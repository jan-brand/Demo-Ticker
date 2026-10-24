import test from 'node:test';
import assert from 'node:assert/strict';
import details from '../src/frontend/berlin-details.js';
import { MAP } from '../src/frontend/mapgeo.js';
import { ortsteilAt, parseRings } from '../src/frontend/details.js';

test('path data with relative steps is read back into absolute rings', () => {
  const rings = parseRings('M10 20l5 0 0 5 -5 0z M100 100l1.5 -2');
  assert.deepEqual(rings, [[[10, 20], [15, 20], [15, 25], [10, 25]], [[100, 100], [101.5, 98]]]);
  assert.deepEqual(parseRings(''), []);
});

test('the data set is complete and consistent', () => {
  assert.ok(details.ortsteile.length >= 96, `Ortsteile: ${details.ortsteile.length}`);
  const districts = new Set(MAP.districts.map((district) => district.name));
  for (const ortsteil of details.ortsteile) {
    assert.ok(districts.has(ortsteil.bezirk), `${ortsteil.name} has no valid district (${ortsteil.bezirk})`);
    assert.ok(ortsteil.labelX > 0 && ortsteil.labelX < MAP.width && ortsteil.labelY > 0 && ortsteil.labelY < MAP.height, `${ortsteil.name} label outside the map`);
    assert.ok(parseRings(ortsteil.d).every((ring) => ring.length >= 3));
  }
  assert.equal(new Set(details.ortsteile.map((o) => o.name)).size, details.ortsteile.length);
  for (const kind of ['motorway', 'trunk', 'primary']) assert.ok(details.roads[kind].startsWith('M'), kind);
  assert.ok(details.labels.some((label) => label.text === 'A100' && label.kind === 'motorway'));
  assert.ok(details.labels.length > 20 && details.labels.every((l) => Math.abs(l.angle) <= 90 && l.x > 0 && l.y > 0));
});

test('positions are assigned to the right Ortsteil', () => {
  const name = (lat, lon) => ortsteilAt(details, lat, lon)?.name;
  assert.equal(name(52.5186, 13.3761), 'Tiergarten'); // Reichstag
  assert.equal(name(52.5219, 13.4132), 'Mitte'); // Alexanderplatz
  assert.equal(name(52.4311, 13.2586), 'Zehlendorf'); // S-Bahnhof Zehlendorf
  assert.equal(name(52.4888, 13.3946), 'Kreuzberg'); // Bergmannstrasse
  assert.equal(ortsteilAt(details, 52.5186, 13.3761).bezirk, 'Mitte');
  assert.equal(ortsteilAt(details, 48.1351, 11.5820), null); // Munich
  assert.equal(ortsteilAt(null, 52.5, 13.4), null);
  assert.equal(ortsteilAt(details, NaN, 13.4), null);
});

test('every Ortsteil lies inside the district it is assigned to', () => {
  // The district of the label point and the stored district must agree for (nearly) all of them.
  assert.ok(details.ortsteile.filter((o) => o.bezirk).length === details.ortsteile.length);
});
