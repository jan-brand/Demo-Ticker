import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db/pool.js';
import { renderLegalPage, renderNotFound } from '../legal/pages.js';
import { FEED_QUERY, renderFeed } from './feed.js';
import { httpsRedirectTarget, isSecure, securityHeaders, send, sendFile, sendJson } from './http.js';
import { authConfig, clientKey, credentialsValid, FailureLimiter, isPublicPath } from './auth.js';
import { buildAssemblySearch, buildMapQuery, MAX_MAP_POINTS } from './query.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const frontendRoot = resolve(root, 'dist');
const port = Number(process.env.PORT ?? 3000);

// Fails at startup (not at the first request) if the login is enabled but incomplete.
const auth = authConfig();
const limiter = new FailureLimiter({ maxFailures: auth.maxFailures, lockMinutes: auth.lockMinutes });

async function handleAssemblyList(request, response, url) {
  const search = buildAssemblySearch(Object.fromEntries(url.searchParams));
  const [rows, count] = await Promise.all([
    pool.query(search.text, search.values),
    pool.query(search.countText, search.values.slice(0, -2)),
  ]);
  await sendJson(request, response, 200, {
    data: rows.rows,
    pagination: {
      page: search.page,
      pageSize: search.pageSize,
      total: count.rows[0].total,
      pages: Math.ceil(count.rows[0].total / search.pageSize),
    },
  });
}

async function handleMap(request, response, url) {
  const map = buildMapQuery(Object.fromEntries(url.searchParams));
  const [rows, counts] = await Promise.all([pool.query(map.text, map.values), pool.query(map.countText, map.values)]);
  const { total, located, pending } = counts.rows[0];
  return sendJson(request, response, 200, {
    // Compact tuples keep the response small: [id, lat, lon, datum, von, thema, plz, strasseNr]
    points: rows.rows.map((row) => [Number(row.id), row.lat, row.lon, row.datum, row.von, row.thema, row.plz, row.strasseNr]),
    total,
    located,
    pending,
    truncated: located > MAX_MAP_POINTS,
  });
}

async function handleAssemblyDetail(request, response, id) {
  const [assembly, history] = await Promise.all([
    pool.query(`SELECT id, datum, von, bis, thema, plz, strasse_nr AS "strasseNr",
                       aufzugsstrecke, is_recurring AS "isRecurring",
                       recurring_start AS "recurringStart", recurring_end AS "recurringEnd",
                       lat, lon, route_points AS "routePoints", removed_at AS "removedAt"
                  FROM assemblies WHERE id = $1`, [id]),
    pool.query(`SELECT id, changed_at AS "changedAt", diff
                  FROM assembly_history WHERE assembly_id = $1
                 ORDER BY changed_at DESC`, [id]),
  ]);
  if (!assembly.rows[0]) return sendJson(request, response, 404, { error: 'Assembly not found' });
  return sendJson(request, response, 200, { ...assembly.rows[0], history: history.rows });
}

async function handleImportStatus(request, response) {
  const [latest, lastSuccess] = await Promise.all([
    pool.query(`SELECT status, started_at AS "startedAt", finished_at AS "finishedAt",
                       fetched_count AS "fetched", new_count AS "new", changed_count AS "changed",
                       removed_count AS "removed", error
                  FROM import_runs ORDER BY id DESC LIMIT 1`),
    pool.query(`SELECT finished_at AS "finishedAt" FROM import_runs
                 WHERE status = 'success' ORDER BY id DESC LIMIT 1`),
  ]);
  return sendJson(request, response, 200, {
    latest: latest.rows[0] ?? null,
    lastSuccessAt: lastSuccess.rows[0]?.finishedAt ?? null,
  });
}

async function handleFeed(request, response) {
  const items = (await pool.query(FEED_QUERY)).rows;
  const baseUrl = (process.env.PUBLIC_URL ?? `${isSecure(request) ? 'https' : 'http'}://${request.headers.host ?? 'localhost'}`).replace(/\/$/, '');
  return send(request, response, {
    type: 'application/atom+xml; charset=utf-8',
    body: renderFeed({ items, baseUrl }),
    headers: { 'cache-control': 'public, max-age=300' },
  });
}

// Server-rendered pages reuse the built stylesheet; during development Vite serves the source file.
function stylesheetHref() {
  try {
    const html = readFileSync(join(frontendRoot, 'index.html'), 'utf8');
    return html.match(/href="(\/assets\/[^"]+\.css)"/)?.[1] ?? '/src/frontend/styles.css';
  } catch {
    return '/src/frontend/styles.css';
  }
}

const sendHtml = (request, response, status, html) => send(request, response, {
  status, type: 'text/html; charset=utf-8', body: html, headers: { 'cache-control': 'no-cache' },
});

async function handleStatic(request, response, pathname) {
  const requested = pathname === '/' || /^\/versammlung\/\d+$/.test(pathname) ? 'index.html' : decodeURIComponent(pathname.slice(1));
  const file = resolve(frontendRoot, requested);
  if (!file.startsWith(`${frontendRoot}${sep}`) || !existsSync(file)) return false;
  await sendFile(request, response, file, { immutable: requested.startsWith('assets/') });
  return true;
}

// Returns true if the request may continue. Otherwise the response has been sent.
async function passesLogin(request, response, pathname) {
  if (isPublicPath(pathname, auth)) return true;
  const key = clientKey(request);
  if (limiter.isBlocked(key)) {
    await send(request, response, {
      status: 429, type: 'text/plain; charset=utf-8', body: 'Zu viele fehlgeschlagene Anmeldungen. Bitte später erneut versuchen.',
      headers: { 'cache-control': 'no-store', 'retry-after': String(auth.lockMinutes * 60) },
    });
    return false;
  }
  if (credentialsValid(request.headers.authorization, auth)) {
    limiter.success(key);
    return true;
  }
  if (request.headers.authorization) limiter.fail(key);
  await send(request, response, {
    status: 401, type: 'text/plain; charset=utf-8', body: 'Anmeldung erforderlich.',
    headers: { 'www-authenticate': 'Basic realm="Demo-Ticker", charset="UTF-8"', 'cache-control': 'no-store' },
  });
  return false;
}

async function route(request, response) {
  const redirect = httpsRedirectTarget(request);
  if (redirect) {
    response.writeHead(308, { location: redirect });
    return response.end();
  }

  const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
  const isRead = request.method === 'GET' || request.method === 'HEAD';

  if (url.pathname === '/healthz') return send(request, response, { type: 'text/plain; charset=utf-8', body: 'ok', headers: { 'cache-control': 'no-store' } });
  if (!(await passesLogin(request, response, url.pathname))) return undefined;

  if (url.pathname.startsWith('/api/')) {
    if (!isRead) return sendJson(request, response, 405, { error: 'Method not allowed' });
    if (url.pathname === '/api/assemblies') return handleAssemblyList(request, response, url);
    if (url.pathname === '/api/map') return handleMap(request, response, url);
    if (url.pathname === '/api/import/status') return handleImportStatus(request, response);
    const detail = url.pathname.match(/^\/api\/assemblies\/(\d+)$/);
    if (detail) return handleAssemblyDetail(request, response, detail[1]);
    return sendJson(request, response, 404, { error: 'Not found' });
  }

  if (!isRead) return sendHtml(request, response, 405, renderNotFound({ stylesheet: stylesheetHref() }));
  if (url.pathname === '/feed.xml') return handleFeed(request, response);
  const legal = url.pathname.match(/^\/(impressum|datenschutz)\/?$/);
  if (legal) return sendHtml(request, response, 200, renderLegalPage(legal[1], { stylesheet: stylesheetHref() }));
  if (await handleStatic(request, response, url.pathname)) return undefined;
  return sendHtml(request, response, 404, renderNotFound({ stylesheet: stylesheetHref() }));
}

const handler = async (request, response) => {
  try {
    await route(request, response);
  } catch (error) {
    console.error(error);
    if (response.headersSent) return response.end();
    response.writeHead(500, { ...securityHeaders(request), 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'Internal server error' }));
  }
};

// With TLS_CERT_FILE and TLS_KEY_FILE the server speaks HTTPS itself, otherwise put a TLS-terminating proxy in front.
const useTls = Boolean(process.env.TLS_CERT_FILE && process.env.TLS_KEY_FILE);
const server = useTls
  ? createHttpsServer({ cert: readFileSync(process.env.TLS_CERT_FILE), key: readFileSync(process.env.TLS_KEY_FILE) }, handler)
  : createHttpServer(handler);

server.listen(port, () => console.log(`Demo-Ticker listening on ${useTls ? 'https' : 'http'}://localhost:${port}`));

const shutdown = async () => {
  server.close();
  await pool.end();
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
