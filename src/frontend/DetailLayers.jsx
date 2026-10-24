import React from 'react';

// Ortsteil boundaries, major roads and their names, drawn over the district map. How much is shown depends on the zoom:
// the full city shows the motorways, closer views add the other main roads, the names appear when there is room for them.
export function DetailLayers({ details, zoomWidth = 1000, unit, activeIndex = -1, names = 'zoom', labelAt = null }) {
  if (!details) return null;
  const roadLabels = names === 'zoom' ? (zoomWidth <= 110 ? 70 : zoomWidth <= 200 ? 35 : zoomWidth <= 320 ? 14 : 0) : 0;
  const ortsteilLabels = names === 'zoom' && zoomWidth <= 260;
  const fontSize = 11 * unit;
  return (
    <g className="detail-layers">
      {details.ortsteile.map((ortsteil, index) => (
        <path key={ortsteil.name} className={`map-ortsteil ${index === activeIndex ? 'is-active' : ''}`} d={ortsteil.d} />
      ))}
      {zoomWidth <= 700 && <path className="map-road map-road-primary" d={details.roads.primary} />}
      <path className="map-road map-road-trunk" d={details.roads.trunk} />
      <path className="map-road map-road-motorway" d={details.roads.motorway} />
      {ortsteilLabels && details.ortsteile.map((ortsteil) => (
        <text key={ortsteil.name} className="map-label map-ortsteil-label" x={ortsteil.labelX} y={ortsteil.labelY} fontSize={fontSize} textAnchor="middle">{ortsteil.name}</text>
      ))}
      {details.labels.slice(0, roadLabels).map((label) => (
        <text key={label.text} className={`map-label map-road-label ${label.kind === 'motorway' ? 'is-motorway' : ''}`} x={label.x} y={label.y} fontSize={fontSize} textAnchor="middle" dominantBaseline="central" transform={`rotate(${label.angle} ${label.x} ${label.y})`}>{label.text}</text>
      ))}
      {names === 'active' && activeIndex >= 0 && (
        <text className="map-label map-ortsteil-label is-active" x={labelAt?.x ?? details.ortsteile[activeIndex].labelX} y={labelAt?.y ?? details.ortsteile[activeIndex].labelY} fontSize={12 * unit} textAnchor="middle">{details.ortsteile[activeIndex].name}</text>
      )}
    </g>
  );
}

export function MapLegend() {
  const items = [
    ['legend-district', 'Bezirksgrenze'],
    ['legend-ortsteil', 'Ortsteilgrenze'],
    ['legend-motorway', 'Autobahn'],
    ['legend-road', 'Hauptstraße'],
  ];
  return (
    <ul className="map-legend text-meta" aria-label="Zeichenerklärung">
      {items.map(([className, label]) => (
        <li key={className}>
          <svg width="24" height="8" viewBox="0 0 24 8" aria-hidden="true"><line className={`legend-line ${className}`} x1="1" y1="4" x2="23" y2="4" /></svg>
          {label}
        </li>
      ))}
    </ul>
  );
}
