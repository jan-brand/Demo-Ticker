import React, { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';

// ---------- Toasts: top right, three at most, success disappears after 4 s, errors stay until closed ----------
const ToastContext = createContext(null);
let nextToastId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const remove = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((kind, title, description) => {
    const id = nextToastId++;
    setToasts((current) => [...current, { id, kind, title, description }].slice(-3));
    if (kind === 'success') timers.current.set(id, setTimeout(() => remove(id), 4000));
  }, [remove]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const api = useMemo(() => ({ success: (title, description) => push('success', title, description), error: (title, description) => push('error', title, description) }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" role="region" aria-label="Meldungen">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
            <Icon name={toast.kind === 'error' ? 'CircleAlert' : 'Check'} className="toast-icon" />
            <div className="toast-text">
              <p className="toast-title">{toast.title}</p>
              {toast.description && <p className="toast-description">{toast.description}</p>}
            </div>
            <button type="button" className="icon-button toast-close" aria-label="Meldung schließen" onClick={() => remove(toast.id)}><Icon name="X" /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

// ---------- Dialog: the native <dialog> gives focus trap, Escape and focus return ----------
export function Modal({ open, title, description, onClose, busy = false, children, actions }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={(event) => { if (event.target === ref.current && !busy) onClose(); }}
    >
      {open && (
        <div className="modal-body">
          <h2 id={titleId} className="section-title">{title}</h2>
          {description && <p className="modal-description">{description}</p>}
          {children}
          <div className="modal-actions">{actions}</div>
        </div>
      )}
    </dialog>
  );
}

// ---------- Dropdown menu (positioned with fixed coordinates so scrolling tables do not clip it) ----------
export function Dropdown({ label, items }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const trigger = useRef(null);
  const menu = useRef(null);

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    setPosition(null);
    if (returnFocus) trigger.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open || !menu.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const height = menu.current.offsetHeight;
    const width = Math.max(180, menu.current.offsetWidth);
    const below = rect.bottom + 4;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 4) : below;
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    setPosition({ top, left });
    // The menu is invisible until it is positioned, and invisible elements cannot take focus. Focus after the next paint.
    requestAnimationFrame(() => menu.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => { if (!menu.current?.contains(event.target) && !trigger.current.contains(event.target)) close(); };
    const onScroll = () => close();
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, close]);

  const onMenuKeyDown = (event) => {
    const entries = [...menu.current.querySelectorAll('[role="menuitem"]:not([disabled])')];
    const index = entries.indexOf(document.activeElement);
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    else if (event.key === 'Tab') close();
    else if (event.key === 'ArrowDown') { event.preventDefault(); entries[(index + 1) % entries.length].focus(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); entries[(index - 1 + entries.length) % entries.length].focus(); }
    else if (event.key === 'Home') { event.preventDefault(); entries[0].focus(); }
    else if (event.key === 'End') { event.preventDefault(); entries[entries.length - 1].focus(); }
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="icon-button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Icon name="Ellipsis" size={18} />
      </button>
      {open && (
        <div ref={menu} role="menu" aria-label={label} className="dropdown" style={position ? { top: position.top, left: position.left } : { visibility: 'hidden', top: 0, left: 0 }} onKeyDown={onMenuKeyDown}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={`dropdown-item ${item.danger ? 'is-danger' : ''}`}
              disabled={item.disabled}
              onClick={() => { close(); item.onSelect(); }}
            >
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// ---------- Tabs with arrow-key navigation ----------
export function Tabs({ label, tabs, value, onChange }) {
  const onKeyDown = (event) => {
    const index = tabs.findIndex((tab) => tab.id === value);
    const move = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!move && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + move + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    document.getElementById(`tab-${tabs[next].id}`)?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((tab) => (
        <button key={tab.id} id={`tab-${tab.id}`} type="button" role="tab" className="tab" aria-selected={tab.id === value} aria-controls={`panel-${tab.id}`} tabIndex={tab.id === value ? 0 : -1} onClick={() => onChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}
