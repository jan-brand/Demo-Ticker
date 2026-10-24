import * as lucide from 'lucide';

// Renders a Lucide icon as inline SVG for the server-rendered pages (no client library needed there).
// Same look as the React app: 1.75 stroke, currentColor.
const attributes = (attrs) => Object.entries(attrs).map(([key, value]) => `${key}="${String(value)}"`).join(' ');

export function iconSvg(name, size = 18) {
  const node = lucide[name];
  if (!Array.isArray(node)) throw new Error(`Unknown Lucide icon: ${name}`);
  const children = node.map(([tag, attrs]) => `<${tag} ${attributes(attrs)}/>`).join('');
  return `<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${children}</svg>`;
}
