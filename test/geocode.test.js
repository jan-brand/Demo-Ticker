import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeocodeRequests, cleanStreet, insideBerlin, parseGeocodeResult, parseStation, routeStart } from '../src/geo/geocode.js';

test('street is reduced to a single geocodable address', () => {
  assert.equal(cleanStreet('Platz der Republik 1'), 'Platz der Republik 1');
  assert.equal(cleanStreet('Unter den Linden 12-14'), 'Unter den Linden 12');
  assert.equal(cleanStreet('Hauptstr. 3a, Hinterhof'), 'Hauptstr. 3a');
  assert.equal(cleanStreet('Am Rosensteig  - > alle 2 Stunden'), 'Am Rosensteig');
  assert.equal(cleanStreet(null), '');
  assert.ok(cleanStreet('x'.repeat(300)).length <= 100);
});

test('position hints like "ggü" are dropped, real street names stay intact', () => {
  assert.equal(cleanStreet('Leipziger Platz 19 ggü'), 'Leipziger Platz 19');
  assert.equal(cleanStreet('Leipziger Platz 19 ggü.'), 'Leipziger Platz 19');
  assert.equal(cleanStreet('Karl-Marx-Allee 3 gegenüber Rathaus'), 'Karl-Marx-Allee 3');
  assert.equal(cleanStreet('Platz vor dem Neuen Tor 1'), 'Platz vor dem Neuen Tor 1');
});

test('stations are asked for as "Bahnhof <name>", with the street of the same name as fallback', () => {
  assert.equal(parseStation('S-Bhf. Zehlendorf'), 'Zehlendorf');
  assert.equal(parseStation('U-Bhf. Turmstr.'), 'Turmstr.');
  assert.equal(parseStation('S Bahnhof Treptower Park'), 'Treptower Park');
  assert.equal(parseStation('Sophienstraße 3'), null);
  assert.equal(parseStation('Südstern'), null);
  assert.deepEqual(buildGeocodeRequests({ strasseNr: 'S-Bhf. Zehlendorf', plz: '14163' }), [{ q: 'Bahnhof Zehlendorf, Berlin' }, { q: 'Zehlendorf, 14163 Berlin' }]);
  assert.deepEqual(buildGeocodeRequests({ strasseNr: 'U-Bhf. Turmstr.', plz: '10551' }), [{ q: 'Bahnhof Turmstraße, Berlin' }, { q: 'Turmstraße, 10551 Berlin' }]);
  assert.deepEqual(buildGeocodeRequests({ strasseNr: 'S-Bhf. Adlershof', plz: '' }), [{ q: 'Bahnhof Adlershof, Berlin' }]);
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

test('a march without an address is placed at the start of its route', () => {
  assert.equal(routeStart('Bundesallee 38 - Güntzelstr. - Bundesallee - Traunsteiner Str.'), 'Bundesallee 38');
  assert.equal(routeStart('NEU:   Bernauer Str. (AK an der Kapelle der Versöhnung) - Brunnenstr.'), 'Bernauer Str.');
  assert.equal(routeStart('John-F.-Kennedy-Platz (Rathaus Schöneberg) - Belziger Str.'), 'John-F.-Kennedy-Platz');
  assert.equal(routeStart('Pariser Platz (AK) - Unter den Linden'), 'Pariser Platz');
  assert.equal(routeStart('Karl-Marx-Allee 12 – Alexanderplatz'), 'Karl-Marx-Allee 12'); // en dash
  assert.equal(routeStart('Glanzstraße (S-Bahnhof Baumschulenweg) - Rodelberg'), 'Glanzstraße');
  assert.equal(routeStart('Wilmersdorfer Str./Ecke Krumme Str. - (AK) - Wilmersdorfer Str. - Schillerstr.'), 'Wilmersdorfer Str.');
  assert.equal(routeStart('(Neu): Torstr./Tucholskystr. (AP) - Torstr./Borsigstr. (ZK)'), 'Torstr.');
  assert.equal(routeStart('(Alt): Torstr. / Tucholskystr. - Torstr.'), 'Torstr.');
  assert.equal(routeStart('NEU:  Mauerstr/Französ. Str. (AP) - Französische Str.'), 'Mauerstr');
  assert.equal(routeStart('Erdener Straße/Königsallee (AK) -  Erdener Str.'), 'Erdener Straße');
  assert.equal(routeStart(''), '');
  assert.equal(routeStart(null), '');
  assert.deepEqual(buildGeocodeRequests({ strasseNr: '', plz: '10117', aufzugsstrecke: 'Pariser Platz (AK) - Unter den Linden' })[0], { street: 'Pariser Platz', postalcode: '10117', city: 'Berlin' });
  // the address field wins when it is filled
  assert.equal(buildGeocodeRequests({ strasseNr: 'Hauptstr. 1', plz: '', aufzugsstrecke: 'Pariser Platz - X' })[0].q, 'Hauptstr. 1, Berlin');
});

test('entries without a street are not geocoded', () => {
  assert.deepEqual(buildGeocodeRequests({ strasseNr: '', plz: '10115' }), []);
  assert.deepEqual(buildGeocodeRequests({ strasseNr: '', plz: '10115', aufzugsstrecke: '' }), []);
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
