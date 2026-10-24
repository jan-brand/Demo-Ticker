export function isoDate(date) {
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Quick ranges for the ticker view. "This week" and "this month" start today; the week ends on Sunday.
export function quickRanges(today = new Date()) {
  const untilSunday = (7 - today.getDay()) % 7;
  const nextMonday = addDays(today, untilSunday + 1);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const startOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const endOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0);
  return [
    { id: 'today', label: 'Heute', dateFrom: isoDate(today), dateTo: isoDate(today) },
    { id: 'week', label: 'Diese Woche', dateFrom: isoDate(today), dateTo: isoDate(addDays(today, untilSunday)) },
    { id: 'nextWeek', label: 'Nächste Woche', dateFrom: isoDate(nextMonday), dateTo: isoDate(addDays(nextMonday, 6)) },
    { id: 'month', label: 'Diesen Monat', dateFrom: isoDate(today), dateTo: isoDate(endOfMonth) },
    { id: 'nextMonth', label: 'Nächsten Monat', dateFrom: isoDate(startOfNextMonth), dateTo: isoDate(endOfNextMonth) },
    { id: 'upcoming', label: 'Ab heute', dateFrom: isoDate(today), dateTo: '' },
    { id: 'all', label: 'Alle', dateFrom: '', dateTo: '' },
  ];
}
