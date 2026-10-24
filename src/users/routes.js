import { clientKey, FailureLimiter } from '../api/auth.js';
import { isSecure, securityHeaders, send, sendJson } from '../api/http.js';
import { renderAccountPage, renderForbiddenPage, renderLoginPage } from '../legal/pages.js';
import { createService } from './service.js';
import { createStore, UserError } from './store.js';

const flag = (value) => ['1', 'true', 'on'].includes(String(value ?? '').toLowerCase());
const COOKIE = 'dt_session';
const SECURE_COOKIE = '__Host-dt_session'; // the __Host- prefix is only valid together with Secure
const PRESENTATION_FILES = /^(\/nav\.js|\/assets\/[\w.-]+\.(css|woff2))$/;
const LEGAL_PATHS = /^\/(impressum|datenschutz)\/?$/;
const MAX_BODY = 20_000;
const STATUS = { invalid: 400, bad_credentials: 401, not_found: 404, duplicate: 409, last_admin: 409, self: 409 };

export function usersEnabled(env = process.env) {
  return flag(env.USERS_ENABLED);
}

export function parseCookies(header) {
  const cookies = {};
  for (const part of String(header ?? '').split(';')) {
    const index = part.indexOf('=');
    const name = index > 0 ? part.slice(0, index).trim() : '';
    if (name) {
      try { cookies[name] = decodeURIComponent(part.slice(index + 1).trim()); } catch { /* ignore a malformed cookie */ }
    }
  }
  return cookies;
}

// Only same-site relative targets are allowed after a login, never another site.
export function safeNext(value) {
  const target = String(value ?? '');
  return target.startsWith('/') && !target.startsWith('//') && !target.includes('\\') && !target.startsWith('/anmelden') ? target : '/';
}

// Browsers send Origin with every POST. A request from another site is refused (cross-site request forgery).
export function sameOrigin(request, env = process.env) {
  const origin = request.headers.origin;
  const allowed = new Set([String(request.headers.host ?? '')]);
  if (env.TRUST_PROXY === '1' && request.headers['x-forwarded-host']) allowed.add(String(request.headers['x-forwarded-host']).split(',')[0].trim());
  if (env.PUBLIC_URL) { try { allowed.add(new URL(env.PUBLIC_URL).host); } catch { /* ignore a malformed PUBLIC_URL */ } }
  // With "Referrer-Policy: no-referrer" browsers send "Origin: null" for form posts, so then the browser's own
  // Sec-Fetch-Site statement decides.
  if (origin && origin !== 'null') { try { return allowed.has(new URL(origin).host); } catch { return false; } }
  const site = request.headers['sec-fetch-site'];
  if (site) return site === 'same-origin' || site === 'none';
  return !origin; // neither header: not a browser, so there is no ambient cookie to abuse
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw new UserError('Die Anfrage ist zu groß.', 'invalid');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJson(request) {
  try { return JSON.parse((await readBody(request)) || '{}'); } catch (error) {
    if (error instanceof UserError) throw error;
    throw new UserError('Die Anfrage ist kein gültiges JSON.', 'invalid');
  }
}

async function readForm(request) {
  return Object.fromEntries(new URLSearchParams(await readBody(request)));
}

export function createUsers({ pool, env = process.env, stylesheet }) {
  if (!usersEnabled(env)) return { enabled: false };

  const store = createStore(pool);
  const sessionHours = Number(env.SESSION_HOURS ?? 12);
  const service = createService({ store, sessionHours });
  const protectLegal = flag(env.AUTH_PROTECT_LEGAL);
  const ipLimiter = new FailureLimiter({ maxFailures: Number(env.AUTH_MAX_FAILURES ?? 10), lockMinutes: Number(env.AUTH_LOCK_MINUTES ?? 15) });
  const nameLimiter = new FailureLimiter({ maxFailures: 5, lockMinutes: Number(env.AUTH_LOCK_MINUTES ?? 15) });
  const auditDays = Number(env.AUDIT_RETENTION_DAYS ?? 365);

  const cookieHeader = (request, token, maxAge) => {
    const secure = isSecure(request, env);
    return `${secure ? SECURE_COOKIE : COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  };
  const tokenOf = (request) => {
    const cookies = parseCookies(request.headers.cookie);
    return cookies[SECURE_COOKIE] ?? cookies[COOKIE] ?? null;
  };

  const redirect = (request, response, location, headers = {}) => {
    response.writeHead(303, { ...securityHeaders(request, env), location, 'cache-control': 'no-store', ...headers });
    response.end();
    return { handled: true };
  };
  const html = (request, response, status, page) => send(request, response, {
    status, type: 'text/html; charset=utf-8', body: page, headers: { 'cache-control': 'no-store' },
  }).then(() => ({ handled: true }));
  const json = (request, response, status, payload) => sendJson(request, response, status, payload).then(() => ({ handled: true }));
  const fail = (request, response, error) => {
    if (!(error instanceof UserError)) throw error;
    return json(request, response, STATUS[error.code] ?? 400, { error: error.message, code: error.code });
  };

  const css = (request) => stylesheet(request);

  async function loginAttempt(request, username, password) {
    const ipKey = `ip:${clientKey(request, env)}`;
    const nameKey = `user:${String(username).trim().toLowerCase()}`;
    if (ipLimiter.isBlocked(ipKey) || nameLimiter.isBlocked(nameKey)) {
      throw new UserError(`Zu viele fehlgeschlagene Anmeldungen. Bitte in ${env.AUTH_LOCK_MINUTES ?? 15} Minuten erneut versuchen.`, 'rate_limited');
    }
    try {
      const result = await service.login(username, password);
      ipLimiter.success(ipKey);
      nameLimiter.success(nameKey);
      return result;
    } catch (error) {
      if (error instanceof UserError && error.code === 'bad_credentials') { ipLimiter.fail(ipKey); nameLimiter.fail(nameKey); }
      throw error;
    }
  }

  async function handleApi(request, response, url, user, session) {
    const { pathname } = url;
    const method = request.method;
    const admin = user.role === 'admin';
    const deny = () => json(request, response, 403, { error: 'Dafür sind Admin-Rechte nötig.', code: 'forbidden' });

    if (pathname === '/api/session' && (method === 'GET' || method === 'HEAD')) return json(request, response, 200, { user });
    if (pathname === '/api/session' && method === 'DELETE') {
      await service.logout(tokenOf(request));
      return json(request, response, 200, { ok: true });
    }

    if (pathname === '/api/users' && method === 'GET') return admin ? json(request, response, 200, { users: await service.listUsers() }) : deny();
    if (pathname === '/api/users' && method === 'POST') {
      if (!admin) return deny();
      try {
        const body = await readJson(request);
        const created = await service.createUser(user, { username: body.username, password: body.password, role: body.role ?? 'member' });
        return json(request, response, 201, { user: created });
      } catch (error) { return fail(request, response, error); }
    }
    if (pathname === '/api/audit' && method === 'GET') return admin ? json(request, response, 200, { entries: await service.listAudit(100) }) : deny();

    const match = pathname.match(/^\/api\/users\/(\d+)(\/password)?$/);
    if (match) {
      if (!admin) return deny();
      const id = match[1];
      try {
        if (match[2] && method === 'POST') {
          await service.resetPassword(user, id, (await readJson(request)).password);
          return json(request, response, 200, { ok: true });
        }
        if (!match[2] && method === 'PATCH') {
          const body = await readJson(request);
          return json(request, response, 200, { user: await service.updateUser(user, id, { role: body.role, active: body.active }) });
        }
        if (!match[2] && method === 'DELETE') {
          await service.deleteUser(user, id);
          return json(request, response, 200, { ok: true });
        }
      } catch (error) { return fail(request, response, error); }
    }
    return json(request, response, 404, { error: 'Not found' });
  }

  async function handleAccountPage(request, response, url, user, session) {
    if (request.method === 'GET' || request.method === 'HEAD') {
      return html(request, response, 200, renderAccountPage({ stylesheet: css(request), user, ok: url.searchParams.get('ok') === '1', forced: user.mustChangePassword }));
    }
    const form = await readForm(request);
    const errors = {};
    if (form.neu !== form.wiederholung) errors.repeat = 'Die beiden neuen Passwörter stimmen nicht überein.';
    if (!errors.repeat) {
      try {
        await service.changeOwnPassword(user, session.tokenHash, { current: form.aktuell, next: form.neu });
        return redirect(request, response, user.mustChangePassword ? '/' : '/konto?ok=1');
      } catch (error) {
        if (!(error instanceof UserError)) throw error;
        if (error.code === 'bad_credentials') errors.current = error.message; else errors.next = error.message;
      }
    }
    return html(request, response, 400, renderAccountPage({ stylesheet: css(request), user, errors, forced: user.mustChangePassword }));
  }

  async function handleLogin(request, response, url, user) {
    const isApi = url.pathname === '/api/session';
    if (request.method === 'GET' || request.method === 'HEAD') {
      if (user) return redirect(request, response, '/');
      return html(request, response, 200, renderLoginPage({ stylesheet: css(request), next: safeNext(url.searchParams.get('weiter')) }));
    }
    const body = isApi ? await readJson(request) : await readForm(request);
    const username = body.username ?? body.benutzername ?? '';
    const password = body.password ?? body.passwort ?? '';
    const next = safeNext(body.weiter);
    try {
      const { user: signedIn, token } = await loginAttempt(request, username, password);
      const cookie = cookieHeader(request, token, Math.round(sessionHours * 3600));
      if (isApi) {
        await sendJson(request, response, 200, { user: signedIn }, { 'set-cookie': cookie });
        return { handled: true };
      }
      return redirect(request, response, signedIn.mustChangePassword ? '/konto' : next, { 'set-cookie': cookie });
    } catch (error) {
      if (!(error instanceof UserError)) throw error;
      const status = error.code === 'rate_limited' ? 429 : 401;
      if (isApi) return json(request, response, status, { error: error.message, code: error.code });
      return html(request, response, status, renderLoginPage({ stylesheet: css(request), error: error.message, username: String(username).slice(0, 64), next }));
    }
  }

  // Runs before every route. Returns { handled: true } if it already answered, otherwise { user } (null for visitors on public paths).
  async function handle(request, response, url) {
    const { pathname } = url;
    const method = request.method;
    const readOnly = method === 'GET' || method === 'HEAD';

    if (!readOnly && !sameOrigin(request, env)) return json(request, response, 403, { error: 'Anfrage von einer fremden Seite abgelehnt.', code: 'cross_site' });

    const token = tokenOf(request);
    const session = await service.authenticate(token);
    const user = session?.user ?? null;
    const isApi = pathname.startsWith('/api/');

    const isLoginRoute = pathname === '/anmelden' || (pathname === '/api/session' && method === 'POST');
    if (isLoginRoute) return handleLogin(request, response, url, user);

    const isPublic = PRESENTATION_FILES.test(pathname) || (!protectLegal && LEGAL_PATHS.test(pathname));
    if (isPublic) return { user };

    if (!user) {
      if (!isApi && readOnly) return redirect(request, response, `/anmelden?weiter=${encodeURIComponent(safeNext(`${pathname}${url.search}`))}`);
      return json(request, response, 401, { error: 'Anmeldung erforderlich.', code: 'unauthenticated' });
    }

    if (pathname === '/abmelden' && method === 'POST') {
      await service.logout(token);
      return redirect(request, response, '/anmelden', { 'set-cookie': cookieHeader(request, '', 0) });
    }

    // A start password must be replaced before anything else is possible.
    const allowedWhileForced = pathname === '/konto' || pathname === '/konto/passwort' || pathname === '/api/session';
    if (user.mustChangePassword && !allowedWhileForced) {
      if (!isApi && readOnly) return redirect(request, response, '/konto');
      return json(request, response, 403, { error: 'Vor der weiteren Nutzung muss ein neues Passwort gewählt werden.', code: 'password_change_required' });
    }

    if (pathname === '/konto' || pathname === '/konto/passwort') return handleAccountPage(request, response, url, user, session);
    if (isApi && (pathname === '/api/session' || pathname.startsWith('/api/users') || pathname === '/api/audit')) return handleApi(request, response, url, user, session);
    if (pathname === '/nutzer' && user.role !== 'admin') return html(request, response, 403, renderForbiddenPage({ stylesheet: css(request), user }));
    return { user };
  }

  // Housekeeping: expired sessions and old audit entries disappear on their own.
  const clean = async () => {
    await store.purgeExpired();
    await pool.query(`DELETE FROM audit_log WHERE at < NOW() - make_interval(days => $1)`, [auditDays]);
  };
  clean().catch((error) => console.error(`Account cleanup failed: ${error.message}`));
  setInterval(() => clean().catch(() => {}), 3_600_000).unref();

  store.countActiveAdmins().then((n) => {
    if (n === 0) console.warn('Warnung: Es gibt keinen aktiven Admin. Anlegen mit: npm run user:create -- <name> --role admin');
  }).catch(() => {});

  return { enabled: true, handle, service, store };
}
