import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEntries, syncEnv } from '../scripts/env-sync.mjs';

const example = [
  'DATABASE_URL=postgres://u:p@localhost/db',
  '# Interval in minutes.',
  '# IMPORT_INTERVAL_MINUTES=60',
  '',
  '# Login. Create the hash with: npm run auth:hash',
  'AUTH_ENABLED=0',
  '# AUTH_USER=redaktion',
  '',
].join('\n');

test('entries keep the comment lines directly above them', () => {
  const entries = parseEntries(example);
  assert.deepEqual(entries.map((e) => e.key), ['DATABASE_URL', 'IMPORT_INTERVAL_MINUTES', 'AUTH_ENABLED', 'AUTH_USER']);
  assert.deepEqual(entries[1].lines, ['# Interval in minutes.', '# IMPORT_INTERVAL_MINUTES=60']);
  assert.equal(entries[1].active, false);
  assert.equal(entries[2].active, true);
  assert.deepEqual(entries[2].lines[0], '# Login. Create the hash with: npm run auth:hash'); // prose is not mistaken for a variable
});

test('only missing variables are added, existing values stay untouched', () => {
  const target = 'DATABASE_URL=postgres://real:secret@db/prod\nAUTH_ENABLED=1\n';
  const { text, added } = syncEnv(example, target, { today: '2026-10-24' });
  assert.deepEqual(added.map((a) => a.key), ['IMPORT_INTERVAL_MINUTES', 'AUTH_USER']);
  assert.ok(text.startsWith(target));
  assert.match(text, /DATABASE_URL=postgres:\/\/real:secret@db\/prod/);
  assert.match(text, /# --- aus \.env\.example uebernommen \(2026-10-24\) ---/);
  assert.match(text, /# Interval in minutes\.\n# IMPORT_INTERVAL_MINUTES=60/);
  assert.equal((text.match(/AUTH_ENABLED/g) ?? []).length, 1);
});

test('commented-out variables count as known, so removed examples are not offered again', () => {
  const target = 'DATABASE_URL=x\n# IMPORT_INTERVAL_MINUTES=15\nAUTH_ENABLED=0\n# AUTH_USER=anna\n';
  assert.deepEqual(syncEnv(example, target).added, []);
  assert.equal(syncEnv(example, target).text, target);
});

test('a second run adds nothing (idempotent)', () => {
  const once = syncEnv(example, 'DATABASE_URL=x\n').text;
  assert.deepEqual(syncEnv(example, once).added, []);
});

test('new active variables stay active, commented ones stay comments', () => {
  const { added } = syncEnv(example, '');
  assert.deepEqual(added.map((a) => [a.key, a.active]), [['DATABASE_URL', true], ['IMPORT_INTERVAL_MINUTES', false], ['AUTH_ENABLED', true], ['AUTH_USER', false]]);
});

test('line endings and a missing final newline are preserved', () => {
  const { text } = syncEnv(example, 'DATABASE_URL=x\r\nAUTH_ENABLED=1');
  assert.ok(!/[^\r]\n/.test(text), 'only CRLF line breaks');
  assert.match(text, /AUTH_ENABLED=1\r\n\r\n# --- aus/);
});

test('an empty target gets everything without a leading blank line', () => {
  const { text } = syncEnv(example, '', { today: '2026-10-24' });
  assert.ok(text.startsWith('# --- aus .env.example'));
});
