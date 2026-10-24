import { spawn } from 'node:child_process';

// Runs the API (port 3000) and the Vite dev server (port 5173) together.
const commands = [
  ['api', process.execPath, ['--watch', 'src/api/server.js']],
  ['web', process.execPath, ['node_modules/vite/bin/vite.js']],
];

const children = commands.map(([name, command, args]) => {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = (stream, target) => stream.on('data', (chunk) => {
    for (const line of String(chunk).split(/\r?\n/).filter(Boolean)) target.write(`[${name}] ${line}\n`);
  });
  prefix(child.stdout, process.stdout);
  prefix(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.error(`[${name}] beendet (Code ${code})`);
    shutdown(code ?? 1);
  });
  return child;
});

function shutdown(code = 0) {
  for (const child of children) child.kill();
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
