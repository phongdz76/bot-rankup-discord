import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Collection, PermissionsBitField, PermissionFlagsBits } from 'discord.js';
import { getDefaultGuildConfig } from '../src/config/index.js';
import { User } from '../src/models/User.js';
import { GuildConfig } from '../src/models/GuildConfig.js';
import { Season } from '../src/models/Season.js';
import { awardXp, ensureUser } from '../src/services/xp.js';
import { periodAt, getSeasonLeaderboard, getSeasonHistory, closeSeasons } from '../src/services/seasons.js';
import { activityNight, achievementProgress, unlockAchievements } from '../src/services/achievements.js';
import { gameRoleMenu, gameRoleSignature, applyGameRoles, publishGameRolePanel } from '../src/services/gameRoles.js';
import { saveGuildConfig, validateSettings } from '../src/services/guildConfig.js';
import * as profile from '../src/commands/profile.js';
import * as games from '../src/commands/games.js';
import * as leaderboard from '../src/commands/leaderboard.js';

const guildId = '111111111111111111';
const userId = '222222222222222222';
const roleId = '333333333333333333';
const otherRoleId = '444444444444444444';
let mongo;
before(async () => {
  mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), Season.init(), GuildConfig.init()]);
});
beforeEach(async () => { await Promise.all([User.deleteMany({}), GuildConfig.deleteMany({}), Season.deleteMany({})]); });
after(async () => { await mongoose.disconnect(); await mongo.stop(); });

function fixture() {
  const client = { isReady: () => true, token: 'private-bot-token' };
  const guild = { id: guildId, name: 'Community', client,
    roles: { cache: new Collection(), fetch: async () => {} }, channels: { cache: new Collection(), fetch: async () => {} } };
  const roles = new Collection();
  const member = { id: userId, guild, displayName: 'Thành viên', user: { id: userId, username: 'Member', bot: false, displayAvatarURL: () => 'https://example.invalid/avatar.png' },
    roles: { cache: roles, add: async id => roles.set(id, guild.roles.cache.get(id)), remove: async id => roles.delete(id) } };
  const me = { permissions: new PermissionsBitField([PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageGuild]) };
  guild.members = { fetchMe: async () => me, fetch: async () => member };
  for (const id of [roleId, otherRoleId]) guild.roles.cache.set(id, { id, name: id === roleId ? 'Genshin' : 'Valorant', editable: true, managed: false, permissions: new PermissionsBitField() });
  const settings = getDefaultGuildConfig(guildId);
  settings.gameRoles = { enabled: true, mode: 'multiple', roles: [{ roleId, label: 'Genshin' }, { roleId: otherRoleId, label: 'Valorant' }] };
  return { client, guild, member, me, settings };
}

test('period boundaries use Vietnam midnight, Mondays, month ends, leap years and year crossings', () => {
  assert.equal(periodAt('month', new Date('2026-10-31T16:59:59Z')).date, '2026-10-01');
  assert.equal(periodAt('month', new Date('2026-10-31T17:00:00Z')).date, '2026-11-01');
  assert.equal(periodAt('week', new Date('2026-11-01T16:59:59Z')).date, '2026-10-26');
  assert.equal(periodAt('week', new Date('2026-11-01T17:00:00Z')).date, '2026-11-02');
  assert.equal(periodAt('week', new Date('2027-01-01T00:00:00Z')).date, '2026-12-28');
  assert.equal(periodAt('month', new Date('2028-02-29T10:00:00Z')).endsAt.toISOString(), '2028-02-29T17:00:00.000Z');
});

test('night activity groups midnight with the previous night and excludes daytime', () => {
  assert.equal(activityNight(new Date('2026-10-31T15:00:00Z')), '2026-10-31');
  assert.equal(activityNight(new Date('2026-10-31T18:59:59Z')), '2026-10-31');
  assert.equal(activityNight(new Date('2026-10-31T19:00:00Z')), null);
});

test('chat cooldown and concurrent voice atomically update lifetime and both period scores without imported role XP', async () => {
  const { member, settings, guild } = fixture();
  settings.gameRoles.enabled = false; settings.gameRoles.roles = [];
  settings.roleBaselines = [{ roleId, level: 5 }]; member.roles.cache.set(roleId, guild.roles.cache.get(roleId));
  const now = new Date('2026-10-31T15:00:00Z');
  const awards = await Promise.all([
    awardXp(member, settings, { source: 'chat', xp: 10, now }),
    awardXp(member, settings, { source: 'chat', xp: 10, now }),
    awardXp(member, settings, { source: 'voice', xp: 2, now }),
  ]);
  assert.equal(awards.filter(Boolean).length, 2);
  const stored = await User.findOne({ guildId, userId }).lean();
  assert.equal(stored.xp, 5012); assert.equal(stored.messageCount, 1); assert.equal(stored.totalVoiceMinutes, 1);
  assert.deepEqual(stored.nightDates, ['2026-10-31']);
  assert(stored.achievements.newcomer);
  for (const period of ['week', 'month']) {
    const board = await getSeasonLeaderboard(guildId, period, 1, undefined, now);
    assert.equal(board.entries[0].xp, 12); assert.equal(board.entries[0].messageCount, 1);
    assert.equal(board.entries[0].totalVoiceMinutes, 1);
  }
});

test('new month/week earn fresh scores, archive prior winners once and keep lifetime XP and badges', async () => {
  const { member, settings } = fixture();
  const before = new Date('2027-01-31T16:59:00Z'); // Sunday 23:59, both periods end together.
  const afterBoundary = new Date('2027-01-31T17:01:00Z');
  await awardXp(member, settings, { source: 'chat', xp: 10, now: before });
  await awardXp(member, settings, { source: 'chat', xp: 20, now: afterBoundary });
  assert.equal(await closeSeasons(new Date('2027-01-31T17:04:00Z')), 0);
  assert.equal(await closeSeasons(new Date('2027-01-31T17:06:00Z')), 2);
  const archived = await getSeasonHistory(guildId, 'week');
  assert.equal(archived.length, 1); assert.equal(archived[0].winners[0].xp, 10);
  const user = await User.findOne({ guildId, userId }).lean();
  assert.equal(user.xp, 30); assert(user.achievements.champion_week); assert(user.achievements.champion_month);
  const unlockedAt = user.achievements.champion_week;
  assert.equal(await closeSeasons(new Date('2027-01-31T17:07:00Z')), 0);
  assert.equal((await User.findOne({ guildId, userId }).lean()).achievements.champion_week.getTime(), unlockedAt.getTime());
  assert.equal((await getSeasonLeaderboard(guildId, 'week', 1, undefined, afterBoundary)).entries[0].xp, 20);
  // Even a delayed award cannot modify an already sealed season.
  await awardXp(member, settings, { source: 'voice', xp: 2, now: before });
  const old = await getSeasonLeaderboard(guildId, 'month', 1, '2027-01-01', afterBoundary);
  assert.equal(old.entries[0].xp, 10); assert(old.season.closedAt);
});

test('season standings paginate by earned XP with stable ties, retain history after leaving, and isolate guilds', async () => {
  const now = new Date('2026-10-31T15:00:00Z'), key = periodAt('week', now).key;
  await User.insertMany(Array.from({ length: 12 }, (_, i) => ({ guildId, userId: String(500000000000000000n + BigInt(i)),
    xp: 9999 - i, rolePosition: i, inGuild: i !== 0, periodScores: { [key]: { xp: 10, displayName: `Member ${i}` } } })));
  await User.create({ guildId: otherRoleId, userId, periodScores: { [key]: { xp: 1000 } } });
  const first = await getSeasonLeaderboard(guildId, 'week', 1, undefined, now);
  const second = await getSeasonLeaderboard(guildId, 'week', 2, undefined, now);
  assert.equal(first.memberCount, 12); assert.equal(first.entries.length, 10); assert.equal(second.entries.length, 2);
  assert.equal(first.entries[0].username, 'Member 0'); assert.equal(second.entries[0].rank, 11);
  for (const date of ['2026-02-30', 'garbage', ['2026-10-31'], '2028-01-01']) {
    await assert.rejects(getSeasonLeaderboard(guildId, 'week', 1, date, now), { status: 400 });
  }
  await assert.rejects(getSeasonLeaderboard(guildId, 'invalid', 1), { status: 400 });
  await assert.rejects(getSeasonLeaderboard(guildId, 'week', 0), { status: 400 });
});

test('milestone achievements backfill from valid counters, keep unlock dates and never fabricate nights', async () => {
  const created = await User.create({ guildId, userId, messageCount: 1000, totalVoiceMinutes: 6000, xp: 99999 });
  const first = await unlockAchievements(created, new Date('2026-10-31T12:00:00Z'));
  assert.equal(achievementProgress(first).filter(badge => badge.unlockedAt).length, 6);
  assert(!first.achievements.night_owl); assert(!first.achievements.champion_week);
  const second = await unlockAchievements(first, new Date('2026-11-01T12:00:00Z'));
  assert.equal(second.achievements.chat_100.getTime(), first.achievements.chat_100.getTime());
  const elsewhere = await User.create({ guildId: roleId, userId, xp: 100000 });
  assert.equal(achievementProgress(await unlockAchievements(elsewhere)).filter(badge => badge.unlockedAt).length, 0);
});

test('three nights unlock Cú đêm, while repeated chat in the same night counts once', async () => {
  const { member, settings } = fixture();
  for (const time of ['2026-10-28T15:00:00Z', '2026-10-28T17:00:00Z', '2026-10-29T15:00:00Z', '2026-10-30T15:00:00Z']) {
    await awardXp(member, settings, { source: 'chat', xp: 1, now: new Date(time) });
  }
  const stored = await User.findOne({ guildId, userId }).lean();
  assert.equal(stored.nightDates.length, 3); assert(stored.achievements.night_owl);
});

test('profile, seasonal leaderboard and games commands produce valid replies without REST reads', async () => {
  const { member, settings } = fixture();
  await GuildConfig.create(settings);
  for (const command of [profile, games, leaderboard]) assert(command.data.toJSON().name);
  const replies = [];
  const interaction = { inGuild: () => true, guildId, user: member.user, member,
    options: { getUser: () => null, getString: name => name === 'period' ? 'week' : null, getInteger: () => null },
    deferReply: async () => {}, editReply: async value => { replies.push(value); } };
  await profile.execute(interaction); await games.execute(interaction); await leaderboard.execute(interaction);
  assert(replies[0].embeds[0].toJSON().fields[1].value.length <= 1024);
  assert.equal(replies[1].components[0].toJSON().components[0].options.length, 2);
  assert(replies[2].embeds[0].toJSON().description.includes('Chưa có hoạt động'));
  const dm = [];
  for (const command of [profile, games]) await command.execute({ inGuild: () => false, reply: value => dm.push(value) });
  assert(dm.every(reply => reply.flags === 64));
});

test('game configuration rejects duplicates, privilege escalation, rank roles and missing resources', async () => {
  const { guild, settings } = fixture();
  const duplicate = structuredClone(settings); duplicate.gameRoles.roles.push(duplicate.gameRoles.roles[0]);
  assert.throws(() => validateSettings(duplicate, guildId), { status: 400 });
  const sameRank = structuredClone(settings); sameRank.roleRewards = [{ roleId, level: 5 }];
  assert.throws(() => validateSettings(sameRank, guildId), { status: 400 });
  guild.roles.cache.get(roleId).permissions = new PermissionsBitField(PermissionFlagsBits.Administrator);
  await assert.rejects(saveGuildConfig(guild, settings, 0), { status: 400 });
  guild.roles.cache.get(roleId).permissions = new PermissionsBitField();
  guild.roles.cache.get(roleId).editable = false;
  await assert.rejects(saveGuildConfig(guild, settings, 0), { status: 400 });
  guild.roles.cache.get(roleId).editable = true;
  const saved = await saveGuildConfig(guild, settings, 0);
  assert.equal(saved.gameRoles.roles[0].label, 'Genshin');
});

test('game selection changes only allowlisted roles through individual idempotent endpoints', async t => {
  const { guild, client, member, settings } = fixture();
  await GuildConfig.create(settings);
  member.roles.cache.set(otherRoleId, guild.roles.cache.get(otherRoleId));
  member.roles.cache.set('999999999999999999', { id: '999999999999999999' });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, method: options.method }); assert.equal(options.headers.Authorization, 'Bot private-bot-token');
    return new Response(null, { status: 204 });
  });
  const result = await applyGameRoles({ guildId, guild, client, user: member.user, values: [roleId], customId: `games:${gameRoleSignature(settings)}` });
  assert.deepEqual(calls.map(call => call.method), ['PUT', 'DELETE']);
  assert(calls[0].url.endsWith(`/roles/${roleId}`)); assert(calls[1].url.endsWith(`/roles/${otherRoleId}`));
  assert(calls.every(call => !call.url.includes('999999999999999999')));
  assert(result.content.includes('Đã cập nhật'));
  assert(!JSON.stringify(result).includes('private-bot-token'));
});

test('stale, tampered, disabled, single-choice and newly privileged role menus cannot modify roles', async t => {
  let mutations = 0; t.mock.method(globalThis, 'fetch', async () => { mutations++; return new Response(null, { status: 204 }); });
  const { guild, client, member, settings } = fixture(); await GuildConfig.create(settings);
  const base = { guildId, guild, client, user: member.user, values: [roleId], customId: `games:${gameRoleSignature(settings)}` };
  await assert.rejects(applyGameRoles({ ...base, customId: 'games:old' }), { status: 400 });
  await assert.rejects(applyGameRoles({ ...base, values: ['999999999999999999'] }), { status: 400 });
  await assert.rejects(applyGameRoles({ ...base, values: [roleId, roleId] }), { status: 400 });
  guild.roles.cache.get(roleId).permissions = new PermissionsBitField(PermissionFlagsBits.ManageRoles);
  await assert.rejects(applyGameRoles(base), { status: 400 });
  guild.roles.cache.get(roleId).permissions = new PermissionsBitField();
  settings.gameRoles.mode = 'single'; await GuildConfig.updateOne({ guildId }, { $set: { gameRoles: settings.gameRoles } });
  await assert.rejects(applyGameRoles({ ...base, customId: `games:${gameRoleSignature(settings)}`, values: [roleId, otherRoleId] }), { status: 400 });
  settings.gameRoles.enabled = false; await GuildConfig.updateOne({ guildId }, { $set: { gameRoles: settings.gameRoles } });
  await assert.rejects(applyGameRoles({ ...base, customId: `games:${gameRoleSignature(settings)}` }), { status: 400 });
  assert.equal(mutations, 0);
});

test('cancelled role selections never start a role write and simultaneous selections are rejected', async t => {
  const { guild, client, member, settings } = fixture(); await GuildConfig.create(settings);
  const controller = new AbortController(); let mutations = 0;
  guild.roles.fetch = async () => controller.abort();
  t.mock.method(globalThis, 'fetch', async () => { mutations++; return new Response(null, { status: 204 }); });
  const base = { guildId, guild, client, user: member.user, values: [roleId], customId: `games:${gameRoleSignature(settings)}` };
  await assert.rejects(applyGameRoles({ ...base, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(mutations, 0);
  let release; guild.roles.fetch = () => new Promise(resolve => { release = resolve; });
  const first = applyGameRoles(base);
  while (!release) await new Promise(resolve => setTimeout(resolve, 1));
  await assert.rejects(applyGameRoles(base), /Lượt chọn trước/);
  release(); await first;
  assert.equal(mutations, 1);
});

test('publishing a persistent game panel checks channel access and sends a non-pinging menu', async t => {
  const { guild, settings } = fixture(); await GuildConfig.create(settings);
  const channelId = '555555555555555555';
  guild.channels.cache.set(channelId, { id: channelId, type: 0, permissionsFor: () => new PermissionsBitField([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]) });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert(url.endsWith(`/channels/${channelId}/messages`));
    const body = JSON.parse(options.body); assert.deepEqual(body.allowed_mentions, { parse: [] });
    assert.equal(body.components[0].components[0].custom_id, `games:${gameRoleSignature(settings)}`);
    return Response.json({ id: '666666666666666666' });
  });
  await assert.rejects(publishGameRolePanel(guild, roleId), { status: 400 });
  const result = await publishGameRolePanel(guild, channelId);
  assert.equal(result.url, `https://discord.com/channels/${guildId}/${channelId}/666666666666666666`);
});

test('role HTTP 429 is not retried, respects cooldown and diagnostics never include credentials', async t => {
  const { guild, client, member, settings } = fixture(); await GuildConfig.create(settings);
  const logs = []; t.mock.method(console, 'warn', (...args) => logs.push(args.join(' ')));
  let writes = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    writes++;
    return Response.json({ retry_after: 120, code: 0, private: 'private-response-token' }, { status: 429, headers: { 'Retry-After': '120' } });
  });
  const interaction = { guildId, guild, client, user: member.user, values: [roleId], customId: `games:${gameRoleSignature(settings)}` };
  await assert.rejects(applyGameRoles(interaction), { status: 429 });
  await assert.rejects(applyGameRoles(interaction), { status: 429 });
  assert.equal(writes, 1);
  assert(logs.some(line => line.includes('retryAfterSeconds')));
  assert(!logs.some(line => line.includes('private-')));
});
