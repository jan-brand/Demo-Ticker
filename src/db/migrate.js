import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from './pool.js';

const migrationDir = fileURLToPath(new URL('../../db/', import.meta.url));

try {
  const files = (await readdir(migrationDir)).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
  for (const file of files) {
    await pool.query(await readFile(path.join(migrationDir, file), 'utf8'));
    console.log(`Applied ${file}`);
  }
  console.log('Database schema is up to date.');
} finally {
  await pool.end();
}
