import { useEffect, useState } from 'react';
import { inRing, project } from './mapgeo.js';

// Ortsteil boundaries and major roads (about 20 KB compressed) are only needed for the map view and the detail page,
// so they are loaded on demand and not as part of the start page.
let loading = null;
export const loadBerlinDetails = () => { loading ??= import('./berlin-details.js').then((module) => module.default); return loading; };

export function useBerlinDetails() {
  const [details, setDetails] = useState(null);
  useEffect(() => {
    let current = true;
    loadBerlinDetails().then((loaded) => { if (current) setDetails(loaded); }).catch(() => {});
    return () => { current = false; };
  }, []);
  return details;
}

// Path data looks like "M x y l dx dy dx dy ... z": an absolute start, then relative steps.
export function parseRings(d) {
  const tokens = String(d).match(/[Mlz]|-?\d+(?:\.\d+)?/g) ?? [];
  const rings = [];
  let ring = null;
  let x = 0;
  let y = 0;
  for (let i = 0; i < tokens.length;) {
    if (tokens[i] === 'M') {
      x = Number(tokens[i + 1]);
      y = Number(tokens[i + 2]);
      ring = [[x, y]];
      rings.push(ring);
      i += 3;
    } else if (tokens[i] === 'l') {
      i += 1;
      while (i < tokens.length && !/^[Mlz]$/.test(tokens[i])) {
        x += Number(tokens[i]);
        y += Number(tokens[i + 1]);
        ring.push([x, y]);
        i += 2;
      }
    } else {
      i += 1;
    }
  }
  return rings;
}

const parsed = new WeakMap();

// The Ortsteil that contains a position: { index, name, bezirk, ... } or null.
export function ortsteilAt(details, lat, lon) {
  if (!details || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const [x, y] = project(lat, lon);
  let rings = parsed.get(details);
  if (!rings) {
    rings = details.ortsteile.map((ortsteil) => parseRings(ortsteil.d));
    parsed.set(details, rings);
  }
  const index = rings.findIndex((list) => list.some((ring) => inRing(x, y, ring)));
  return index < 0 ? null : { index, ...details.ortsteile[index] };
}
