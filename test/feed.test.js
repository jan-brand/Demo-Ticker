import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeXml, feedEntryTitle, renderFeed } from '../src/api/feed.js';

const item = { id: '7', datum: '2026-10-24', von: '10:00', thema: 'Demo & <Kundgebung>', plz: '10117', strasseNr: 'Unter den Linden 1', aufzugsstrecke: '', firstSeenAt: new Date('2026-10-20T08:00:00Z'), lastChangedAt: null };

test('entry title uses the German date and time', () => {
  assert.equal(feedEntryTitle(item), '24.10.2026 10:00 – Demo & <Kundgebung>');
  assert.equal(feedEntryTitle({ ...item, von: null, thema: '' }), '24.10.2026 – Ohne Thema');
});

test('feed is a well-formed Atom document with absolute links', () => {
  const xml = renderFeed({ items: [item], baseUrl: 'https://ticker.example', updated: new Date('2026-10-24T12:00:00Z') });
  assert.match(xml, /^<\?xml version="1\.0" encoding="utf-8"\?>/);
  assert.match(xml, /<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom"/);
  assert.match(xml, /<id>https:\/\/ticker\.example\/versammlung\/7<\/id>/);
  assert.match(xml, /<updated>2026-10-20T08:00:00\.000Z<\/updated>/);
  assert.match(xml, /<summary>10117 · Unter den Linden 1<\/summary>/);
  assert.equal((xml.match(/<entry>/g) ?? []).length, 1);
});

test('free text is escaped and invalid XML characters are removed', () => {
  const xml = renderFeed({ items: [{ ...item, thema: 'A\u0001B <b>&' }], baseUrl: 'https://t.example' });
  assert.doesNotMatch(xml, /\u0001/);
  assert.match(xml, /AB &lt;b&gt;&amp;/);
  assert.equal(escapeXml(`"'`), '&quot;&apos;');
});

test('an empty feed is still valid', () => {
  const xml = renderFeed({ items: [], baseUrl: 'https://t.example' });
  assert.doesNotMatch(xml, /<entry>/);
  assert.match(xml, /<\/feed>\s*$/);
});
