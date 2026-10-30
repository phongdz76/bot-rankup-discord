import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { REST, RateLimitError, Routes } from 'discord.js';
import { client } from '../src/services/discord.js';

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
