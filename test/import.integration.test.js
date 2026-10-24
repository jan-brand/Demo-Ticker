import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

// Runs against the configured database, but inside a throw-away schema so real data is never touched.
dotenv.config();
const baseUrl = process.env.DATABASE_URL;
const schema = `test_${process.pid}_${Date.now()}`;
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

test('import lifecycle: insert, idempotence, change, removal, restore, size guard', { skip: !available && 'database not reachable' }, async (t) => {
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const dir = await mkdtemp(path.join(tmpdir(), 'demo-ticker-'));

  const url = new URL(baseUrl);
  url.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  delete process.env.ASSEMBLIES_API_URL;

  const { pool } = await import('../src/db/pool.js');
  const { runImport } = await import('../src/jobs/import-assemblies.js');

  t.after(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
    await rm(dir, { recursive: true, force: true });
  });

  for (const file of (await readdir(dbDir)).filter((name) => /^\d+_.*\.sql$/.test(name)).sort()) {
    await pool.query(await readFile(path.join(dbDir, file), 'utf8'));
  }

  const future = (days) => {
    const date = new Date(Date.now() + days * 86_400_000);
    return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
  };
  const entry = (n, extra = {}) => ({ datum: future(n), von: '10:00', bis: '12:00', thema: `Kundgebung ${n}`, plz: '10117', strasse_nr: `Straße ${n}`, aufzugsstrecke: '', ...extra });
  const importFile = async (entries) => {
    const file = path.join(dir, 'all.json');
    await writeFile(file, JSON.stringify({ index: entries }));
    process.env.IMPORT_FILE = file;
    return runImport();
  };
  const row = async (thema) => (await pool.query('SELECT * FROM assemblies WHERE thema = $1', [thema])).rows[0];

  const base = [1, 2, 3, 4].map((n) => entry(n));

  await t.test('first import inserts everything', async () => {
    const result = await importFile(base);
    assert.deepEqual([result.new, result.changed, result.unchanged, result.removed], [4, 0, 0, 0]);
  });

  await t.test('second identical import changes nothing and writes no history', async () => {
    const result = await importFile(base);
    assert.deepEqual([result.new, result.changed, result.unchanged], [0, 0, 4]);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM assembly_history')).rows[0].n, 0);
  });

  await t.test('dates and times come back as plain strings', async () => {
    const stored = await row('Kundgebung 1');
    assert.match(stored.datum, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(stored.von, '10:00');
  });

  await t.test('a changed end time is archived as a diff', async () => {
    const changed = base.map((item, index) => (index === 0 ? { ...item, bis: '13:30' } : item));
    const result = await importFile(changed);
    assert.deepEqual([result.changed, result.unchanged], [1, 3]);
    const history = (await pool.query('SELECT diff FROM assembly_history')).rows;
    assert.deepEqual(history[0].diff.bis, { before: '12:00', after: '13:30' });
  });

  await t.test('an upcoming assembly missing from the source is marked removed, not deleted', async () => {
    const result = await importFile(base.slice(0, 3).map((item, index) => (index === 0 ? { ...item, bis: '13:30' } : item)));
    assert.equal(result.removed, 1);
    assert.ok((await row('Kundgebung 4')).removed_at);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM assemblies')).rows[0].n, 4);
  });

  await t.test('it is restored when the source lists it again', async () => {
    const result = await importFile(base.map((item, index) => (index === 0 ? { ...item, bis: '13:30' } : item)));
    assert.equal(result.changed, 1);
    assert.equal((await row('Kundgebung 4')).removed_at, null);
  });

  await t.test('an implausibly small response is rejected and nothing changes', async () => {
    await assert.rejects(importFile([entry(1)]), /less than 50%/);
    assert.equal((await row('Kundgebung 2')).removed_at, null);
    const runs = (await pool.query('SELECT status FROM import_runs ORDER BY id DESC LIMIT 1')).rows;
    assert.equal(runs[0].status, 'failed');
  });

  await t.test('an empty response is rejected', async () => {
    await assert.rejects(importFile([]), /no assemblies/);
  });
});
