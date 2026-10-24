import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API and the server-rendered pages (login, account, legal pages, feed) run on the Node server.
const api = process.env.API_URL ?? 'http://localhost:3000';
const proxied = ['/api', '/impressum', '/datenschutz', '/nav.js', '/anmelden', '/abmelden', '/konto', '/feed.xml'];

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: Object.fromEntries(proxied.map((path) => [path, api])),
  },
});
