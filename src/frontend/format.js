export function formatDate(value) {
  return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T00:00:00`)) : 'Unbekanntes Datum';
}

export function formatTime(value) {
  return value ? String(value).slice(0, 5) : '';
}

export function formatDay(value) {
  return new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T00:00:00`));
}

export function formatTimeRange(assembly) {
  const from = formatTime(assembly.von);
  const to = formatTime(assembly.bis);
  return from && to ? `${from}–${to}` : from || 'Zeit offen';
}
