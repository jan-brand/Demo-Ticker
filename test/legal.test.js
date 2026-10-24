import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, missingLegalFields, renderLegalPage } from '../src/legal/pages.js';

const complete = { LEGAL_NAME: 'Erika Mustermann', LEGAL_STREET: 'Musterstraße 1', LEGAL_CITY: '10115 Berlin', LEGAL_EMAIL: 'kontakt@example.org' };
const stylesheet = '/assets/app.css';

test('missing operator details are reported and shown as a warning', () => {
  assert.deepEqual(missingLegalFields({}).map((field) => field.key), ['LEGAL_NAME', 'LEGAL_STREET', 'LEGAL_CITY', 'LEGAL_EMAIL']);
  assert.match(renderLegalPage('impressum', { env: {}, stylesheet }), /Angaben des Betreibers fehlen/);
  assert.match(renderLegalPage('datenschutz', { env: {}, stylesheet }), /Angaben des Betreibers fehlen/);
});

test('template placeholders count as missing', () => {
  const placeholders = { LEGAL_NAME: 'BITTE ANPASSEN: Vorname Nachname', LEGAL_STREET: 'bitte anpassen', LEGAL_CITY: '10115 Berlin', LEGAL_EMAIL: 'kontakt@example.org' };
  assert.deepEqual(missingLegalFields(placeholders).map((field) => field.key), ['LEGAL_NAME', 'LEGAL_STREET']);
  assert.match(renderLegalPage('impressum', { env: placeholders, stylesheet }), /Angaben des Betreibers fehlen/);
});

test('a placeholder hosting note is not published', () => {
  const html = renderLegalPage('datenschutz', { env: { ...complete, LEGAL_HOSTING: 'BITTE ANPASSEN: Hoster' }, stylesheet });
  assert.doesNotMatch(html, /BITTE ANPASSEN/);
  assert.match(html, /Der Betreiber ergänzt hier/);
  assert.match(renderLegalPage('datenschutz', { env: { ...complete, LEGAL_HOSTING: 'Hetzner Online GmbH, Logs 7 Tage' }, stylesheet }), /Hetzner Online GmbH/);
});

test('complete details produce a page without warning', () => {
  assert.deepEqual(missingLegalFields(complete), []);
  const html = renderLegalPage('impressum', { env: complete, stylesheet });
  assert.doesNotMatch(html, /Angaben des Betreibers fehlen/);
  assert.match(html, /Erika Mustermann/);
  assert.match(html, /mailto:kontakt@example\.org/);
  assert.match(html, /§ 5 DDG/);
});

test('operator input is escaped', () => {
  const html = renderLegalPage('impressum', { env: { ...complete, LEGAL_NAME: '<script>alert(1)</script>' }, stylesheet });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.equal(escapeHtml('"\'&<>'), '&quot;&#39;&amp;&lt;&gt;');
});

test('privacy page states the facts and has a valid document skeleton', () => {
  const html = renderLegalPage('datenschutz', { env: complete, stylesheet });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<html lang="de">/);
  assert.match(html, /<title>Datenschutzerklärung – Demo-Ticker<\/title>/);
  assert.match(html, /keine Cookies/);
  assert.match(html, /Art\. 6 Abs\. 1 lit\. f DSGVO/);
  assert.match(html, /Nominatim/);
  assert.match(html, /Speicherdauer/);
  assert.match(html, /Profilbildung/);
  assert.match(html, /keine Kartenkacheln/);
  assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1);
});

test('legal pages use the same shell as the app: sidebar, header, active item, drawer script', () => {
  const html = renderLegalPage('impressum', { env: complete, stylesheet });
  assert.match(html, /<aside id="sidebar" class="sidebar"/);
  assert.match(html, /<header class="app-header">/);
  assert.match(html, /<p class="header-title">Impressum<\/p>/);
  assert.match(html, /<a class="nav-item" href="\/impressum"[^>]*aria-current="page"/);
  assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
  for (const label of ['Liste', 'Karte', 'Feed (Atom)', 'Impressum', 'Datenschutz', 'Datenquelle: Polizei Berlin']) assert.ok(html.includes(`<span class="nav-label">${label}</span>`), label);
  assert.match(html, /<script type="module" src="\/nav\.js"><\/script>/);
  assert.match(html, /<svg class="icon"/);
  assert.match(html, /aria-label="Menü öffnen"/);
  assert.doesNotMatch(html, /<script>|onclick=|style="/); // content security policy: no inline code or styles
});

test('unknown page kinds are rejected', () => {
  assert.throws(() => renderLegalPage('agb', { env: {}, stylesheet }), /Unknown legal page/);
});
