import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { CommandRegistry } from '../src/models/CommandRegistry.js';
import { registerCommandsOnce } from '../src/services/commandRegistry.js';

let mongo;
before(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); await CommandRegistry.init(); });
beforeEach(async () => { await CommandRegistry.deleteMany({}); });
after(async () => { await mongoose.disconnect(); await mongo.stop(); });

test('unchanged commands reuse persisted registrations across rest clients, but changed commands and force publish', async () => {
  const appId = '111111111111111111'; let calls = 0;
  const rest = { put: async (path, { body }) => { calls++; return body.map(command => ({ id: '222222222222222222', name: command.name, type: 1 })); } };
  const body = [{ name: 'help', description: 'Help', type: 1 }];
  assert.equal((await registerCommandsOnce(rest, appId, body)).cached, false);
  const reused = await registerCommandsOnce({ put: async () => assert.fail('Unchanged commands must not contact Discord') }, appId, body);
  assert.equal(reused.cached, true); assert.equal(reused.commands[0].id, '222222222222222222');
  assert.equal(calls, 1);
  await registerCommandsOnce(rest, appId, [{ ...body[0], description: 'Updated help' }]);
  assert.equal(calls, 2);
  await registerCommandsOnce(rest, appId, [{ ...body[0], description: 'Updated help' }], { force: true });
  assert.equal(calls, 3);
});

test('failed registration does not checkpoint success and registrations are isolated per application', async () => {
  const body = [{ name: 'help', description: 'Help', type: 1 }];
  await assert.rejects(registerCommandsOnce({ put: async () => { throw new Error('Upstream unavailable'); } }, '111111111111111111', body));
  assert.equal(await CommandRegistry.countDocuments(), 0);
  let calls = 0;
  const rest = { put: async () => { calls++; return [{ id: '333333333333333333', name: 'help', type: 1 }]; } };
  await registerCommandsOnce(rest, '111111111111111111', body);
  await registerCommandsOnce(rest, '222222222222222222', body);
  assert.equal(calls, 2); assert.equal(await CommandRegistry.countDocuments(), 2);
});
