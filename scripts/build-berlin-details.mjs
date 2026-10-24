// Builds src/frontend/berlin-details.js: the 97 Ortsteile (boundaries) and the major roads of Berlin.
// Both are simplified and projected exactly like the district outlines in berlin-map.js, so they line up.
//
// Sources
//   Ortsteile: ALKIS Berlin Ortsteile (Geoportal Berlin, Datenlizenz Deutschland - Zero - Version 2.0), WFS as GeoJSON
//   Roads:     OpenStreetMap via Overpass (motorway, trunk, primary, secondary), (c) OpenStreetMap contributors, ODbL
//              classes: Autobahn, Bundesstrasse (ref "B ..."), other main road, connecting road (secondary)
//
// Usage: node scripts/build-berlin-details.mjs [--ortsteile file-or-url] [--roads file-or-url]
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import berlin from '../src/frontend/berlin-map.js';
import { districtAt } from '../src/frontend/mapgeo.js';

const ORTSTEILE_URL = 'https://gdi.berlin.de/services/wfs/alkis_ortsteile?service=WFS&version=2.0.0&request=GetFeature&typeNames=alkis_ortsteile:ortsteile&outputFormat=application/json&srsName=EPSG:4326';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const QUERY = '[out:json][timeout:120];area["name"="Berlin"]["boundary"="administrative"]["admin_level"="4"]->.a;way(area.a)["highway"~"^(motorway|trunk|primary|secondary)$"];out geom tags;';
const TOLERANCE_ORTSTEIL = 0.00025; // degrees, about 20 to 30 m
const TOLERANCE_ROAD = 0.0005;
const MAX_LABELS = 90;
// Longer roads of the higher classes win when the labels are chosen.
const LABEL_WEIGHT = { motorway: 3, federal: 2.5, main: 2, connector: 1 };

const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function load(source, fallback) {
  if (source && !/^https?:/.test(source)) return JSON.parse(await readFile(source, 'utf8'));
  return fallback(source);
}

async function fetchOrtsteile(url) {
  const response = await fetch(url ?? ORTSTEILE_URL);
  if (!response.ok) throw new Error(`Ortsteile: HTTP ${response.status}`);
  return response.json();
}

async function fetchRoads() {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    for (const endpoint of OVERPASS) {
      try {
        const response = await fetch(endpoint, { method: 'POST', headers: { 'user-agent': 'Demo-Ticker build script' }, body: new URLSearchParams({ data: QUERY }) });
        if (response.ok) return await response.json();
        console.warn(`Overpass ${endpoint}: HTTP ${response.status}`);
      } catch (error) {
        console.warn(`Overpass ${endpoint}: ${error.message}`);
      }
      await sleep(5000);
    }
    await sleep(15000 * (attempt + 1));
  }
  throw new Error('Overpass is not reachable, try again later or pass a saved file with --roads');
}

// Douglas-Peucker, iterative.
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  const sq = tolerance * tolerance;
  while (stack.length) {
    const [first, last] = stack.pop();
    const [x1, y1] = points[first];
    const [x2, y2] = points[last];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = dx * dx + dy * dy;
    let worst = 0;
    let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const [x, y] = points[i];
      const t = len ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len)) : 0;
      const d = (x - (x1 + t * dx)) ** 2 + (y - (y1 + t * dy)) ** 2;
      if (d > worst) { worst = d; index = i; }
    }
    if (worst > sq && index > 0) { keep[index] = 1; stack.push([first, index], [index, last]); }
  }
  return points.filter((_, i) => keep[i]);
}

const project = ([lon, lat]) => [(lon - berlin.lonMin) * berlin.cosLat0 * berlin.scale, (berlin.latMax - lat) * berlin.scale];
const round = (value) => Math.round(value * 10) / 10;
// Path data with relative steps ("M x y l dx dy dx dy ..."): the numbers stay small, which makes the file about a third smaller.
// Steps are computed from the rounded absolute positions, so rounding errors never add up.
function pathOf(points, close) {
  const absolute = points.map(([x, y]) => [round(x), round(y)]);
  const steps = [];
  for (let i = 1; i < absolute.length; i += 1) {
    steps.push(round(absolute[i][0] - absolute[i - 1][0]), round(absolute[i][1] - absolute[i - 1][1]));
  }
  return `M${absolute[0][0]} ${absolute[0][1]}${steps.length ? `l${steps.join(' ')}` : ''}${close ? 'z' : ''}`;
}

function areaCentroid(ring) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    area += cross; cx += (x0 + x1) * cross; cy += (y0 + y1) * cross;
  }
  return { area: Math.abs(area / 2), x: cx / (3 * area), y: cy / (3 * area) };
}

// ---------- Ortsteile ----------
const ortsteileJson = await load(option('ortsteile'), fetchOrtsteile);
const ortsteile = ortsteileJson.features
  .map((feature) => {
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    const rings = polygons.map((polygon) => simplify(polygon[0], TOLERANCE_ORTSTEIL)).filter((ring) => ring.length >= 4);
    const largest = rings.map((ring) => ({ ring, ...areaCentroid(ring) })).sort((a, b) => b.area - a.area)[0];
    const district = districtAt(largest.y, largest.x);
    const projected = rings.map((ring) => ring.map(project));
    const [labelX, labelY] = project([largest.x, largest.y]);
    return {
      name: feature.properties.nam,
      bezirk: district?.name ?? null,
      d: projected.map((ring) => pathOf(ring, true)).join(''),
      labelX: round(labelX),
      labelY: round(labelY),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name, 'de'));

const unassigned = ortsteile.filter((o) => !o.bezirk).map((o) => o.name);
if (unassigned.length) console.warn(`Ortsteile ohne Bezirk: ${unassigned.join(', ')}`);

// ---------- Roads ----------
const roadsJson = await load(option('roads'), fetchRoads);
const raw = { motorway: [], federal: [], main: [], connector: [] };

// Autobahn; Bundesstrasse = any of the other classes with a reference "B ..."; other trunk and primary roads; secondary roads.
function classify(tags) {
  if (tags.highway === 'motorway') return 'motorway';
  if (/(^|;)\s*B\s*\d+/.test(tags.ref ?? '')) return 'federal';
  return tags.highway === 'secondary' ? 'connector' : 'main';
}
const groups = new Map(); // label -> { kind, length, best: { length, points } }
const lengthOf = (points) => points.slice(1).reduce((sum, [x, y], i) => sum + Math.hypot(x - points[i][0], y - points[i][1]), 0);

for (const way of roadsJson.elements.filter((element) => element.type === 'way' && element.geometry?.length > 1)) {
  const kind = classify(way.tags);
  const coordinates = way.geometry.map((node) => [node.lon, node.lat]);
  raw[kind].push(coordinates);
  const points = simplify(coordinates, TOLERANCE_ROAD).map(project);
  if (points.length < 2) continue;
  const text = kind === 'motorway' ? (way.tags.ref ?? '').split(';')[0].replace(/\s+/g, '') : (way.tags.name ?? (way.tags.ref ?? '').split(';')[0]);
  if (!text) continue;
  const length = lengthOf(points);
  const group = groups.get(text) ?? { text, kind, length: 0, best: { length: 0, points: null } };
  group.length += length;
  if (length > group.best.length) group.best = { length, points };
  groups.set(text, group);
}

// OpenStreetMap splits a road into many short pieces. Pieces that meet at the same point are joined into one line,
// which removes a lot of repeated "M" commands and lets the simplification work over the whole line.
function stitch(lines) {
  const key = (point) => `${point[0]},${point[1]}`;
  const ends = new Map();
  lines.forEach((line, index) => {
    for (const point of [line[0], line[line.length - 1]]) {
      if (!ends.has(key(point))) ends.set(key(point), new Set());
      ends.get(key(point)).add(index);
    }
  });
  const used = new Uint8Array(lines.length);
  const next = (point) => { for (const index of ends.get(key(point)) ?? []) if (!used[index]) return index; return null; };
  const chains = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (used[i]) continue;
    used[i] = 1;
    const chain = [...lines[i]];
    for (let j = next(chain[chain.length - 1]); j !== null; j = next(chain[chain.length - 1])) {
      used[j] = 1;
      const line = lines[j];
      chain.push(...(key(line[0]) === key(chain[chain.length - 1]) ? line : [...line].reverse()).slice(1));
    }
    for (let j = next(chain[0]); j !== null; j = next(chain[0])) {
      used[j] = 1;
      const line = lines[j];
      chain.unshift(...(key(line[line.length - 1]) === key(chain[0]) ? line : [...line].reverse()).slice(0, -1));
    }
    chains.push(chain);
  }
  return chains;
}

const kinds = Object.fromEntries(Object.entries(raw).map(([kind, lines]) => [
  kind,
  stitch(lines).map((chain) => simplify(chain, TOLERANCE_ROAD).map(project)).filter((points) => points.length >= 2).map((points) => pathOf(points, false)),
]));

// A label sits at the middle of the longest piece of a road and follows its direction (never upside down).
function labelFor(group) {
  const { points, length } = group.best;
  let walked = 0;
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const segment = Math.hypot(x1 - x0, y1 - y0);
    if (walked + segment >= length / 2) {
      const t = segment ? (length / 2 - walked) / segment : 0;
      let angle = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;
      return { text: group.text, kind: group.kind, x: round(x0 + t * (x1 - x0)), y: round(y0 + t * (y1 - y0)), angle: Math.round(angle) };
    }
    walked += segment;
  }
  return null;
}

const labels = [...groups.values()].sort((a, b) => b.length * LABEL_WEIGHT[b.kind] - a.length * LABEL_WEIGHT[a.kind]).slice(0, MAX_LABELS).map(labelFor).filter(Boolean);

const module = {
  source: 'Ortsteile: ALKIS Berlin Ortsteile, Geoportal Berlin, Datenlizenz Deutschland - Zero - Version 2.0. Strassen: (c) OpenStreetMap-Mitwirkende, ODbL. Klassen: motorway (Autobahn), federal (Bundesstrasse), main (Hauptstrasse), connector (Verbindungsstrasse).',
  ortsteile,
  roads: Object.fromEntries(Object.entries(kinds).map(([kind, paths]) => [kind, paths.join('')])),
  labels,
};

const target = fileURLToPath(new URL('../src/frontend/berlin-details.js', import.meta.url));
await writeFile(target, `// Generated by scripts/build-berlin-details.mjs, do not edit.\n// Road data (c) OpenStreetMap contributors, ODbL. Ortsteile: Geoportal Berlin, Datenlizenz Deutschland - Zero - Version 2.0.\nexport default ${JSON.stringify(module)};\n`);
const size = JSON.stringify(module).length;
console.log(`${ortsteile.length} Ortsteile, Strassen: ${kinds.motorway.length} Autobahn-, ${kinds.federal.length} Bundesstrassen-, ${kinds.main.length} Hauptstrassen-, ${kinds.connector.length} Verbindungsstrassenlinien, ${labels.length} Beschriftungen, ${(size / 1024).toFixed(1)} KB -> src/frontend/berlin-details.js`);
