// Account administration on the command line, for the first admin and for emergencies.
//   npm run user:create -- anna --role admin          (a start password is generated and shown once)
//   npm run user:create -- anna --password "..."      (use a given start password)
//   npm run user:reset  -- anna                       (new start password, all sessions end)
//   npm run user:list
import { randomInt } from 'node:crypto';
import 'dotenv/config';
import { pool } from '../src/db/pool.js';
import { generatePassword } from '../src/users/policy.js';
import { createService } from '../src/users/service.js';
import { createStore, UserError } from '../src/users/store.js';

const [command, ...rest] = process.argv.slice(2);
const options = {};
const positional = [];
for (let i = 0; i < rest.length; i += 1) {
  if (rest[i].startsWith('--')) { options[rest[i].slice(2)] = rest[i + 1]; i += 1; } else positional.push(rest[i]);
}

const store = createStore(pool);
const service = createService({ store });
const cli = { id: null, username: 'Kommandozeile' };

try {
  if (command === 'create') {
    const [username] = positional;
    if (!username) throw new UserError('Benutzername fehlt: npm run user:create -- <name> [--role admin|member]');
    const password = options.password ?? generatePassword(randomInt);
    const user = await service.createUser(cli, { username, password, role: options.role ?? 'member' });
    console.log(`Konto "${user.username}" (${user.role}) angelegt.`);
    if (!options.password) console.log(`Startpasswort (wird nur jetzt angezeigt): ${password}`);
    console.log('Das Passwort muss bei der ersten Anmeldung geändert werden.');
  } else if (command === 'reset') {
    const [username] = positional;
    const user = username && await store.findByUsername(username);
    if (!user) throw new UserError(`Konto "${username ?? ''}" gibt es nicht.`);
    const password = options.password ?? generatePassword(randomInt);
    await service.resetPassword(cli, user.id, password);
    console.log(`Neues Startpasswort für "${user.username}"${options.password ? ' gesetzt.' : ` (wird nur jetzt angezeigt): ${password}`}`);
  } else if (command === 'list') {
    const users = await store.listUsers();
    for (const u of users) console.log(`${u.username.padEnd(24)} ${u.role.padEnd(7)} ${u.active ? 'aktiv' : 'gesperrt'}${u.mustChangePassword ? ' (Passwort ändern)' : ''}`);
    if (!users.length) console.log('Noch keine Konten. Anlegen: npm run user:create -- <name> --role admin');
  } else {
    console.log('Befehle: create <name> [--role admin|member] [--password ...] | reset <name> [--password ...] | list');
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof UserError ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
