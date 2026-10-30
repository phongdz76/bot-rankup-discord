import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getErrorDiagnostics } from '../src/utils/errors.js';
import { describeAuthFailure } from '../src/dashboard/authFailure.js';

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
