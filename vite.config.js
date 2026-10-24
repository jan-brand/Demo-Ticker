import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API and the server-rendered pages (login, account, legal pages, feed) run on the Node server.
// The header tells the server that Vite is in front, so those pages link the style sheet Vite serves
// (/src/frontend/styles.css) instead of the built file in dist/, which Vite does not have.
const api = process.env.API_URL ?? 'http://localhost:3000';
const proxied = ['/api', '/impressum', '/datenschutz', '/nav.js', '/anmelden', '/abmelden', '/konto', '/feed.xml'];

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: Object.fromEntries(proxied.map((path) => [path, { target: api, headers: { 'x-dev-server': '1' } }])),
  },
});
