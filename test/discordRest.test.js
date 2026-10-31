import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { REST, RateLimitError, Routes } from 'discord.js';
import { client } from '../src/services/discord.js';
import { attachDiscordHttpDiagnostics } from '../src/services/discordHttp.js';

after(async () => { await client.destroy(); });

test('interaction callback stops after the first HTTP 429 instead of retrying an expiring token', async () => {
  let requests = 0;
  const rest = new REST({
    rejectOnRateLimit: client.rest.options.rejectOnRateLimit,
    makeRequest: async () => {
      requests++;
      if (requests > 1) throw new Error('Interaction callback was retried after HTTP 429');
      return new Response('{"retry_after":0.02,"global":false}', {
        status: 429, headers: { 'content-type': 'application/json', 'retry-after': '0.02' },
      });
    },
  }).setToken('test-token');
  await assert.rejects(rest.post(Routes.interactionCallback('111111111111111111', 'test-interaction-token'), {
    auth: false, body: { type: 5 },
  }), error => error instanceof RateLimitError);
  assert.equal(requests, 1);
});

test('ordinary Discord REST requests still use the SDK retry policy', async () => {
  let requests = 0;
  const rest = new REST({
    rejectOnRateLimit: client.rest.options.rejectOnRateLimit,
    makeRequest: async () => {
      requests++;
      if (requests === 1) return new Response('{"retry_after":0.001,"global":false}', {
        status: 429, headers: { 'content-type': 'application/json', 'retry-after': '0.001' },
      });
      return new Response('{"url":"wss://example.invalid"}', { headers: { 'content-type': 'application/json' } });
    },
  }).setToken('test-token');
  const response = await rest.get(Routes.gateway());
  assert.equal(response.url, 'wss://example.invalid');
  assert.equal(requests, 2);
});

test('HTTP diagnostics preserve SDK bodies, record cooldown expiry and never expose request secrets', async () => {
  let time = Date.parse('2026-10-31T09:00:00Z');
  let status = 429;
  const logs = [];
  const rest = new REST({
    rejectOnRateLimit: ['/interactions/'],
    makeRequest: async () => new Response(status === 429
      ? '{"code":0,"retry_after":120,"global":false,"message":"private-provider-message"}'
      : '{"id":"111111111111111111","private":"private-response-token"}', {
      status, headers: { 'content-type': 'application/json', ...(status === 429 ? { 'retry-after': '120' } : {}) },
    }),
  }).setToken('private-bot-token');
  const diagnostics = attachDiscordHttpDiagnostics(rest, { now: () => time, log: (...args) => logs.push(args) });
  assert.equal(diagnostics.snapshot().interactions, 'unverified');
  await assert.rejects(rest.post(Routes.interactionCallback('111111111111111111', 'private-interaction-token'), {
    auth: false, body: { type: 5 },
  }), error => error instanceof RateLimitError);
  // The diagnostics handler reads the SDK-provided clone asynchronously.
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(diagnostics.snapshot(), {
    interactions: 'rate_limited', lastInteractionResponse: {
      httpStatus: 429, at: '2026-10-31T09:00:00.000Z', retryAt: '2026-10-31T09:02:00.000Z',
    },
  });
  assert(logs.some(entry => entry[0].includes('HTTP_ERROR') && JSON.parse(entry[1]).discordCode === 0));
  time += 120001;
  diagnostics.flush();
  assert.equal(diagnostics.snapshot().interactions, 'unverified');
  const summary = JSON.parse(logs.find(entry => entry[0].includes('REQUEST_SUMMARY'))[1]);
  assert.deepEqual(summary.counts, { 'interaction:429': 1 });
  status = 200;
  const body = await rest.post(Routes.interactionCallback('222222222222222222', 'private-new-token'), {
    auth: false, body: { type: 5 },
  });
  assert.equal(body.private, 'private-response-token');
  assert.equal(diagnostics.snapshot().interactions, 'available');
  assert(!JSON.stringify({ logs, health: diagnostics.snapshot() }).includes('private-'));
});

test('oversized provider error bodies do not stop SDK error handling or expose their contents', async () => {
  const logs = [];
  const rest = new REST({
    rejectOnRateLimit: ['/interactions/'],
    makeRequest: async () => new Response('private-secret'.repeat(25000), {
      status: 429, headers: { 'retry-after': '5', 'content-type': 'text/html' },
    }),
  }).setToken('test-token');
  attachDiscordHttpDiagnostics(rest, { log: (...args) => logs.push(args) });
  await assert.rejects(rest.post(Routes.interactionCallback('333333333333333333', 'private-token'), {
    auth: false, body: { type: 5 },
  }), error => error instanceof RateLimitError);
  await new Promise(resolve => setImmediate(resolve));
  const failure = JSON.parse(logs.find(entry => entry[0].includes('HTTP_ERROR'))[1]);
  assert.equal(failure.responseFormat, 'html');
  assert.equal(failure.retryAfterSeconds, 5);
  assert(!JSON.stringify(logs).includes('private-'));
});
