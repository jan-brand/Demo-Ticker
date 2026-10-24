import test from 'node:test';
import assert from 'node:assert/strict';
import { checkImportSize } from '../src/import/guard.js';

test('rejects an empty source response', () => {
  assert.match(checkImportSize(0, 0), /no assemblies/);
});

test('rejects a response far smaller than the previous run', () => {
  assert.match(checkImportSize(100, 1000), /less than 50%/);
});

test('accepts the first run and normal fluctuation', () => {
  assert.equal(checkImportSize(1067, 0), null);
  assert.equal(checkImportSize(900, 1000), null);
  assert.equal(checkImportSize(500, 1000), null);
});
