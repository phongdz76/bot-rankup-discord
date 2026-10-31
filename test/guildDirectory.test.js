import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import session from 'express-session';
import request from 'supertest';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createWebApp } from '../src/server.js';
import { createDiscordApi } from '../src/dashboard/discordApi.js';
import { createGuildDirectory } from '../src/dashboard/guildDirectory.js';

const guildId = '111111111111111111', userId = '222222222222222222';
const settings = { clientId: guildId, mongoUri: 'mongodb://unused/test', production: false,
  dashboard: { clientSecret: 'private-client-secret', sessionSecret: 'test-session-secret-at-least-32-characters', callbackUrl: 'http://localhost/auth/discord/callback' } };
const rateLimited = () => Object.assign(new Error('private-upstream-body'), { status: 429, httpStatus: 429, retryAfterSeconds: 120 });

async function fixture(api, guildDirectory) {
  let allowed = true, ready = true;
  const guild = { id: guildId, name: 'Test Guild', roles: { fetch: async () => {} },
    members: { fetch: async () => ({ permissions: { has: () => allowed } }) } };
  const client = { isReady: () => ready, guilds: { cache: new Map([[guildId, guild]]) } };
  const store = new session.MemoryStore(); const sid = 'directory-session';
  await new Promise((resolve, reject) => store.set(sid, {
    cookie: { originalMaxAge: 86400000, expires: new Date(Date.now() + 86400000), httpOnly: true, sameSite: 'lax' },
    passport: { user: { id: userId, username: 'Test manager', accessToken: 'private-access-token', expiresAt: Date.now() + 3600000 } },
    csrfToken: 'a'.repeat(64), ...(guildDirectory ? { guildDirectory } : {}),
  }, error => error ? reject(error) : resolve()));
  const signature = createHmac('sha256', settings.dashboard.sessionSecret).update(sid).digest('base64').replace(/=+$/, '');
  const cookie = `hutao.sid=${encodeURIComponent(`s:${sid}.${signature}`)}`;
  const makeApp = (provider = api) => createWebApp({ client, settings, store, api: provider });
  const stored = () => new Promise((resolve, reject) => store.get(sid, (error, value) => error ? reject(error) : resolve(value)));
  return { app: makeApp(), makeApp, cookie, stored, revoke: () => { allowed = false; }, disconnect: () => { ready = false; } };
}

test('dashboard API honors provider cooldown, resumes afterward and keeps logs free of credentials', async () => {
  let time = Date.now(), calls = 0;
  const logs = [];
  const api = createDiscordApi({ now: () => time, log: (...args) => logs.push(args), fetcher: async url => {
    calls++;
    if (url.endsWith('/users/@me')) return Response.json({ id: userId });
    return Response.json({ retry_after: 2, code: 0, private: 'private-body' }, { status: 429,
      headers: { 'Retry-After': '120', 'cf-ray': '0123456789abcdef-SIN' } });
  } });
  await assert.rejects(api('/users/@me/guilds?limit=200', 'private-access-token'), error => error.status === 429 && error.retryAfterSeconds === 120);
  await assert.rejects(api('/users/@me/guilds?limit=200', 'private-access-token'), { status: 429 });
  assert.equal(calls, 1);
  assert.equal((await api('/users/@me', 'private-access-token')).id, userId);
  time += 120001;
  await assert.rejects(api('/users/@me/guilds?limit=200', 'private-access-token'), { status: 429 });
  assert.equal(calls, 3);
  assert(!JSON.stringify(logs).includes('private-'));
  assert(JSON.stringify(logs).includes('cfRay'));
});

test('global dashboard API cooldown pauses both profile and guild calls', async () => {
  let calls = 0;
  const api = createDiscordApi({ log: () => {}, fetcher: async () => {
    calls++; return Response.json({ global: true, retry_after: 120 }, { status: 429 });
  } });
  await assert.rejects(api('/users/@me/guilds', 'token'), { status: 429 });
  await assert.rejects(api('/users/@me', 'token'), { status: 429 });
  assert.equal(calls, 1);
});

test('guild directory paginates, filters non-managers and coalesces simultaneous loads', async () => {
  let calls = 0;
  const user = { id: userId, accessToken: 'private-access-token' };
  const list = createGuildDirectory({ isReady: () => true, guilds: { cache: new Map() } }, async path => {
    calls++; await new Promise(resolve => setTimeout(resolve, 10));
    if (path.includes('&after=')) return [{ id: guildId, name: 'Managed', permissions: '32' }];
    return Array.from({ length: 200 }, (_, i) => ({ id: String(500000000000000000n + BigInt(i)), name: 'Ordinary', permissions: '0' }));
  });
  const results = await Promise.all([list(user), list(user), list(user)]);
  assert.equal(calls, 2);
  assert.equal(results[0].snapshot.guilds.length, 1);
  assert.equal(results[0].snapshot.guilds[0].name, 'Managed');
  assert(!JSON.stringify(results).includes('private-access-token'));
});

test('fresh guild list persists in the session across app restart without calling Discord again', async () => {
  let calls = 0;
  const { app, makeApp, cookie, stored } = await fixture(async () => {
    calls++; return [{ id: guildId, name: 'Stored Guild', owner: true }];
  });
  await request(app).get('/servers').set('Cookie', cookie).expect(200);
  const reopened = await request(makeApp(async () => { assert.fail('Must reuse stored directory'); })).get('/servers').set('Cookie', cookie).expect(200);
  assert(reopened.text.includes('Stored Guild')); assert.equal(calls, 1);
  assert.equal((await stored()).guildDirectory.guilds[0].id, guildId);
});

test('429 serves a stale directory, preserves login and persists retry timing across restart', async () => {
  let calls = 0;
  const saved = { userId, fetchedAt: Date.now() - 6 * 60000, guilds: [{ id: guildId, name: '<Stored Guild>', botPresent: true }] };
  const { app, makeApp, cookie, stored } = await fixture(async () => { calls++; throw rateLimited(); }, saved);
  const response = await request(app).get('/servers').set('Cookie', cookie).expect(200);
  assert(response.text.includes('&lt;Stored Guild&gt;')); assert(response.text.includes('bản đã tải trước đó'));
  assert(!response.text.includes('Đăng nhập lại')); assert(!response.text.includes('private-'));
  assert(Number(response.headers['retry-after']) > 0);
  await request(makeApp(async () => { assert.fail('Persisted cooldown must survive restart'); })).get('/servers').set('Cookie', cookie).expect(200);
  assert.equal(calls, 1); assert.equal((await stored()).passport.user.id, userId);
});

test('cold 429 explains the outage instead of losing login and repeated reloads do not call Discord', async () => {
  let calls = 0;
  const { app, cookie, stored } = await fixture(async () => { calls++; throw rateLimited(); });
  for (let i = 0; i < 5; i++) {
    const response = await request(app).get('/servers').set('Cookie', cookie).expect(429);
    assert(response.text.includes('Phiên đăng nhập của bạn vẫn được giữ'));
    assert(response.text.includes('DISCORD_API_RATE_LIMITED'));
    assert(!response.text.includes('Đăng nhập lại'));
    assert(!response.text.includes('Chưa tìm thấy máy chủ để quản lý'));
  }
  assert.equal(calls, 1); assert.equal((await stored()).passport.user.id, userId);
});

test('stored lists cannot grant read/write access after manager permission is revoked', async () => {
  const { app, cookie, revoke, disconnect } = await fixture(async () => [{ id: guildId, name: 'Managed', owner: true }]);
  await request(app).get('/servers').set('Cookie', cookie).expect(200);
  revoke();
  await request(app).get(`/servers/${guildId}`).set('Cookie', cookie).expect(403);
  await request(app).post(`/api/guilds/${guildId}/settings`).set('Cookie', cookie).set('x-csrf-token', 'a'.repeat(64)).send({}).expect(403);
  disconnect();
  const offline = await request(app).get(`/servers/${guildId}`).set('Cookie', cookie).expect(503);
  assert(offline.text.includes('Bot đang kết nối lại'));
  assert(!offline.text.includes('Đăng nhập lại'));
});

test('logout while guild loading is pending cannot resurrect the authenticated session', async () => {
  let release, markStarted;
  const started = new Promise(resolve => { markStarted = resolve; });
  const { app, cookie, stored } = await fixture(async () => {
    markStarted(); return new Promise(resolve => { release = () => resolve([]); });
  });
  const loading = request(app).get('/servers').set('Cookie', cookie).then(response => response);
  await started;
  await request(app).post('/auth/logout').set('Cookie', cookie).set('x-csrf-token', 'a'.repeat(64)).expect(302);
  release(); assert.equal((await loading).status, 302);
  assert(!(await stored())?.passport?.user);
  await request(app).get('/servers').set('Cookie', cookie).expect(302).expect('Location', '/auth/discord');
});

test('rejected access token clears authentication instead of looping between login and servers', async () => {
  const { app, cookie } = await fixture(async () => { throw Object.assign(new Error('Token rejected'), { status: 401 }); });
  const response = await request(app).get('/servers').set('Cookie', cookie).expect(401);
  assert(response.text.includes('Đăng nhập lại'));
  await request(app).get('/auth/discord').set('Cookie', cookie).expect(302).expect('Location', /^https:\/\/discord\.com\/oauth2\/authorize/);
});

const browserExecutable = [process.env.BROWSER_EXECUTABLE, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(path => path && existsSync(path));
test('browser: upstream 429 keeps a signed-in directory with a countdown and prevents repeated requests', { skip: !browserExecutable }, async () => {
  let calls = 0;
  const { app, cookie, disconnect } = await fixture(async () => { calls++; throw rateLimited(); });
  disconnect();
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: browserExecutable, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addCookies([{ name: 'hutao.sid', value: cookie.slice('hutao.sid='.length), url: base }]);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    assert.equal((await page.goto(`${base}/servers`)).status(), 429);
    const retry = page.locator('[data-discord-retry-at]');
    await page.waitForFunction(() => document.querySelector('[data-discord-retry-at]').textContent.includes('Thử lại sau'));
    assert.equal(await retry.getAttribute('aria-disabled'), 'true');
    assert.equal(await page.getByRole('link', { name: 'Đăng nhập lại' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Đăng xuất' }).count(), 1);
    await retry.click({ force: true }); assert.equal(calls, 1);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (process.env.CAPTURE_UI === '1') {
      await mkdir('.cache/qa', { recursive: true });
      await page.screenshot({ path: '.cache/qa/directory-rate-limited-mobile.png', fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({ path: '.cache/qa/directory-rate-limited-desktop.png', fullPage: true });
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
