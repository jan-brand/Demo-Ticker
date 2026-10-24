// Database access for users, sessions and the audit log. All queries are parameterized.

export class UserError extends Error {
  constructor(message, code = 'invalid') {
    super(message);
    this.name = 'UserError';
    this.code = code;
  }
}

const USER_COLUMNS = `id::text AS id, username, role, active, must_change_password AS "mustChangePassword",
                      created_at AS "createdAt", last_login_at AS "lastLoginAt"`;

export function createStore(pool) {
  const one = async (text, values) => (await pool.query(text, values)).rows[0] ?? null;

  // Runs `work` inside a transaction that locks all active admins, so two admins cannot remove each other at once.
  async function withAdminLock(work) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT id FROM users WHERE role = 'admin' AND active FOR UPDATE`);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function otherActiveAdmins(client, id) {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND active AND id <> $1`, [id]);
    return rows[0].n;
  }

  return {
    countUsers: async () => (await one('SELECT count(*)::int AS n FROM users')).n,
    countActiveAdmins: async () => (await one(`SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND active`)).n,

    findByUsername: (username) => one(`SELECT ${USER_COLUMNS}, password_hash AS "passwordHash" FROM users WHERE lower(username) = lower($1)`, [username]),
    findById: (id) => one(`SELECT ${USER_COLUMNS}, password_hash AS "passwordHash" FROM users WHERE id = $1`, [id]),
    async listUsers() {
      return (await pool.query(`SELECT ${USER_COLUMNS} FROM users ORDER BY lower(username)`)).rows;
    },

    async createUser({ username, passwordHash, role = 'member', mustChangePassword = true }) {
      try {
        return await one(
          `INSERT INTO users (username, password_hash, role, must_change_password) VALUES ($1, $2, $3, $4) RETURNING ${USER_COLUMNS}`,
          [username, passwordHash, role, mustChangePassword],
        );
      } catch (error) {
        if (error.code === '23505') throw new UserError('Dieser Benutzername ist schon vergeben.', 'duplicate');
        throw error;
      }
    },

    // Changes role and/or status. The last active admin can never be demoted or blocked.
    async updateUser(id, { role, active }) {
      return withAdminLock(async (client) => {
        const { rows } = await client.query('SELECT role, active FROM users WHERE id = $1', [id]);
        if (!rows[0]) throw new UserError('Dieses Konto gibt es nicht.', 'not_found');
        const removesAdmin = rows[0].role === 'admin' && rows[0].active && (role === 'member' || active === false);
        if (removesAdmin && (await otherActiveAdmins(client, id)) === 0) {
          throw new UserError('Das ist der letzte aktive Admin. Zuerst ein anderes Konto zum Admin machen.', 'last_admin');
        }
        const result = await client.query(
          `UPDATE users SET role = COALESCE($2, role), active = COALESCE($3, active), updated_at = NOW() WHERE id = $1 RETURNING ${USER_COLUMNS}`,
          [id, role ?? null, active ?? null],
        );
        if (active === false) await client.query('DELETE FROM sessions WHERE user_id = $1', [id]);
        return result.rows[0];
      });
    },

    async deleteUser(id) {
      return withAdminLock(async (client) => {
        const { rows } = await client.query('SELECT username, role, active FROM users WHERE id = $1', [id]);
        if (!rows[0]) throw new UserError('Dieses Konto gibt es nicht.', 'not_found');
        if (rows[0].role === 'admin' && rows[0].active && (await otherActiveAdmins(client, id)) === 0) {
          throw new UserError('Das ist der letzte aktive Admin und kann nicht gelöscht werden.', 'last_admin');
        }
        await client.query('DELETE FROM users WHERE id = $1', [id]);
        return rows[0];
      });
    },

    async setPassword(id, passwordHash, mustChangePassword) {
      return one(
        `UPDATE users SET password_hash = $2, must_change_password = $3, updated_at = NOW() WHERE id = $1 RETURNING ${USER_COLUMNS}`,
        [id, passwordHash, mustChangePassword],
      );
    },

    recordLogin: (id) => pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [id]),

    createSession: (userId, tokenHash, expiresAt) => pool.query(
      'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [tokenHash, userId, expiresAt],
    ),
    findSession: (tokenHash) => one(
      `SELECT s.token_hash AS "tokenHash", s.last_seen_at AS "lastSeenAt", s.expires_at AS "expiresAt",
              u.id::text AS id, u.username, u.role, u.active, u.must_change_password AS "mustChangePassword"
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
      [tokenHash],
    ),
    touchSession: (tokenHash, expiresAt) => pool.query('UPDATE sessions SET last_seen_at = NOW(), expires_at = $2 WHERE token_hash = $1', [tokenHash, expiresAt]),
    deleteSession: (tokenHash) => pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]),
    deleteSessionsOfUser: (userId, exceptHash = null) => pool.query(
      'DELETE FROM sessions WHERE user_id = $1 AND ($2::text IS NULL OR token_hash <> $2)', [userId, exceptHash],
    ),
    purgeExpired: () => pool.query('DELETE FROM sessions WHERE expires_at <= NOW()'),

    audit: (actor, action, targetName, detail = {}) => pool.query(
      'INSERT INTO audit_log (actor_id, actor_name, action, target_name, detail) VALUES ($1, $2, $3, $4, $5)',
      [actor?.id ?? null, actor?.username ?? null, action, targetName ?? null, detail],
    ),
    async listAudit(limit = 100) {
      return (await pool.query(
        `SELECT id::text AS id, at, actor_name AS "actorName", action, target_name AS "targetName", detail
           FROM audit_log ORDER BY id DESC LIMIT $1`, [limit],
      )).rows;
    },
  };
}
