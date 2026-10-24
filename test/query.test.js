import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAssemblySearch } from '../src/api/query.js';

test('without filters: no WHERE clause, default paging', () => {
  const search = buildAssemblySearch({});
  assert.doesNotMatch(search.text, /WHERE/);
  assert.deepEqual(search.values, [25, 0]);
  assert.equal(search.page, 1);
});

test('all filters are bound as parameters, never interpolated', () => {
  const evil = "x'; DROP TABLE assemblies; --";
  const search = buildAssemblySearch({ q: evil, dateFrom: '2026-10-01', dateTo: '2026-10-31', plz: '10117', street: evil });
  assert.ok(!search.text.includes('DROP TABLE'));
  assert.ok(!search.countText.includes('DROP TABLE'));
  assert.deepEqual(search.values.slice(0, 5), [evil, '2026-10-01', '2026-10-31', '10117', evil]);
  assert.match(search.countText, /WHERE/);
});

test('paging is clamped and offset is computed', () => {
  const search = buildAssemblySearch({ page: '3', pageSize: '1000' });
  assert.equal(search.pageSize, 100);
  assert.deepEqual(search.values, [100, 200]);
  const invalid = buildAssemblySearch({ page: '-2', pageSize: 'abc' });
  assert.deepEqual([invalid.page, invalid.pageSize], [1, 25]);
});

test('count query uses the filter parameters only', () => {
  const search = buildAssemblySearch({ plz: '10117' });
  assert.equal(search.values.slice(0, -2).length, 1);
  assert.doesNotMatch(search.countText, /LIMIT/);
});
