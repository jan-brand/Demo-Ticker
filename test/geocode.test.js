import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeocodeRequests, cleanStreet, insideBerlin, parseGeocodeResult } from '../src/geo/geocode.js';

test('street is reduced to a single geocodable address', () => {
  assert.equal(cleanStreet('Platz der Republik 1'), 'Platz der Republik 1');
  assert.equal(cleanStreet('Unter den Linden 12-14'), 'Unter den Linden 12');
  assert.equal(cleanStreet('Hauptstr. 3a, Hinterhof'), 'Hauptstr. 3a');
  assert.equal(cleanStreet('Am Rosensteig  - > alle 2 Stunden'), 'Am Rosensteig');
  assert.equal(cleanStreet(null), '');
  assert.ok(cleanStreet('x'.repeat(300)).length <= 100);
});

test('structured request first, free text as fallback', () => {
  const requests = buildGeocodeRequests({ strasseNr: 'Platz der Republik 1', plz: '10557' });
  assert.deepEqual(requests[0], { street: 'Platz der Republik 1', postalcode: '10557', city: 'Berlin' });
  assert.deepEqual(requests[1], { q: 'Platz der Republik 1, 10557 Berlin' });
});

test('without a valid postcode only the free text request is used', () => {
  const requests = buildGeocodeRequests({ strasseNr: 'Alexanderplatz', plz: '' });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].q, 'Alexanderplatz, Berlin');
  assert.equal(buildGeocodeRequests({ strasseNr: 'Alexanderplatz', plz: 'abc' }).length, 1);
});

test('entries without a street are not geocoded', () => {
  assert.deepEqual(buildGeocodeRequests({ strasseNr: '', plz: '10115' }), []);
  assert.deepEqual(buildGeocodeRequests({ strasseNr: null, plz: null }), []);
});

test('results outside of Berlin are rejected', () => {
  assert.deepEqual(parseGeocodeResult([{ lat: '52.5186538', lon: '13.3761015' }]), { lat: 52.5186538, lon: 13.3761015 });
  assert.equal(parseGeocodeResult([{ lat: '48.1351', lon: '11.5820' }]), null); // Munich
  assert.equal(parseGeocodeResult([]), null);
  assert.equal(parseGeocodeResult([{ lat: 'x', lon: 'y' }]), null);
  assert.equal(insideBerlin(52.52, 13.4), true);
  assert.equal(insideBerlin(53.55, 10.0), false);
});
