import test from 'node:test';
import assert from 'node:assert/strict';
import { quickRanges } from '../src/frontend/ranges.js';

const byId = (today) => Object.fromEntries(quickRanges(today).map((range) => [range.id, range]));

test('Saturday 24.10.2026: week ends Sunday, next week is Monday to Sunday', () => {
  const ranges = byId(new Date(2026, 9, 24));
  assert.deepEqual([ranges.today.dateFrom, ranges.today.dateTo], ['2026-10-24', '2026-10-24']);
  assert.deepEqual([ranges.week.dateFrom, ranges.week.dateTo], ['2026-10-24', '2026-10-25']);
  assert.deepEqual([ranges.nextWeek.dateFrom, ranges.nextWeek.dateTo], ['2026-10-26', '2026-11-01']);
  assert.deepEqual([ranges.month.dateFrom, ranges.month.dateTo], ['2026-10-24', '2026-10-31']);
  assert.deepEqual([ranges.nextMonth.dateFrom, ranges.nextMonth.dateTo], ['2026-11-01', '2026-11-30']);
});

test('Sunday: this week is only today, next week starts tomorrow', () => {
  const ranges = byId(new Date(2026, 9, 25));
  assert.deepEqual([ranges.week.dateFrom, ranges.week.dateTo], ['2026-10-25', '2026-10-25']);
  assert.deepEqual([ranges.nextWeek.dateFrom, ranges.nextWeek.dateTo], ['2026-10-26', '2026-11-01']);
});

test('Monday: this week runs through the coming Sunday', () => {
  const ranges = byId(new Date(2026, 9, 26));
  assert.deepEqual([ranges.week.dateFrom, ranges.week.dateTo], ['2026-10-26', '2026-11-01']);
  assert.deepEqual([ranges.nextWeek.dateFrom, ranges.nextWeek.dateTo], ['2026-11-02', '2026-11-08']);
});

test('year boundary and February', () => {
  const december = byId(new Date(2026, 11, 15));
  assert.deepEqual([december.nextMonth.dateFrom, december.nextMonth.dateTo], ['2027-01-01', '2027-01-31']);
  const january = byId(new Date(2028, 0, 31));
  assert.deepEqual([january.month.dateTo, january.nextMonth.dateTo], ['2028-01-31', '2028-02-29']);
});

test('open ranges', () => {
  const ranges = byId(new Date(2026, 9, 24));
  assert.deepEqual([ranges.upcoming.dateFrom, ranges.upcoming.dateTo], ['2026-10-24', '']);
  assert.deepEqual([ranges.all.dateFrom, ranges.all.dateTo], ['', '']);
});
