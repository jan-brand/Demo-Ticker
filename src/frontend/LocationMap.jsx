import React from 'react';
import { districtAt, MAP, project } from './mapgeo.js';

// The outlines are defined once in the document and every small map only references them with <use>,
// so a list of 25 entries does not repeat 17 KB of path data 25 times.
export function MapDefs() {
  return (
    <svg className="map-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        {MAP.districts.map((district, index) => <path key={district.name} id={`berlin-district-${index}`} d={district.d} />)}
      </defs>
    </svg>
  );
}

// Berlin with the district of the position highlighted and a marker on the position.
// "small" is the thumbnail in the list, "large" the map on the detail page.
export function LocationMap({ lat, lon, size = 'small' }) {
  const district = districtAt(lat, lon);
  const [x, y] = project(lat, lon);
  const width = size === 'small' ? 88 : 560; // rendered width in px, so marker and stroke keep a constant size on screen
  const unit = MAP.width / width;
  const label = `Lage: ${district ? `Bezirk ${district.name}` : 'Berlin'}`;
  return (
    <svg className={`location-map location-map-${size}`} viewBox={`0 0 ${MAP.width} ${MAP.height}`} role="img" aria-label={label}>
      {MAP.districts.map((item, index) => (
        <use key={item.name} href={`#berlin-district-${index}`} className={`map-district ${district?.index === index ? 'is-active' : ''}`} />
      ))}
      <circle className="location-dot" cx={x} cy={y} r={(size === 'small' ? 5 : 8) * unit} strokeWidth={(size === 'small' ? 1.5 : 2) * unit} />
    </svg>
  );
}
