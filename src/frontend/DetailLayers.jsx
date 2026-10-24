import React from 'react';

// Ortsteil boundaries, major roads and their names, drawn over the district map. Four road classes in four colors:
// Autobahn, Bundesstrasse, other main road and connecting road. How much is shown depends on the zoom: the full city shows
// Autobahnen and Bundesstrassen, closer views add the main roads, then the connecting roads; the names appear when there is room.
// Drawn from the bottom up, so the more important roads lie on top.
const ROAD_CLASSES = ['connector', 'main', 'federal', 'motorway'];

export function DetailLayers({ details, zoomWidth = 1000, unit, activeIndex = -1, names = 'zoom', labelAt = null }) {
  if (!details) return null;
  const visibleClasses = new Set(['motorway', 'federal']);
  if (zoomWidth <= 750) visibleClasses.add('main');
  if (zoomWidth <= 450) visibleClasses.add('connector');
  const roadLabels = names === 'zoom' ? (zoomWidth <= 110 ? 90 : zoomWidth <= 200 ? 45 : zoomWidth <= 320 ? 16 : 0) : 0;
  const ortsteilLabels = names === 'zoom' && zoomWidth <= 260;
  const fontSize = 11 * unit;
  return (
    <g className="detail-layers">
      {details.ortsteile.map((ortsteil, index) => (
        <path key={ortsteil.name} className={`map-ortsteil ${index === activeIndex ? 'is-active' : ''}`} d={ortsteil.d} />
      ))}
      {ROAD_CLASSES.filter((kind) => visibleClasses.has(kind)).map((kind) => (
        <path key={kind} className={`map-road map-road-${kind}`} d={details.roads[kind]} />
      ))}
      {ortsteilLabels && details.ortsteile.map((ortsteil) => (
        <text key={ortsteil.name} className="map-label map-ortsteil-label" x={ortsteil.labelX} y={ortsteil.labelY} fontSize={fontSize} textAnchor="middle">{ortsteil.name}</text>
      ))}
      {details.labels.filter((label) => visibleClasses.has(label.kind)).slice(0, roadLabels).map((label) => (
        <text key={label.text} className={`map-label map-road-label is-${label.kind}`} x={label.x} y={label.y} fontSize={fontSize} textAnchor="middle" dominantBaseline="central" transform={`rotate(${label.angle} ${label.x} ${label.y})`}>{label.text}</text>
      ))}
      {names === 'active' && activeIndex >= 0 && (
        <text className="map-label map-ortsteil-label is-active" x={labelAt?.x ?? details.ortsteile[activeIndex].labelX} y={labelAt?.y ?? details.ortsteile[activeIndex].labelY} fontSize={12 * unit} textAnchor="middle">{details.ortsteile[activeIndex].name}</text>
      )}
    </g>
  );
}

export function MapLegend({ zoomWidth = 1000 }) {
  const items = [
    ['legend-district', 'Bezirksgrenze'],
    ['legend-ortsteil', 'Ortsteilgrenze'],
    ['legend-motorway', 'Autobahn'],
    ['legend-federal', 'Bundesstraße'],
    ['legend-main', 'Hauptstraße'],
    ['legend-connector', 'Verbindungsstraße'],
  ];
  return (
    <ul className="map-legend text-meta" aria-label="Zeichenerklärung">
      {items.map(([className, label]) => (
        <li key={className}>
          <svg width="24" height="8" viewBox="0 0 24 8" aria-hidden="true"><line className={`legend-line ${className}`} x1="1" y1="4" x2="23" y2="4" /></svg>
          {label}
        </li>
      ))}
      {zoomWidth > 450 && <li className="legend-hint">Kleinere Straßen erscheinen beim Hineinzoomen.</li>}
    </ul>
  );
}
