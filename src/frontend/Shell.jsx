import React, { useEffect, useRef, useState } from 'react';
import { APP_NAME, buildNav } from '../shared/nav.js';
import { Icon } from './Icon.jsx';

const MOBILE_QUERY = '(max-width: 767px)';

function useIsMobile() {
  const [matches, setMatches] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const update = () => setMatches(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return matches;
}

function NavItem({ item, active, onSelect }) {
  const props = { className: 'nav-item', 'data-tooltip': item.label, 'aria-current': active ? 'page' : undefined };
  const content = (
    <>
      <Icon name={item.icon} size={18} />
      <span className="nav-label">{item.label}</span>
    </>
  );
  if (onSelect) {
    return <a href={item.href} {...props} onClick={(event) => { event.preventDefault(); onSelect(item.id); }}>{content}</a>;
  }
  return <a href={item.href} {...props} rel={item.external ? 'noopener' : undefined}>{content}</a>;
}

// Sidebar on desktop and tablet, drawer on mobile. The drawer traps focus, closes with Escape, the X button or a
// click on the overlay, and gives the focus back to the menu button.
export function AppShell({ areaName, activeNav, onSelectNav, user = null, onLogout, children }) {
  const nav = buildNav(user);
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const menuButton = useRef(null);
  const sidebar = useRef(null);
  const closeButton = useRef(null);

  useEffect(() => { if (!isMobile) setOpen(false); }, [isMobile]);

  useEffect(() => {
    if (!open) return undefined;
    closeButton.current?.focus();
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { setOpen(false); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...sidebar.current.querySelectorAll('a[href], button:not([disabled])')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!sidebar.current.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      menuButton.current?.focus();
    };
  }, [open]);

  const select = (id) => { setOpen(false); onSelectNav(id); };
  const SELECTABLE = ['list', 'map', 'users'];

  return (
    <>
      <a className="skip-link" href="#inhalt">Zum Inhalt springen</a>
      <div className={`overlay ${open ? 'is-open' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside
        id="sidebar"
        ref={sidebar}
        className={`sidebar ${open ? 'is-open' : ''}`}
        aria-label="Navigation"
        role={isMobile ? 'dialog' : undefined}
        aria-modal={isMobile && open ? 'true' : undefined}
        inert={isMobile && !open}
      >
        <div className="sidebar-top">
          <a className="brand" href="/" onClick={(event) => { event.preventDefault(); select('list'); }}>{APP_NAME}</a>
          <button ref={closeButton} type="button" className="icon-button drawer-close" aria-label="Menü schließen" onClick={() => setOpen(false)}>
            <Icon name="X" size={18} />
          </button>
        </div>
        <nav aria-label="Bereiche">
          <ul className="nav-list">
            {nav.main.map((item) => <li key={item.id}><NavItem item={item} active={activeNav === item.id} onSelect={SELECTABLE.includes(item.id) ? select : undefined} /></li>)}
          </ul>
        </nav>
        <nav className="nav-secondary" aria-label="Weitere Links">
          <ul className="nav-list">
            {nav.secondary.map((item) => <li key={item.id}><NavItem item={item} /></li>)}
            {nav.logout && (
              <li>
                <button type="button" className="nav-item" data-tooltip="Abmelden" onClick={onLogout}>
                  <Icon name="LogOut" size={18} />
                  <span className="nav-label">Abmelden</span>
                </button>
              </li>
            )}
          </ul>
        </nav>
      </aside>

      <div className="app-main">
        <header className="app-header">
          <button
            ref={menuButton}
            type="button"
            className="icon-button menu-button"
            aria-label="Menü öffnen"
            aria-expanded={open}
            aria-controls="sidebar"
            onClick={() => setOpen(true)}
          >
            <Icon name="Menu" size={18} />
          </button>
          <p className="header-title">{areaName}</p>
          {user && (
            <a className="icon-button header-account" href="/konto" aria-label={`Konto von ${user.username}`}>
              <Icon name="UserRound" size={18} />
            </a>
          )}
        </header>
        <main id="inhalt" className="content" tabIndex={-1}>
          <div className="content-inner">{children}</div>
        </main>
      </div>
    </>
  );
}
