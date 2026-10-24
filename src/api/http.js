import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';

const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};
const COMPRESSIBLE = /^(text\/|application\/(json|atom\+xml)|image\/svg)/;
const MIN_COMPRESS_BYTES = 1024;

export const contentType = (file) => TYPES[extname(file)] ?? 'application/octet-stream';

// Everything is served from this origin: no third-party scripts, fonts, images or trackers.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function isSecure(request, env = process.env) {
  if (request.socket?.encrypted) return true;
  return env.TRUST_PROXY === '1' && String(request.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https';
}

export function securityHeaders(request, env = process.env) {
  const headers = {
    'content-security-policy': CONTENT_SECURITY_POLICY,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    'cross-origin-opener-policy': 'same-origin',
  };
  if (isSecure(request, env)) headers['strict-transport-security'] = 'max-age=31536000; includeSubDomains';
  return headers;
}

// With FORCE_HTTPS=1 plain HTTP requests are redirected. Behind a reverse proxy set TRUST_PROXY=1 as well.
export function httpsRedirectTarget(request, env = process.env) {
  if (env.FORCE_HTTPS !== '1' || isSecure(request, env)) return null;
  const host = (request.headers.host ?? '').replace(/:\d+$/, '');
  return host ? `https://${host}${env.HTTPS_PORT && env.HTTPS_PORT !== '443' ? `:${env.HTTPS_PORT}` : ''}${request.url}` : null;
}

function pickEncoding(request) {
  const accepted = String(request.headers['accept-encoding'] ?? '');
  if (/\bbr\b/.test(accepted)) return 'br';
  if (/\bgzip\b/.test(accepted)) return 'gzip';
  return null;
}

export async function send(request, response, { status = 200, type, body, headers = {} }) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const out = { ...securityHeaders(request), 'content-type': type, vary: 'Accept-Encoding', ...headers };
  let payload = buffer;
  const encoding = COMPRESSIBLE.test(type) && buffer.length >= MIN_COMPRESS_BYTES ? pickEncoding(request) : null;
  if (encoding === 'br') {
    payload = await brotliAsync(buffer, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } });
  } else if (encoding === 'gzip') {
    payload = await gzipAsync(buffer);
  }
  if (encoding) out['content-encoding'] = encoding;
  out['content-length'] = payload.length;
  response.writeHead(status, out);
  response.end(request.method === 'HEAD' ? undefined : payload);
}

export function sendJson(request, response, status, payload) {
  return send(request, response, { status, type: TYPES['.json'], body: JSON.stringify(payload), headers: { 'cache-control': 'no-store' } });
}

// Built files are read once and kept in memory together with their ETag.
const fileCache = new Map();

async function loadFile(file) {
  const info = await stat(file);
  const cached = fileCache.get(file);
  if (cached && cached.mtimeMs === info.mtimeMs) return cached;
  const body = await readFile(file);
  const entry = { mtimeMs: info.mtimeMs, body, etag: `"${createHash('sha1').update(body).digest('base64url')}"` };
  fileCache.set(file, entry);
  return entry;
}

export async function sendFile(request, response, file, { immutable = false } = {}) {
  const { body, etag } = await loadFile(file);
  const cacheControl = immutable ? 'public, max-age=31536000, immutable' : 'no-cache';
  if (request.headers['if-none-match'] === etag) {
    response.writeHead(304, { ...securityHeaders(request), etag, 'cache-control': cacheControl });
    return response.end();
  }
  return send(request, response, { type: contentType(file), body, headers: { etag, 'cache-control': cacheControl } });
}
