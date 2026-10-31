import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retryStartup, startReadyServices } from '../src/services/startup.js';

test('voice and role sync start while command registration is still waiting', async () => {
  let completeRegistration;
  const registration = new Promise(resolve => { completeRegistration = resolve; });
  const calls = [];
  const task = startReadyServices({}, {
    startVoice: () => calls.push('voice'),
    registerCommands: () => { calls.push('commands'); return registration; },
    syncGuilds: async () => { calls.push('roles'); },
  });
  await Promise.resolve();
  assert.deepEqual(calls, ['voice', 'commands', 'roles']);
  completeRegistration();
  await task;
});

test('failed background registration does not terminate voice or leak error text', async () => {
  let voiceStarted = false;
  const logs = [];
  await startReadyServices({}, {
    startVoice: () => { voiceStarted = true; },
    registerCommands: async () => { throw Object.assign(new Error('secret-token'), { status: 429 }); },
    syncGuilds: async () => {}, log: (...args) => logs.push(args),
  });
  assert(voiceStarted);
  assert.match(JSON.stringify(logs), /429/);
  assert(!JSON.stringify(logs).includes('secret-token'));
});

test('transient startup failure recovers with increasing backoff', async () => {
  let attempts = 0;
  const waits = [];
  const result = await retryStartup(async () => {
    if (++attempts < 3) throw Object.assign(new Error('connection lost'), { name: 'MongooseServerSelectionError' });
    return true;
  }, { sleep: async ms => waits.push(ms), log: () => {} });
  assert.equal(result, true);
  assert.deepEqual(waits, [15000, 30000]);
});

test('startup retry honors server cooldown and stops when shutdown is requested', async () => {
  const controller = new AbortController();
  const waits = [];
  let attempts = 0;
  await retryStartup(async () => {
    attempts++;
    throw { status: 429, retryAfterSeconds: 120 };
  }, {
    signal: controller.signal, log: () => {},
    sleep: async ms => { waits.push(ms); if (waits.length === 2) controller.abort(); },
  });
  assert.deepEqual(waits, [60000, 60000]);
  assert.equal(attempts, 1);
});

test('invalid credentials are not retried', async () => {
  let attempts = 0;
  await assert.rejects(retryStartup(async () => {
    attempts++;
    throw Object.assign(new Error('invalid credentials'), { status: 401 });
  }, { sleep: async () => assert.fail('must not retry') }), /invalid credentials/);
  assert.equal(attempts, 1);
});
