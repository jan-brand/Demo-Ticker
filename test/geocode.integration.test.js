import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

// Uses a throw-away schema and a local fake geocoder: no real data is touched and nothing leaves the machine.
dotenv.config();
const baseUrl = process.env.DATABASE_URL;
const schema = `test_geo_${process.pid}_${Date.now()}`;
const dbDir = fileURLToPath(new URL('../db/', import.meta.url));

async function databaseReachable() {
  if (!baseUrl) return false;
  const client = new pg.Client({ connectionString: baseUrl, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

const available = await databaseReachable();

test('geocoding: found, not found, outside Berlin, no address, outage', { skip: !available && 'database not reachable' }, async (t) => {
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);

  const requests = [];
  let outage = false;
  const fake = createServer((request, response) => {
    const url = new URL(request.url, 'http://x');
    requests.push({ query: Object.fromEntries(url.searchParams), userAgent: request.headers['user-agent'] });
    if (outage) { response.writeHead(503); return response.end(); }
    const street = url.searchParams.get('street') ?? url.searchParams.get('q') ?? '';
    response.setHeader('content-type', 'application/json');
    if (street.includes('Reichstag')) return response.end(JSON.stringify([{ lat: '52.5186', lon: '13.3761' }]));
    if (street.includes('Marienplatz')) return response.end(JSON.stringify([{ lat: '48.1374', lon: '11.5755' }])); // Munich
    return response.end('[]');
  });
  await new Promise((resolve) => { fake.listen(0, '127.0.0.1', resolve); });
  const { port } = fake.address();

  const url = new URL(baseUrl);
  url.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.GEOCODER_URL = `http://127.0.0.1:${port}/search`;
  process.env.GEOCODER_DELAY_MS = '0';
  process.env.GEOCODER_CONTACT = '';

  const { pool } = await import('../src/db/pool.js');
  const { geocodePending } = await import('../src/geo/geocode.js');

  t.after(async () => {
    await pool.end();
    fake.close();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  });

  for (const file of (await readdir(dbDir)).filter((name) => /^\d+_.*\.sql$/.test(name)).sort()) {
    await pool.query(await readFile(path.join(dbDir, file), 'utf8'));
  }
  const insert = (key, strasse, plz) => pool.query(
    'INSERT INTO assemblies (external_key, datum, thema, strasse_nr, plz) VALUES ($1, CURRENT_DATE + 1, $1, $2, $3)', [key, strasse, plz],
  );
  await insert('found', 'Platz der Republik Reichstag 1', '10557');
  await insert('missing', 'Nirgendwostrasse 99', '10115');
  await insert('munich', 'Marienplatz 1', '10115');
  await insert('no-address', null, '10115');
  const row = async (key) => (await pool.query('SELECT lat, lon, geocode_status AS status FROM assemblies WHERE external_key = $1', [key])).rows[0];

  await t.test('classifies every kind of entry', async () => {
    const result = await geocodePending({ limit: 10 });
    assert.deepEqual([result.found, result.notFound, result.skipped, result.stopped], [1, 2, 1, false]);
    assert.deepEqual(await row('found'), { lat: 52.5186, lon: 13.3761, status: 'ok' });
    assert.equal((await row('missing')).status, 'not_found');
    assert.equal((await row('munich')).status, 'not_found'); // rejected, outside Berlin
    assert.equal((await row('munich')).lat, null);
    assert.equal((await row('no-address')).status, 'skipped');
  });

  await t.test('the geocoder receives only the address and an identifying User-Agent', async () => {
    assert.ok(requests.length >= 3);
    assert.deepEqual(requests[0].query.street, 'Platz der Republik Reichstag 1');
    assert.equal(requests[0].query.postalcode, '10557');
    assert.equal(requests[0].query.countrycodes, 'de');
    assert.equal(requests[0].userAgent, 'Demo-Ticker/0.1');
  });

  await t.test('finished entries are not requested again', async () => {
    const before = requests.length;
    const result = await geocodePending({ limit: 10 });
    assert.equal(result.checked + result.skipped, 0);
    assert.equal(requests.length, before);
  });

  await t.test('failed entries are retried after the retry period', async () => {
    await pool.query(`UPDATE assemblies SET geocoded_at = NOW() - interval '8 days' WHERE external_key = 'missing'`);
    const result = await geocodePending({ limit: 10 });
    assert.equal(result.checked, 1);
  });

  await t.test('a geocoder outage stops the run without marking entries', async () => {
    await insert('later', 'Irgendwo 5', '10115');
    outage = true;
    const result = await geocodePending({ limit: 10 });
    assert.equal(result.stopped, true);
    assert.equal((await row('later')).status, null);
  });

  await t.test('geocoding can be switched off', async () => {
    const result = await geocodePending({ limit: 10, env: { ...process.env, GEOCODING: 'off' } });
    assert.equal(result.enabled, false);
  });
});
