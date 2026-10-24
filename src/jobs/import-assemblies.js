import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { pool } from '../db/pool.js';
import { diffAssembly, extractEntries, normalizeAssembly } from '../import/normalize.js';
import { checkImportSize } from '../import/guard.js';

async function readPayload() {
  const apiUrl = process.env.ASSEMBLIES_API_URL;
  const inputFile = process.env.IMPORT_FILE;
  if (inputFile) return JSON.parse((await readFile(inputFile, 'utf8')).replace(/^﻿/, ''));
  if (!apiUrl) throw new Error('Set ASSEMBLIES_API_URL or IMPORT_FILE');
  const response = await fetch(apiUrl, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(Number(process.env.IMPORT_TIMEOUT_MS ?? 60000)),
  });
  if (!response.ok) throw new Error(`API request failed with ${response.status} ${response.statusText}`);
  return response.json();
}

async function importAssembly(client, assembly) {
  const result = await client.query(
    `SELECT id, datum, von, bis, thema, plz, strasse_nr AS "strasseNr",
            aufzugsstrecke, is_recurring AS "isRecurring",
            recurring_start AS "recurringStart", recurring_end AS "recurringEnd",
            removed_at AS "removedAt"
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
  // An assembly that was marked as removed but is listed again is restored and logged.
  if (previous.removedAt) diff.removed = { before: true, after: false };
  const changed = Object.keys(diff).length > 0;
  await client.query(
    `UPDATE assemblies
        SET last_seen_at = NOW(), removed_at = NULL, source_data = $2
          ${changed ? `, datum = $3, von = $4, bis = $5, thema = $6, plz = $7,
             strasse_nr = $8, aufzugsstrecke = $9, is_recurring = $10,
             recurring_start = $11, recurring_end = $12, last_changed_at = NOW()` : ''}
      WHERE id = $1`,
    changed
      ? [previous.id, assembly.sourceData, assembly.datum, assembly.von, assembly.bis, assembly.thema,
        assembly.plz, assembly.strasseNr, assembly.aufzugsstrecke, assembly.isRecurring,
        assembly.recurringStart, assembly.recurringEnd]
      : [previous.id, assembly.sourceData],
  );
  if (changed) {
    await client.query(
      'INSERT INTO assembly_history (assembly_id, diff) VALUES ($1, $2)',
      [previous.id, diff],
    );
    return { kind: 'changed', id: previous.id };
  }
  return { kind: 'unchanged', id: previous.id };
}

// Upcoming assemblies that the source no longer lists are kept but marked as removed.
// Past assemblies disappearing from the source is normal and is not recorded.
async function markRemoved(client) {
  const removed = await client.query(
    `UPDATE assemblies
        SET removed_at = NOW(), last_changed_at = NOW()
      WHERE last_seen_at < NOW() AND removed_at IS NULL AND datum >= CURRENT_DATE
      RETURNING id`,
  );
  if (removed.rowCount) {
    await client.query(
      `INSERT INTO assembly_history (assembly_id, diff)
       SELECT id, $2::jsonb FROM assemblies WHERE id = ANY($1::bigint[])`,
      [removed.rows.map((row) => row.id), JSON.stringify({ removed: { before: false, after: true } })],
    );
  }
  return removed.rowCount;
}

export async function runImport() {
  const source = process.env.IMPORT_FILE ? `file:${process.env.IMPORT_FILE}` : process.env.ASSEMBLIES_API_URL ?? null;
  const run = await pool.query('INSERT INTO import_runs (source) VALUES ($1) RETURNING id', [source]);
  const runId = run.rows[0].id;
  const counts = { new: 0, changed: 0, unchanged: 0 };
  let fetched = null;
  let removed = null;

  try {
    const assemblies = extractEntries(await readPayload()).map(normalizeAssembly);
    fetched = assemblies.length;

    const previousRun = await pool.query(
      `SELECT fetched_count FROM import_runs
        WHERE status = 'success' AND fetched_count IS NOT NULL ORDER BY id DESC LIMIT 1`,
    );
    const problem = checkImportSize(fetched, previousRun.rows[0]?.fetched_count ?? 0);
    if (problem) throw new Error(problem);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const assembly of assemblies) {
        counts[(await importAssembly(client, assembly)).kind] += 1;
      }
      removed = await markRemoved(client);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await pool.query(
      `UPDATE import_runs SET finished_at = NOW(), status = 'success', fetched_count = $2,
              new_count = $3, changed_count = $4, unchanged_count = $5, removed_count = $6
        WHERE id = $1`,
      [runId, fetched, counts.new, counts.changed, counts.unchanged, removed],
    );
    return { imported: fetched, ...counts, removed };
  } catch (error) {
    await pool.query(
      `UPDATE import_runs SET finished_at = NOW(), status = 'failed', fetched_count = $2, error = $3 WHERE id = $1`,
      [runId, fetched, String(error?.message ?? error)],
    );
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await runImport()));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
