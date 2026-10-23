import crypto from 'node:crypto';

const FIRST_RECURRING_DATE = /(?:vom|ab)\s+(\d{1,2}\.\d{1,2}(?:\.\d{4})?)/i;
const LAST_RECURRING_DATE = /(?:bis|bis zum)\s+(\d{1,2}\.\d{1,2}\.\d{4})/i;
const RECURRING_MARKER = /\b(?:täglich|werktäglich|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/i;

const FIELD_ALIASES = {
  date: ['datum', 'date', 'begin', 'start_date'],
  from: ['von', 'from', 'start', 'begin_time'],
  to: ['bis', 'to', 'end', 'end_time'],
  topic: ['thema', 'topic', 'anlass', 'bezeichnung'],
  postalCode: ['plz', 'postal_code', 'postleitzahl'],
  address: ['strasse_nr', 'straße_nr', 'strasse', 'straße', 'address', 'ort'],
  route: ['aufzugsstrecke', 'aufzugstrecke', 'route', 'strecke'],
};

function firstValue(entry, aliases) {
  for (const alias of aliases) {
    if (entry[alias] !== undefined && entry[alias] !== null) return entry[alias];
  }
  const normalizedEntries = Object.entries(entry).map(([key, value]) => [
    key.toLocaleLowerCase('de-DE').replace(/[^a-z0-9äöüß]/g, ''),
    value,
  ]);
  for (const alias of aliases) {
    const normalizedAlias = alias.toLocaleLowerCase('de-DE').replace(/[^a-z0-9äöüß]/g, '');
    const match = normalizedEntries.find(([key]) => key === normalizedAlias);
    if (match?.[1] !== undefined && match[1] !== null) return match[1];
  }
  return '';
}

function text(value) {
  return String(value ?? '').trim();
}

function parseDate(value) {
  const raw = text(value);
  const match = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (!match) throw new Error(`Unsupported date: ${raw || '(empty)'}`);
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

function parseRecurringDate(value, fallbackYear) {
  const match = text(value).match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?/);
  const year = match?.[3] ?? fallbackYear;
  return match && year ? `${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : null;
}

function normalizeTime(value) {
  const raw = text(value);
  if (!raw) return null;
  const match = raw.match(/(\d{1,2})[:.](\d{2})/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null;
}

export function recurringDetails(topic, fallbackYear = null) {
  const value = text(topic);
  const recurring = RECURRING_MARKER.test(value) && Boolean(value.match(FIRST_RECURRING_DATE) || value.match(LAST_RECURRING_DATE));
  return {
    isRecurring: recurring,
    recurringStart: recurring ? parseRecurringDate(value.match(FIRST_RECURRING_DATE)?.[1], fallbackYear) : null,
    recurringEnd: recurring ? parseRecurringDate(value.match(LAST_RECURRING_DATE)?.[1], fallbackYear) : null,
  };
}

export function normalizeAssembly(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error('Each assembly must be a JSON object');
  }
  const datum = parseDate(firstValue(entry, FIELD_ALIASES.date));
  const von = normalizeTime(firstValue(entry, FIELD_ALIASES.from));
  const bis = normalizeTime(firstValue(entry, FIELD_ALIASES.to));
  const thema = text(firstValue(entry, FIELD_ALIASES.topic));
  const plz = text(firstValue(entry, FIELD_ALIASES.postalCode)) || null;
  const strasseNr = text(firstValue(entry, FIELD_ALIASES.address)) || null;
  const aufzugsstrecke = text(firstValue(entry, FIELD_ALIASES.route)) || null;
  const recurring = recurringDetails(thema, datum.slice(0, 4));
  const externalInput = [datum, von ?? '', thema, plz ?? '', strasseNr ?? '', aufzugsstrecke ?? '']
    .join('|')
    .normalize('NFKC')
    .toLocaleLowerCase('de-DE');

  return {
    externalKey: crypto.createHash('sha256').update(externalInput, 'utf8').digest('hex'),
    datum,
    von,
    bis,
    thema,
    plz,
    strasseNr,
    aufzugsstrecke,
    ...recurring,
    sourceData: entry,
  };
}

export function diffAssembly(previous, current) {
  const fields = ['datum', 'von', 'bis', 'thema', 'plz', 'strasseNr', 'aufzugsstrecke', 'isRecurring', 'recurringStart', 'recurringEnd'];
  return Object.fromEntries(fields
    .filter((field) => previous[field] !== current[field])
    .map((field) => [field, { before: previous[field] ?? null, after: current[field] ?? null }]));
}

export function extractEntries(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['data', 'results', 'items', 'versammlungen', 'assemblies']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  throw new Error('API response does not contain an assembly array');
}
