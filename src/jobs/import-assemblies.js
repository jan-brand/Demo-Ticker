import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { pool } from '../db/pool.js';
import { diffAssembly, extractEntries, normalizeAssembly } from '../import/normalize.js';

const apiUrl = process.env.ASSEMBLIES_API_URL;
const inputFile = process.env.IMPORT_FILE;

async function readPayload() {
  if (inputFile) return JSON.parse(await readFile(inputFile, 'utf8'));
  if (!apiUrl) throw new Error('Set ASSEMBLIES_API_URL or IMPORT_FILE');
  const response = await fetch(apiUrl, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`API request failed with ${response.status} ${response.statusText}`);
  return response.json();
}

async function importAssembly(client, assembly) {
  const result = await client.query(
    `SELECT id, datum, von, bis, thema, plz, strasse_nr AS "strasseNr",
            aufzugsstrecke, is_recurring AS "isRecurring",
            recurring_start AS "recurringStart", recurring_end AS "recurringEnd"
       FROM assemblies WHERE external_key = $1`,
    [assembly.externalKey],
  );
  const previous = result.rows[0];
  if (!previous) {
    const inserted = await client.query(
      `INSERT INTO assemblies
        (external_key, datum, von, bis, thema, plz, strasse_nr, aufzugsstrecke,
         is_recurring, recurring_start, recurring_end, source_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [assembly.externalKey, assembly.datum, assembly.von, assembly.bis, assembly.thema,
        assembly.plz, assembly.strasseNr, assembly.aufzugsstrecke, assembly.isRecurring,
        assembly.recurringStart, assembly.recurringEnd, assembly.sourceData],
    );
    return { kind: 'new', id: inserted.rows[0].id };
  }

  const diff = diffAssembly(previous, assembly);
  await client.query(
    `UPDATE assemblies
        SET last_seen_at = NOW(), source_data = $2
          ${Object.keys(diff).length ? `, datum = $3, von = $4, bis = $5, thema = $6, plz = $7,
             strasse_nr = $8, aufzugsstrecke = $9, is_recurring = $10,
             recurring_start = $11, recurring_end = $12, last_changed_at = NOW()` : ''}
      WHERE id = $1`,
    Object.keys(diff).length
      ? [previous.id, assembly.sourceData, assembly.datum, assembly.von, assembly.bis, assembly.thema,
        assembly.plz, assembly.strasseNr, assembly.aufzugsstrecke, assembly.isRecurring,
        assembly.recurringStart, assembly.recurringEnd]
      : [previous.id, assembly.sourceData],
  );
  if (Object.keys(diff).length) {
    await client.query(
      'INSERT INTO assembly_history (assembly_id, diff) VALUES ($1, $2)',
      [previous.id, diff],
    );
    return { kind: 'changed', id: previous.id };
  }
  return { kind: 'unchanged', id: previous.id };
}

const payload = await readPayload();
const assemblies = extractEntries(payload).map(normalizeAssembly);
const client = await pool.connect();
const counts = { new: 0, changed: 0, unchanged: 0 };

try {
  await client.query('BEGIN');
  for (const assembly of assemblies) {
    const result = await importAssembly(client, assembly);
    counts[result.kind] += 1;
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({ imported: assemblies.length, ...counts }));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
