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

export const NAV_ADMIN = [{ id: 'users', label: 'Nutzer', href: '/nutzer', icon: 'Users' }];
export const NAV_ACCOUNT = { id: 'account', label: 'Konto', href: '/konto', icon: 'UserRound' };
// Visitors who are not signed in only see the pages that stay public.
export const NAV_LEGAL = NAV_SECONDARY.filter((item) => ['impressum', 'datenschutz'].includes(item.id));

// The sidebar for a given user: signed-in users get the account link, admins the user management.
export function buildNav(user) {
  if (!user) return { main: [], secondary: NAV_LEGAL, logout: false };
  const main = user.role === 'admin' ? [...NAV_MAIN, ...NAV_ADMIN] : [...NAV_MAIN];
  return { main, secondary: [NAV_ACCOUNT, ...NAV_SECONDARY], logout: true };
}
