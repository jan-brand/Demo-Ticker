import test from 'node:test';
import assert from 'node:assert/strict';
import { diffAssembly, extractEntries, normalizeAssembly, recurringDetails } from '../src/import/normalize.js';

const sample = {
  datum: '23.10.2026',
  von: '18:00 Uhr',
  bis: '20:30 Uhr',
  thema: 'Mahnwache (vom 02.10. bis 30.12.2026 - täglich)',
  plz: '10117',
  strasse_nr: 'Pariser Platz 1',
  aufzugsstrecke: '',
};

test('creates a stable external key and detects recurring assemblies', () => {
  const normalized = normalizeAssembly(sample);
  assert.equal(normalized.externalKey.length, 64);
  assert.equal(normalized.isRecurring, true);
  assert.equal(normalized.recurringStart, '2026-10-02');
  assert.equal(normalized.recurringEnd, '2026-12-30');
  assert.equal(normalized.von, '18:00');
});

test('same input produces the same key regardless of object identity', () => {
  assert.equal(normalizeAssembly(sample).externalKey, normalizeAssembly({ ...sample }).externalKey);
});

test('reports only changed import fields', () => {
  const previous = normalizeAssembly(sample);
  const current = normalizeAssembly({ ...sample, aufzugsstrecke: 'Unter den Linden' });
  assert.deepEqual(Object.keys(diffAssembly(previous, current)), ['aufzugsstrecke']);
});

test('accepts common API envelope shapes', () => {
  assert.equal(extractEntries({ data: [sample] }).length, 1);
  assert.equal(recurringDetails('Kundgebung').isRecurring, false);
});
