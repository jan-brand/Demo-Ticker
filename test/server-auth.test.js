import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

// Starts the real server with the login enabled and checks that nothing is reachable without credentials.
const root = fileURLToPath(new URL('../', import.meta.url));
const hasBuild = existsSync(new URL('../dist/index.html', import.meta.url));

const freePort = () => new Promise((resolve) => {
  const probe = net.createServer().listen(0, () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

const baseEnv = {
  ...process.env,
  DATABASE_URL: 'postgres://u:p@127.0.0.1:1/none',
  LEGAL_NAME: '', LEGAL_STREET: '', LEGAL_CITY: '', LEGAL_EMAIL: '',
  FORCE_HTTPS: '', TLS_CERT_FILE: '', TLS_KEY_FILE: '', TRUST_PROXY: '',
  AUTH_ENABLED: '1', AUTH_USER: 'anna', AUTH_PASSWORD: 'geheim', AUTH_PASSWORD_HASH: '', AUTH_PROTECT_LEGAL: '',
  AUTH_MAX_FAILURES: '4', AUTH_LOCK_MINUTES: '5',
};

async function start(env) {
  const port = await freePort();
  const child = spawn(process.execPath, ['src/api/server.js'], { cwd: root, env: { ...baseEnv, ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => { if (String(chunk).includes('listening')) resolve(); });
    child.on('exit', (code) => reject(new Error(`server exited (${code}): ${errors.match(/Error: .*/)?.[0] ?? errors.trim()}`)));
  });
  return { port, child, get: (path, headers = {}) => fetch(`http://127.0.0.1:${port}${path}`, { headers, redirect: 'manual' }) };
}

const basic = (user, password) => ({ authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}` });

test('server with login: everything is protected except health check and legal pages', { skip: !hasBuild && 'run npm run build first' }, async (t) => {
  const server = await start({});
  t.after(() => server.child.kill());

  await t.test('protected paths answer 401 with a Basic challenge and no content', async () => {
    for (const path of ['/', '/versammlung/1', '/api/assemblies', '/api/map', '/api/import/status', '/feed.xml', '/gibt-es-nicht']) {
      const response = await server.get(path);
      assert.equal(response.status, 401, path);
      assert.match(response.headers.get('www-authenticate'), /^Basic realm=/);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
      assert.doesNotMatch(await response.text(), /<html|assemblies|Demo-Ticker/);
    }
  });

  await t.test('assets are protected as well', async () => {
    const asset = (await (await server.get('/', basic('anna', 'geheim'))).text()).match(/src="(\/assets\/[^"]+\.js)"/)[1];
    assert.equal((await server.get(asset)).status, 401);
    assert.equal((await server.get(asset, basic('anna', 'geheim'))).status, 200);
  });

  await t.test('style sheet, fonts and drawer script are public so the public legal pages are styled', async () => {
    const html = await (await server.get('/impressum')).text();
    const css = html.match(/href="(\/assets\/[^"]+\.css)"/)[1];
    assert.equal((await server.get(css)).status, 200);
    assert.equal((await server.get('/nav.js')).status, 200);
    const font = (await (await server.get(css)).text()).match(/url\((\/assets\/[^)]+\.woff2)\)/)[1];
    assert.equal((await server.get(font)).status, 200);
  });

  await t.test('health check and legal pages stay public', async () => {
    assert.equal((await server.get('/healthz')).status, 200);
    assert.equal((await server.get('/impressum')).status, 200);
    const privacy = await (await server.get('/datenschutz')).text();
    assert.match(privacy, /passwortgeschützt/);
    assert.match(privacy, /keine Cookies/);
  });

  await t.test('correct credentials open the site, no cookie is set', async () => {
    const response = await server.get('/', basic('anna', 'geheim'));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal((await server.get('/feed.xml', basic('anna', 'geheim'))).status === 401, false);
  });

  await t.test('wrong credentials stay out, repeated failures are locked', async () => {
    assert.equal((await server.get('/', basic('anna', 'falsch'))).status, 401);
    assert.equal((await server.get('/', basic('bernd', 'geheim'))).status, 401);
    assert.equal((await server.get('/', basic('anna', 'falsch'))).status, 401);
    assert.equal((await server.get('/', basic('anna', 'falsch'))).status, 401);
    const locked = await server.get('/', basic('anna', 'geheim'));
    assert.equal(locked.status, 429);
    assert.ok(Number(locked.headers.get('retry-after')) > 0);
  });
});

test('server with login can run with a password hash and protect the legal pages too', { skip: !hasBuild && 'run npm run build first' }, async (t) => {
  const { hashPassword } = await import('../src/api/auth.js');
  const server = await start({ AUTH_PASSWORD: '', AUTH_PASSWORD_HASH: hashPassword('streng geheim'), AUTH_PROTECT_LEGAL: '1' });
  t.after(() => server.child.kill());
  assert.equal((await server.get('/impressum')).status, 401);
  assert.equal((await server.get('/impressum', basic('anna', 'streng geheim'))).status, 200);
  assert.equal((await server.get('/impressum', basic('anna', 'geheim'))).status, 401);
  assert.equal((await server.get('/healthz')).status, 200);
});

test('server refuses to start when the login is enabled but incomplete', { skip: !hasBuild && 'run npm run build first' }, async () => {
  await assert.rejects(start({ AUTH_PASSWORD: '', AUTH_PASSWORD_HASH: '' }), /AUTH_PASSWORD/);
  await assert.rejects(start({ AUTH_USER: '' }), /AUTH_USER/);
});
