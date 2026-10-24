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

export function missingLegalFields(env = process.env) {
  return REQUIRED.filter(([key]) => !String(env[key] ?? '').trim()).map(([key, label]) => ({ key, label }));
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
  return `<div class="notice" role="alert"><strong>Angaben des Betreibers fehlen.</strong> Diese Seite darf so nicht veröffentlicht werden. Folgende Werte in der <code>.env</code> ergänzen:<ul>${list}</ul></div>`;
}

function impressum(env) {
  return `
<h1>Impressum</h1>
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
vermerkt spätere Änderungen. Für die Richtigkeit, Vollständigkeit und Aktualität ist ausschließlich die Quelle maßgeblich.</p>`;
}

function datenschutz(env) {
  const hosting = env.LEGAL_HOSTING
    ? `<p>${escapeHtml(env.LEGAL_HOSTING)}</p>`
    : '<p>Der Betreiber ergänzt hier, bei welchem Anbieter die Anwendung gehostet wird und ob dieser Zugriffsprotokolle führt (Angabe über <code>LEGAL_HOSTING</code> in der <code>.env</code>).</p>';
  return `
<h1>Datenschutzerklärung</h1>
${warningBlock(env)}
<h2>Verantwortlicher</h2>
${operatorBlock(env)}
${contactBlock(env)}

<h2>Das Wichtigste in Kürze</h2>
<ul>
  <li>Diese Website setzt keine Cookies und speichert keine Daten im Browser.</li>
  <li>Es gibt keine Webanalyse, keine Werbung und keine eingebundenen Dienste Dritter.</li>
  <li>Schriften, Skripte und Stile werden ausschließlich vom eigenen Server geladen.</li>
  <li>Suchanfragen werden verarbeitet, aber nicht gespeichert.</li>
</ul>
<p>Weil keine Cookies oder vergleichbaren Speicherzugriffe stattfinden, die eine Einwilligung erfordern, gibt es keinen Cookie-Banner.</p>

<h2>Aufruf der Seite</h2>
<p>Beim Aufruf überträgt Ihr Browser technisch notwendige Daten an den Server, insbesondere Ihre IP-Adresse, Datum und Uhrzeit sowie die angeforderte Adresse. Die Verarbeitung ist erforderlich, um die Seite auszuliefern und den Betrieb abzusichern (Art. 6 Abs. 1 lit. f DSGVO). Die Anwendung selbst führt keine Zugriffsprotokolle und speichert keine IP-Adressen.</p>
<h3>Hosting</h3>
${hosting}

<h2>Suche</h2>
<p>Suchbegriffe, Zeiträume, Postleitzahl und Straße werden an den Server übertragen, um die Trefferliste zu erstellen. Sie werden nicht gespeichert und nicht ausgewertet.</p>

<h2>Archivierte Versammlungsdaten</h2>
<p>Demo-Ticker speichert die von der Polizei Berlin veröffentlichten Angaben zu Versammlungen (Datum, Zeit, Thema, Ort, Strecke) samt Änderungshistorie. Themenangaben können im Einzelfall Hinweise auf Personen oder Organisationen enthalten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; das berechtigte Interesse liegt in der nachvollziehbaren Dokumentation öffentlich bekannt gemachter Versammlungen. Einträge, die die Quelle nicht mehr nennt, bleiben als „aus der Quelle entfernt“ markiert erhalten.</p>

<h2>Ihre Rechte</h2>
<p>Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch gegen die Verarbeitung (Art. 15 bis 21 DSGVO). Wenden Sie sich dafür an die oben genannte Kontaktadresse. Außerdem können Sie sich bei einer Datenschutzaufsichtsbehörde beschweren, zum Beispiel bei der ${AUTHORITY}.</p>`;
}

export function renderPage({ title, body, stylesheet }) {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${escapeHtml(title)} – Demo-Ticker</title>
  <link rel="stylesheet" href="${escapeHtml(stylesheet)}">
  <link rel="alternate" type="application/atom+xml" title="Demo-Ticker: heute und die nächsten 14 Tage" href="/feed.xml">
</head>
<body>
  <a class="skip-link" href="#inhalt">Zum Inhalt springen</a>
  <header class="masthead"><p class="site-name"><a href="/">Demo-Ticker</a></p></header>
  <main id="inhalt" class="legal" tabindex="-1">${body}</main>
  <footer class="site-footer">
    <nav aria-label="Rechtliches"><a href="/">Startseite</a> <a href="/impressum">Impressum</a> <a href="/datenschutz">Datenschutz</a></nav>
  </footer>
</body>
</html>`;
}

export function renderLegalPage(kind, { env = process.env, stylesheet }) {
  if (kind === 'impressum') return renderPage({ title: 'Impressum', body: impressum(env), stylesheet });
  if (kind === 'datenschutz') return renderPage({ title: 'Datenschutzerklärung', body: datenschutz(env), stylesheet });
  throw new Error(`Unknown legal page: ${kind}`);
}

export function renderNotFound({ stylesheet }) {
  return renderPage({
    title: 'Seite nicht gefunden',
    body: '<h1>Seite nicht gefunden</h1><p>Diese Adresse gibt es nicht. <a href="/">Zurück zur Übersicht</a></p>',
    stylesheet,
  });
}
