import { createHash, randomBytes } from 'node:crypto';
import { hashPassword, verifyHash } from '../api/auth.js';
import { validatePassword, validateUsername } from './policy.js';
import { UserError } from './store.js';

const ROLES = ['admin', 'member'];
const GENERIC_LOGIN_ERROR = 'Benutzername oder Passwort stimmt nicht.';

export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

// Business rules for accounts. HTTP details (cookies, forms) live in routes.js.
export function createService({ store, sessionHours = 12, audit = true }) {
  // A fake hash makes a login with an unknown name take as long as one with a wrong password.
  let dummyHash = null;
  const dummy = () => { dummyHash ??= hashPassword('dummy-password-for-timing'); return dummyHash; };
  const publicUser = (user) => ({ id: user.id, username: user.username, role: user.role, active: user.active, mustChangePassword: user.mustChangePassword });
  const log = (actor, action, target, detail) => (audit ? store.audit(actor, action, target, detail) : undefined);
  const sessionExpiry = () => new Date(Date.now() + sessionHours * 3_600_000);

  const service = {
    sessionHours,
    publicUser,

    // Returns { user, token } or throws UserError with a message that does not reveal which part was wrong.
    async login(username, password) {
      const user = await store.findByUsername(String(username ?? '').trim());
      const valid = verifyHash(String(password ?? ''), user?.passwordHash ?? dummy());
      if (!user || !valid || !user.active) throw new UserError(GENERIC_LOGIN_ERROR, 'bad_credentials');
      const token = randomBytes(32).toString('base64url');
      await store.createSession(user.id, tokenHash(token), sessionExpiry());
      await store.recordLogin(user.id);
      return { user: publicUser(user), token };
    },

    // Finds the user for a session token and extends the session (at most every five minutes).
    async authenticate(token) {
      if (!token) return null;
      const hash = tokenHash(token);
      const session = await store.findSession(hash);
      if (!session || !session.active) return null;
      if (Date.now() - new Date(session.lastSeenAt).getTime() > 300_000) await store.touchSession(hash, sessionExpiry());
      return { user: publicUser(session), tokenHash: hash };
    },

    logout: (token) => (token ? store.deleteSession(tokenHash(token)) : undefined),

    async createUser(actor, { username, password, role }) {
      const name = validateUsername(username);
      const errors = [...name.errors, ...validatePassword(password, { username: name.value })];
      if (!ROLES.includes(role)) errors.push('Die Rolle muss Admin oder Mitglied sein.');
      if (errors.length) throw new UserError(errors.join(' '), 'invalid');
      const user = await store.createUser({ username: name.value, passwordHash: hashPassword(password), role, mustChangePassword: true });
      await log(actor, 'user_created', user.username, { role });
      return user;
    },

    async updateUser(actor, id, { role, active }) {
      if (role !== undefined && !ROLES.includes(role)) throw new UserError('Die Rolle muss Admin oder Mitglied sein.', 'invalid');
      if (active !== undefined && typeof active !== 'boolean') throw new UserError('Der Status muss aktiv oder gesperrt sein.', 'invalid');
      if (String(actor.id) === String(id) && (role === 'member' || active === false)) {
        throw new UserError('Das eigene Konto kann nicht herabgestuft oder gesperrt werden. Das erledigt ein anderer Admin.', 'self');
      }
      const before = await store.findById(id);
      const user = await store.updateUser(id, { role, active });
      if (role !== undefined && before && before.role !== role) await log(actor, 'role_changed', user.username, { from: before.role, to: role });
      if (active !== undefined && before && before.active !== active) await log(actor, active ? 'user_enabled' : 'user_disabled', user.username, {});
      return user;
    },

    async deleteUser(actor, id) {
      if (String(actor.id) === String(id)) throw new UserError('Das eigene Konto kann nicht gelöscht werden. Das erledigt ein anderer Admin.', 'self');
      const removed = await store.deleteUser(id);
      await log(actor, 'user_deleted', removed.username, { role: removed.role });
    },

    // Admin sets a new start password: the user has to choose their own one at the next login.
    async resetPassword(actor, id, password) {
      const target = await store.findById(id);
      if (!target) throw new UserError('Dieses Konto gibt es nicht.', 'not_found');
      const errors = validatePassword(password, { username: target.username });
      if (errors.length) throw new UserError(errors.join(' '), 'invalid');
      await store.setPassword(id, hashPassword(password), true);
      await store.deleteSessionsOfUser(id);
      await log(actor, 'password_reset', target.username, {});
    },

    // The user changes their own password. All other sessions end, the current one stays.
    async changeOwnPassword(user, currentTokenHash, { current, next }) {
      const full = await store.findById(user.id);
      if (!full || !verifyHash(String(current ?? ''), full.passwordHash)) throw new UserError('Das bisherige Passwort stimmt nicht.', 'bad_credentials');
      const errors = validatePassword(next, { username: full.username, current });
      if (errors.length) throw new UserError(errors.join(' '), 'invalid');
      await store.setPassword(user.id, hashPassword(next), false);
      await store.deleteSessionsOfUser(user.id, currentTokenHash);
      await log(user, 'password_changed', user.username, {});
    },

    listUsers: () => store.listUsers(),
    listAudit: (limit) => store.listAudit(limit),
  };
  return service;
}
