import { pool } from '../db/pool.js';

// Berlin bounding box. Anything outside is a wrong match (another city with the same street name).
export const BERLIN_BOUNDS = { latMin: 52.33, latMax: 52.68, lonMin: 13.08, lonMax: 13.77 };

export const insideBerlin = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon)
  && lat >= BERLIN_BOUNDS.latMin && lat <= BERLIN_BOUNDS.latMax
  && lon >= BERLIN_BOUNDS.lonMin && lon <= BERLIN_BOUNDS.lonMax;

// The source field mixes addresses with free text ("Am Rosensteig, Am Brunnen - > alle 2 Stunden im Wechsel").
// Only the first part is used, house number ranges ("12-14") are reduced to the first number.
export function cleanStreet(value) {
  const first = String(value ?? '').split(/[;\n]|\s+-\s*>|\s{2,}/)[0].split(',')[0].trim();
  const withoutRange = first.replace(/(\d+[a-zA-Z]?)\s*[-–/]\s*\d+[a-zA-Z]?\b/, '$1');
  return withoutRange.replace(/\s+/g, ' ').slice(0, 100);
}

export function buildGeocodeRequests(assembly) {
  const street = cleanStreet(assembly.strasseNr);
  if (!street) return [];
  const plz = /^\d{5}$/.test(String(assembly.plz ?? '').trim()) ? String(assembly.plz).trim() : null;
  const requests = [];
  if (plz) requests.push({ street, postalcode: plz, city: 'Berlin' });
  requests.push({ q: `${street}, ${[plz, 'Berlin'].filter(Boolean).join(' ')}` });
  return requests;
}

export function parseGeocodeResult(body) {
  const hit = Array.isArray(body) ? body[0] : null;
  const lat = Number(hit?.lat);
  const lon = Number(hit?.lon);
  return insideBerlin(lat, lon) ? { lat, lon } : null;
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function settings(env = process.env) {
  return {
    enabled: env.GEOCODING !== 'off',
    url: env.GEOCODER_URL ?? 'https://nominatim.openstreetmap.org/search',
    // Nominatim's usage policy asks for an identifying User-Agent, a contact address is optional but polite.
    userAgent: `Demo-Ticker/0.1${env.GEOCODER_CONTACT ? ` (${env.GEOCODER_CONTACT})` : ''}`,
    delayMs: Number(env.GEOCODER_DELAY_MS ?? 1100),
    retryDays: Number(env.GEOCODER_RETRY_DAYS ?? 7),
  };
}

async function lookup(request, config) {
  const params = new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: 'de', ...request });
  const response = await fetch(`${config.url}?${params}`, {
    headers: { 'user-agent': config.userAgent, accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 429 || response.status >= 500) throw new Error(`Geocoder unavailable (${response.status})`);
  if (!response.ok) return null;
  return parseGeocodeResult(await response.json());
}

// Looks up coordinates for assemblies that have none yet. At most `limit` rows per call, one request per
// delayMs, so the public Nominatim server is used as its policy requires. Stops early if the service fails.
export async function geocodePending({ limit = 100, env = process.env } = {}) {
  const config = settings(env);
  if (!config.enabled) return { enabled: false, checked: 0, found: 0, notFound: 0, skipped: 0, stopped: false };

  const pending = await pool.query(
    `SELECT id, plz, strasse_nr AS "strasseNr" FROM assemblies
      WHERE lat IS NULL AND (geocode_status IS NULL
         OR (geocode_status = 'not_found' AND geocoded_at < NOW() - make_interval(days => $2)))
      ORDER BY datum, id LIMIT $1`,
    [limit, config.retryDays],
  );

  const result = { enabled: true, checked: 0, found: 0, notFound: 0, skipped: 0, stopped: false };
  for (const assembly of pending.rows) {
    const requests = buildGeocodeRequests(assembly);
    if (!requests.length) {
      await pool.query(`UPDATE assemblies SET geocode_status = 'skipped', geocoded_at = NOW() WHERE id = $1`, [assembly.id]);
      result.skipped += 1;
      continue;
    }
    try {
      let point = null;
      for (const request of requests) {
        point = await lookup(request, config);
        await sleep(config.delayMs);
        if (point) break;
      }
      await pool.query(
        `UPDATE assemblies SET lat = $2, lon = $3, geocode_status = $4, geocoded_at = NOW() WHERE id = $1`,
        [assembly.id, point?.lat ?? null, point?.lon ?? null, point ? 'ok' : 'not_found'],
      );
      result.checked += 1;
      if (point) result.found += 1; else result.notFound += 1;
    } catch (error) {
      console.error(`Geocoding stopped: ${error.message}`);
      result.stopped = true;
      break;
    }
  }
  return result;
}
