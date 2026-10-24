import { pool } from '../db/pool.js';
import { runUpdate } from './update.js';

const intervalMinutes = Math.max(1, Number(process.env.IMPORT_INTERVAL_MINUTES ?? 60));
let timer = null;
let stopping = false;

const stamp = () => new Date().toISOString();

async function tick() {
  try {
    console.log(`[${stamp()}] import started`);
    console.log(`[${stamp()}] import finished ${JSON.stringify(await runUpdate())}`);
  } catch (error) {
    // A failed run is recorded in import_runs; the scheduler keeps going.
    console.error(`[${stamp()}] import failed: ${error.message}`);
  }
  if (!stopping) timer = setTimeout(tick, intervalMinutes * 60_000);
}

async function shutdown() {
  stopping = true;
  clearTimeout(timer);
  await pool.end();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

console.log(`Import scheduler running, interval ${intervalMinutes} min. Stop with Ctrl+C.`);
await tick();
