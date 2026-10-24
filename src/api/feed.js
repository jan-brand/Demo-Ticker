// Atom feed of upcoming assemblies, so people can follow the ticker in a feed reader.

// XML 1.0 forbids most control characters; the source data is free text, so strip them.
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export const escapeXml = (value) => String(value ?? '')
  .replace(INVALID_XML, '')
  .replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));

function germanDate(iso) {
  const [year, month, day] = String(iso).split('-');
  return `${day}.${month}.${year}`;
}

export function feedEntryTitle(item) {
  const time = item.von ? ` ${item.von}` : '';
  return `${germanDate(item.datum)}${time} – ${item.thema || 'Ohne Thema'}`;
}

export function renderFeed({ items, baseUrl, updated = new Date() }) {
  const entries = items.map((item) => {
    const place = [item.plz, item.strasseNr, item.aufzugsstrecke].filter(Boolean).join(' · ');
    const timestamp = new Date(item.lastChangedAt ?? item.firstSeenAt ?? updated).toISOString();
    return `  <entry>
    <id>${escapeXml(`${baseUrl}/versammlung/${item.id}`)}</id>
    <title>${escapeXml(feedEntryTitle(item))}</title>
    <link rel="alternate" type="text/html" href="${escapeXml(`${baseUrl}/versammlung/${item.id}`)}"/>
    <updated>${timestamp}</updated>
    <summary>${escapeXml(place || 'Kein Ort angegeben')}</summary>
  </entry>`;
  });
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="de">
  <id>${escapeXml(`${baseUrl}/feed.xml`)}</id>
  <title>Demo-Ticker: Versammlungen in Berlin</title>
  <subtitle>Heute und die nächsten 14 Tage</subtitle>
  <link rel="self" type="application/atom+xml" href="${escapeXml(`${baseUrl}/feed.xml`)}"/>
  <link rel="alternate" type="text/html" href="${escapeXml(`${baseUrl}/`)}"/>
  <updated>${updated.toISOString()}</updated>
${entries.join('\n')}
</feed>
`;
}

export const FEED_QUERY = `SELECT id, datum, von, thema, plz, strasse_nr AS "strasseNr", aufzugsstrecke,
                                  first_seen_at AS "firstSeenAt", last_changed_at AS "lastChangedAt"
                             FROM assemblies
                            WHERE removed_at IS NULL
                              AND datum >= (NOW() AT TIME ZONE 'Europe/Berlin')::date
                              AND datum <= (NOW() AT TIME ZONE 'Europe/Berlin')::date + 14
                            ORDER BY datum, von NULLS LAST, id
                            LIMIT 300`;
