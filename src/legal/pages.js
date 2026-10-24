import { APP_NAME, buildNav } from '../shared/nav.js';
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

const flag = (value) => ['1', 'true', 'on'].includes(String(value ?? '').toLowerCase());
const usersOn = (env) => flag(env.USERS_ENABLED);
// With user accounts the single shared password (AUTH_*) is not used.
const loginOn = (env) => flag(env.AUTH_ENABLED) && !usersOn(env);

function loginSection(env) {
  if (!loginOn(env)) return '';
  return `<h2>Anmeldung</h2>
<p>Der Zugang zu dieser Website ist passwortgeschützt (HTTP-Authentifizierung). Benutzername und Passwort überträgt Ihr Browser bei jeder Anfrage an den Server und werden dort nur zur Prüfung verarbeitet, nicht gespeichert. Dafür werden keine Cookies gesetzt. Nach mehreren fehlgeschlagenen Versuchen wird die Adresse vorübergehend gesperrt; dazu hält der Server die IP-Adresse kurzzeitig im Arbeitsspeicher (Art. 6 Abs. 1 lit. f DSGVO, Schutz vor missbräuchlichen Zugriffen).</p>`;
}

function accountsSection(env) {
  if (!usersOn(env)) return '';
  return `<h2>Nutzerkonten und Anmeldung</h2>
<p>Der Zugang zu dieser Website ist nur mit einem Nutzerkonto möglich. Für ein Konto speichert der Server den Benutzernamen, die Rolle (Admin oder Mitglied), den Status, den Zeitpunkt der letzten Anmeldung und das Passwort ausschließlich als Hash, nicht im Klartext. E-Mail-Adressen werden nicht erhoben. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Zugang für die vom Betreiber eingerichteten Nutzer) beziehungsweise lit. f (Sicherheit des Angebots).</p>
<p>Nach der Anmeldung setzt der Server ein Sitzungs-Cookie. Es enthält eine zufällige Kennung, ist nur für diese Website gültig, für Skripte nicht lesbar und läuft nach einer begrenzten Zeit ab; in der Datenbank wird nur ein Hash der Kennung gespeichert. Das Cookie ist für die Anmeldung unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG) und benötigt keine Einwilligung.</p>
<p>Änderungen an Konten (Anlegen, Rolle, Sperren, Passwort-Zurücksetzen, Löschen) hält der Server in einem Protokoll fest, mit dem Namen des handelnden Admins und dem Zeitpunkt. Einträge werden nach 365 Tagen gelöscht. Beim Löschen eines Kontos werden Konto und Sitzungen entfernt. Nach mehreren fehlgeschlagenen Anmeldungen wird die Adresse vorübergehend gesperrt; dazu hält der Server die IP-Adresse kurzzeitig im Arbeitsspeicher (Art. 6 Abs. 1 lit. f DSGVO).</p>`;
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
  ${usersOn(env)
    ? '<li>Nach der Anmeldung setzt die Website ein technisch notwendiges Sitzungs-Cookie, sonst keine Cookies. Es gibt keine Webanalyse und keine Werbung.</li>'
    : '<li>Diese Website setzt keine Cookies und speichert keine Daten im Browser.</li>'}
  <li>Es gibt keine Webanalyse, keine Werbung und keine eingebundenen Dienste Dritter.</li>
  <li>Schriften, Skripte, Stile und die Karte werden ausschließlich vom eigenen Server geladen.</li>
  <li>Suchanfragen werden verarbeitet, aber nicht gespeichert.</li>
</ul>
<p>${usersOn(env)
    ? 'Das Sitzungs-Cookie ist für die Anmeldung unbedingt erforderlich und braucht keine Einwilligung, deshalb gibt es keinen Cookie-Banner.'
    : 'Weil keine Cookies oder vergleichbaren Speicherzugriffe stattfinden, die eine Einwilligung erfordern, gibt es keinen Cookie-Banner.'}</p>

<h2>Aufruf der Seite</h2>
<p>Beim Aufruf überträgt Ihr Browser technisch notwendige Daten an den Server, insbesondere Ihre IP-Adresse, Datum und Uhrzeit sowie die angeforderte Adresse. Die Verarbeitung ist erforderlich, um die Seite auszuliefern und den Betrieb abzusichern (Art. 6 Abs. 1 lit. f DSGVO). Die Anwendung selbst führt keine Zugriffsprotokolle und speichert keine IP-Adressen.</p>
<h3>Hosting</h3>
${hosting}

${loginSection(env)}
${accountsSection(env)}

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

function logoutItem() {
  return `<li><form method="post" action="/abmelden"><button type="submit" class="nav-item" data-tooltip="Abmelden">${iconSvg('LogOut', 18)}<span class="nav-label">Abmelden</span></button></form></li>`;
}

// Same sidebar, header and content frame as the React app. `user` decides which navigation is shown.
export function renderPage({ title, body, stylesheet, areaName = title, activeId = '', user = null, wide = false }) {
  const nav = buildNav(user);
  const mainNav = nav.main.length ? `<nav aria-label="Bereiche"><ul class="nav-list">${nav.main.map((item) => navItem(item, activeId)).join('')}</ul></nav>` : '';
  const account = user
    ? `<a class="icon-button header-account" href="/konto" aria-label="Konto von ${escapeHtml(user.username)}"${activeId === 'account' ? ' aria-current="page"' : ''}>${iconSvg('UserRound', 18)}</a>`
    : '';
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
    ${mainNav}
    <nav class="nav-secondary" aria-label="Weitere Links"><ul class="nav-list">${nav.secondary.map((item) => navItem(item, activeId)).join('')}${nav.logout ? logoutItem() : ''}</ul></nav>
  </aside>
  <div class="app-main">
    <header class="app-header">
      <button type="button" class="icon-button menu-button" data-menu-button aria-label="Menü öffnen" aria-expanded="false" aria-controls="sidebar">${iconSvg('Menu', 18)}</button>
      <p class="header-title">${escapeHtml(areaName)}</p>
      ${account}
    </header>
    <main id="inhalt" class="content" tabindex="-1">
      <div class="content-inner"><div class="${wide ? 'wide' : 'legal'}">${body}</div></div>
    </main>
  </div>
  <script type="module" src="/nav.js"></script>
</body>
</html>`;
}

export function renderLegalPage(kind, { env = process.env, stylesheet, user = null }) {
  if (kind === 'impressum') return renderPage({ title: 'Impressum', body: impressum(env), stylesheet, activeId: 'impressum', user });
  if (kind === 'datenschutz') return renderPage({ title: 'Datenschutzerklärung', areaName: 'Datenschutz', body: datenschutz(env), stylesheet, activeId: 'datenschutz', user });
  throw new Error(`Unknown legal page: ${kind}`);
}

export function renderNotFound({ stylesheet, user = null }) {
  return renderPage({
    title: 'Seite nicht gefunden',
    body: '<h1 class="page-title">Seite nicht gefunden</h1><p>Diese Adresse gibt es nicht. <a href="/">Zurück zur Übersicht</a></p>',
    stylesheet,
    user,
  });
}

function field({ id, label, type = 'text', value = '', autocomplete, error, hint, required = true }) {
  const described = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ');
  return `<div class="field">
    <label class="field-label" for="${id}">${escapeHtml(label)}</label>
    <input class="input" id="${id}" name="${id}" type="${type}" value="${escapeHtml(value)}"${autocomplete ? ` autocomplete="${autocomplete}"` : ''}${required ? ' required' : ''}${error ? ' aria-invalid="true"' : ''}${described ? ` aria-describedby="${described}"` : ''}>
    ${hint ? `<span class="text-description" id="${id}-hint">${escapeHtml(hint)}</span>` : ''}
    ${error ? `<span class="field-error" id="${id}-error">${escapeHtml(error)}</span>` : ''}
  </div>`;
}

const notice = (text, kind = 'notice') => `<p class="${kind}" role="${kind === 'alert' ? 'alert' : 'status'}">${iconSvg(kind === 'alert' ? 'CircleAlert' : 'Info', 16)}<span>${escapeHtml(text)}</span></p>`;

export function renderLoginPage({ stylesheet, error = '', username = '', next = '/' }) {
  const body = `
<div class="page-head"><div>
  <h1 class="page-title">Anmelden</h1>
  <p class="page-desc">Diese Seite ist nur für angemeldete Nutzer.</p>
</div></div>
<form class="card form-narrow stack" method="post" action="/anmelden">
  ${error ? notice(error, 'alert') : ''}
  <input type="hidden" name="weiter" value="${escapeHtml(next)}">
  ${field({ id: 'benutzername', label: 'Benutzername', value: username, autocomplete: 'username' })}
  ${field({ id: 'passwort', label: 'Passwort', type: 'password', autocomplete: 'current-password' })}
  <div class="form-actions"><button type="submit" class="btn btn-primary">${iconSvg('LogIn', 16)}Anmelden</button></div>
</form>`;
  return renderPage({ title: 'Anmelden', body, stylesheet, activeId: '', user: null, wide: true });
}

export function renderAccountPage({ stylesheet, user, errors = {}, ok = false, forced = false }) {
  const body = `
<div class="page-head"><div>
  <h1 class="page-title">Konto</h1>
  <p class="page-desc">Angemeldet als ${escapeHtml(user.username)}</p>
</div></div>
<div class="detail-stack form-narrow">
  ${forced ? notice('Vor der weiteren Nutzung muss ein neues Passwort gewählt werden.') : ''}
  ${ok ? notice('Das Passwort wurde geändert.') : ''}
  <section class="card">
    <dl class="facts">
      <dt>Benutzername</dt><dd>${escapeHtml(user.username)}</dd>
      <dt>Rolle</dt><dd>${user.role === 'admin' ? 'Admin' : 'Mitglied'}</dd>
    </dl>
  </section>
  <form class="card stack" method="post" action="/konto/passwort">
    <h2 class="card-title">Passwort ändern</h2>
    ${errors.general ? notice(errors.general, 'alert') : ''}
    ${field({ id: 'aktuell', label: 'Bisheriges Passwort', type: 'password', autocomplete: 'current-password', error: errors.current })}
    ${field({ id: 'neu', label: 'Neues Passwort', type: 'password', autocomplete: 'new-password', hint: 'Mindestens 12 Zeichen.', error: errors.next })}
    ${field({ id: 'wiederholung', label: 'Neues Passwort wiederholen', type: 'password', autocomplete: 'new-password', error: errors.repeat })}
    <div class="form-actions"><button type="submit" class="btn btn-primary">${iconSvg('Check', 16)}Passwort ändern</button></div>
  </form>
  <form method="post" action="/abmelden"><button type="submit" class="btn btn-secondary">${iconSvg('LogOut', 16)}Abmelden</button></form>
</div>`;
  return renderPage({ title: 'Konto', body, stylesheet, activeId: 'account', user, wide: true });
}

export function renderForbiddenPage({ stylesheet, user }) {
  return renderPage({
    title: 'Kein Zugriff',
    body: '<h1 class="page-title">Kein Zugriff</h1><p class="page-desc">Dieser Bereich ist nur für Admins gedacht.</p><p><a href="/">Zurück zur Übersicht</a></p>',
    stylesheet, user,
  });
}
