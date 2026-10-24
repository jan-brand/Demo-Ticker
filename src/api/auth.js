import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// Optional login for the whole site (HTTP Basic authentication, configured through the environment).
// Basic auth sets no cookies, so the privacy statement "no cookies" stays true.

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };
const LEGAL_PATHS = /^\/(impressum|datenschutz)\/?$/;

// Format scrypt.N.salt.hash with base64url parts: no '$' in it, because Docker Compose would expand that in .env files.
export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt.${SCRYPT.N}.${salt.toString('base64url')}.${hash.toString('base64url')}`;
}

export function verifyHash(password, stored) {
  const [scheme, n, salt, hash] = String(stored).split('.');
  if (scheme !== 'scrypt' || !n || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = scryptSync(String(password), Buffer.from(salt, 'base64url'), expected.length, { N: Number(n), r: SCRYPT.r, p: SCRYPT.p });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Hashing both sides to a fixed length lets timingSafeEqual compare without leaking the length.
const digest = (value) => createHash('sha256').update(String(value)).digest();
const safeEqual = (a, b) => timingSafeEqual(digest(a), digest(b));

export function authConfig(env = process.env) {
  if (!['1', 'true', 'on'].includes(String(env.AUTH_ENABLED ?? '').toLowerCase())) return { enabled: false };
  const user = String(env.AUTH_USER ?? '');
  const hash = String(env.AUTH_PASSWORD_HASH ?? '');
  const password = String(env.AUTH_PASSWORD ?? '');
  if (!user) throw new Error('AUTH_ENABLED is set but AUTH_USER is missing');
  if (!hash && !password) throw new Error('AUTH_ENABLED is set but neither AUTH_PASSWORD_HASH nor AUTH_PASSWORD is set');
  if (hash && !hash.startsWith('scrypt.')) throw new Error('AUTH_PASSWORD_HASH must be created with "npm run auth:hash"');
  return {
    enabled: true,
    user,
    hash,
    password,
    protectLegal: ['1', 'true', 'on'].includes(String(env.AUTH_PROTECT_LEGAL ?? '').toLowerCase()),
    maxFailures: Number(env.AUTH_MAX_FAILURES ?? 10),
    lockMinutes: Number(env.AUTH_LOCK_MINUTES ?? 15),
  };
}

export function parseBasic(header) {
  const match = String(header ?? '').match(/^Basic\s+([A-Za-z0-9+/=]+)\s*$/i);
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const index = decoded.indexOf(':');
  return index < 0 ? null : { user: decoded.slice(0, index), password: decoded.slice(index + 1) };
}

export function credentialsValid(header, config) {
  const given = parseBasic(header);
  if (!config.enabled || !given) return false;
  // Both checks always run, so a wrong user name takes as long as a wrong password.
  const userOk = safeEqual(given.user, config.user);
  const passwordOk = config.hash ? verifyHash(given.password, config.hash) : safeEqual(given.password, config.password);
  return userOk && passwordOk;
}

// The health check must work without credentials, the legal pages by default as well (they have to stay reachable).
export function isPublicPath(pathname, config) {
  if (!config.enabled) return true;
  if (pathname === '/healthz') return true;
  return !config.protectLegal && LEGAL_PATHS.test(pathname);
}

// Counts failed logins per client address and blocks it for a while after too many.
export class FailureLimiter {
  constructor({ maxFailures = 10, lockMinutes = 15, now = () => Date.now() } = {}) {
    this.maxFailures = maxFailures;
    this.lockMs = lockMinutes * 60_000;
    this.now = now;
    this.entries = new Map();
  }

  isBlocked(key) {
    const entry = this.entries.get(key);
    if (!entry) return false;
    if (this.now() - entry.first > this.lockMs) {
      this.entries.delete(key);
      return false;
    }
    return entry.count >= this.maxFailures;
  }

  fail(key) {
    const entry = this.entries.get(key);
    if (!entry || this.now() - entry.first > this.lockMs) this.entries.set(key, { count: 1, first: this.now() });
    else entry.count += 1;
    if (this.entries.size > 5000) this.entries.delete(this.entries.keys().next().value);
  }

  success(key) {
    this.entries.delete(key);
  }
}

export function clientKey(request, env = process.env) {
  const forwarded = env.TRUST_PROXY === '1' ? String(request.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '';
  return forwarded || request.socket?.remoteAddress || 'unknown';
}
