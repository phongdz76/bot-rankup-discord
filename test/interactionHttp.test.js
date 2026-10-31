import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Client, Collection, PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { config, getDefaultGuildConfig } from '../src/config/index.js';
import { createWebApp } from '../src/server.js';
import { interactionHttpRoutes } from '../src/services/interactionHttp.js';
import { saveGuildConfig } from '../src/services/guildConfig.js';
import { User } from '../src/models/User.js';
import { GuildConfig } from '../src/models/GuildConfig.js';
import * as help from '../src/commands/help.js';
import * as rank from '../src/commands/rank.js';
import * as leaderboard from '../src/commands/leaderboard.js';
import * as setup from '../src/commands/setup.js';
import * as profile from '../src/commands/profile.js';
import * as games from '../src/commands/games.js';
import { gameRoleSignature } from '../src/services/gameRoles.js';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicHex = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
const appId = '111111111111111111';
const guildId = '222222222222222222';
const userId = '333333333333333333';
let counter = 400000000000000000n;
let mongo;
let outbound = 0;
const clients = [];
const settings = { ...config, clientId: appId, botEnabled: true, interactionsPublicKey: publicHex,
  dashboard: { clientSecret: '', sessionSecret: '' } };

before(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); });
beforeEach(async () => { outbound = 0; await Promise.all([User.deleteMany({}), GuildConfig.deleteMany({})]); });
after(async () => { await Promise.all(clients.map(client => client.destroy())); await mongoose.disconnect(); await mongo.stop(); });

function fixture() {
  const client = new Client({ intents: [], rest: { makeRequest: async () => {
    outbound++;
    throw new Error('Outbound REST must not be used by inline reads');
  } } });
  client.commands = new Collection([help, rank, leaderboard, setup, profile, games].map(command => [command.data.name, command]));
  clients.push(client);
  return { client, app: createWebApp({ client, settings }) };
}

function command(name, options = []) {
  return { id: String(++counter), application_id: appId, type: 2, token: 'private-interaction-token', version: 1,
    guild_id: guildId, channel: { id: '555555555555555555', type: 0 },
    member: { user: { id: userId, username: 'Test User', discriminator: '0', avatar: null }, roles: [], permissions: '0' },
    app_permissions: '0', entitlements: [], data: { id: '666666666666666666', name, type: 1, options } };
}

function signed(app, payload, { timestamp = String(Math.floor(Date.now() / 1000)), raw = JSON.stringify(payload), signature } = {}) {
  const bytes = Buffer.from(raw);
  const signedHex = signature || sign(null, Buffer.concat([Buffer.from(timestamp), bytes]), privateKey).toString('hex');
  return request(app).post('/discord/interactions').set('Content-Type', 'application/json')
    .set('x-signature-timestamp', timestamp).set('x-signature-ed25519', signedHex).send(raw);
}

test('HTTP endpoint verifies raw signatures, timestamp freshness and application identity before dispatch', async () => {
  const { app } = fixture();
  await signed(app, { type: 1 }).expect(200, { type: 1 });
  await signed(app, { type: 1 }, { signature: '0'.repeat(128) }).expect(401);
  await signed(app, { type: 1 }, { timestamp: String(Math.floor(Date.now() / 1000) - 301) }).expect(401);
  await signed(app, { type: 1 }, { timestamp: String(Math.floor(Date.now() / 1000) + 301) }).expect(401);
  const raw = JSON.stringify({ type: 1 });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = sign(null, Buffer.from(timestamp + raw), privateKey).toString('hex');
  await signed(app, { type: 1 }, { timestamp, signature, raw: raw + ' ' }).expect(401);
  await signed(app, null).expect(400);
  await signed(app, {}, { raw: '{broken' }).expect(400);
  await signed(app, { ...command('help'), application_id: guildId }).expect(400);
  await request(app).post('/discord/interactions').send({ type: 1 }).expect(401);
  assert.equal(outbound, 0);
});

test('help, rank, leaderboard and private configuration reads reply inline while Gateway and outbound API are unavailable', async () => {
  const { app, client } = fixture();
  assert.equal(client.isReady(), false);
  await User.create({ guildId, userId, xp: 5000, level: 5, inGuild: true, displayName: 'Test User' });
  for (const [name, options, title] of [
    ['help', [], 'Hướng dẫn'], ['rank', [], null], ['leaderboard', [], 'Bảng xếp hạng'], ['profile', [], 'Hồ sơ'],
  ]) {
    const response = await signed(app, command(name, options)).expect(200);
    assert.equal(response.body.type, 4);
    assert(response.body.data.embeds.length);
    if (title) assert(response.body.data.embeds[0].title.includes(title));
    if (name === 'rank') assert(response.body.data.embeds[0].fields.some(field => field.value === '**Level 5**'));
    if (name === 'leaderboard') assert(response.body.data.embeds[0].description.includes(userId));
    assert(!response.text.includes('private-interaction-token'));
    assert.deepEqual(response.body.data.allowed_mentions, { parse: [] });
  }
  const denied = await signed(app, command('setup', [{ type: 1, name: 'view' }])).expect(200);
  assert.equal(denied.body.data.flags, 64);
  assert(denied.body.data.content.includes('Quản lý Server'));
  const view = command('setup', [{ type: 1, name: 'view' }]);
  view.member.permissions = PermissionFlagsBits.ManageGuild.toString();
  const file = await signed(app, view).buffer(true).parse((res, done) => {
    const chunks = [];
    res.on('data', chunk => chunks.push(chunk));
    res.on('end', () => done(null, Buffer.concat(chunks)));
  }).expect(200);
  const multipart = file.body.toString('utf8');
  assert.match(file.headers['content-type'], /multipart\/form-data/);
  assert(multipart.includes('hutao-settings.json'));
  assert(multipart.includes('"flags":64'));
  assert(multipart.includes(guildId));
  const health = await request(app).get('/health').expect(503);
  assert.equal(health.body.interactionsHttp.enabled, true);
  assert.equal(health.body.interactionsHttp.lastResponse.outcome, 'completed');
  assert.equal(outbound, 0);
});

test('games command and signed select menus reply inline and duplicate deliveries change roles once', async t => {
  const { app, client } = fixture();
  const roleId = '777777777777777777', botRoleId = '888888888888888888';
  const saved = getDefaultGuildConfig(guildId);
  saved.gameRoles = { enabled: true, mode: 'multiple', roles: [{ roleId, label: 'Genshin' }] };
  await GuildConfig.create(saved);
  const menu = await signed(app, command('games')).expect(200);
  assert.equal(menu.body.data.flags, 64);
  assert.equal(menu.body.data.components[0].components[0].custom_id, `games:${gameRoleSignature(saved)}`);
  client.user = client.users._add({ id: appId, username: 'Hutao', discriminator: '0', bot: true });
  client.token = 'private-bot-token';
  const guild = client.guilds._add({ id: guildId, name: 'Test', owner_id: '999999999999999999', roles: [
    { id: guildId, name: '@everyone', permissions: '0', position: 0 },
    { id: roleId, name: 'Genshin', permissions: '0', position: 1 },
    { id: botRoleId, name: 'Bot', permissions: PermissionFlagsBits.ManageRoles.toString(), position: 10 },
  ] });
  guild.members._add({ user: { id: appId, username: 'Hutao', discriminator: '0', bot: true }, roles: [botRoleId], joined_at: new Date().toISOString() });
  const member = guild.members._add({ user: { id: userId, username: 'Test User', discriminator: '0' }, roles: [], joined_at: new Date().toISOString() });
  t.mock.method(client, 'isReady', () => true);
  t.mock.method(guild.roles, 'fetch', async () => guild.roles.cache);
  t.mock.method(guild.members, 'fetchMe', async () => guild.members.me);
  t.mock.method(guild.members, 'fetch', async () => member);
  let writes = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    writes++; assert(url.endsWith(`/members/${userId}/roles/${roleId}`)); assert.equal(options.method, 'PUT');
    return new Response(null, { status: 204 });
  });
  const payload = { ...command('games'), type: 3, data: { component_type: 3, custom_id: `games:${gameRoleSignature(saved)}`, values: [roleId] },
    message: { id: '999999999999999998', channel_id: '555555555555555555', author: { id: appId, username: 'Hutao', discriminator: '0', bot: true },
      content: 'Chọn game', timestamp: new Date().toISOString(), type: 0, attachments: [], embeds: [], components: [], mentions: [], mention_roles: [] } };
  const responses = await Promise.all([signed(app, payload).expect(200), signed(app, payload).expect(200)]);
  assert.equal(responses[0].body.type, 4); assert.equal(responses[0].body.data.flags, 64);
  assert(responses[0].body.data.content.includes('Đã cập nhật'));
  assert.deepEqual(responses[0].body, responses[1].body); assert.equal(writes, 1);
  assert.equal(outbound, 0);
  await signed(app, { ...payload, id: String(++counter), message: { ...payload.message, author: { id: userId } } }).expect(400);
});

test('signed game menu deadline aborts before any role mutation when preflight is slow', async t => {
  const { client } = fixture();
  const roleId = '777777777777777777';
  const saved = getDefaultGuildConfig(guildId); saved.gameRoles = { enabled: true, mode: 'multiple', roles: [{ roleId, label: 'Game' }] };
  await GuildConfig.create(saved);
  client.user = client.users._add({ id: appId, username: 'Hutao', discriminator: '0', bot: true });
  const guild = client.guilds._add({ id: guildId, name: 'Test', roles: [] });
  guild.roles.cache.set(roleId, { id: roleId, editable: true, managed: false, permissions: new PermissionsBitField() });
  t.mock.method(client, 'isReady', () => true);
  let release;
  t.mock.method(guild.roles, 'fetch', () => new Promise(resolve => { release = resolve; }));
  t.mock.method(guild.members, 'fetchMe', async () => ({ permissions: { has: () => true } }));
  t.mock.method(guild.members, 'fetch', async () => ({ id: userId, roles: { cache: new Collection() } }));
  let writes = 0; t.mock.method(globalThis, 'fetch', async () => { writes++; return new Response(null, { status: 204 }); });
  const app = express(); app.use('/discord/interactions', interactionHttpRoutes({ client, settings, deadlineMs: 30, log: () => {} }));
  const payload = { ...command('games'), type: 3, data: { component_type: 3, custom_id: `games:${gameRoleSignature(saved)}`, values: [roleId] },
    message: { id: '999999999999999998', channel_id: '555555555555555555', author: { id: appId, username: 'Hutao', discriminator: '0', bot: true },
      content: '', timestamp: new Date().toISOString(), type: 0, attachments: [], embeds: [], components: [], mentions: [], mention_roles: [] } };
  const response = await signed(app, payload).expect(200);
  assert(response.body.data.content.includes('Mở /games'));
  release(); await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(writes, 0);
});

test('duplicate signed commands share the same result and execute side effects once', async () => {
  const { client, app } = fixture();
  let executions = 0;
  client.commands.set('setup', { execute: async interaction => {
    executions++;
    await interaction.deferReply({ flags: 64 });
    await new Promise(resolve => setTimeout(resolve, 20));
    await interaction.editReply('saved once');
  } });
  const payload = command('setup');
  const [first, duplicate] = await Promise.all([signed(app, payload), signed(app, payload)]);
  assert.equal(first.status, 200); assert.deepEqual(first.body, duplicate.body);
  assert.equal(first.body.data.flags, 64);
  const later = await signed(app, payload).expect(200);
  assert.deepEqual(first.body, later.body);
  assert.equal(executions, 1); assert.equal(outbound, 0);
});

test('slow commands get a bounded inline response and late results never call Discord', async () => {
  const { client } = fixture();
  let release;
  let lateDone;
  const completed = new Promise(resolve => { lateDone = resolve; });
  client.commands.set('help', { execute: async interaction => {
    await interaction.deferReply();
    await new Promise(resolve => { release = resolve; });
    await interaction.editReply('late result');
    lateDone();
  } });
  const app = express();
  app.use('/discord/interactions', interactionHttpRoutes({ client, settings, deadlineMs: 20, log: () => {} }));
  const response = await signed(app, command('help')).expect(200);
  assert.equal(response.body.type, 4);
  assert.equal(response.body.data.flags, 64);
  assert(response.body.data.content.includes('Chưa tải xong'));
  release(); await completed;
  assert.equal(outbound, 0);
});

test('aborted setup validation cannot write configuration after the inline deadline', async () => {
  const controller = new AbortController();
  const guild = { id: guildId,
    channels: { fetch: async () => { controller.abort(); }, cache: new Collection() },
    roles: { fetch: async () => {}, cache: new Collection() },
    members: { fetchMe: async () => ({}) },
  };
  await assert.rejects(saveGuildConfig(guild, getDefaultGuildConfig(guildId), 0, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(await GuildConfig.countDocuments(), 0);
});
