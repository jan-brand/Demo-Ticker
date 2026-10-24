import { formatDate } from './format.js';

// Turns the stored diff of one change ({ field: { before, after } }) into readable lines.
const FIELDS = {
  datum: ['Datum', 'date'],
  von: ['Beginn', 'text'],
  bis: ['Ende', 'text'],
  thema: ['Thema', 'text'],
  plz: ['PLZ', 'text'],
  strasseNr: ['Ort', 'text'],
  aufzugsstrecke: ['Aufzugsstrecke', 'text'],
  isRecurring: ['Dauerversammlung', 'bool'],
  recurringStart: ['Dauerversammlung ab', 'date'],
  recurringEnd: ['Dauerversammlung bis', 'date'],
};

function formatValue(value, kind) {
  if (value === null || value === undefined || value === '') return 'leer';
  if (kind === 'bool') return value ? 'ja' : 'nein';
  if (kind === 'date') return formatDate(String(value).slice(0, 10));
  return String(value);
}

export function describeChange(diff) {
  const lines = [];
  for (const [field, change] of Object.entries(diff ?? {})) {
    if (field === 'removed') {
      lines.push(change?.after ? 'Aus der Quelle entfernt' : 'Wieder in der Quelle gelistet');
      continue;
    }
    const [label, kind] = FIELDS[field] ?? [field, 'text'];
    lines.push(`${label}: ${formatValue(change?.before, kind)} → ${formatValue(change?.after, kind)}`);
  }
  return lines;
}
