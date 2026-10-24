const MAX_PAGE_SIZE = 100;

function asPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function buildAssemblySearch(query = {}) {
  const values = [];
  const conditions = [];
  const add = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  const q = String(query.q ?? '').trim();
  if (q) {
    const parameter = add(q);
    conditions.push(`(search_vector @@ plainto_tsquery('german', ${parameter}) OR
      thema ILIKE '%' || ${parameter} || '%' OR strasse_nr ILIKE '%' || ${parameter} || '%' OR
      aufzugsstrecke ILIKE '%' || ${parameter} || '%')`);
  }
  if (query.dateFrom) conditions.push(`datum >= ${add(query.dateFrom)}::date`);
  if (query.dateTo) conditions.push(`datum <= ${add(query.dateTo)}::date`);
  if (query.plz) conditions.push(`plz = ${add(String(query.plz).trim())}`);
  if (query.street) {
    const parameter = add(String(query.street).trim());
    conditions.push(`(strasse_nr ILIKE '%' || ${parameter} || '%' OR aufzugsstrecke ILIKE '%' || ${parameter} || '%')`);
  }

  const page = asPositiveInteger(query.page, 1);
  const pageSize = Math.min(asPositiveInteger(query.pageSize, 25), MAX_PAGE_SIZE);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;
  values.push(pageSize, offset);

  return {
    values,
    page,
    pageSize,
    text: `SELECT id, datum, von, bis, thema, plz, strasse_nr AS "strasseNr",
                  aufzugsstrecke, is_recurring AS "isRecurring",
                  recurring_start AS "recurringStart", recurring_end AS "recurringEnd",
                  lat, lon, removed_at AS "removedAt"
             FROM assemblies
             ${where}
            ORDER BY datum ASC NULLS LAST, von ASC NULLS LAST, id ASC
            LIMIT $${values.length - 1} OFFSET $${values.length}`,
    countText: `SELECT COUNT(*)::int AS total FROM assemblies ${where}`,
  };
}
