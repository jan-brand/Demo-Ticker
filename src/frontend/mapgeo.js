import berlin from './berlin-map.js';

export const MAP = berlin;
export const FULL_VIEW = { x: 0, y: 0, w: berlin.width, h: berlin.height };
export const MIN_WIDTH = 60;

export function project(lat, lon) {
  return [(lon - berlin.lonMin) * berlin.cosLat0 * berlin.scale, (berlin.latMax - lat) * berlin.scale];
}

// Keeps the visible window inside the map and inside the allowed zoom range.
export function clampView(view) {
  const w = Math.min(FULL_VIEW.w, Math.max(MIN_WIDTH, view.w));
  const h = w * (FULL_VIEW.h / FULL_VIEW.w);
  return {
    w,
    h,
    x: Math.min(FULL_VIEW.w - w, Math.max(0, view.x)),
    y: Math.min(FULL_VIEW.h - h, Math.max(0, view.y)),
  };
}

// Zooms around a point given in map units; factor < 1 zooms in.
export function zoomView(view, factor, cx = view.x + view.w / 2, cy = view.y + view.h / 2) {
  const w = Math.min(FULL_VIEW.w, Math.max(MIN_WIDTH, view.w * factor));
  const ratio = w / view.w;
  return clampView({ w, h: w * (FULL_VIEW.h / FULL_VIEW.w), x: cx - (cx - view.x) * ratio, y: cy - (cy - view.y) * ratio });
}

export function centerView(view, cx, cy, factor = 1) {
  const w = Math.min(FULL_VIEW.w, Math.max(MIN_WIDTH, view.w * factor));
  const h = w * (FULL_VIEW.h / FULL_VIEW.w);
  return clampView({ w, h, x: cx - w / 2, y: cy - h / 2 });
}

// Groups points that would overlap at the current zoom into one cluster (simple grid, stable and fast).
// `cell` is the grid size in map units.
export function clusterPoints(points, cell) {
  const cells = new Map();
  for (const point of points) {
    const key = `${Math.floor(point.x / cell)}:${Math.floor(point.y / cell)}`;
    const entry = cells.get(key);
    if (entry) entry.items.push(point);
    else cells.set(key, { items: [point] });
  }
  return [...cells.values()].map(({ items }) => ({
    x: items.reduce((sum, item) => sum + item.x, 0) / items.length,
    y: items.reduce((sum, item) => sum + item.y, 0) / items.length,
    items,
    sameSpot: items.every((item) => item.x === items[0].x && item.y === items[0].y),
  }));
}

// Compact API tuple -> object with projected coordinates.
export function toPoint([id, lat, lon, datum, von, thema, plz, strasseNr]) {
  const [x, y] = project(lat, lon);
  return { id, lat, lon, x, y, datum, von, thema, plz, strasseNr };
}
