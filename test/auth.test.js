import test from 'node:test';
import assert from 'node:assert/strict';
import { authConfig, clientKey, credentialsValid, FailureLimiter, hashPassword, isPublicPath, parseBasic, verifyHash } from '../src/api/auth.js';

const basic = (user, password) => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

test('the login is off unless explicitly enabled', () => {
  assert.equal(authConfig({}).enabled, false);
  assert.equal(authConfig({ AUTH_ENABLED: '0', AUTH_USER: 'a', AUTH_PASSWORD: 'b' }).enabled, false);
  assert.equal(authConfig({ AUTH_ENABLED: '1', AUTH_USER: 'a', AUTH_PASSWORD: 'b' }).enabled, true);
});

test('an incomplete configuration refuses to start instead of leaving the site open', () => {
  assert.throws(() => authConfig({ AUTH_ENABLED: '1', AUTH_PASSWORD: 'b' }), /AUTH_USER/);
  assert.throws(() => authConfig({ AUTH_ENABLED: '1', AUTH_USER: 'a' }), /AUTH_PASSWORD/);
  assert.throws(() => authConfig({ AUTH_ENABLED: '1', AUTH_USER: 'a', AUTH_PASSWORD_HASH: 'plain-text' }), /auth:hash/);
});

test('password hashes verify and are salted', () => {
  const hash = hashPassword('geheim');
  assert.match(hash, /^scrypt\.\d+\.[\w-]+\.[\w-]+$/);
  assert.ok(!hash.includes('$'));
  assert.equal(verifyHash('geheim', hash), true);
  assert.equal(verifyHash('falsch', hash), false);
  assert.notEqual(hashPassword('geheim'), hash);
  assert.equal(verifyHash('geheim', 'kaputt'), false);
});

test('header parsing', () => {
  assert.deepEqual(parseBasic(basic('anna', 'pw:mit:doppelpunkt')), { user: 'anna', password: 'pw:mit:doppelpunkt' });
  assert.equal(parseBasic('Bearer abc'), null);
  assert.equal(parseBasic(undefined), null);
  assert.equal(parseBasic(`Basic ${Buffer.from('ohne-doppelpunkt').toString('base64')}`), null);
});

test('credentials: plain password and hash, wrong user, wrong password', () => {
  const plain = authConfig({ AUTH_ENABLED: '1', AUTH_USER: 'anna', AUTH_PASSWORD: 'geheim' });
  assert.equal(credentialsValid(basic('anna', 'geheim'), plain), true);
  assert.equal(credentialsValid(basic('anna', 'falsch'), plain), false);
  assert.equal(credentialsValid(basic('bernd', 'geheim'), plain), false);
  assert.equal(credentialsValid(undefined, plain), false);
  const hashed = authConfig({ AUTH_ENABLED: '1', AUTH_USER: 'anna', AUTH_PASSWORD_HASH: hashPassword('äöü ß 🔑') });
  assert.equal(credentialsValid(basic('anna', 'äöü ß 🔑'), hashed), true);
  assert.equal(credentialsValid(basic('anna', 'aou ss'), hashed), false);
  assert.equal(credentialsValid(basic('anna', 'geheim'), { enabled: false }), false);
});

test('public paths: health check always, legal pages unless protected', () => {
  const open = authConfig({ AUTH_ENABLED: '1', AUTH_USER: 'a', AUTH_PASSWORD: 'b' });
  const closed = authConfig({ AUTH_ENABLED: '1', AUTH_USER: 'a', AUTH_PASSWORD: 'b', AUTH_PROTECT_LEGAL: '1' });
  for (const config of [open, closed]) {
    assert.equal(isPublicPath('/healthz', config), true);
    for (const path of ['/', '/api/assemblies', '/api/map', '/feed.xml', '/versammlung/1', '/assets/app.js']) assert.equal(isPublicPath(path, config), false, path);
  }
  for (const path of ['/nav.js', '/assets/index-abc123.css', '/assets/dm-sans-latin-Bf69Tn_J.woff2']) assert.equal(isPublicPath(path, closed), true, path);
  for (const path of ['/assets/index-abc123.js', '/assets/../secret.css', '/api/map', '/nav.js.map']) assert.equal(isPublicPath(path, closed), false, path);
  assert.equal(isPublicPath('/impressum', open), true);
  assert.equal(isPublicPath('/datenschutz/', open), true);
  assert.equal(isPublicPath('/impressum', closed), false);
  assert.equal(isPublicPath('/irgendwas', { enabled: false }), true);
});

test('failed logins lock an address and the lock expires', () => {
  let time = 0;
  const limiter = new FailureLimiter({ maxFailures: 3, lockMinutes: 10, now: () => time });
  for (let i = 0; i < 2; i += 1) limiter.fail('1.2.3.4');
  assert.equal(limiter.isBlocked('1.2.3.4'), false);
  limiter.fail('1.2.3.4');
  assert.equal(limiter.isBlocked('1.2.3.4'), true);
  assert.equal(limiter.isBlocked('5.6.7.8'), false);
  time = 10 * 60_000 + 1;
  assert.equal(limiter.isBlocked('1.2.3.4'), false);
});

test('a successful login clears earlier failures', () => {
  const limiter = new FailureLimiter({ maxFailures: 2, lockMinutes: 10, now: () => 0 });
  limiter.fail('a');
  limiter.success('a');
  limiter.fail('a');
  assert.equal(limiter.isBlocked('a'), false);
});

test('client address: the forwarded header is only trusted behind a proxy', () => {
  const request = { headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }, socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(clientKey(request, {}), '127.0.0.1');
  assert.equal(clientKey(request, { TRUST_PROXY: '1' }), '9.9.9.9');
});
