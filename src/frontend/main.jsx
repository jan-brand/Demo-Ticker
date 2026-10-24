import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { formatDate, formatDay, formatTimeRange } from './format.js';
import { MapView } from './MapView.jsx';
import { isoDate, quickRanges } from './ranges.js';

const SOURCE_URL = 'https://www.berlin.de/polizei/service/versammlungsbehoerde/versammlungen-aufzuege/';
const LIST_TITLE = 'Berliner Versammlungen heute und demnächst – Demo-Ticker';

// The API returns assemblies sorted by date, so consecutive entries with the same date form one day.
function groupByDay(assemblies) {
  const days = [];
  for (const assembly of assemblies) {
    const last = days[days.length - 1];
    if (last?.datum === assembly.datum) last.items.push(assembly);
    else days.push({ datum: assembly.datum, items: [assembly] });
  }
  return days;
}

const defaultFilters = () => ({ q: '', dateFrom: isoDate(new Date()), dateTo: '', plz: '', street: '' });
const assemblyIdFromPath = () => window.location.pathname.match(/^\/versammlung\/(\d+)$/)?.[1] ?? null;

function activeRange(filters) {
  return quickRanges().find((range) => range.dateFrom === filters.dateFrom && range.dateTo === filters.dateTo)?.id;
}

function ImportStatus({ status }) {
  if (!status?.lastSuccessAt) return <p className="import-status">Noch kein erfolgreicher Datenimport.</p>;
  const failed = status.latest?.status === 'failed';
  return (
    <p className="import-status">
      Stand der Daten: {new Date(status.lastSuccessAt).toLocaleString('de-DE')}
      {failed && <span className="import-failed"> · letzter Abruf fehlgeschlagen</span>}
    </p>
  );
}

function SearchForm({ filters, onChange, onSubmit, onRange, onReset }) {
  const current = activeRange(filters);
  return (
    <form className="search-form" onSubmit={onSubmit} role="search">
      <div className="quick-ranges" role="group" aria-label="Zeitraum">
        {quickRanges().map((range) => (
          <button key={range.id} type="button" aria-pressed={current === range.id} className={current === range.id ? 'active' : ''} onClick={() => onRange(range)}>{range.label}</button>
        ))}
      </div>
      <label className="field-wide">
        Suchbegriff
        <input type="search" value={filters.q} onChange={(event) => onChange('q', event.target.value)} placeholder="Thema oder Straße" />
      </label>
      <label>
        Von
        <input type="date" value={filters.dateFrom} onChange={(event) => onChange('dateFrom', event.target.value)} />
      </label>
      <label>
        Bis
        <input type="date" value={filters.dateTo} onChange={(event) => onChange('dateTo', event.target.value)} />
      </label>
      <label>
        PLZ
        <input inputMode="numeric" autoComplete="postal-code" value={filters.plz} onChange={(event) => onChange('plz', event.target.value)} placeholder="10117" />
      </label>
      <label>
        Straße
        <input value={filters.street} onChange={(event) => onChange('street', event.target.value)} placeholder="Unter den Linden" />
      </label>
      <div className="form-actions">
        <button type="submit" className="primary">Suchen</button>
        <button type="button" className="secondary" onClick={onReset}>Zurücksetzen</button>
      </div>
    </form>
  );
}

function AssemblyRow({ assembly, href, onSelect }) {
  const place = [assembly.plz, assembly.strasseNr, assembly.aufzugsstrecke].filter(Boolean).join(' · ');
  return (
    <li>
      <article className="row">
        <p className="row-time">{formatTimeRange(assembly)}</p>
        <div className="row-body">
          <h3>
            <a className="row-link" href={href} onClick={(event) => { event.preventDefault(); onSelect(assembly.id); }}>{assembly.thema || 'Ohne Thema'}</a>
          </h3>
          <p className="row-place">{place || 'Kein Ort angegeben'}</p>
          {assembly.isRecurring && <span className="tag">Dauerversammlung</span>}
          {assembly.removedAt && <span className="tag tag-removed">Aus der Quelle entfernt</span>}
        </div>
      </article>
    </li>
  );
}

function AssemblyList({ assemblies, onSelect }) {
  return groupByDay(assemblies).map((day) => (
    <section className="day" key={day.datum}>
      <h2>{formatDay(day.datum)}</h2>
      <ul className="rows">{day.items.map((assembly) => <AssemblyRow key={assembly.id} assembly={assembly} href={`/versammlung/${assembly.id}`} onSelect={onSelect} />)}</ul>
    </section>
  ));
}

function Detail({ assembly, onBack }) {
  const heading = useRef(null);
  useEffect(() => {
    window.scrollTo(0, 0);
    heading.current?.focus();
  }, [assembly.id]);

  return (
    <section>
      <button type="button" className="secondary back" onClick={onBack}>Zurück zur Suche</button>
      <article className="detail">
        <p className="detail-date">{formatDay(assembly.datum)}, {formatTimeRange(assembly)}</p>
        <h2 ref={heading} tabIndex={-1}>{assembly.thema || 'Ohne Thema'}</h2>
        <dl>
          <dt>PLZ</dt><dd>{assembly.plz || '—'}</dd>
          <dt>Ort</dt><dd>{assembly.strasseNr || '—'}</dd>
          <dt>Aufzugsstrecke</dt><dd>{assembly.aufzugsstrecke || '—'}</dd>
        </dl>
        {assembly.removedAt && <p className="notice">Diese Versammlung wird seit {new Date(assembly.removedAt).toLocaleString('de-DE')} nicht mehr von der Quelle gelistet.</p>}
        {assembly.isRecurring && <p className="notice">Dauerversammlung{assembly.recurringStart ? ` vom ${formatDate(assembly.recurringStart)}` : ''}{assembly.recurringEnd ? ` bis ${formatDate(assembly.recurringEnd)}` : ''}.</p>}
        <p><a className="button-link" href={SOURCE_URL} rel="noopener">Offizielle Quelle bei der Polizei Berlin</a></p>
        <h3>Änderungshistorie</h3>
        {assembly.history.length
          ? <ul className="history">{assembly.history.map((entry) => <li key={entry.id}>{new Date(entry.changedAt).toLocaleString('de-DE')}<pre>{JSON.stringify(entry.diff, null, 2)}</pre></li>)}</ul>
          : <p>Noch keine Änderungen erkannt.</p>}
      </article>
    </section>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <nav aria-label="Rechtliches und Quelle">
        <a href="/impressum">Impressum</a>
        <a href="/datenschutz">Datenschutz</a>
        <a href="/feed.xml">Feed (Atom)</a>
        <a href={SOURCE_URL} rel="noopener">Datenquelle: Polizei Berlin</a>
      </nav>
    </footer>
  );
}

function App() {
  const [filters, setFilters] = useState(defaultFilters);
  const [applied, setApplied] = useState(filters);
  const [mode, setMode] = useState(() => (new URLSearchParams(window.location.search).get('ansicht') === 'karte' ? 'map' : 'list'));
  const [importStatus, setImportStatus] = useState(null);
  const [assemblies, setAssemblies] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(() => !assemblyIdFromPath());
  const [error, setError] = useState('');

  const search = async (page = 1, activeFilters = filters, keepError = false) => {
    setLoading(true);
    if (!keepError) setError('');
    setApplied(activeFilters);
    try {
      const params = new URLSearchParams({ ...activeFilters, page: String(page) });
      const response = await fetch(`/api/assemblies?${params}`);
      if (!response.ok) throw new Error('Die Suche konnte nicht geladen werden.');
      const result = await response.json();
      setAssemblies(result.data);
      setPagination(result.pagination);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id) => {
    setError('');
    const response = await fetch(`/api/assemblies/${id}`);
    if (!response.ok) {
      setSelected(null);
      return setError(response.status === 404 ? 'Diesen Eintrag gibt es nicht.' : 'Der Eintrag konnte nicht geladen werden.');
    }
    setSelected(await response.json());
  };

  useEffect(() => {
    const id = assemblyIdFromPath();
    if (id) loadDetail(id); else search();
    fetch('/api/import/status').then((response) => (response.ok ? response.json() : null)).then(setImportStatus).catch(() => {});

    // Browser back/forward switches between the list and a detail address.
    const onPopState = () => {
      const current = assemblyIdFromPath();
      if (current) loadDetail(current);
      else setSelected(null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // A detail opened directly by its address has no list yet; load it when the user goes back.
  useEffect(() => {
    if (!selected && !pagination && !loading) search(1, filters, true);
  }, [selected]);

  useEffect(() => {
    document.title = selected ? `${selected.thema || 'Versammlung'} – Demo-Ticker` : LIST_TITLE;
  }, [selected]);

  const select = async (id) => {
    window.history.pushState({ fromList: true }, '', `/versammlung/${id}`);
    await loadDetail(id);
  };

  const listUrl = (nextMode) => (nextMode === 'map' ? '/?ansicht=karte' : '/');

  const changeMode = (nextMode) => {
    setMode(nextMode);
    window.history.replaceState(window.history.state, '', listUrl(nextMode));
  };

  const back = () => {
    if (window.history.state?.fromList) window.history.back();
    else {
      window.history.replaceState(null, '', listUrl(mode));
      setSelected(null);
    }
  };

  const applyRange = (range) => {
    const next = { ...filters, dateFrom: range.dateFrom, dateTo: range.dateTo };
    setFilters(next);
    search(1, next);
  };

  const reset = () => {
    const next = defaultFilters();
    setFilters(next);
    search(1, next);
  };

  return (
    <>
      <a className="skip-link" href="#inhalt">Zum Inhalt springen</a>
      <header className="masthead">
        <h1>Demo-Ticker</h1>
        <p>Versammlungen und Aufzüge in Berlin</p>
        <ImportStatus status={importStatus} />
      </header>
      <main id="inhalt" tabIndex={-1}>
        {error && <p className="error" role="alert">{error}</p>}
        {selected ? <Detail assembly={selected} onBack={back} /> : (
          <>
            <SearchForm filters={filters} onRange={applyRange} onReset={reset} onChange={(key, value) => setFilters({ ...filters, [key]: value })} onSubmit={(event) => { event.preventDefault(); search(); }} />
            <div className="view-toggle" role="group" aria-label="Ansicht">
              <button type="button" aria-pressed={mode === 'list'} className={mode === 'list' ? 'active' : ''} onClick={() => changeMode('list')}>Liste</button>
              <button type="button" aria-pressed={mode === 'map'} className={mode === 'map' ? 'active' : ''} onClick={() => changeMode('map')}>Karte</button>
            </div>
            {mode === 'map' && <MapView filters={applied} onSelect={select} />}
            {mode === 'list' && (loading
              ? <p role="status">Lade Einträge …</p>
              : <><p className="result-count" role="status">{pagination?.total ?? 0} Einträge</p><AssemblyList assemblies={assemblies} onSelect={select} /></>)}
            {mode === 'list' && pagination?.pages > 1 && (
              <nav className="pagination" aria-label="Seiten">
                <button type="button" className="secondary" disabled={pagination.page <= 1} onClick={() => search(pagination.page - 1)}>Vorherige Seite</button>
                <span>Seite {pagination.page} von {pagination.pages}</span>
                <button type="button" className="secondary" disabled={pagination.page >= pagination.pages} onClick={() => search(pagination.page + 1)}>Nächste Seite</button>
              </nav>
            )}
          </>
        )}
      </main>
      <Footer />
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
