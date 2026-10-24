// Navigation shared by the React app and the server-rendered pages (Impressum, Datenschutz, 404),
// so the sidebar is identical everywhere. Icon names are Lucide icon names.
export const APP_NAME = 'Demo-Ticker';
export const SOURCE_URL = 'https://www.berlin.de/polizei/service/versammlungsbehoerde/versammlungen-aufzuege/';

export const NAV_MAIN = [
  { id: 'list', label: 'Liste', href: '/', icon: 'List' },
  { id: 'map', label: 'Karte', href: '/?ansicht=karte', icon: 'Map' },
];

export const NAV_SECONDARY = [
  { id: 'feed', label: 'Feed (Atom)', href: '/feed.xml', icon: 'Rss' },
  { id: 'impressum', label: 'Impressum', href: '/impressum', icon: 'FileText' },
  { id: 'datenschutz', label: 'Datenschutz', href: '/datenschutz', icon: 'ShieldCheck' },
  { id: 'source', label: 'Datenquelle: Polizei Berlin', href: SOURCE_URL, icon: 'ExternalLink', external: true },
];
