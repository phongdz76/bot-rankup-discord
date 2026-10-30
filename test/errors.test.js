import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getErrorDiagnostics } from '../src/utils/errors.js';
import { describeAuthFailure } from '../src/dashboard/authFailure.js';
import { getRateLimitDiagnostics } from '../src/utils/rateLimit.js';
import { createOAuthCooldown } from '../src/dashboard/oauthCooldown.js';

test('diagnostics retain HTTP and nested network failures without copying credentials', () => {
  const error = new Error('https://example.invalid/?code=private-authorization-code');
  error.oauthError = { statusCode: 429, data: '<html>private-client-secret</html>' };
  error.cause = new AggregateError([Object.assign(new Error('private-cookie'), { code: 'ETIMEDOUT' })]);
  error.cause.cause = error;
  assert.deepEqual(getErrorDiagnostics(error), { httpStatus: 429, networkCode: 'ETIMEDOUT' });
  assert.deepEqual(getErrorDiagnostics({ code: 'private-token', status: 'private-secret' }), {});
  assert.deepEqual(getErrorDiagnostics({ code: 'TokenInvalid' }), { clientCode: 'TokenInvalid' });
  assert.deepEqual(getErrorDiagnostics({ code: 4014 }), { discordCode: 4014 });
});

test('OAuth distinguishes credential rejection from provider limits and connection failures', () => {
  const cases = [
    [{ oauthError: { statusCode: 429, data: '<html>private-secret</html>' } }, 'OAUTH_RATE_LIMITED'],
    [{ oauthError: { statusCode: 403, data: '<html>private-secret</html>' } }, 'OAUTH_ACCESS_BLOCKED'],
    [{ oauthError: { statusCode: 503 } }, 'OAUTH_PROVIDER_UNAVAILABLE'],
    [{ oauthError: { code: 'ECONNRESET' } }, 'OAUTH_NETWORK_FAILED'],
    [{ oauthError: { statusCode: 401, data: '{"error":"invalid_client","error_description":"private-secret"}' } }, 'OAUTH_CLIENT_REJECTED'],
    [{ oauthError: { statusCode: 400, data: '{"error":"invalid_grant"}' } }, 'OAUTH_CODE_REJECTED'],
    [{ authStage: 'profile', httpStatus: 429, status: 502 }, 'OAUTH_RATE_LIMITED'],
  ];
  for (const [error, expected] of cases) {
    const failure = describeAuthFailure(error);
    assert.equal(failure.code, expected);
    assert(!JSON.stringify(failure).includes('private-secret'));
  }
});

test('429 diagnostics retain provider retry timing and scope without leaking headers or bodies', () => {
  const headers = new Headers({
    'retry-after': '12.5', 'x-ratelimit-scope': 'shared', 'x-ratelimit-global': 'true',
    'content-type': 'application/json', 'cf-ray': '0123456789abcdef-SIN',
    authorization: 'private-bearer-token', 'set-cookie': 'private-cookie',
  });
  assert.deepEqual(getRateLimitDiagnostics({ headers, data: '{"retry_after":2,"private":"private-secret"}' }), {
    retryAfterSeconds: 12.5, scope: 'shared', global: true,
    responseFormat: 'json', cfRay: '0123456789abcdef-SIN',
  });
  const failure = describeAuthFailure({ oauthError: {
    statusCode: 429, data: '{"retry_after":2.25,"global":false,"message":"private-secret"}',
  } });
  assert.equal(failure.retryAfterSeconds, 2.25);
  assert.equal(failure.global, false);
  assert(failure.message.includes('ít nhất 3 giây'));
  assert.deepEqual(getErrorDiagnostics(failure), {
    httpStatus: 429, retryAfterSeconds: 2.25, global: false, responseFormat: 'json',
  });
  assert(!JSON.stringify(failure).includes('private-secret'));
});

test('429 diagnostics do not invent a retry delay or claim every 429 is a Cloudflare block', () => {
  assert.deepEqual(getRateLimitDiagnostics({ headers: new Headers({ 'content-type': 'text/html' }) }), { responseFormat: 'html' });
  assert.deepEqual(getRateLimitDiagnostics({ data: '<html>Cloudflare Error code: 1015 private-secret</html>' }), { cloudflareError: 1015 });
  assert.deepEqual(getRateLimitDiagnostics({ data: '{"retry_after":"private-secret","global":"private-secret"}',
    headers: new Headers({ 'retry-after': '-4', 'x-ratelimit-scope': 'private-secret', 'cf-ray': 'private-secret' }) }), { responseFormat: 'json' });
  const unknown = describeAuthFailure({ oauthError: { statusCode: 429, data: '<html>private-secret</html>' } });
  assert.equal(unknown.retryAfterSeconds, undefined);
  assert(unknown.message.includes('chưa cung cấp thời gian chờ'));
  assert(!unknown.message.includes('ít phút'));
  const now = Date.parse('2026-10-30T12:00:00Z');
  assert.equal(getRateLimitDiagnostics({ headers: new Headers({ 'retry-after': 'Fri, 30 Oct 2026 12:00:15 GMT' }) }, now).retryAfterSeconds, 15);
});

test('OAuth cooldown honors provider delays, expires and uses a bounded fallback when unknown', () => {
  let time = 0;
  const cooldown = createOAuthCooldown({ now: () => time });
  cooldown.record({ httpStatus: 401 });
  assert.equal(cooldown.remainingSeconds(), 0);
  cooldown.record({ httpStatus: 429, retryAfterSeconds: 120.25 });
  assert.equal(cooldown.remainingSeconds(), 121);
  time = 30000;
  cooldown.record({ httpStatus: 429, retryAfterSeconds: 2 });
  assert.equal(cooldown.remainingSeconds(), 91);
  time = 121000;
  assert.equal(cooldown.remainingSeconds(), 0);
  cooldown.record({ httpStatus: 429 });
  assert.equal(cooldown.remainingSeconds(), 60);
  time += 60000;
  assert.equal(cooldown.remainingSeconds(), 0);
});
