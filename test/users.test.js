import test from 'node:test';
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { generatePassword, validatePassword, validateUsername } from '../src/users/policy.js';
import { parseCookies, safeNext, sameOrigin, usersEnabled } from '../src/users/routes.js';
import { tokenHash } from '../src/users/service.js';

test('user names: length and allowed characters, with concrete messages', () => {
  assert.deepEqual(validateUsername('anna.k-1_x').errors, []);
  assert.equal(validateUsername('  anna  ').value, 'anna');
  assert.match(validateUsername('ab').errors[0], /mindestens 3 Zeichen \(aktuell 2\)/);
  assert.match(validateUsername('x'.repeat(33)).errors[0], /höchstens 32/);
  assert.match(validateUsername('ärger').errors[0], /ohne Umlaute/);
  assert.match(validateUsername('a b c').errors[0], /ohne Umlaute/);
  assert.ok(validateUsername('').errors.length >= 1);
});

test('passwords: length, user name, weak patterns and reuse', () => {
  assert.deepEqual(validatePassword('Sehr-gutes-Passwort-42', { username: 'anna' }), []);
  assert.match(validatePassword('kurz')[0], /mindestens 12 Zeichen \(aktuell 4\)/);
  assert.match(validatePassword('x'.repeat(201))[0], /höchstens 200/);
  assert.match(validatePassword('Mein-Anna-Passwort-1', { username: 'anna' }).join(' '), /Benutzernamen nicht enthalten/);
  assert.match(validatePassword('aaaaaaaaaaaaaaaa').join(' '), /zu einfach/);
  assert.match(validatePassword('123456789012').join(' '), /zu einfach/);
  assert.match(validatePassword('Passwortpasswort').join(' '), /zu einfach/);
  assert.match(validatePassword('Gleiches-Passwort-1', { current: 'Gleiches-Passwort-1' }).join(' '), /unterscheiden/);
  assert.deepEqual(validatePassword(undefined).length, 1);
});

test('generated passwords satisfy the rules, differ and avoid look-alike characters', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) {
    const password = generatePassword(randomInt);
    assert.match(password, /^[A-HJ-NP-Za-km-z2-9]{4}(-[A-HJ-NP-Za-km-z2-9]{4}){3}$/);
    assert.deepEqual(validatePassword(password, { username: 'anna' }), []);
    seen.add(password);
  }
  assert.equal(seen.size, 200);
});

test('cookies are parsed defensively', () => {
  assert.deepEqual(parseCookies('a=1; dt_session=abc; x=%E0%A4%A'), { a: '1', dt_session: 'abc' });
  assert.deepEqual(parseCookies(undefined), {});
  assert.deepEqual(parseCookies('novalue; =x'), {});
});

test('after login only local targets are followed', () => {
  assert.equal(safeNext('/versammlung/5?x=1'), '/versammlung/5?x=1');
  for (const bad of ['//evil.example', 'https://evil.example', '/\\evil', 'javascript:alert(1)', '', undefined, '/anmelden?weiter=/']) assert.equal(safeNext(bad), '/', String(bad));
});

test('cross-site requests are recognized by Origin or Sec-Fetch-Site', () => {
  const request = (headers) => ({ headers: { host: 'ticker.example:3000', ...headers } });
  assert.equal(sameOrigin(request({ origin: 'http://ticker.example:3000' }), {}), true);
  assert.equal(sameOrigin(request({ origin: 'https://evil.example' }), {}), false);
  assert.equal(sameOrigin(request({ origin: 'not a url' }), {}), false);
  assert.equal(sameOrigin(request({ 'sec-fetch-site': 'cross-site' }), {}), false);
  assert.equal(sameOrigin(request({ 'sec-fetch-site': 'same-origin' }), {}), true);
  assert.equal(sameOrigin(request({}), {}), true); // no browser, no ambient cookie to abuse
  // "Referrer-Policy: no-referrer" makes browsers send "Origin: null" on form posts
  assert.equal(sameOrigin(request({ origin: 'null', 'sec-fetch-site': 'same-origin' }), {}), true);
  assert.equal(sameOrigin(request({ origin: 'null', 'sec-fetch-site': 'cross-site' }), {}), false);
  assert.equal(sameOrigin(request({ origin: 'null', 'sec-fetch-site': 'same-site' }), {}), false);
  assert.equal(sameOrigin(request({ origin: 'null' }), {}), false);
  assert.equal(sameOrigin(request({ origin: 'https://public.example' }), { PUBLIC_URL: 'https://public.example' }), true);
  assert.equal(sameOrigin(request({ origin: 'https://proxy.example', 'x-forwarded-host': 'proxy.example' }), { TRUST_PROXY: '1' }), true);
  assert.equal(sameOrigin(request({ origin: 'https://proxy.example', 'x-forwarded-host': 'proxy.example' }), {}), false);
});

test('account mode is off unless enabled, tokens are stored hashed', () => {
  assert.equal(usersEnabled({}), false);
  assert.equal(usersEnabled({ USERS_ENABLED: '0' }), false);
  assert.equal(usersEnabled({ USERS_ENABLED: '1' }), true);
  assert.match(tokenHash('abc'), /^[0-9a-f]{64}$/);
  assert.notEqual(tokenHash('abc'), tokenHash('abd'));
});
