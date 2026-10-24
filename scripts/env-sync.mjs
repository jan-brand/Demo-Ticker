// Copies variables that are new in .env.example into the other env files (.env, .env.local, ...).
// Existing values are never changed. Variables that are commented out in .env.example are added as comments.
//
//   npm run env:sync                  all .env and .env.* files except .env.example
//   npm run env:sync -- --dry-run     only show what would be added
//   npm run env:sync -- .env.production other.env     explicit files
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KEY_LINE = /^\s*(#\s*)?([A-Za-z_][A-Za-z0-9_]*)=/;

// Splits a file into entries: one per variable, together with the comment lines directly above it.
export function parseEntries(text) {
  const lines = text.split(/\r?\n/);
  const entries = [];
  let comments = [];
  for (const line of lines) {
    const match = line.match(KEY_LINE);
    if (match) {
      entries.push({ key: match[2], active: !match[1], lines: [...comments, line] });
      comments = [];
    } else if (/^\s*#/.test(line)) {
      comments.push(line);
    } else {
      comments = []; // a blank line ends the comment block
    }
  }
  return entries;
}

// A variable counts as known if it appears in the target, active or commented out. The user may have
// removed a commented example on purpose, so it is only offered again when it is missing completely.
export function syncEnv(exampleText, targetText, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const known = new Set(parseEntries(targetText).map((entry) => entry.key));
  const seen = new Set();
  const missing = [];
  for (const entry of parseEntries(exampleText)) {
    if (known.has(entry.key) || seen.has(entry.key)) continue;
    seen.add(entry.key);
    missing.push(entry);
  }
  if (!missing.length) return { text: targetText, added: [] };

  const eol = targetText.includes('\r\n') ? '\r\n' : '\n';
  const block = [
    `# --- aus .env.example uebernommen (${today}) ---`,
    ...missing.flatMap((entry) => ['', ...entry.lines]),
  ].join(eol);
  const base = targetText === '' || targetText.endsWith('\n') ? targetText : targetText + eol;
  return {
    text: `${base}${base === '' ? '' : eol}${block}${eol}`,
    added: missing.map((entry) => ({ key: entry.key, active: entry.active })),
  };
}

async function defaultTargets(directory) {
  const names = await readdir(directory);
  return names
    .filter((name) => (name === '.env' || name.startsWith('.env.')) && name !== '.env.example' && !/\.(bak|backup|orig)$/.test(name))
    .sort();
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const explicit = args.filter((arg) => !arg.startsWith('--'));
  const root = fileURLToPath(new URL('../', import.meta.url));
  const examplePath = path.join(root, '.env.example');
  const example = await readFile(examplePath, 'utf8');
  const targets = explicit.length ? explicit : (await defaultTargets(root)).map((name) => path.join(root, name));

  if (!targets.length) {
    console.log('Keine Zieldateien gefunden. Lege zuerst eine .env an: Copy-Item .env.example .env');
    return;
  }

  let total = 0;
  for (const target of targets) {
    const label = path.relative(process.cwd(), target) || target;
    let current;
    try {
      current = await readFile(target, 'utf8');
    } catch {
      console.error(`${label}: Datei nicht lesbar, uebersprungen`);
      process.exitCode = 1;
      continue;
    }
    const { text, added } = syncEnv(example, current);
    if (!added.length) {
      console.log(`${label}: aktuell, nichts zu ergaenzen`);
      continue;
    }
    total += added.length;
    console.log(`${label}: ${dryRun ? 'wuerde ergaenzen' : 'ergaenzt'} ${added.length} Variable(n)`);
    for (const { key, active } of added) console.log(`  + ${key}${active ? '' : '  (auskommentiert)'}`);
    if (!dryRun) await writeFile(target, text);
  }
  if (dryRun && total) console.log('\nTrockenlauf: nichts geschrieben. Ohne --dry-run ausfuehren, um die Dateien zu aendern.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
