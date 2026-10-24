import 'dotenv/config';
import { pool } from '../db/pool.js';
import { geocodePending } from '../geo/geocode.js';

// Manual run: node src/jobs/geocode.js [limit]  (default: everything that is still open)
const limit = Number(process.argv[2] ?? 100000);
try {
  console.log(JSON.stringify(await geocodePending({ limit })));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
