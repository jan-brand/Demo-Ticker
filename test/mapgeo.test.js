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

test('the wheel zooms proportionally and gently, in both directions', async () => {
  const { wheelFactor, WHEEL_ZOOM_SPEED } = await import('../src/frontend/mapgeo.js');
  const notch = wheelFactor(100);
  assert.ok(notch > 1.05 && notch < 1.13, `one notch changes the zoom by ${((notch - 1) * 100).toFixed(1)} %`); // earlier: 25 % per event
  assert.ok(Math.abs(wheelFactor(-100) * notch - 1) < 1e-9); // zooming in and out cancel each other
  assert.ok(wheelFactor(-100) < 1 && wheelFactor(100) > 1);
  assert.ok(wheelFactor(4) < 1.005); // a fine touchpad movement changes almost nothing
  assert.equal(wheelFactor(0), 1);
  assert.ok(Math.abs(wheelFactor(6000) - wheelFactor(240)) < 1e-9); // a huge jump is limited
  assert.ok(Math.abs(wheelFactor(1, 1) - wheelFactor(16)) < 1e-9); // lines
  assert.ok(Math.abs(wheelFactor(1, 2) - wheelFactor(100)) < 1e-9); // pages
  assert.ok(WHEEL_ZOOM_SPEED > 0 && WHEEL_ZOOM_SPEED < 0.002);
  // many small events add up to the same as one big one
  let combined = 1;
  for (let i = 0; i < 10; i += 1) combined *= wheelFactor(10);
  assert.ok(Math.abs(combined - wheelFactor(100)) < 1e-9);
});

test('the view glides towards the goal and stops exactly on it', async () => {
  const { lerpView } = await import('../src/frontend/mapgeo.js');
  const goal = { x: 100, y: 80, w: 250, h: 205.75 };
  let view = { x: 0, y: 0, w: 1000, h: 823 };
  const first = lerpView(view, goal, 0.25);
  assert.ok(first.w < 1000 && first.w > 250 && first.x > 0 && first.x < 100);
  let steps = 0;
  while (view !== goal && steps < 200) { const next = lerpView(view, goal, 0.25); if (next.w === goal.w && next.x === goal.x) { view = goal; } else view = next; steps += 1; }
  assert.ok(steps < 100 && view === goal);
  assert.deepEqual(lerpView(goal, goal, 0.25), goal);
});

test('screen positions are converted correctly, also when the map is letterboxed', async () => {
  const { clientToMap, FULL_VIEW } = await import('../src/frontend/mapgeo.js');
  // exact fit: the center of the element is the center of the map
  const fit = clientToMap({ left: 10, top: 20, width: 500, height: 411.5 }, FULL_VIEW, 260, 225.75);
  assert.ok(Math.abs(fit.x - 500) < 1e-6 && Math.abs(fit.y - 411.5) < 1e-6 && Math.abs(fit.scale - 0.5) < 1e-9);
  // wide element (fullscreen): the map is as high as the element and centered, bars left and right
  const wide = { left: 0, top: 0, width: 1600, height: 823 };
  const left = clientToMap(wide, FULL_VIEW, 300, 0); // 300 px = exactly the left edge of the map (1600 - 1000) / 2
  assert.ok(Math.abs(left.x) < 1e-6 && Math.abs(left.scale - 1) < 1e-9);
  assert.ok(Math.abs(clientToMap(wide, FULL_VIEW, 800, 411.5).x - 500) < 1e-6); // middle of the screen = middle of the map
  assert.ok(clientToMap(wide, FULL_VIEW, 100, 100).x < 0); // on the bar, outside of the map
  // zoomed view: 100 map units wide in a 1000 px element
  const zoomed = clientToMap({ left: 0, top: 0, width: 1000, height: 822 }, { x: 400, y: 300, w: 100, h: 82.3 }, 500, 411);
  assert.ok(Math.abs(zoomed.x - 450) < 1e-6 && Math.abs(zoomed.y - 341.15) < 1e-6);
});
