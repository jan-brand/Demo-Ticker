import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

// Real server and real database, but inside a throw-away schema: user accounts end to end.
dotenv.config();
const baseUrl = process.env.DATABASE_URL;
const schema = `test_users_${process.pid}_${Date.now()}`;
const root = fileURLToPath(new URL('../', import.meta.url));
const dbDir = path.join(root, 'db');

async function databaseReachable() {
  if (!baseUrl) return false;
  const client = new pg.Client({ connectionString: baseUrl, connectionTimeoutMillis: 3000 });
  try { await client.connect(); return true; } catch { return false; } finally { await client.end().catch(() => {}); }
}
const available = await databaseReachable();
const freePort = () => new Promise((resolve) => { const p = net.createServer().listen(0, () => { const { port } = p.address(); p.close(() => resolve(port)); }); });

test('user accounts: login, roles, forced password change, protection against misuse', { skip: !available && 'database not reachable' }, async (t) => {
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const url = new URL(baseUrl);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const schemaUrl = url.toString();
  process.env.DATABASE_URL = schemaUrl;

  const { pool } = await import('../src/db/pool.js');
  const { createStore } = await import('../src/users/store.js');
  const { createService } = await import('../src/users/service.js');
  for (const file of (await readdir(dbDir)).filter((n) => /^\d+_.*\.sql$/.test(n)).sort()) await pool.query(await readFile(path.join(dbDir, file), 'utf8'));
  const store = createStore(pool);
  const service = createService({ store });
  const cli = { id: null, username: 'Kommandozeile' };

  const port = await freePort();
  const child = spawn(process.execPath, ['src/api/server.js'], {
    cwd: root,
    env: {
      ...process.env, PORT: String(port), DATABASE_URL: schemaUrl, USERS_ENABLED: '1', SESSION_HOURS: '12',
      AUTH_ENABLED: '', TRUST_PROXY: '', FORCE_HTTPS: '', TLS_CERT_FILE: '', TLS_KEY_FILE: '', AUTH_PROTECT_LEGAL: '',
      LEGAL_NAME: '', LEGAL_STREET: '', LEGAL_CITY: '', LEGAL_EMAIL: '', PUBLIC_URL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (c) => { stderr += c; });
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (c) => { if (String(c).includes('listening')) resolve(); });
    child.on('exit', () => reject(new Error(`server exited: ${stderr}`)));
  });
  t.after(async () => { child.kill(); await pool.end(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end(); });

  const base = `http://127.0.0.1:${port}`;
  // A tiny browser: keeps the session cookie of one user.
  const browser = () => {
    let cookie = '';
    const request = async (pathname, { method = 'GET', json, form, headers = {} } = {}) => {
      const h = { cookie, ...headers };
      let body;
      if (method !== 'GET') h.origin = headers.origin ?? base;
      if (json !== undefined) { h['content-type'] = 'application/json'; body = JSON.stringify(json); }
      if (form) { h['content-type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
      const response = await fetch(base + pathname, { method, headers: h, body, redirect: 'manual' });
      for (const line of response.headers.getSetCookie?.() ?? []) {
        const [pair] = line.split(';');
        cookie = pair.endsWith('=') ? '' : pair;
      }
      return response;
    };
    return { request, get cookie() { return cookie; } };
  };
  const login = async (username, password, b = browser()) => ({ b, response: await b.request('/anmelden', { method: 'POST', form: { benutzername: username, passwort: password } }) });
  const STRONG = 'Strong-Passwort-2026';

  await service.createUser(cli, { username: 'chef', password: 'Start-Passwort-2026', role: 'admin' });
  await service.createUser(cli, { username: 'anna', password: 'Erstes-Mitglied-Pass1', role: 'member' });

  await t.test('visitors are sent to the login form, APIs answer 401, public pages stay open', async () => {
    const b = browser();
    const page = await b.request('/');
    assert.equal(page.status, 303);
    assert.equal(page.headers.get('location'), '/anmelden?weiter=%2F');
    const api = await b.request('/api/assemblies');
    assert.equal(api.status, 401);
    assert.equal((await api.json()).code, 'unauthenticated');
    for (const p of ['/healthz', '/impressum', '/datenschutz', '/anmelden']) assert.equal((await b.request(p)).status, 200, p);
    assert.match(await (await b.request('/anmelden')).text(), /name="passwort"[^>]*type|type="password"/);
    assert.equal((await b.request('/api/users')).status, 401);
    assert.equal((await b.request('/nutzer')).status, 303);
  });

  await t.test('wrong credentials: generic message, no cookie, unknown user looks the same', async () => {
    const wrongPassword = await login('chef', 'falsch');
    const unknownUser = await login('gibt-es-nicht', 'falsch');
    for (const { response, b } of [wrongPassword, unknownUser]) {
      assert.equal(response.status, 401);
      assert.equal(b.cookie, '');
      assert.match(await response.text(), /Benutzername oder Passwort stimmt nicht\./);
    }
  });

  await t.test('login sets a hardened session cookie, only a hash is stored', async () => {
    const b = browser();
    const response = await b.request('/anmelden', { method: 'POST', form: { benutzername: 'CHEF', passwort: 'Start-Passwort-2026' } }); // names are case-insensitive
    assert.equal(response.status, 303);
    const cookie = response.headers.getSetCookie()[0];
    assert.match(cookie, /^dt_session=[\w-]{40,}/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\//);
    assert.doesNotMatch(cookie, /Secure/); // plain http in this test
    const token = cookie.split(';')[0].split('=')[1];
    const rows = (await pool.query('SELECT token_hash FROM sessions')).rows;
    assert.ok(rows.length >= 1 && rows.every((r) => r.token_hash !== token && /^[0-9a-f]{64}$/.test(r.token_hash)));
  });

  await t.test('a start password must be replaced before anything else works', async () => {
    const { b, response } = await login('chef', 'Start-Passwort-2026');
    assert.equal(response.headers.get('location'), '/konto');
    const blocked = await b.request('/api/assemblies');
    assert.equal(blocked.status, 403);
    assert.equal((await blocked.json()).code, 'password_change_required');
    assert.equal((await b.request('/')).headers.get('location'), '/konto');
    assert.equal((await b.request('/api/session')).status, 200);
    assert.equal((await b.request('/api/users')).status, 403);

    const account = await (await b.request('/konto')).text();
    assert.match(account, /neues Passwort gewählt werden/);
    const post = (fields) => b.request('/konto/passwort', { method: 'POST', form: fields });
    const wrongCurrent = await post({ aktuell: 'falsch', neu: STRONG, wiederholung: STRONG });
    assert.equal(wrongCurrent.status, 400);
    assert.match(await wrongCurrent.text(), /Das bisherige Passwort stimmt nicht\./);
    assert.match(await (await post({ aktuell: 'Start-Passwort-2026', neu: STRONG, wiederholung: 'anders' })).text(), /stimmen nicht überein/);
    assert.match(await (await post({ aktuell: 'Start-Passwort-2026', neu: 'kurz', wiederholung: 'kurz' })).text(), /mindestens 12 Zeichen \(aktuell 4\)/);
    assert.match(await (await post({ aktuell: 'Start-Passwort-2026', neu: 'Start-Passwort-2026', wiederholung: 'Start-Passwort-2026' })).text(), /muss sich vom bisherigen unterscheiden/);

    const done = await post({ aktuell: 'Start-Passwort-2026', neu: STRONG, wiederholung: STRONG });
    assert.equal(done.status, 303);
    assert.equal((await b.request('/api/assemblies')).status, 200);
    assert.equal((await login('chef', 'Start-Passwort-2026')).response.status, 401); // old password is gone
    assert.equal((await login('chef', STRONG)).response.headers.get('location'), '/');
  });

  // From here on the admin and a normal member are signed in.
  await service.resetPassword(cli, (await store.findByUsername('anna')).id, 'Zweites-Mitglied-Pass2');
  const adminBrowser = (await login('chef', STRONG)).b;
  const member = (await login('anna', 'Zweites-Mitglied-Pass2')).b;
  await member.request('/konto/passwort', { method: 'POST', form: { aktuell: 'Zweites-Mitglied-Pass2', neu: 'Eigenes-Mitglied-Pass3', wiederholung: 'Eigenes-Mitglied-Pass3' } });

  await t.test('requests from other sites are refused, even with a valid session', async () => {
    const evil = { origin: 'https://evil.example' };
    assert.equal((await adminBrowser.request('/api/users', { method: 'POST', json: { username: 'x', password: 'y' }, headers: evil })).status, 403);
    assert.equal((await adminBrowser.request('/abmelden', { method: 'POST', headers: evil })).status, 403);
    assert.equal((await adminBrowser.request('/anmelden', { method: 'POST', form: { benutzername: 'chef', passwort: STRONG }, headers: evil })).status, 403);
    assert.equal((await adminBrowser.request('/api/session')).status, 200); // still signed in
  });

  await t.test('members cannot manage users or read the log', async () => {
    assert.equal((await member.request('/api/assemblies')).status, 200);
    for (const [method, p] of [['GET', '/api/users'], ['GET', '/api/audit'], ['POST', '/api/users'], ['PATCH', '/api/users/1'], ['DELETE', '/api/users/1']]) {
      assert.equal((await member.request(p, { method, json: method === 'GET' ? undefined : {} })).status, 403, `${method} ${p}`);
    }
    const page = await member.request('/nutzer');
    assert.equal(page.status, 403);
    assert.match(await page.text(), /Kein Zugriff/);
  });

  await t.test('admins manage accounts; secrets never leave the server', async () => {
    const list = await adminBrowser.request('/api/users');
    assert.equal(list.status, 200);
    const text = await list.text();
    assert.doesNotMatch(text, /scrypt|passwordHash|password_hash/);
    assert.deepEqual(JSON.parse(text).users.map((u) => u.username).sort(), ['anna', 'chef']);
    assert.ok(![303, 403].includes((await adminBrowser.request('/nutzer')).status)); // admins reach the user page (served by the app shell)

    const create = (body) => adminBrowser.request('/api/users', { method: 'POST', json: body });
    const created = await create({ username: 'bernd', password: 'Start-Zugang-Passwort', role: 'member' });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).user.mustChangePassword, true);
    assert.equal((await create({ username: 'BERND', password: 'Anderes-Start-Passwort' })).status, 409);
    const weak = await create({ username: 'carla', password: 'zukurz' });
    assert.equal(weak.status, 400);
    assert.match((await weak.json()).error, /mindestens 12 Zeichen/);
    assert.equal((await create({ username: 'ä ö', password: 'Gutes-Start-Passwort' })).status, 400);
    assert.equal((await create({ username: 'dora', password: 'Gutes-Start-Passwort', role: 'root' })).status, 400);
  });

  await t.test('role changes, blocking and deleting work and end sessions; own account is protected', async () => {
    const bernd = (await store.findByUsername('bernd')).id;
    const anna = (await store.findByUsername('anna')).id;
    const chef = (await store.findByUsername('chef')).id;
    const patch = (id, json) => adminBrowser.request(`/api/users/${id}`, { method: 'PATCH', json });

    assert.equal((await patch(bernd, { role: 'admin' })).status, 200);
    assert.equal((await store.findById(bernd)).role, 'admin');
    assert.equal((await patch(chef, { role: 'member' })).status, 409); // not the own account
    assert.equal((await patch(chef, { active: false })).status, 409);
    assert.equal((await adminBrowser.request(`/api/users/${chef}`, { method: 'DELETE' })).status, 409);

    assert.equal((await member.request('/api/assemblies')).status, 200);
    assert.equal((await patch(anna, { active: false })).status, 200);
    assert.equal((await member.request('/api/assemblies')).status, 401); // the open session ended with the block
    assert.equal((await login('anna', 'Eigenes-Mitglied-Pass3')).response.status, 401);
    assert.equal((await patch(anna, { active: true })).status, 200);
    assert.equal((await login('anna', 'Eigenes-Mitglied-Pass3')).response.status, 303);

    assert.equal((await adminBrowser.request(`/api/users/${bernd}`, { method: 'DELETE' })).status, 200);
    assert.equal(await store.findById(bernd), null);
    assert.equal((await adminBrowser.request('/api/users/999999', { method: 'DELETE' })).status, 404);
  });

  await t.test('the last active admin can never be demoted, blocked or deleted', async () => {
    const chef = (await store.findByUsername('chef')).id;
    await assert.rejects(store.updateUser(chef, { role: 'member' }), /letzte aktive Admin/);
    await assert.rejects(store.updateUser(chef, { active: false }), /letzte aktive Admin/);
    await assert.rejects(store.deleteUser(chef), /letzte aktive Admin/);
    assert.equal((await store.findById(chef)).role, 'admin');
  });

  await t.test('resetting a password ends the sessions and forces a new one', async () => {
    const victim = await login('anna', 'Eigenes-Mitglied-Pass3');
    const annaId = (await store.findByUsername('anna')).id;
    assert.equal((await victim.b.request('/api/assemblies')).status, 200);
    const reset = await adminBrowser.request(`/api/users/${annaId}/password`, { method: 'POST', json: { password: 'Neues-Start-Passwort-1' } });
    assert.equal(reset.status, 200);
    assert.equal((await victim.b.request('/api/assemblies')).status, 401);
    const again = await login('anna', 'Neues-Start-Passwort-1');
    assert.equal(again.response.headers.get('location'), '/konto');
    assert.equal((await adminBrowser.request(`/api/users/${annaId}/password`, { method: 'POST', json: { password: 'kurz' } })).status, 400);
  });

  await t.test('changing the own password keeps this session but ends all others', async () => {
    const first = (await login('chef', STRONG)).b;
    const second = (await login('chef', STRONG)).b;
    const changed = await first.request('/konto/passwort', { method: 'POST', form: { aktuell: STRONG, neu: 'Neues-Leitung-Passwort-27', wiederholung: 'Neues-Leitung-Passwort-27' } });
    assert.equal(changed.status, 303);
    assert.equal((await first.request('/api/session')).status, 200);
    assert.equal((await second.request('/api/session')).status, 401);
    assert.equal((await adminBrowser.request('/api/session')).status, 401);
  });

  await t.test('logout ends the session on the server', async () => {
    const b = (await login('chef', 'Neues-Leitung-Passwort-27')).b;
    const cookieBefore = b.cookie;
    const out = await b.request('/abmelden', { method: 'POST' });
    assert.equal(out.headers.get('location'), '/anmelden');
    assert.match(out.headers.getSetCookie()[0], /Max-Age=0/);
    const replay = await fetch(`${base}/api/session`, { headers: { cookie: cookieBefore } });
    assert.equal(replay.status, 401); // a stolen cookie is useless after logout
  });

  await t.test('sessions expire', async () => {
    const b = (await login('chef', 'Neues-Leitung-Passwort-27')).b;
    assert.equal((await b.request('/api/session')).status, 200);
    await pool.query(`UPDATE sessions SET expires_at = NOW() - interval '1 minute'`);
    assert.equal((await b.request('/api/session')).status, 401);
  });

  await t.test('repeated failures lock the account name, even from other clients', async () => {
    let last;
    for (let i = 0; i < 6; i += 1) last = (await login('bernd-gibt-es-nicht', 'falsch-falsch-1')).response.status;
    assert.equal(last, 429);
    assert.match(await (await login('bernd-gibt-es-nicht', 'egal')).response.text(), /Zu viele fehlgeschlagene Anmeldungen/);
  });

  await t.test('the audit log records who did what, without secrets', async () => {
    const fresh = (await login('chef', 'Neues-Leitung-Passwort-27')).b; // the earlier test let every session expire
    const entries = (await (await fresh.request('/api/audit')).json()).entries;
    const actions = entries.map((e) => e.action);
    for (const a of ['user_created', 'role_changed', 'user_disabled', 'user_enabled', 'user_deleted', 'password_reset', 'password_changed']) assert.ok(actions.includes(a), a);
    assert.ok(entries.some((e) => e.action === 'user_disabled' && e.actorName === 'chef' && e.targetName === 'anna'));
    assert.doesNotMatch(JSON.stringify(entries), /Passwort-|scrypt|Start-/);
  });

  await t.test('the login form only redirects to local targets', async () => {
    const b = browser();
    const go = (weiter) => b.request('/anmelden', { method: 'POST', form: { benutzername: 'chef', passwort: 'Neues-Leitung-Passwort-27', weiter } });
    assert.equal((await go('//evil.example/x')).headers.get('location'), '/');
    assert.equal((await go('https://evil.example')).headers.get('location'), '/');
    assert.equal((await go('/karte?x=1')).headers.get('location'), '/karte?x=1');
  });

  await t.test('the shared password login is not active in this mode and the health check is open', async () => {
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    assert.equal((await fetch(`${base}/api/assemblies`, { headers: { authorization: `Basic ${Buffer.from('a:b').toString('base64')}` } })).status, 401);
  });
});
