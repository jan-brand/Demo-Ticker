import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { pool } from '../db/pool.js';
import { geocodePending } from '../geo/geocode.js';
import { runImport } from './import-assemblies.js';

// One scheduled run: fetch and archive the assemblies, then add coordinates for new entries.
// A geocoding problem never fails the import.
export async function runUpdate() {
  const imported = await runImport();
  let geocoding;
  try {
    geocoding = await geocodePending({ limit: Number(process.env.GEOCODE_BATCH ?? 100) });
  } catch (error) {
    geocoding = { error: error.message };
  }
  return { ...imported, geocoding };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await runUpdate()));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
