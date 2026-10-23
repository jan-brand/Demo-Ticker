import 'dotenv/config';
import { createReadStream } from 'node:fs';
import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { pool } from '../db/pool.js';
import { buildAssemblySearch } from './query.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const frontendRoot = join(root, 'dist');
const port = Number(process.env.PORT ?? 3000);

function sendJson(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function sendFrontend(response, pathname) {
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = join(frontendRoot, requested);
  if (!file.startsWith(`${frontendRoot}/`) || !existsSync(file)) return false;
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
  response.writeHead(200, { 'content-type': `${types[extname(file)] ?? 'application/octet-stream'}; charset=utf-8` });
  createReadStream(file).pipe(response);
  return true;
}

async function handleAssemblyList(response, url) {
  const search = buildAssemblySearch(Object.fromEntries(url.searchParams));
  const [rows, count] = await Promise.all([
    pool.query(search.text, search.values),
    pool.query(search.countText, search.values.slice(0, -2)),
  ]);
  sendJson(response, 200, {
    data: rows.rows,
    pagination: {
      page: search.page,
      pageSize: search.pageSize,
      total: count.rows[0].total,
      pages: Math.ceil(count.rows[0].total / search.pageSize),
    },
  });
}

async function handleAssemblyDetail(response, id) {
  const [assembly, history] = await Promise.all([
    pool.query(`SELECT id, datum, von, bis, thema, plz, strasse_nr AS "strasseNr",
                       aufzugsstrecke, is_recurring AS "isRecurring",
                       recurring_start AS "recurringStart", recurring_end AS "recurringEnd",
                       lat, lon, route_points AS "routePoints"
                  FROM assemblies WHERE id = $1`, [id]),
    pool.query(`SELECT id, changed_at AS "changedAt", diff
                  FROM assembly_history WHERE assembly_id = $1
                 ORDER BY changed_at DESC`, [id]),
  ]);
  if (!assembly.rows[0]) return sendJson(response, 404, { error: 'Assembly not found' });
  sendJson(response, 200, { ...assembly.rows[0], history: history.rows });
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
    if (url.pathname === '/api/assemblies') return await handleAssemblyList(response, url);
    const detail = url.pathname.match(/^\/api\/assemblies\/(\d+)$/);
    if (detail) return await handleAssemblyDetail(response, detail[1]);
    if (request.method === 'GET' && sendFrontend(response, url.pathname)) return;
    sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: 'Internal server error' });
  }
});

server.listen(port, () => console.log(`Demo-Ticker listening on http://localhost:${port}`));

const shutdown = async () => {
  server.close();
  await pool.end();
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
