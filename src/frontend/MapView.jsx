import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDay, formatTime } from './format.js';
import { DetailLayers, MapLegend } from './DetailLayers.jsx';
import { useBerlinDetails } from './details.js';
import { Icon } from './Icon.jsx';
import { centerView, clampView, clientToMap, clusterPoints, FULL_VIEW, lerpView, MAP, toPoint, wheelFactor, zoomView } from './mapgeo.js';

const PANEL_LIMIT = 10;
const GLIDE_MS = 110; // time constant of the smooth zoom: the view covers about two thirds of the way in this time

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

// The shown view glides towards a goal view, so zooming with the wheel or the buttons feels smooth and gentle.
// With "reduce motion" in the system settings the view jumps instead.
function useGlidingView() {
  const [view, setViewState] = useState(FULL_VIEW);
  const shown = useRef(FULL_VIEW);
  const goal = useRef(FULL_VIEW);
  const frame = useRef(0);
  const last = useRef(0);

  const show = useCallback((next) => { shown.current = next; setViewState(next); }, []);

  const step = useCallback((now) => {
    const elapsed = Math.min(64, now - (last.current || now - 16));
    last.current = now;
    const next = lerpView(shown.current, goal.current, 1 - Math.exp(-elapsed / GLIDE_MS));
    show(next);
    if (next !== goal.current && (next.w !== goal.current.w || next.x !== goal.current.x || next.y !== goal.current.y)) frame.current = requestAnimationFrame(step);
    else frame.current = 0;
  }, [show]);

  const moveTo = useCallback((next, { instant = false } = {}) => {
    goal.current = next;
    if (instant || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      show(next);
    } else if (!frame.current) {
      last.current = 0;
      frame.current = requestAnimationFrame(step);
    }
  }, [show, step]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return { view, shown, goal, moveTo };
}

// Fullscreen of the whole map section (map, legend, counts and the selection), with a fallback for browsers
// that cannot do element fullscreen (iPhone): the section then covers the page.
function useFullscreen(sectionRef) {
  const [native, setNative] = useState(false);
  const [covering, setCovering] = useState(false);

  useEffect(() => {
    const onChange = () => setNative(document.fullscreenElement === sectionRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [sectionRef]);

  useEffect(() => {
    if (!covering) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setCovering(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [covering]);

  const toggle = useCallback(async () => {
    if (document.fullscreenEnabled) {
      try {
        if (document.fullscreenElement === sectionRef.current) await document.exitFullscreen();
        else await sectionRef.current.requestFullscreen();
        return;
      } catch { /* the browser refused: use the fallback */ }
    }
    setCovering((current) => !current);
  }, [sectionRef]);

  return { active: native || covering, covering, toggle };
}

export function MapView({ filters, onSelect, onReset }) {
  const data = useMapData(filters);
  const details = useBerlinDetails();
  const sectionRef = useRef(null);
  const svgRef = useRef(null);
  const drag = useRef(null);
  const moved = useRef(false);
  const { view, shown, goal, moveTo } = useGlidingView();
  const fullscreen = useFullscreen(sectionRef);
  const [size, setSize] = useState({ width: 800, height: 660 });
  const [selection, setSelection] = useState(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.max(280, entry.contentRect.width), height: Math.max(200, entry.contentRect.height) }));
    observer.observe(svg);

    // Wheel zoom needs a non-passive listener so the page does not scroll at the same time. The zoom follows the amount of
    // wheel movement (see wheelFactor) and keeps the map point under the cursor in place.
    const onWheel = (event) => {
      event.preventDefault();
      const target = goal.current;
      const at = clientToMap(svg.getBoundingClientRect(), target, event.clientX, event.clientY);
      moveTo(zoomView(target, wheelFactor(event.deltaY, event.deltaMode), at.x, at.y));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      observer.disconnect();
      svg.removeEventListener('wheel', onWheel);
    };
  }, [goal, moveTo]);

  // One pixel on screen in map units: keeps markers and text the same size at every zoom level.
  const unit = Math.max(view.w / size.width, view.h / size.height);
  const clusters = useMemo(() => clusterPoints(data.points, 30 * unit), [data.points, unit]);
  const zoomed = view.w < FULL_VIEW.w - 1;

  const onPointerDown = (event) => {
    if (!zoomed) return;
    drag.current = { x: event.clientX, y: event.clientY, view: shown.current };
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
    const start = drag.current.view;
    const { scale } = clientToMap(svgRef.current.getBoundingClientRect(), start, 0, 0);
    moveTo(clampView({ ...start, x: start.x - dx / scale, y: start.y - dy / scale }), { instant: true });
  };
  const onPointerUp = () => { drag.current = null; };

  const activate = (cluster) => {
    if (moved.current) return;
    if (cluster.items.length === 1 || cluster.sameSpot || goal.current.w <= 130) {
      setSelection(cluster.items);
    } else {
      setSelection(null);
      moveTo(centerView(goal.current, cluster.x, cluster.y, 0.4));
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
    <section ref={sectionRef} className={`map-view ${fullscreen.covering ? 'is-pseudo-fullscreen' : ''}`} aria-label="Kartenansicht">
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
          {(size.width >= 520 || zoomed) && view.w > 260 && MAP.districts.map((district) => (
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
          <button type="button" className="btn btn-secondary btn-icon" aria-label={fullscreen.active ? 'Vollbild beenden' : 'Vollbild'} aria-pressed={fullscreen.active} onClick={fullscreen.toggle}><Icon name={fullscreen.active ? 'Shrink' : 'Expand'} /></button>
          <button type="button" className="btn btn-secondary btn-icon" aria-label="Hineinzoomen" onClick={() => moveTo(zoomView(goal.current, 0.6))}><Icon name="Plus" /></button>
          <button type="button" className="btn btn-secondary btn-icon" aria-label="Herauszoomen" onClick={() => moveTo(zoomView(goal.current, 1.6))}><Icon name="Minus" /></button>
          <button type="button" className="btn btn-secondary btn-icon" aria-label="Gesamte Stadt zeigen" disabled={!zoomed} onClick={() => moveTo(FULL_VIEW)}><Icon name="House" /></button>
        </div>
        {data.status === 'loading' && <p className="map-overlay text-meta" role="status">Lade Karte …</p>}
      </div>

      {details && <MapLegend zoomWidth={view.w} />}

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

      <div className="card card-compact map-selection" aria-live="polite">
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
        Bezirks- und Ortsteilgrenzen: Geoportal Berlin / ALKIS (dl-zero-de/2.0). Straßen und Positionen aus den Adressen mit Nominatim ermittelt, © OpenStreetMap-Mitwirkende (ODbL).
        Die Karte lädt keine Kacheln von Dritten.
      </p>
    </section>
  );
}
