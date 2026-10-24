// Drawer for the server-rendered pages (Impressum, Datenschutz, 404). Same behaviour as the React app:
// focus stays inside the open drawer, Escape / X button / click outside close it, focus returns to the menu button.
const sidebar = document.getElementById('sidebar');
const menuButton = document.querySelector('[data-menu-button]');
const closeButton = document.querySelector('[data-menu-close]');
const overlay = document.querySelector('[data-nav-overlay]');
const mobile = window.matchMedia('(max-width: 767px)');

function isOpen() { return sidebar.classList.contains('is-open'); }

function applyMode() {
  if (mobile.matches) {
    sidebar.setAttribute('role', 'dialog');
    sidebar.toggleAttribute('inert', !isOpen());
    if (isOpen()) sidebar.setAttribute('aria-modal', 'true'); else sidebar.removeAttribute('aria-modal');
  } else {
    sidebar.removeAttribute('role');
    sidebar.removeAttribute('aria-modal');
    sidebar.removeAttribute('inert');
    sidebar.classList.remove('is-open');
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
  }
}

function setOpen(open) {
  sidebar.classList.toggle('is-open', open);
  overlay.classList.toggle('is-open', open);
  menuButton.setAttribute('aria-expanded', String(open));
  document.body.style.overflow = open ? 'hidden' : '';
  applyMode();
  if (open) closeButton.focus(); else menuButton.focus();
}

menuButton.addEventListener('click', () => setOpen(true));
closeButton.addEventListener('click', () => setOpen(false));
overlay.addEventListener('click', () => setOpen(false));
mobile.addEventListener('change', applyMode);

document.addEventListener('keydown', (event) => {
  if (!mobile.matches || !isOpen()) return;
  if (event.key === 'Escape') { setOpen(false); return; }
  if (event.key !== 'Tab') return;
  const focusable = [...sidebar.querySelectorAll('a[href], button:not([disabled])')];
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!sidebar.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
  else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

applyMode();
