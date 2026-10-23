import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from './pool.js';

const migrationPath = fileURLToPath(new URL('../../db/001_initial.sql', import.meta.url));

try {
  await pool.query(await readFile(path.resolve(migrationPath), 'utf8'));
  console.log('Database schema is up to date.');
} finally {
  await pool.end();
}
