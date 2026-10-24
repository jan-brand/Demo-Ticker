import test from 'node:test';
import assert from 'node:assert/strict';
import { centerView, clampView, clusterPoints, FULL_VIEW, MIN_WIDTH, project, toPoint, zoomView } from '../src/frontend/mapgeo.js';

test('projection puts known places in a plausible order', () => {
  const [reichstagX, reichstagY] = project(52.5186, 13.3761);
  const [spandauX] = project(52.5350, 13.2000); // west
  const [koepenickX, koepenickY] = project(52.4420, 13.5800); // south-east
  assert.ok(spandauX < reichstagX && reichstagX < koepenickX);
  assert.ok(koepenickY > reichstagY);
  for (const value of [reichstagX, reichstagY]) assert.ok(value > 0);
  assert.ok(reichstagX < FULL_VIEW.w && reichstagY < FULL_VIEW.h);
});

test('the Berlin corner points land on the edges of the map', () => {
  const [, top] = project(52.6755, 13.3);
  assert.ok(top < 1);
  const [left] = project(52.5, 13.0884);
  assert.ok(left < 1);
});

test('zoom keeps the point under the cursor fixed and stays inside the map', () => {
  const zoomed = zoomView(FULL_VIEW, 0.5, 500, 400);
  assert.equal(zoomed.w, 500);
  assert.equal(zoomed.x + (500 - zoomed.x) * 0, zoomed.x);
  assert.ok(Math.abs((500 - zoomed.x) / zoomed.w - 0.5) < 1e-9);
  assert.ok(zoomed.x >= 0 && zoomed.y >= 0 && zoomed.x + zoomed.w <= FULL_VIEW.w && zoomed.y + zoomed.h <= FULL_VIEW.h);
});

test('zoom limits', () => {
  assert.equal(zoomView(FULL_VIEW, 2).w, FULL_VIEW.w);
  let view = FULL_VIEW;
  for (let i = 0; i < 20; i += 1) view = zoomView(view, 0.5);
  assert.equal(view.w, MIN_WIDTH);
  assert.deepEqual(clampView({ x: -50, y: 9999, w: 200, h: 0 }).x, 0);
});

test('centering moves the window onto a point', () => {
  const view = centerView(FULL_VIEW, 600, 300, 0.25);
  assert.equal(view.w, 250);
  assert.ok(Math.abs(view.x + view.w / 2 - 600) < 1e-9);
});

test('clustering merges close points and keeps far ones apart', () => {
  const points = [{ x: 100, y: 100 }, { x: 105, y: 102 }, { x: 400, y: 400 }];
  const clusters = clusterPoints(points, 30);
  assert.equal(clusters.length, 2);
  assert.deepEqual(clusters.map((c) => c.items.length).sort(), [1, 2]);
  const merged = clusters.find((c) => c.items.length === 2);
  assert.equal(merged.x, 102.5);
  assert.equal(merged.sameSpot, false);
});

test('identical coordinates are flagged as one spot and never split', () => {
  const clusters = clusterPoints([{ x: 50, y: 50 }, { x: 50, y: 50 }, { x: 50, y: 50 }], 1);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].sameSpot, true);
});

test('API tuples become points with projected coordinates', () => {
  const point = toPoint([7, 52.5186, 13.3761, '2026-10-24', '10:00', 'Demo', '10557', 'Platz der Republik 1']);
  assert.equal(point.id, 7);
  assert.equal(point.thema, 'Demo');
  assert.ok(point.x > 0 && point.y > 0);
});

test('a position is assigned to the right district', async () => {
  const { districtAt } = await import('../src/frontend/mapgeo.js');
  assert.equal(districtAt(52.5186, 13.3761)?.name, 'Mitte'); // Reichstag
  assert.equal(districtAt(52.5219, 13.4132)?.name, 'Mitte'); // Alexanderplatz
  assert.equal(districtAt(52.5350, 13.2000)?.name, 'Spandau');
  assert.equal(districtAt(52.4420, 13.5800)?.name, 'Treptow-Köpenick');
  assert.equal(districtAt(52.4888, 13.3946)?.name, 'Friedrichshain-Kreuzberg'); // Bergmannstr.
  assert.equal(districtAt(52.5927, 13.2996)?.name, 'Reinickendorf');
  assert.equal(districtAt(48.1351, 11.5820), null); // Munich
  assert.equal(districtAt(NaN, 13.4), null);
  assert.equal(districtAt(52.5, 13.4)?.index >= 0, true);
});

test('the OpenStreetMap link carries the position', async () => {
  const { osmUrl } = await import('../src/frontend/mapgeo.js');
  assert.equal(osmUrl(52.5186, 13.3761), 'https://www.openstreetmap.org/?mlat=52.5186&mlon=13.3761#map=17/52.5186/13.3761');
});
