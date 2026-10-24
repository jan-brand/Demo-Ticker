const MAX_PAGE_SIZE = 100;
export const MAX_MAP_POINTS = 2000;

function asPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// The filters are shared by the list and the map, so both always show the same assemblies.
function buildConditions(query) {
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
  return { values, conditions };
}

export function buildAssemblySearch(query = {}) {
  const { values, conditions } = buildConditions(query);
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

// Compact points for the map: only entries with coordinates, plus how many matches cannot be shown.
export function buildMapQuery(query = {}) {
  const { values, conditions } = buildConditions(query);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const located = [...conditions, 'lat IS NOT NULL AND lon IS NOT NULL'];
  return {
    values,
    text: `SELECT id, datum, von, thema, plz, strasse_nr AS "strasseNr", lat, lon
             FROM assemblies
            WHERE ${located.join(' AND ')}
            ORDER BY datum ASC, von ASC NULLS LAST, id ASC
            LIMIT ${MAX_MAP_POINTS}`,
    countText: `SELECT COUNT(*)::int AS total,
                       COUNT(*) FILTER (WHERE lat IS NOT NULL AND lon IS NOT NULL)::int AS located,
                       COUNT(*) FILTER (WHERE geocode_status IS NULL AND strasse_nr IS NOT NULL)::int AS pending
                  FROM assemblies ${where}`,
  };
}
