// Rules for user names and passwords. Messages say what has to be corrected.

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 200;
const USERNAME = /^[A-Za-z0-9._-]+$/;

const COMMON = new Set([
  'passwortpasswort', 'passwort12345', 'password1234', 'password12345', 'passwordpassword', 'qwertzuiopasd',
  'qwertyuiopas', '123456789012', '1234567890123', 'abcdefghijkl', 'willkommen123', 'welcome12345', 'changeme1234',
]);

export function validateUsername(value) {
  const name = String(value ?? '').trim();
  const errors = [];
  if (name.length < 3) errors.push(`Der Benutzername braucht mindestens 3 Zeichen (aktuell ${name.length}).`);
  if (name.length > 32) errors.push('Der Benutzername darf höchstens 32 Zeichen lang sein.');
  if (name && !USERNAME.test(name)) errors.push('Der Benutzername darf nur Buchstaben ohne Umlaute, Ziffern, Punkt, Unterstrich und Bindestrich enthalten.');
  return { value: name, errors };
}

export function validatePassword(password, { username = '', current = '' } = {}) {
  const value = String(password ?? '');
  const errors = [];
  if (value.length < MIN_PASSWORD_LENGTH) errors.push(`Das Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen (aktuell ${value.length}).`);
  if (value.length > MAX_PASSWORD_LENGTH) errors.push(`Das Passwort darf höchstens ${MAX_PASSWORD_LENGTH} Zeichen lang sein.`);
  const lower = value.toLowerCase();
  if (username.length >= 3 && lower.includes(username.toLowerCase())) errors.push('Das Passwort darf den Benutzernamen nicht enthalten.');
  if (value && (new Set(value).size < 4 || COMMON.has(lower))) errors.push('Dieses Passwort ist zu einfach. Bitte mehrere verschiedene Zeichen oder eine längere Wortfolge verwenden.');
  if (current && value === current) errors.push('Das neue Passwort muss sich vom bisherigen unterscheiden.');
  return errors;
}

// No look-alike characters (0/O, 1/l/I). `randomIndex(n)` returns an integer in [0, n), so the same generator works
// with Node's crypto.randomInt and with the browser's crypto.getRandomValues.
const PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export function generatePassword(randomIndex, groups = 4) {
  return Array.from({ length: groups }, () => Array.from({ length: 4 }, () => PASSWORD_ALPHABET[randomIndex(PASSWORD_ALPHABET.length)]).join('')).join('-');
}
