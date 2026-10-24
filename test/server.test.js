import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

// Starts the real server. Static files and legal pages need no database, so a dummy URL is enough.
const root = fileURLToPath(new URL('../', import.meta.url));
const hasBuild = existsSync(new URL('../dist/index.html', import.meta.url));

const freePort = () => new Promise((resolve) => {
  const probe = net.createServer().listen(0, () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

test('server: headers, legal pages, routing and path safety', { skip: !hasBuild && 'run npm run build first' }, async (t) => {
  const port = await freePort();
  const child = spawn(process.execPath, ['src/api/server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: 'postgres://u:p@127.0.0.1:1/none',
      LEGAL_NAME: '', LEGAL_STREET: '', LEGAL_CITY: '', LEGAL_EMAIL: '',
      FORCE_HTTPS: '', TLS_CERT_FILE: '', TLS_KEY_FILE: '',
      AUTH_ENABLED: '', AUTH_USER: '', AUTH_PASSWORD: '', AUTH_PASSWORD_HASH: '', USERS_ENABLED: '',
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => { if (String(chunk).includes('listening')) resolve(); });
    child.on('exit', () => reject(new Error('server exited early')));
  });
  t.after(() => child.kill());
  const get = (path, headers = {}) => fetch(`http://127.0.0.1:${port}${path}`, { headers, redirect: 'manual' });

  await t.test('start page: HTML shell with security headers', async () => {
    const response = await get('/');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const html = await response.text();
    assert.match(html, /<html lang="de">/);
    assert.match(html, /<meta name="description"/);
  });

  await t.test('detail address is served by the app shell', async () => {
    assert.equal((await get('/versammlung/42')).status, 200);
  });

  await t.test('hashed assets are cached for a year and compressed', async () => {
    const html = await (await get('/')).text();
    const asset = html.match(/src="(\/assets\/[^"]+\.js)"/)[1];
    const response = await get(asset, { 'accept-encoding': 'gzip' });
    assert.match(response.headers.get('cache-control'), /immutable/);
    assert.equal(response.headers.get('content-encoding'), 'gzip');
    assert.ok(response.headers.get('etag'));
  });

  await t.test('ETag revalidation returns 304', async () => {
    const first = await get('/');
    const second = await get('/', { 'if-none-match': first.headers.get('etag') });
    assert.equal(second.status, 304);
  });

  await t.test('legal pages exist and warn while operator details are missing', async () => {
    for (const path of ['/impressum', '/datenschutz']) {
      const response = await get(path);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /Angaben des Betreibers fehlen/);
    }
  });

  await t.test('server-rendered pages link the built style sheet, or the source file behind the Vite dev server', async () => {
    const built = await (await get('/impressum')).text();
    assert.match(built, /href="\/assets\/[^"]+\.css"/);
    const dev = await (await get('/impressum', { 'x-dev-server': '1' })).text();
    assert.match(dev, /href="\/src\/frontend\/styles\.css"/);
    assert.doesNotMatch(dev, /\/assets\/[^"]+\.css/);
  });

  await t.test('unknown paths, wrong methods and path traversal are rejected', async () => {
    assert.equal((await get('/gibt-es-nicht')).status, 404);
    assert.equal((await get('/api/gibt-es-nicht')).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/assemblies`, { method: 'POST' })).status, 405);
    assert.equal((await get('/%2e%2e/package.json')).status, 404);
    assert.equal((await get('/..%2f..%2f.env')).status, 404);
  });
});
