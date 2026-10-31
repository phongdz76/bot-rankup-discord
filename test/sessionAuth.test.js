import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import session from 'express-session';
import request from 'supertest';
import { createWebApp } from '../src/server.js';

const maxAge = 30 * 86400000;
const settings = { clientId: '111111111111111111', mongoUri: 'mongodb://unused/test', production: false,
  dashboard: { clientSecret: 'private-client-secret', sessionSecret: 'test-session-secret-with-at-least-32-characters',
    callbackUrl: 'http://localhost/auth/discord/callback' } };

async function fixture({ expiresAt = Date.now() - 1000, refreshToken = 'private-refresh-token' } = {}) {
  const store = new session.MemoryStore();
  const sid = 'remembered-session';
  const signature = createHmac('sha256', settings.dashboard.sessionSecret).update(sid).digest('base64').replace(/=+$/, '');
  const cookie = `hutao.sid=${encodeURIComponent(`s:${sid}.${signature}`)}`;
  await new Promise((resolve, reject) => store.set(sid, {
    cookie: { originalMaxAge: 86400000, expires: new Date(Date.now() + 86400000), httpOnly: true, sameSite: 'lax' },
    passport: { user: { id: '333333333333333333', username: 'Remembered user',
      accessToken: 'private-old-access-token', refreshToken, expiresAt } }, csrfToken: 'a'.repeat(64),
  }, error => error ? reject(error) : resolve()));
  const failures = [];
  const accessTokens = [];
  const makeApp = () => createWebApp({ settings, store, authLogger: failure => failures.push(failure),
    client: { isReady: () => true, guilds: { cache: new Map() } },
    api: async (path, token) => { accessTokens.push(token); return []; } });
  const stored = () => new Promise((resolve, reject) => store.get(sid, (error, value) => error ? reject(error) : resolve(value)));
  return { app: makeApp(), makeApp, cookie, stored, failures, accessTokens };
}

test('remembered login reopens dashboard without OAuth, extends cookie 30 days and survives app restart', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not contact Discord OAuth'); });
  const { app, makeApp, cookie, stored, accessTokens } = await fixture({ expiresAt: Date.now() + 604800000 });
  for (const path of ['/', '/auth/discord']) {
    const response = await request(app).get(path).set('Cookie', cookie).expect(302);
    assert.equal(response.headers.location, '/servers');
    const expires = new Date(response.headers['set-cookie'][0].match(/Expires=([^;]+)/)[1]).getTime();
    assert(Math.abs(expires - Date.now() - maxAge) < 5000);
    assert.match(response.headers['set-cookie'][0], /HttpOnly/);
    assert.match(response.headers['set-cookie'][0], /SameSite=Lax/);
  }
  await request(makeApp()).get('/servers').set('Cookie', cookie).expect(200);
  assert.deepEqual(accessTokens, ['private-old-access-token']);
  assert.equal((await stored()).cookie.originalMaxAge, maxAge);
});

test('expired access token refreshes once across simultaneous requests and persists rotated tokens', async t => {
  let exchanges = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    exchanges++;
    assert.equal(url, 'https://discord.com/api/oauth2/token');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.equal(options.body.get('grant_type'), 'refresh_token');
    assert.equal(options.body.get('refresh_token'), 'private-refresh-token');
    assert.equal(options.body.get('client_id'), settings.clientId);
    assert.equal(options.body.get('client_secret'), settings.dashboard.clientSecret);
    await new Promise(resolve => setTimeout(resolve, 30));
    return Response.json({ access_token: 'private-new-access-token', refresh_token: 'private-rotated-refresh-token', expires_in: 604800 });
  });
  const { app, makeApp, cookie, stored, accessTokens } = await fixture();
  const responses = await Promise.all(Array.from({ length: 4 }, () => request(app).get('/servers').set('Cookie', cookie).expect(200)));
  assert.equal(exchanges, 1);
  assert(accessTokens.every(token => token === 'private-new-access-token'));
  for (const response of responses) assert(!response.text.includes('private-'));
  const persisted = (await stored()).passport.user;
  assert.equal(persisted.refreshToken, 'private-rotated-refresh-token');
  assert(persisted.expiresAt > Date.now() + 6 * 86400000);
  await request(makeApp()).get('/servers').set('Cookie', cookie).expect(200);
  assert.equal(exchanges, 1);
});

test('token refresh preserves the previous refresh token when Discord does not rotate it', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ access_token: 'private-new-access-token', expires_in: 3600 }));
  const { app, cookie, stored } = await fixture({ expiresAt: Date.now() + 30000 });
  await request(app).get('/').set('Cookie', cookie).expect(302).expect('Location', '/servers');
  assert.equal((await stored()).passport.user.refreshToken, 'private-refresh-token');
});

test('refresh rate limits keep the login and pause further token or authorization requests', async t => {
  let exchanges = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    exchanges++;
    return Response.json({ retry_after: 120, private: 'private-response-secret' }, { status: 429 });
  });
  const { app, cookie, stored, failures } = await fixture();
  const failure = await request(app).get('/servers').set('Cookie', cookie).expect(429);
  assert(Number(failure.headers['retry-after']) > 0);
  assert(!failure.text.includes('private-'));
  const api = await request(app).get('/api/guilds/111111111111111111/settings').set('Cookie', cookie).expect(429);
  assert(api.body.error.includes('Phiên đăng nhập vẫn được giữ'));
  await request(app).get('/auth/discord').expect(429);
  assert.equal(exchanges, 1);
  assert.equal((await stored()).passport.user.refreshToken, 'private-refresh-token');
  assert.equal(failures.length, 1);
  assert(!JSON.stringify(failures).includes('private-'));
  // Public help and logout remain available during an upstream outage.
  await request(app).get('/docs').set('Cookie', cookie).expect(200);
  await request(app).post('/auth/logout').set('Cookie', cookie).set('x-csrf-token', 'a'.repeat(64)).expect(302);
  assert.equal(await stored(), undefined);
});

test('temporary refresh failures retain credentials so a later request can recover', async t => {
  let available = false;
  t.mock.method(globalThis, 'fetch', async () => {
    if (!available) throw Object.assign(new Error('private-network-error'), { code: 'ECONNRESET' });
    return Response.json({ access_token: 'private-recovered-access-token', expires_in: 3600 });
  });
  const { app, cookie, stored, failures } = await fixture();
  const response = await request(app).get('/servers').set('Cookie', cookie).expect(503);
  assert(!response.text.includes('private-'));
  assert((await stored()).passport.user.refreshToken);
  assert(!JSON.stringify(failures).includes('private-'));
  available = true;
  await request(app).get('/servers').set('Cookie', cookie).expect(200);
});

test('revoked refresh token clears authentication and expired legacy sessions require login', async t => {
  let exchanges = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    exchanges++;
    return Response.json({ error: 'invalid_grant' }, { status: 400 });
  });
  const { app, cookie, stored } = await fixture();
  await request(app).get('/api/guilds/111111111111111111/settings').set('Cookie', cookie).expect(401);
  assert(!(await stored())?.passport?.user);
  assert.equal(exchanges, 1);
  const legacy = await fixture({ refreshToken: null });
  await request(legacy.app).get('/servers').set('Cookie', legacy.cookie).expect(302).expect('Location', '/auth/discord');
  assert.equal(exchanges, 1);
});

test('logout during refresh does not restore the authenticated session', async t => {
  let finishRefresh;
  let markStarted;
  const started = new Promise(resolve => { markStarted = resolve; });
  t.mock.method(globalThis, 'fetch', async () => {
    markStarted();
    return new Promise(resolve => { finishRefresh = () => resolve(Response.json({ access_token: 'private-new-access-token', expires_in: 3600 })); });
  });
  const { app, cookie, stored } = await fixture();
  const refreshRequest = request(app).get('/servers').set('Cookie', cookie).then(response => response);
  await started;
  await request(app).post('/auth/logout').set('Cookie', cookie).set('x-csrf-token', 'a'.repeat(64)).expect(302);
  finishRefresh();
  const response = await refreshRequest;
  assert.equal(response.status, 302);
  assert.equal(response.headers.location, '/auth/discord');
  assert(!(await stored())?.passport?.user);
});
