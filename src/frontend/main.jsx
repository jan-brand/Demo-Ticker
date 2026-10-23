import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T00:00:00`)) : 'Unbekanntes Datum';
}

function formatTime(value) {
  return value ? String(value).slice(0, 5) : '';
}

function SearchForm({ filters, onChange, onSubmit }) {
  return (
    <form className="search-form" onSubmit={onSubmit}>
      <label>
        Suchbegriff
        <input value={filters.q} onChange={(event) => onChange('q', event.target.value)} placeholder="Thema oder Straße" />
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
        <input inputMode="numeric" value={filters.plz} onChange={(event) => onChange('plz', event.target.value)} placeholder="10117" />
      </label>
      <label>
        Straße
        <input value={filters.street} onChange={(event) => onChange('street', event.target.value)} placeholder="Unter den Linden" />
      </label>
      <button type="submit">Suchen</button>
    </form>
  );
}

function AssemblyCard({ assembly, onSelect }) {
  return (
    <button className="assembly-card" onClick={() => onSelect(assembly.id)}>
      <div className="card-date">{formatDate(assembly.datum)} · {formatTime(assembly.von)}</div>
      <h2>{assembly.thema || 'Ohne Thema'}</h2>
      <p>{[assembly.plz, assembly.strasseNr, assembly.aufzugsstrecke].filter(Boolean).join(' · ') || 'Kein Ort angegeben'}</p>
      {assembly.isRecurring && <span className="tag">Dauerversammlung</span>}
    </button>
  );
}

function Detail({ assembly, onBack }) {
  return (
    <section>
      <button className="back" onClick={onBack}>← Zurück zur Suche</button>
      <article className="detail">
        <div className="card-date">{formatDate(assembly.datum)} · {formatTime(assembly.von)}{assembly.bis ? `–${formatTime(assembly.bis)}` : ''}</div>
        <h2>{assembly.thema || 'Ohne Thema'}</h2>
        <dl>
          <dt>PLZ</dt><dd>{assembly.plz || '—'}</dd>
          <dt>Ort</dt><dd>{assembly.strasseNr || '—'}</dd>
          <dt>Aufzugsstrecke</dt><dd>{assembly.aufzugsstrecke || '—'}</dd>
        </dl>
        {assembly.isRecurring && <p className="notice">Dauerversammlung{assembly.recurringStart ? ` vom ${formatDate(assembly.recurringStart)}` : ''}{assembly.recurringEnd ? ` bis ${formatDate(assembly.recurringEnd)}` : ''}.</p>}
        <h3>Änderungshistorie</h3>
        {assembly.history.length ? <ul className="history">{assembly.history.map((entry) => <li key={entry.id}>{new Date(entry.changedAt).toLocaleString('de-DE')}<pre>{JSON.stringify(entry.diff, null, 2)}</pre></li>)}</ul> : <p>Noch keine Änderungen erkannt.</p>}
      </article>
    </section>
  );
}

function App() {
  const [filters, setFilters] = useState({ q: '', dateFrom: '', dateTo: '', plz: '', street: '' });
  const [assemblies, setAssemblies] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const search = async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ ...filters, page: String(page) });
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

  useEffect(() => { search(); }, []);

  const select = async (id) => {
    const response = await fetch(`/api/assemblies/${id}`);
    if (!response.ok) return setError('Der Eintrag konnte nicht geladen werden.');
    setSelected(await response.json());
  };

  if (selected) return <main><header><h1>Demo-Ticker</h1></header><Detail assembly={selected} onBack={() => setSelected(null)} /></main>;
  return (
    <main>
      <header><h1>Demo-Ticker</h1><p>Versammlungen und Aufzüge in Berlin</p></header>
      <SearchForm filters={filters} onChange={(key, value) => setFilters({ ...filters, [key]: value })} onSubmit={(event) => { event.preventDefault(); search(); }} />
      {error && <p className="error">{error}</p>}
      {loading ? <p>Lade Einträge …</p> : <><p className="result-count">{pagination?.total ?? 0} Einträge</p><div className="results">{assemblies.map((assembly) => <AssemblyCard key={assembly.id} assembly={assembly} onSelect={select} />)}</div></>}
      {pagination?.pages > 1 && <nav className="pagination"><button disabled={pagination.page <= 1} onClick={() => search(pagination.page - 1)}>←</button><span>Seite {pagination.page} von {pagination.pages}</span><button disabled={pagination.page >= pagination.pages} onClick={() => search(pagination.page + 1)}>→</button></nav>}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
