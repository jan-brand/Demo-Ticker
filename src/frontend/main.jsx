import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { SOURCE_URL } from '../shared/nav.js';
import { formatDate, formatDay, formatTimeRange } from './format.js';
import { describeChange } from './history.js';
import { Icon } from './Icon.jsx';
import { LocationMap, MapDefs } from './LocationMap.jsx';
import { MapView } from './MapView.jsx';
import { ortsteilAt, useBerlinDetails } from './details.js';
import { districtAt, osmUrl } from './mapgeo.js';
import { isoDate, quickRanges } from './ranges.js';
import { AppShell } from './Shell.jsx';
import { ToastProvider } from './ui.jsx';
import { UsersPage } from './UsersPage.jsx';

const LIST_TITLE = 'Berliner Versammlungen heute und demnächst – Demo-Ticker';
const PAGE_TITLE = 'Versammlungen und Aufzüge in Berlin';

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
const isUsersPath = () => window.location.pathname === '/nutzer';
const assemblyIdFromPath = () => window.location.pathname.match(/^\/versammlung\/(\d+)$/)?.[1] ?? null;
const listUrl = (mode) => (mode === 'map' ? '/?ansicht=karte' : '/');

function activeRange(filters) {
  return quickRanges().find((range) => range.dateFrom === filters.dateFrom && range.dateTo === filters.dateTo)?.id;
}

function PageHead({ title, children, failed = false }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {children && <p className={`page-desc ${failed ? 'is-failed' : ''}`}>{children}</p>}
      </div>
    </div>
  );
}

function importDescription(status) {
  if (!status?.lastSuccessAt) return status ? 'Noch kein erfolgreicher Datenimport.' : null;
  const stand = `Stand der Daten: ${new Date(status.lastSuccessAt).toLocaleString('de-DE')}`;
  return status.latest?.status === 'failed' ? `${stand} · letzter Abruf fehlgeschlagen` : stand;
}

function FilterCard({ filters, loading, onChange, onSubmit, onRange, onReset }) {
  const current = activeRange(filters);
  return (
    <section className="card" aria-label="Filter">
      <div className="tabs" role="group" aria-label="Zeitraum">
        {quickRanges().map((range) => (
          <button key={range.id} type="button" className="tab" aria-pressed={current === range.id} onClick={() => onRange(range)}>{range.label}</button>
        ))}
      </div>
      <form className="search-form" onSubmit={onSubmit} role="search">
        <div className="fields">
          <label className="field field-wide">
            <span className="field-label">Suchbegriff</span>
            <input className="input" type="search" value={filters.q} onChange={(event) => onChange('q', event.target.value)} placeholder="Thema oder Straße" />
          </label>
          <label className="field">
            <span className="field-label">Von</span>
            <input className="input" type="date" value={filters.dateFrom} onChange={(event) => onChange('dateFrom', event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Bis</span>
            <input className="input" type="date" value={filters.dateTo} onChange={(event) => onChange('dateTo', event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">PLZ</span>
            <input className="input" inputMode="numeric" autoComplete="postal-code" value={filters.plz} onChange={(event) => onChange('plz', event.target.value)} placeholder="10117" />
          </label>
          <label className="field">
            <span className="field-label">Straße</span>
            <input className="input" value={filters.street} onChange={(event) => onChange('street', event.target.value)} placeholder="Unter den Linden" />
          </label>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" aria-busy={loading}>
            <Icon name={loading ? 'LoaderCircle' : 'Search'} className={loading ? 'spinner' : ''} />
            Suchen
          </button>
          <button type="button" className="btn btn-secondary" onClick={onReset}>
            <Icon name="RotateCcw" />
            Zurücksetzen
          </button>
        </div>
      </form>
    </section>
  );
}

const hasPosition = (assembly) => assembly.lat !== null && assembly.lat !== undefined && assembly.lon !== null && assembly.lon !== undefined;

function AssemblyRow({ assembly, href, onSelect }) {
  const place = [assembly.plz, assembly.strasseNr, assembly.aufzugsstrecke].filter(Boolean).join(' · ');
  const located = hasPosition(assembly);
  return (
    <li>
      <article className={`row ${located ? 'has-map' : ''}`}>
        <p className="row-time tabular">{formatTimeRange(assembly)}</p>
        <div className="row-body">
          <h3 className="card-title">
            <a className="row-link" href={href} onClick={(event) => { event.preventDefault(); onSelect(assembly.id); }}>{assembly.thema || 'Ohne Thema'}</a>
          </h3>
          <p className="row-place">{place || 'Kein Ort angegeben'}</p>
          {(assembly.isRecurring || assembly.removedAt) && (
            <div className="badges">
              {assembly.isRecurring && <span className="badge badge-info">Dauerversammlung</span>}
              {assembly.removedAt && <span className="badge badge-error">Aus der Quelle entfernt</span>}
            </div>
          )}
        </div>
        {located && <div className="row-map"><LocationMap lat={Number(assembly.lat)} lon={Number(assembly.lon)} size="small" /></div>}
      </article>
    </li>
  );
}

function AssemblyList({ assemblies, onSelect }) {
  return groupByDay(assemblies).map((day) => (
    <section className="day" key={day.datum}>
      <h2 className="section-title day-title">{formatDay(day.datum)}</h2>
      <ul className="rows card">{day.items.map((assembly) => <AssemblyRow key={assembly.id} assembly={assembly} href={`/versammlung/${assembly.id}`} onSelect={onSelect} />)}</ul>
    </section>
  ));
}

function ListSkeleton() {
  return (
    <div className="card rows" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="skeleton-row" key={index}>
          <span className="skeleton skeleton-w-80" />
          <div className="skeleton-lines">
            <span className="skeleton skeleton-h-18 skeleton-w-80" />
            <span className="skeleton skeleton-w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onReset }) {
  return (
    <div className="empty">
      <Icon name="SearchX" size={24} />
      <h2>Keine Einträge gefunden</h2>
      <p>Für diese Filter gibt es keine Versammlungen. Zeitraum oder Suchbegriff lassen sich ändern.</p>
      <button type="button" className="btn btn-secondary" onClick={onReset}>
        <Icon name="RotateCcw" />
        Zurücksetzen
      </button>
    </div>
  );
}

function LocationCard({ assembly }) {
  const details = useBerlinDetails();
  if (!hasPosition(assembly)) {
    return (
      <section className="card">
        <h2 className="card-title">Lage</h2>
        <p className="text-description">Für diesen Eintrag ist kein Ort bekannt, er erscheint deshalb nicht auf der Karte.</p>
      </section>
    );
  }
  const lat = Number(assembly.lat);
  const lon = Number(assembly.lon);
  const district = districtAt(lat, lon);
  const ortsteil = ortsteilAt(details, lat, lon);
  // Marches without an address are placed at the start of their route (see the geocoding in the README).
  const fromRoute = !assembly.strasseNr && assembly.aufzugsstrecke;
  return (
    <section className="card">
      <h2 className="card-title">Lage</h2>
      <div className="location-block">
        <div className="map-frame location-frame"><LocationMap lat={lat} lon={lon} size="large" /></div>
        <p className="text-description">
          {[ortsteil && `Ortsteil ${ortsteil.name}`, district && `Bezirk ${district.name}`].filter(Boolean).join(', ')}{district ? '. ' : ''}
          {fromRoute ? 'Die Markierung zeigt den Start der Strecke, die Hausnummer ist nicht bekannt.' : 'Die Position wurde aus der Adresse ermittelt.'}
        </p>
        <p><a className="btn btn-secondary" href={osmUrl(lat, lon)} rel="noopener noreferrer"><Icon name="ExternalLink" />In OpenStreetMap ansehen</a></p>
      </div>
    </section>
  );
}

function Detail({ assembly, onBack }) {
  const heading = useRef(null);
  useEffect(() => {
    window.scrollTo(0, 0);
    heading.current?.focus();
  }, [assembly.id]);

  return (
    <section>
      <button type="button" className="btn btn-secondary back" onClick={onBack}>
        <Icon name="ArrowLeft" />
        Zurück zur Suche
      </button>
      <div className="page-head">
        <div>
          <h1 className="page-title" ref={heading} tabIndex={-1}>{assembly.thema || 'Ohne Thema'}</h1>
          <p className="page-desc">{formatDay(assembly.datum)}, {formatTimeRange(assembly)}</p>
        </div>
      </div>
      <div className="detail-stack">
        {assembly.removedAt && (
          <p className="notice"><Icon name="Info" /><span>Diese Versammlung wird seit {new Date(assembly.removedAt).toLocaleString('de-DE')} nicht mehr von der Quelle gelistet.</span></p>
        )}
        {assembly.isRecurring && (
          <p className="notice"><Icon name="Info" /><span>Dauerversammlung{assembly.recurringStart ? ` vom ${formatDate(assembly.recurringStart)}` : ''}{assembly.recurringEnd ? ` bis ${formatDate(assembly.recurringEnd)}` : ''}.</span></p>
        )}
        <div className="card">
          <dl className="facts">
            <dt>PLZ</dt><dd>{assembly.plz || '—'}</dd>
            <dt>Ort</dt><dd>{assembly.strasseNr || '—'}</dd>
            <dt>Aufzugsstrecke</dt><dd>{assembly.aufzugsstrecke || '—'}</dd>
          </dl>
        </div>
        <LocationCard assembly={assembly} />
        <p><a className="btn btn-secondary" href={SOURCE_URL} rel="noopener"><Icon name="ExternalLink" />Offizielle Quelle bei der Polizei Berlin</a></p>
        <section className="card">
          <h2 className="card-title">Änderungshistorie</h2>
          {assembly.history.length ? (
            <ul className="history">
              {assembly.history.map((entry) => (
                <li key={entry.id}>
                  <span className="text-meta">{new Date(entry.changedAt).toLocaleString('de-DE')}</span>
                  <ul>{describeChange(entry.diff).map((line) => <li key={line}>{line}</li>)}</ul>
                </li>
              ))}
            </ul>
          ) : <p>Noch keine Änderungen erkannt.</p>}
        </section>
      </div>
    </section>
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
  const [user, setUser] = useState(null);
  const [page, setPage] = useState(() => (isUsersPath() ? 'users' : 'main'));

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
    // With user accounts the session tells who is signed in. Without them this answers 404 and no account menu is shown.
    fetch('/api/session').then(async (response) => {
      if (response.status === 401) { window.location.assign(`/anmelden?weiter=${encodeURIComponent(window.location.pathname + window.location.search)}`); return null; }
      return response.ok ? (await response.json()).user : null;
    }).then(setUser).catch(() => {});
    fetch('/api/import/status').then((response) => (response.ok ? response.json() : null)).then(setImportStatus).catch(() => {});

    // Browser back/forward switches between the list and a detail address.
    const onPopState = () => {
      setPage(isUsersPath() ? 'users' : 'main');
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
    if (page === 'users') document.title = 'Nutzer – Demo-Ticker';
    else document.title = selected ? `${selected.thema || 'Versammlung'} – Demo-Ticker` : LIST_TITLE;
  }, [selected, page]);

  const select = async (id) => {
    window.history.pushState({ fromList: true }, '', `/versammlung/${id}`);
    await loadDetail(id);
  };

  const changeMode = (nextMode) => {
    setMode(nextMode);
    if (page === 'users') {
      window.history.pushState(null, '', listUrl(nextMode));
      setPage('main');
    } else if (selected || assemblyIdFromPath()) {
      window.history.pushState(null, '', listUrl(nextMode));
      setSelected(null);
    } else {
      window.history.replaceState(window.history.state, '', listUrl(nextMode));
    }
  };

  const back = () => {
    if (window.history.state?.fromList) window.history.back();
    else {
      window.history.replaceState(null, '', listUrl(mode));
      setSelected(null);
    }
  };

  const selectNav = (id) => {
    if (id === 'users') {
      if (page !== 'users') window.history.pushState(null, '', '/nutzer');
      setSelected(null);
      setPage('users');
    } else {
      changeMode(id);
    }
  };

  const logout = async () => {
    await fetch('/api/session', { method: 'DELETE' }).catch(() => {});
    window.location.assign('/anmelden');
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

  const description = importDescription(importStatus);

  return (
    <AppShell
      areaName={page === 'users' ? 'Nutzer' : mode === 'map' ? 'Karte' : 'Liste'}
      activeNav={page === 'users' ? 'users' : mode}
      onSelectNav={selectNav}
      user={user}
      onLogout={logout}
    >
      {error && <p className="alert" role="alert"><Icon name="CircleAlert" /><span>{error}</span></p>}
      {page === 'users' ? (user?.role === 'admin' ? <UsersPage me={user} /> : null) : selected ? <Detail assembly={selected} onBack={back} /> : (
        <>
          <PageHead title={PAGE_TITLE} failed={importStatus?.latest?.status === 'failed'}>{description}</PageHead>
          <FilterCard
            filters={filters}
            loading={loading}
            onRange={applyRange}
            onReset={reset}
            onChange={(key, value) => setFilters({ ...filters, [key]: value })}
            onSubmit={(event) => { event.preventDefault(); search(); }}
          />
          {mode === 'map' && <div className="result-bar" />}
          {mode === 'map' && <MapView filters={applied} onSelect={select} onReset={reset} />}
          {mode === 'list' && (
            <>
              <div className="result-bar">
                <p className="text-description" role="status">{loading ? 'Lade Einträge …' : `${pagination?.total ?? 0} Einträge`}</p>
              </div>
              {loading && <ListSkeleton />}
              {!loading && assemblies.length > 0 && <AssemblyList assemblies={assemblies} onSelect={select} />}
              {!loading && assemblies.length === 0 && !error && <EmptyState onReset={reset} />}
              {pagination?.pages > 1 && (
                <nav className="pagination" aria-label="Seiten">
                  <button type="button" className="btn btn-secondary" disabled={pagination.page <= 1} onClick={() => search(pagination.page - 1)}>
                    <Icon name="ChevronLeft" />
                    Vorherige Seite
                  </button>
                  <span className="text-description">Seite {pagination.page} von {pagination.pages}</span>
                  <button type="button" className="btn btn-secondary" disabled={pagination.page >= pagination.pages} onClick={() => search(pagination.page + 1)}>
                    Nächste Seite
                    <Icon name="ChevronRight" />
                  </button>
                </nav>
              )}
            </>
          )}
        </>
      )}
    </AppShell>
  );
}

createRoot(document.getElementById('root')).render(<ToastProvider><MapDefs /><App /></ToastProvider>);
