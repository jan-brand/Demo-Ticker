import test from 'node:test';
import assert from 'node:assert/strict';
import { httpsRedirectTarget, isSecure, securityHeaders } from '../src/api/http.js';

const request = (headers = {}, encrypted = false, url = '/versammlung/5') => ({
  headers: { host: 'ticker.example:3000', ...headers }, socket: { encrypted }, url,
});

test('security headers always restrict content to the own origin', () => {
  const headers = securityHeaders(request(), {});
  assert.match(headers['content-security-policy'], /default-src 'self'/);
  assert.match(headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['referrer-policy'], 'no-referrer');
  assert.equal(headers['strict-transport-security'], undefined);
});

test('HSTS is only sent over HTTPS', () => {
  assert.ok(securityHeaders(request({}, true), {})['strict-transport-security']);
  assert.equal(securityHeaders(request({ 'x-forwarded-proto': 'https' }), {})['strict-transport-security'], undefined);
  assert.ok(securityHeaders(request({ 'x-forwarded-proto': 'https' }), { TRUST_PROXY: '1' })['strict-transport-security']);
});

test('x-forwarded-proto is ignored unless the proxy is trusted', () => {
  assert.equal(isSecure(request({ 'x-forwarded-proto': 'https' }), {}), false);
  assert.equal(isSecure(request({ 'x-forwarded-proto': 'https' }), { TRUST_PROXY: '1' }), true);
  assert.equal(isSecure(request({ 'x-forwarded-proto': 'http' }), { TRUST_PROXY: '1' }), false);
});

test('HTTPS redirect only when enabled and the request is insecure', () => {
  assert.equal(httpsRedirectTarget(request(), {}), null);
  assert.equal(httpsRedirectTarget(request(), { FORCE_HTTPS: '1' }), 'https://ticker.example/versammlung/5');
  assert.equal(httpsRedirectTarget(request(), { FORCE_HTTPS: '1', HTTPS_PORT: '8443' }), 'https://ticker.example:8443/versammlung/5');
  assert.equal(httpsRedirectTarget(request({}, true), { FORCE_HTTPS: '1' }), null);
  assert.equal(httpsRedirectTarget(request({ 'x-forwarded-proto': 'https' }), { FORCE_HTTPS: '1', TRUST_PROXY: '1' }), null);
});
