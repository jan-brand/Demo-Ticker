import { APP_NAME, NAV_MAIN, NAV_SECONDARY } from '../shared/nav.js';
import { iconSvg } from './icons.js';

// Server-rendered Impressum and Datenschutzerklärung. The operator's details come from the environment,
// so no personal data is stored in the repository. Missing details are shown as a visible warning.

const REQUIRED = [
  ['LEGAL_NAME', 'Name'],
  ['LEGAL_STREET', 'Straße und Hausnummer'],
  ['LEGAL_CITY', 'Postleitzahl und Ort'],
  ['LEGAL_EMAIL', 'E-Mail-Adresse'],
];

const SOURCE_URL = 'https://www.berlin.de/polizei/service/versammlungsbehoerde/versammlungen-aufzuege/';
const AUTHORITY = 'Berliner Beauftragte für Datenschutz und Informationsfreiheit';

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
));

// Values that still start with the marker from the template count as missing, so a forgotten placeholder never
// passes as a real imprint.
const PLACEHOLDER = /^\s*BITTE ANPASSEN/i;
const isFilled = (value) => String(value ?? '').trim() !== '' && !PLACEHOLDER.test(String(value));

export function missingLegalFields(env = process.env) {
  return REQUIRED.filter(([key]) => !isFilled(env[key])).map(([key, label]) => ({ key, label }));
}

function operatorBlock(env) {
  const lines = [env.LEGAL_NAME, env.LEGAL_STREET, env.LEGAL_CITY].filter((line) => String(line ?? '').trim()).map(escapeHtml);
  return lines.length ? `<p>${lines.join('<br>')}</p>` : '';
}

function contactBlock(env) {
  const parts = [];
  if (env.LEGAL_EMAIL) parts.push(`E-Mail: <a href="mailto:${escapeHtml(env.LEGAL_EMAIL)}">${escapeHtml(env.LEGAL_EMAIL)}</a>`);
  if (env.LEGAL_PHONE) parts.push(`Telefon: ${escapeHtml(env.LEGAL_PHONE)}`);
  return parts.length ? `<p>${parts.join('<br>')}</p>` : '';
}

function warningBlock(env) {
  const missing = missingLegalFields(env);
  if (!missing.length) return '';
  const list = missing.map(({ key, label }) => `<li>${escapeHtml(label)} (<code>${key}</code>)</li>`).join('');
  return `<div class="alert" role="alert">${iconSvg('CircleAlert', 16)}<div><strong>Angaben des Betreibers fehlen.</strong> Diese Seite darf so nicht veröffentlicht werden. Folgende Werte in der <code>.env</code> ergänzen:<ul>${list}</ul></div></div>`;
}

function impressum(env) {
  return `
<h1 class="page-title">Impressum</h1>
${warningBlock(env)}
<h2>Angaben nach § 5 DDG</h2>
${operatorBlock(env)}
<h2>Kontakt</h2>
${contactBlock(env)}
<h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
${operatorBlock(env)}
<h2>Herkunft der Daten</h2>
<p>Die angezeigten Versammlungen stammen aus den öffentlich abrufbaren Angaben der Polizei Berlin
(<a href="${SOURCE_URL}" rel="noopener">Versammlungen und Aufzüge</a>). Demo-Ticker archiviert diese Angaben und
vermerkt spätere Änderungen. Für die Richtigkeit, Vollständigkeit und Aktualität ist ausschließlich die Quelle maßgeblich.</p>
<p>Die Bezirksgrenzen der Karte stammen aus dem Datensatz „ALKIS Berlin Bezirke“ des Geoportals Berlin (Senatsverwaltung für Stadtentwicklung, Bauen und Wohnen, <a href="https://www.govdata.de/dl-de/zero-2-0" rel="noopener">Datenlizenz Deutschland – Zero – Version 2.0</a>). Die Positionen der Versammlungen werden aus den Adressen mit Nominatim ermittelt, © OpenStreetMap-Mitwirkende (<a href="https://www.openstreetmap.org/copyright" rel="noopener">ODbL</a>).</p>`;
}

const loginOn = (env) => ['1', 'true', 'on'].includes(String(env.AUTH_ENABLED ?? '').toLowerCase());

function loginSection(env) {
  if (!loginOn(env)) return '';
  return `<h2>Anmeldung</h2>
<p>Der Zugang zu dieser Website ist passwortgeschützt (HTTP-Authentifizierung). Benutzername und Passwort überträgt Ihr Browser bei jeder Anfrage an den Server und werden dort nur zur Prüfung verarbeitet, nicht gespeichert. Dafür werden keine Cookies gesetzt. Nach mehreren fehlgeschlagenen Versuchen wird die Adresse vorübergehend gesperrt; dazu hält der Server die IP-Adresse kurzzeitig im Arbeitsspeicher (Art. 6 Abs. 1 lit. f DSGVO, Schutz vor missbräuchlichen Zugriffen).</p>`;
}

function datenschutz(env) {
  const hosting = isFilled(env.LEGAL_HOSTING)
    ? `<p>${escapeHtml(env.LEGAL_HOSTING)}</p>`
    : '<p>Der Betreiber ergänzt hier, bei welchem Anbieter die Anwendung gehostet wird und ob dieser Zugriffsprotokolle führt (Angabe über <code>LEGAL_HOSTING</code> in der <code>.env</code>).</p>';
  return `
<h1 class="page-title">Datenschutzerklärung</h1>
${warningBlock(env)}
<h2>Verantwortlicher</h2>
${operatorBlock(env)}
${contactBlock(env)}

<h2>Das Wichtigste in Kürze</h2>
<ul>
  <li>Diese Website setzt keine Cookies und speichert keine Daten im Browser.</li>
  <li>Es gibt keine Webanalyse, keine Werbung und keine eingebundenen Dienste Dritter.</li>
  <li>Schriften, Skripte, Stile und die Karte werden ausschließlich vom eigenen Server geladen.</li>
  <li>Suchanfragen werden verarbeitet, aber nicht gespeichert.</li>
</ul>
<p>Weil keine Cookies oder vergleichbaren Speicherzugriffe stattfinden, die eine Einwilligung erfordern, gibt es keinen Cookie-Banner.</p>

<h2>Aufruf der Seite</h2>
<p>Beim Aufruf überträgt Ihr Browser technisch notwendige Daten an den Server, insbesondere Ihre IP-Adresse, Datum und Uhrzeit sowie die angeforderte Adresse. Die Verarbeitung ist erforderlich, um die Seite auszuliefern und den Betrieb abzusichern (Art. 6 Abs. 1 lit. f DSGVO). Die Anwendung selbst führt keine Zugriffsprotokolle und speichert keine IP-Adressen.</p>
<h3>Hosting</h3>
${hosting}

${loginSection(env)}

<h2>Suche</h2>
<p>Suchbegriffe, Zeiträume, Postleitzahl und Straße werden an den Server übertragen, um die Trefferliste zu erstellen. Sie werden nicht gespeichert und nicht ausgewertet.</p>

<h2>Archivierte Versammlungsdaten</h2>
<p>Demo-Ticker speichert die von der Polizei Berlin veröffentlichten Angaben zu Versammlungen (Datum, Zeit, Thema, Ort, Strecke) samt Änderungshistorie. Themenangaben können im Einzelfall Hinweise auf Personen oder Organisationen enthalten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; das berechtigte Interesse liegt in der nachvollziehbaren Dokumentation öffentlich bekannt gemachter Versammlungen. Einträge, die die Quelle nicht mehr nennt, bleiben als „aus der Quelle entfernt“ markiert erhalten.</p>

<h2>Karte und Ortsbestimmung</h2>
<p>Die Kartenansicht wird vollständig auf diesem Server erzeugt. Es werden keine Kartenkacheln, Schriften oder Skripte von Dritten geladen, Ihre IP-Adresse gelangt dadurch an keinen Kartenanbieter.</p>
<p>Um Versammlungen auf der Karte zu zeigen, ermittelt der Server die Koordinaten der veröffentlichten Adressen (Straße, Hausnummer, Postleitzahl) über den Geocoding-Dienst Nominatim der OpenStreetMap-Foundation. Übermittelt werden ausschließlich diese öffentlich bekannten Adressen, keine Angaben über Besucherinnen und Besucher. Die Ergebnisse stammen aus Daten der OpenStreetMap-Mitwirkenden (<a href="https://www.openstreetmap.org/copyright" rel="noopener">ODbL</a>). Die Funktion kann der Betreiber abschalten.</p>

<h2>Empfänger und Speicherdauer</h2>
<p>Empfänger Ihrer technisch notwendigen Verbindungsdaten ist der oben genannte Hosting-Anbieter, soweit er die Seite ausliefert. Die Verbindungsdaten werden von der Anwendung nicht gespeichert; Aufbewahrungsfristen von Zugriffsprotokollen eines Hosters oder Proxys ergänzt der Betreiber im Abschnitt Hosting. Die archivierten Versammlungsdaten werden gespeichert, solange das Archiv betrieben wird, und auf berechtigte Anfrage berichtigt oder gelöscht. Die Bereitstellung Ihrer Daten beim Seitenaufruf ist technisch erforderlich, eine automatisierte Entscheidungsfindung oder Profilbildung findet nicht statt.</p>

<h2>Ihre Rechte</h2>
<p>Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch gegen die Verarbeitung (Art. 15 bis 21 DSGVO). Wenden Sie sich dafür an die oben genannte Kontaktadresse. Außerdem können Sie sich bei einer Datenschutzaufsichtsbehörde beschweren, zum Beispiel bei der ${AUTHORITY}.</p>`;
}

const FAVICON = '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E%3Crect width=%2732%27 height=%2732%27 rx=%276%27 fill=%27%236C584C%27/%3E%3Crect x=%277%27 y=%2720%27 width=%2718%27 height=%274%27 fill=%27%23F0EAD2%27/%3E%3Ccircle cx=%2716%27 cy=%2711%27 r=%275%27 fill=%27%23D08C60%27/%3E%3C/svg%3E">';

function navItem(item, activeId) {
  const current = item.id === activeId ? ' aria-current="page"' : '';
  const rel = item.external ? ' rel="noopener"' : '';
  return `<li><a class="nav-item" href="${escapeHtml(item.href)}" data-tooltip="${escapeHtml(item.label)}"${current}${rel}>${iconSvg(item.icon, 18)}<span class="nav-label">${escapeHtml(item.label)}</span></a></li>`;
}

// Same sidebar, header and content frame as the React app.
export function renderPage({ title, body, stylesheet, areaName = title, activeId = '' }) {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${escapeHtml(title)} – Demo-Ticker</title>
  ${FAVICON}
  <link rel="stylesheet" href="${escapeHtml(stylesheet)}">
  <link rel="alternate" type="application/atom+xml" title="Demo-Ticker: heute und die nächsten 14 Tage" href="/feed.xml">
</head>
<body>
  <a class="skip-link" href="#inhalt">Zum Inhalt springen</a>
  <div class="overlay" data-nav-overlay aria-hidden="true"></div>
  <aside id="sidebar" class="sidebar" aria-label="Navigation">
    <div class="sidebar-top">
      <a class="brand" href="/">${escapeHtml(APP_NAME)}</a>
      <button type="button" class="icon-button drawer-close" data-menu-close aria-label="Menü schließen">${iconSvg('X', 18)}</button>
    </div>
    <nav aria-label="Bereiche"><ul class="nav-list">${NAV_MAIN.map((item) => navItem(item, activeId)).join('')}</ul></nav>
    <nav class="nav-secondary" aria-label="Weitere Links"><ul class="nav-list">${NAV_SECONDARY.map((item) => navItem(item, activeId)).join('')}</ul></nav>
  </aside>
  <div class="app-main">
    <header class="app-header">
      <button type="button" class="icon-button menu-button" data-menu-button aria-label="Menü öffnen" aria-expanded="false" aria-controls="sidebar">${iconSvg('Menu', 18)}</button>
      <p class="header-title">${escapeHtml(areaName)}</p>
    </header>
    <main id="inhalt" class="content" tabindex="-1">
      <div class="content-inner"><div class="legal">${body}</div></div>
    </main>
  </div>
  <script type="module" src="/nav.js"></script>
</body>
</html>`;
}

export function renderLegalPage(kind, { env = process.env, stylesheet }) {
  if (kind === 'impressum') return renderPage({ title: 'Impressum', body: impressum(env), stylesheet, activeId: 'impressum' });
  if (kind === 'datenschutz') return renderPage({ title: 'Datenschutzerklärung', areaName: 'Datenschutz', body: datenschutz(env), stylesheet, activeId: 'datenschutz' });
  throw new Error(`Unknown legal page: ${kind}`);
}

export function renderNotFound({ stylesheet }) {
  return renderPage({
    title: 'Seite nicht gefunden',
    body: '<h1 class="page-title">Seite nicht gefunden</h1><p>Diese Adresse gibt es nicht. <a href="/">Zurück zur Übersicht</a></p>',
    stylesheet,
  });
}
