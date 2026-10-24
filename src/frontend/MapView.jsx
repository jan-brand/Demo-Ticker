import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatDay, formatTime } from './format.js';
import { DetailLayers, MapLegend } from './DetailLayers.jsx';
import { useBerlinDetails } from './details.js';
import { Icon } from './Icon.jsx';
import { centerView, clampView, clusterPoints, FULL_VIEW, MAP, toPoint, zoomView } from './mapgeo.js';

const PANEL_LIMIT = 10;

function useMapData(filters) {
  const [state, setState] = useState({ status: 'loading', points: [], total: 0, located: 0, pending: 0, truncated: false });
  const key = JSON.stringify(filters);

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, status: 'loading' }));
    fetch(`/api/map?${new URLSearchParams(filters)}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Karte konnte nicht geladen werden.');
        return response.json();
      })
      .then((data) => setState({ status: 'ready', ...data, points: data.points.map(toPoint) }))
      .catch((error) => {
        if (error.name !== 'AbortError') setState((current) => ({ ...current, status: 'error' }));
      });
    return () => controller.abort();
  }, [key]);

  return state;
}

export function MapView({ filters, onSelect, onReset }) {
  const data = useMapData(filters);
  const details = useBerlinDetails();
  const svgRef = useRef(null);
  const drag = useRef(null);
  const moved = useRef(false);
  const viewRef = useRef(FULL_VIEW);
  const [view, setViewState] = useState(FULL_VIEW);
  const [widthPx, setWidthPx] = useState(800);
  const [selection, setSelection] = useState(null);

  const setView = (next) => {
    viewRef.current = next;
    setViewState(next);
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidthPx(Math.max(280, entry.contentRect.width)));
    observer.observe(svg);

    // Wheel zoom needs a non-passive listener so the page does not scroll at the same time.
    const onWheel = (event) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const current = viewRef.current;
      const cx = current.x + ((event.clientX - rect.left) / rect.width) * current.w;
      const cy = current.y + ((event.clientY - rect.top) / rect.height) * current.h;
      setView(zoomView(current, event.deltaY > 0 ? 1.25 : 0.8, cx, cy));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      observer.disconnect();
      svg.removeEventListener('wheel', onWheel);
    };
  }, []);

  // One pixel on screen in map units: keeps markers and text the same size at every zoom level.
  const unit = view.w / widthPx;
  const clusters = useMemo(() => clusterPoints(data.points, 30 * unit), [data.points, unit]);
  const zoomed = view.w < FULL_VIEW.w - 1;

  const onPointerDown = (event) => {
    if (!zoomed) return;
    drag.current = { x: event.clientX, y: event.clientY, view: viewRef.current };
    moved.current = false;
  };
  const onPointerMove = (event) => {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    if (!moved.current && Math.abs(dx) + Math.abs(dy) > 4) {
      moved.current = true;
      // Capture only once it is a real drag, otherwise clicks on markers would be redirected to the map.
      svgRef.current.setPointerCapture?.(event.pointerId);
    }
    const rect = svgRef.current.getBoundingClientRect();
    const start = drag.current.view;
    setView(clampView({ ...start, x: start.x - (dx / rect.width) * start.w, y: start.y - (dy / rect.height) * start.h }));
  };
  const onPointerUp = () => { drag.current = null; };

  const activate = (cluster) => {
    if (moved.current) return;
    if (cluster.items.length === 1 || cluster.sameSpot || view.w <= 130) {
      setSelection(cluster.items);
    } else {
      setSelection(null);
      setView(centerView(view, cluster.x, cluster.y, 0.4));
    }
  };

  const keyActivate = (cluster) => (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      moved.current = false;
      activate(cluster);
    }
  };

  const markerLabel = (cluster) => (cluster.items.length === 1
    ? `${cluster.items[0].thema || 'Versammlung'}, ${formatDay(cluster.items[0].datum)}`
    : `${cluster.items.length} Versammlungen, Auswahl anzeigen`);

  const hidden = data.total - data.located;

  return (
    <section className="map-view" aria-label="Kartenansicht">
      <div className="map-frame">
        <svg
          ref={svgRef}
          className={`map ${zoomed ? 'map-zoomed' : ''}`}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          role="group"
          aria-label="Karte der Berliner Bezirke mit den Versammlungen"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {MAP.districts.map((district) => (
            <path key={district.name} className="map-district" d={district.d} />
          ))}
          <DetailLayers details={details} zoomWidth={view.w} unit={unit} />
          {(widthPx >= 520 || zoomed) && view.w > 260 && MAP.districts.map((district) => (
            <text key={district.name} className="map-label" x={district.labelX} y={district.labelY} fontSize={11 * unit} textAnchor="middle">{district.name}</text>
          ))}
          {clusters.map((cluster) => {
            const count = cluster.items.length;
            const radius = (count === 1 ? 8 : 11 + Math.min(10, Math.sqrt(count) * 1.6)) * unit;
            return (
              <g
                key={`${Math.round(cluster.x)}:${Math.round(cluster.y)}:${count}`}
                className={count === 1 ? 'map-marker' : 'map-cluster'}
                role="button"
                tabIndex={0}
                aria-label={markerLabel(cluster)}
                onClick={() => activate(cluster)}
                onKeyDown={keyActivate(cluster)}
              >
                <circle cx={cluster.x} cy={cluster.y} r={radius} strokeWidth={2 * unit} />
                {count > 1 && <text x={cluster.x} y={cluster.y} fontSize={12 * unit} textAnchor="middle" dominantBaseline="central">{count}</text>}
              </g>
            );
          })}
        </svg>
        <div className="map-controls" role="group" aria-label="Kartensteuerung">
          <button type="button" className="btn btn-secondary btn-icon" aria-label="Hineinzoomen" onClick={() => setView(zoomView(view, 0.6))}><Icon name="Plus" /></button>
          <button type="button" className="btn btn-secondary btn-icon" aria-label="Herauszoomen" onClick={() => setView(zoomView(view, 1.6))}><Icon name="Minus" /></button>
          <button type="button" className="btn btn-secondary btn-icon" aria-label="Gesamte Stadt zeigen" disabled={!zoomed} onClick={() => setView(FULL_VIEW)}><Icon name="Maximize" /></button>
        </div>
        {data.status === 'loading' && <p className="map-overlay text-meta" role="status">Lade Karte …</p>}
      </div>

      {details && <MapLegend />}

      <div className="map-status text-description" role="status">
        {data.status === 'loading' && <span className="skeleton skeleton-w-40" aria-hidden="true" />}
        {data.status === 'error' && 'Die Karte konnte nicht geladen werden.'}
        {data.status === 'ready' && (
          <>
            {data.located} von {data.total} Einträgen sind auf der Karte.
            {hidden > 0 && ` ${hidden} haben keine genaue Adresse${data.pending > 0 ? ' oder werden noch verortet' : ''}.`}
            {data.truncated && ' Es werden nur die ersten Treffer gezeigt, bitte Zeitraum eingrenzen.'}
          </>
        )}
      </div>

      {data.status === 'ready' && data.located === 0 && (
        <div className="empty">
          <Icon name="MapPin" size={24} />
          <h2>Keine Orte auf der Karte</h2>
          <p>Für diese Filter gibt es keine Einträge mit bekannter Position.</p>
          {onReset && (
            <button type="button" className="btn btn-secondary" onClick={onReset}>
              <Icon name="RotateCcw" />
              Zurücksetzen
            </button>
          )}
        </div>
      )}

      <div className="card card-compact" aria-live="polite">
        {selection ? (
          <>
            <h2 className="card-title">{selection.length === 1 ? 'Ausgewählte Versammlung' : `${selection.length} Versammlungen an dieser Stelle`}</h2>
            <ul className="map-panel-list">
              {selection.slice(0, PANEL_LIMIT).map((item) => (
                <li key={item.id}>
                  <p className="text-meta">{formatDay(item.datum)}, {formatTime(item.von) || 'Zeit offen'}</p>
                  <a className="text-strong" href={`/versammlung/${item.id}`} onClick={(event) => { event.preventDefault(); onSelect(item.id); }}>{item.thema || 'Ohne Thema'}</a>
                  <p className="text-description">{[item.plz, item.strasseNr].filter(Boolean).join(' · ')}</p>
                </li>
              ))}
            </ul>
            {selection.length > PANEL_LIMIT && <p className="text-description">und {selection.length - PANEL_LIMIT} weitere. In der Listenansicht stehen alle Einträge.</p>}
          </>
        ) : (
          <p className="text-description">Markierung antippen oder anklicken, um Einzelheiten zu sehen. Zahlen zeigen mehrere Versammlungen, ein Klick vergrößert den Ausschnitt.</p>
        )}
      </div>

      <p className="map-credit text-meta">
        Bezirks- und Ortsteilgrenzen: Geoportal Berlin / ALKIS (dl-zero-de/2.0). Autobahnen, Hauptstraßen und Positionen aus den Adressen mit Nominatim ermittelt, © OpenStreetMap-Mitwirkende (ODbL).
        Die Karte lädt keine Kacheln von Dritten.
      </p>
    </section>
  );
}
