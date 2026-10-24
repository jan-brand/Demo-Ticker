// Creates the value for AUTH_PASSWORD_HASH, so no plain password has to be stored in .env.
//   npm run auth:hash -- "my password"
//   (Get-Content secret.txt) | npm run auth:hash        (password from standard input)
import { hashPassword } from '../src/api/auth.js';

let password = process.argv[2];
if (!password) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  password = Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}
if (!password) {
  console.error('Usage: npm run auth:hash -- "password"');
  process.exit(1);
}
console.log(`AUTH_PASSWORD_HASH=${hashPassword(password)}`);
