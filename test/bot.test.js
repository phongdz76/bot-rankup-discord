import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import session from 'express-session';
import { chromium } from 'playwright-core';
import { Collection, PermissionsBitField, PermissionFlagsBits, ChannelType } from 'discord.js';
import { config, getDefaultGuildConfig } from '../src/config/index.js';
import { GuildConfig } from '../src/models/GuildConfig.js';
import { User } from '../src/models/User.js';
import { getGuildConfig, saveGuildConfig, validateSettings } from '../src/services/guildConfig.js';
import { awardXp, ensureUser } from '../src/services/xp.js';
import { syncGuildMembersFromRoles, getGuildLeaderboard, handleMemberRoleUpdate, handleMemberLeave, handleRoleRename, invalidateRoleSync } from '../src/services/roleSync.js';
import { calculateLevelData, getTotalXpForLevel, syncUserRoles } from '../src/core/level.js';
import { eligibleVoiceMembers, processAllVoiceChannels, handleVoiceStateUpdate, stopVoiceXpTracker } from '../src/core/voiceXp.js';
import { handleChatMessage } from '../src/core/chatXp.js';
import { handleMemberEvent, renderMemberMessage } from '../src/core/welcome.js';
import { createProgressBar } from '../src/utils/embed.js';
import { createWebApp } from '../src/server.js';
import * as setupCommand from '../src/commands/setup.js';
import * as rankCommand from '../src/commands/rank.js';
import * as leaderboardCommand from '../src/commands/leaderboard.js';
import * as helpCommand from '../src/commands/help.js';
import { describeAuthFailure } from '../src/dashboard/authFailure.js';
import { createSessionStore } from '../src/dashboard/sessionStore.js';

const require = createRequire(import.meta.url);
const { OAuth2 } = require(createRequire(require.resolve('passport-oauth2')).resolve('oauth'));

const guildId = '111111111111111111';
const otherGuildId = '222222222222222222';
const userId = '333333333333333333';
const roleId = '444444444444444444';
const role2Id = '555555555555555555';
const channelId = '666666666666666666';
let mongo;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), GuildConfig.init()]);
});
after(async () => { stopVoiceXpTracker(); await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => { stopVoiceXpTracker(); invalidateRoleSync(); await Promise.all([User.deleteMany({}), GuildConfig.deleteMany({})]); });

function fixture(id = guildId) {
  const sent = [];
  const guild = { id, name: '<Server thử nghiệm>', memberCount: 12, afkChannelId: null };
  const permissions = new PermissionsBitField([PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);
  const channel = { id: channelId, name: 'chao-mung', type: ChannelType.GuildText, guild,
    isTextBased: () => true, permissionsFor: () => permissions, send: async payload => sent.push(payload) };
  const roles = new Collection([
    [roleId, { id: roleId, name: 'Tân binh', editable: true, managed: false }],
    [role2Id, { id: role2Id, name: 'Kỳ cựu', editable: true, managed: false }],
  ]);
  const memberRoles = new Collection();
  const member = { id: userId, guild, displayName: '<Bạn & tôi>', joinedAt: new Date('2026-01-01'), permissions,
    user: { id: userId, username: 'test', bot: false, displayAvatarURL: () => 'https://example.invalid/avatar.png' },
    voice: { selfMute: false, selfDeaf: false, serverMute: false, serverDeaf: false, suppress: false },
    roles: { cache: memberRoles, add: async id => memberRoles.set(id, roles.get(id)), remove: async id => memberRoles.delete(id) },
  };
  guild.roles = { cache: roles, fetch: async () => roles };
  guild.channels = { cache: new Collection([[channelId, channel]]), fetch: async id => id ? guild.channels.cache.get(id) : guild.channels.cache };
  guild.members = { me: { permissions }, fetchMe: async () => ({ permissions }), fetch: async () => member,
    list: async () => new Collection([[member.id, member]]) };
  const client = { isReady: () => true, guilds: { cache: new Collection([[id, guild]]) } };
  return { client, guild, member, channel, roles, sent };
}

test('level thresholds use cumulative formula, including high levels', () => {
  assert.equal(getTotalXpForLevel(5), 5000);
  assert.equal(getTotalXpForLevel(15), 76250);
  assert.equal(getTotalXpForLevel(30), 523750);
  for (const level of [1, 5, 15, 30, 1000, 10000]) {
    const total = getTotalXpForLevel(level);
    assert.equal(calculateLevelData(total).level, level);
    assert.equal(calculateLevelData(total - 1).level, level - 1);
  }
  assert.throws(() => calculateLevelData(Infinity));
});

test('defaults isolate legacy guild and use 30 second cooldown everywhere', () => {
  const prior = { guildId: config.guildId, role: config.roles.lvl5 };
  try {
    config.guildId = guildId; config.roles.lvl5 = roleId;
    const original = getDefaultGuildConfig(guildId);
    const other = getDefaultGuildConfig(otherGuildId);
    assert(original.roleRewards.some(r => r.roleId === roleId));
    assert.equal(other.roleRewards.length, 0);
    assert.equal(other.levelUpChannelId, null);
    assert.equal(other.levelMode, 'unlimited');
    assert.equal(original.xpSettings.chat.cooldownSeconds, 30);
    assert.equal(other.xpSettings.chat.cooldownSeconds, 30);
  } finally { config.guildId = prior.guildId; config.roles.lvl5 = prior.role; }
});

test('settings reject duplicate milestones, invalid ranges, foreign resources and stale writes', async () => {
  const { guild } = fixture();
  const input = getDefaultGuildConfig(otherGuildId);
  input.roleRewards = [{ level: 0, roleId }]; input.levelMode = 'role_mapping';
  input.welcome.enabled = true; input.welcome.channelId = channelId;
  const saved = await saveGuildConfig(guild, input, 0);
  assert.equal(saved.guildId, guildId); assert.equal(saved.roleRewards[0].roleName, 'Tân binh');
  assert.equal(saved.revision, 1);
  await assert.rejects(saveGuildConfig(guild, input, 0), error => error.status === 409);
  input.roleRewards.push({ level: 0, roleId: role2Id });
  assert.throws(() => validateSettings(input, guildId), /chỉ được xuất hiện/);
  input.roleRewards.pop(); input.xpSettings.chat.max = -1;
  assert.throws(() => validateSettings(input, guildId), /XP chat tối đa/);
  input.xpSettings.chat.max = 15; input.welcome.channelId = otherGuildId;
  await assert.rejects(saveGuildConfig(guild, input, 1), /kênh văn bản/);
  assert.equal((await getGuildConfig(guildId)).revision, 1);
});

test('chat cooldown is atomic, persists across handlers and is independent per guild', async () => {
  const { member } = fixture();
  const settings = getDefaultGuildConfig(otherGuildId);
  const now = new Date('2026-10-29T00:00:00Z');
  await Promise.all(Array.from({ length: 12 }, () => awardXp(member, settings, { source: 'chat', xp: 10, now })));
  let user = await User.findOne({ guildId, userId });
  assert.equal(user.xp, 10); assert.equal(user.messageCount, 1);
  assert.equal(await awardXp(member, settings, { source: 'chat', xp: 10, now: new Date(now.getTime() + 29999) }), null);
  await awardXp(member, settings, { source: 'chat', xp: 10, now: new Date(now.getTime() + 30000) });
  const other = fixture(otherGuildId);
  await awardXp(other.member, settings, { source: 'chat', xp: 13, now });
  assert.equal((await User.findOne({ guildId, userId })).xp, 20);
  assert.equal((await User.findOne({ guildId: otherGuildId, userId })).xp, 13);
});

test('simultaneous chat and voice preserve all increments and level', async () => {
  const { member } = fixture(); const settings = getDefaultGuildConfig(otherGuildId);
  await User.create({ guildId, userId, xp: 290 });
  await Promise.all([
    awardXp(member, settings, { source: 'chat', xp: 15 }),
    ...Array.from({ length: 5 }, () => awardXp(member, settings, { source: 'voice', xp: 2 })),
  ]);
  const user = await User.findOne({ guildId, userId });
  assert.equal(user.xp, 315); assert.equal(user.level, 1);
  assert.equal(user.messageCount, 1); assert.equal(user.totalVoiceMinutes, 5);
});

test('configured roles seed profiles in every guild, preserve progress and never add the baseline twice', async () => {
  const { member, roles } = fixture(); member.roles.cache.set(roleId, roles.get(roleId));
  const settings = getDefaultGuildConfig(otherGuildId); settings.roleRewards = [{ level: 5, roleId }];
  assert.equal((await ensureUser(member, settings)).xp, 5000);
  await User.updateOne({ guildId, userId }, { $set: { xp: 6000, level: 5 } });
  assert.equal((await ensureUser(member, settings)).xp, 6000);
  assert.equal((await ensureUser(member, settings)).xp, 6000);
  const other = fixture(otherGuildId); other.member.roles.cache.set(roleId, roles.get(roleId));
  assert.equal((await ensureUser(other.member, settings)).xp, 5000);
  assert.equal((await User.findOne({ guildId, userId })).xp, 6000);
});

test('existing profiles take the highest configured role floor and continue earning XP', async () => {
  const { member, roles } = fixture();
  member.roles.cache.set(roleId, roles.get(roleId)); member.roles.cache.set(role2Id, roles.get(role2Id));
  const settings = getDefaultGuildConfig(guildId);
  settings.roleRewards = [{ level: 5, roleId }, { level: 15, roleId: role2Id }];
  await User.create({ guildId, userId, xp: 29, level: 0, messageCount: 7, totalVoiceMinutes: 3 });
  const synced = await ensureUser(member, settings);
  assert.equal(synced.xp, 76250); assert.equal(synced.level, 15);
  assert.equal(synced.messageCount, 7); assert.equal(synced.totalVoiceMinutes, 3);
  await awardXp(member, settings, { source: 'chat', xp: 12 });
  await awardXp(member, settings, { source: 'voice', xp: 2 });
  const user = await ensureUser(member, settings);
  assert.equal(user.xp, 76264); assert.equal(user.level, 15);
  member.roles.cache.clear();
  assert.equal((await ensureUser(member, settings)).xp, 76264);
});

test('unconfigured special roles are neither imported nor changed', async () => {
  const { member } = fixture();
  const specialId = '999999999999999999'; member.roles.cache.set(specialId, { id: specialId, name: 'Owner only' });
  const settings = getDefaultGuildConfig(guildId); settings.roleRewards = [{ level: 30, roleId }];
  const user = await ensureUser(member, settings);
  assert.equal(user.xp, 0); assert.equal(user.level, 0);
  await syncUserRoles(member, 0, settings);
  assert(member.roles.cache.has(specialId));
});

test('read-only special roles seed the same tier without ever granting or removing the special role', async () => {
  const { guild, member, roles } = fixture();
  const specialId = '999999999999999999'; roles.set(specialId, { id: specialId, name: 'Private title', position: 20 });
  member.roles.cache.set(specialId, roles.get(specialId));
  const settings = getDefaultGuildConfig(guildId);
  settings.roleRewards = [{ level: 5, roleId }]; settings.roleBaselines = [{ level: 30, roleId: specialId }];
  await GuildConfig.create(settings);
  const user = await ensureUser(member, settings);
  assert.equal(user.level, 30); assert.equal(user.xp, 523750); assert.equal(user.roleLevel, 30);
  await syncUserRoles(member, 30, settings);
  assert(member.roles.cache.has(specialId));
  const other = { ...member, id: '777777777777777777', roles: {
    cache: new Collection(), add: async id => assert.notEqual(id, specialId), remove: async id => assert.notEqual(id, specialId),
  } };
  await syncUserRoles(other, 30, settings);
  const saved = await saveGuildConfig(guild, settings, 0);
  assert.deepEqual(saved.roleBaselines.map(({level, roleId}) => ({level, roleId})), settings.roleBaselines);
});

test('leaderboard sorts current rank roles before XP, preserves progress after role removal and updates role names', async () => {
  const { guild, member, roles } = fixture();
  roles.get(roleId).position = 10; roles.get(role2Id).position = 20;
  const settings = getDefaultGuildConfig(guildId); settings.roleRewards = [{ level: 5, roleId }, { level: 15, roleId: role2Id }];
  await GuildConfig.create(settings);
  member.roles.cache.set(roleId, roles.get(roleId));
  const senior = { ...member, id: '777777777777777777', roles: { cache: new Collection([[role2Id, roles.get(role2Id)]]) } };
  guild.members.list = async () => new Collection([[member.id, member], [senior.id, senior]]);
  await User.create({guildId, userId:member.id, xp:999999, level:37});
  const board = await getGuildLeaderboard(guild);
  assert.deepEqual(board.entries.map(item => item.userId), [senior.id, member.id]);
  assert.equal(board.entries[0].roleName, 'Kỳ cựu');
  assert.equal(board.entries[1].xp, 999999);
  await handleRoleRename({name:'Kỳ cựu'}, {id:role2Id, guild, name:'Senior renamed'});
  assert.equal((await getGuildLeaderboard(guild)).entries[0].roleName, 'Senior renamed');
  roles.get(roleId).position = 30;
  await handleRoleRename({name:'Tân binh',position:10}, {...roles.get(roleId),guild});
  assert.equal((await getGuildLeaderboard(guild)).entries[0].userId, member.id);
  senior.roles.cache.clear();
  await handleMemberRoleUpdate(member, senior);
  const changed = await getGuildLeaderboard(guild);
  assert.deepEqual(changed.entries.map(item => item.userId), [member.id, senior.id]);
  assert.equal(changed.entries[1].roleLevel, 0); assert.equal(changed.entries[1].xp, 76250);
});

test('guild sync imports inactive members, skips bots and keeps departed users off leaderboard', async () => {
  const { guild, member, roles } = fixture();
  const settings = getDefaultGuildConfig(guildId); settings.roleRewards = [{ level: 5, roleId }, { level: 15, roleId: role2Id }];
  await GuildConfig.create(settings);
  const inactive = { ...member, id: '777777777777777777', displayName: 'Inactive member', roles: { cache: new Collection([[role2Id, roles.get(role2Id)]]) } };
  const bot = { ...member, id: '888888888888888888', user: { ...member.user, bot: true } };
  member.roles.cache.set(roleId, roles.get(roleId));
  guild.members.list = async () => new Collection([[member.id, member], [inactive.id, inactive], [bot.id, bot]]);
  await User.create({ guildId, userId: member.id, xp: 6000, level: 5 });
  await User.create({ guildId, userId: '999999999999999999', xp: 999999, level: 37 });
  const first = await getGuildLeaderboard(guild);
  assert.equal(first.memberCount, 2);
  assert.deepEqual(first.entries.map(item => item.userId), [inactive.id, member.id]);
  assert.equal(first.entries[0].xp, 76250); assert.equal(first.entries[0].username, 'Inactive member');
  assert.equal(first.entries[1].xp, 6000);
  assert.equal(await User.countDocuments({ guildId, userId: bot.id }), 0);
  const again = await getGuildLeaderboard(guild);
  assert.deepEqual(again.entries, first.entries);
});

test('guild member import paginates beyond 1000 members', async () => {
  const { guild, member } = fixture();
  const bots = new Collection(Array.from({ length: 1000 }, (_, index) => {
    const id = String(700000000000000000n + BigInt(index));
    return [id, { ...member, id, user: { bot: true } }];
  }));
  const calls = [];
  guild.members.list = async options => {
    calls.push(options);
    return options.after ? new Collection([[member.id, member]]) : bots;
  };
  const result = await syncGuildMembersFromRoles(guild);
  assert.equal(result.memberCount, 1);
  assert.equal(calls.length, 2); assert.equal(calls[1].after, bots.lastKey());
  assert(calls.every(options => options.cache === false));
  assert.equal(await User.countDocuments({ guildId }), 1);
});

test('leaderboard returns 10 per page with stable ranks, isolated guilds and no repeated Discord scan', async () => {
  const { guild, member, roles } = fixture();
  const settings = getDefaultGuildConfig(guildId); settings.roleRewards = [{ level: 5, roleId }];
  await GuildConfig.create(settings);
  const members = new Collection(Array.from({ length: 25 }, (_, index) => {
    const id = String(700000000000000000n + BigInt(index));
    return [id, { ...member, id, displayName: `Member ${index}`, roles: { cache: new Collection([[roleId, roles.get(roleId)]]) } }];
  }));
  let scans = 0;
  guild.members.list = async () => { scans++; return members; };
  await User.create({ guildId: otherGuildId, userId, xp: 999999, inGuild: true });
  const pages = await Promise.all([1, 2, 3].map(page => getGuildLeaderboard(guild, page)));
  assert.equal(scans, 1);
  assert.deepEqual(pages.map(page => page.entries.length), [10, 10, 5]);
  assert(pages.every(page => page.memberCount === 25 && page.pageSize === 10 && page.totalPages === 3));
  assert.deepEqual(pages.flatMap(page => page.entries.map(entry => entry.rank)), Array.from({ length: 25 }, (_, i) => i + 1));
  assert.deepEqual(pages.flatMap(page => page.entries.map(entry => entry.userId)), [...members.keys()]);
  assert(pages.flatMap(page => page.entries).every(entry => entry.xp === 5000));
  assert.equal((await getGuildLeaderboard(guild, 999)).page, 3);
  assert.equal(scans, 1);
  let reply;
  await leaderboardCommand.execute({
    inGuild: () => true, guild, options: { getInteger: () => 2 },
    deferReply: async () => {}, editReply: async payload => { reply = payload; },
  });
  assert.match(reply.embeds[0].data.title, /Trang 2\/3/);
  assert(reply.embeds[0].data.description.startsWith('**#11**'));
  assert.equal(scans, 1);
  for (const page of [0, -1, 1.5, NaN, Infinity]) {
    await assert.rejects(getGuildLeaderboard(guild, page), error => error.status === 400);
  }
});

test('cached leaderboard updates membership, names and role milestones without scanning on every page', async () => {
  const { guild, member, roles } = fixture();
  member.roles.cache.set(roleId, roles.get(roleId));
  const settings = getDefaultGuildConfig(guildId); settings.roleRewards = [{ level: 5, roleId }];
  await GuildConfig.create(settings);
  let scans = 0;
  guild.members.list = async () => { scans++; return new Collection([[member.id, member]]); };
  assert.equal((await getGuildLeaderboard(guild)).entries[0].xp, 5000);
  member.displayName = 'Renamed member';
  await handleMemberRoleUpdate(member, member);
  assert.equal((await getGuildLeaderboard(guild)).entries[0].username, 'Renamed member');
  assert.equal(scans, 1);
  await GuildConfig.updateOne({ guildId }, { $set: { 'roleRewards.0.level': 15 } });
  assert.equal((await getGuildLeaderboard(guild)).entries[0].xp, 76250);
  assert.equal(scans, 2);
  await handleMemberLeave(member);
  const empty = await getGuildLeaderboard(guild);
  assert.equal(empty.memberCount, 0); assert.equal(empty.page, 1); assert.equal(empty.totalPages, 1);
  assert.deepEqual(empty.entries, []); assert.equal(scans, 2);
  assert.equal((await User.findOne({ guildId, userId })).xp, 76250);
});

test('role sync racing with chat and voice never overwrites increments', async () => {
  const { guild, member, roles } = fixture();
  member.roles.cache.set(role2Id, roles.get(role2Id));
  const settings = getDefaultGuildConfig(guildId); settings.roleRewards = [{ level: 15, roleId: role2Id }];
  await GuildConfig.create(settings);
  await ensureUser(member, settings);
  await Promise.all([
    syncGuildMembersFromRoles(guild),
    awardXp(member, settings, { source: 'chat', xp: 12 }),
    awardXp(member, settings, { source: 'voice', xp: 2 }),
    ensureUser(member, settings),
  ]);
  assert.equal((await User.findOne({ guildId, userId })).xp, 76264);
});

test('manual role changes raise an existing profile without resetting activity counters', async () => {
  const { member, roles } = fixture();
  const settings = getDefaultGuildConfig(guildId); settings.roleRewards = [{ level: 15, roleId: role2Id }];
  await GuildConfig.create(settings);
  await User.create({ guildId, userId, xp: 42, level: 0, messageCount: 4 });
  const oldMember = { ...member, roles: { cache: new Collection() } };
  member.roles.cache.set(role2Id, roles.get(role2Id));
  await handleMemberRoleUpdate(oldMember, member);
  const updated = await User.findOne({ guildId, userId });
  assert.equal(updated.xp, 76250); assert.equal(updated.messageCount, 4);
});

test('role reconciliation does not downgrade a higher configured role from stale XP', async () => {
  const { member, roles } = fixture();
  member.roles.cache.set(role2Id, roles.get(role2Id));
  const settings = { levelMode: 'role_mapping', roleRewards: [{ level: 0, roleId }, { level: 15, roleId: role2Id }] };
  await syncUserRoles(member, 0, settings);
  assert(member.roles.cache.has(role2Id)); assert(!member.roles.cache.has(roleId));
});

test('role mapping replaces only configured rewards; unlimited stacks rewards', async () => {
  const { member, roles } = fixture();
  const unrelated = '777777777777777777'; member.roles.cache.set(unrelated, { id: unrelated });
  member.roles.cache.set(roleId, roles.get(roleId));
  const settings = { levelMode: 'role_mapping', roleRewards: [{ level: 0, roleId }, { level: 5, roleId: role2Id }] };
  await syncUserRoles(member, 5, settings);
  assert(member.roles.cache.has(role2Id)); assert(!member.roles.cache.has(roleId)); assert(member.roles.cache.has(unrelated));
  settings.levelMode = 'unlimited'; await syncUserRoles(member, 5, settings);
  assert(member.roles.cache.has(roleId)); assert(member.roles.cache.has(role2Id));
});

test('chat skips excluded channels, bots, DMs and system messages', async () => {
  const { member, guild, channel } = fixture();
  const settings = getDefaultGuildConfig(guildId); settings.excludedChannels = [channel.id];
  await GuildConfig.create(settings);
  const message = { guild, member, channel, channelId: channel.id, author: member.user };
  await handleChatMessage(message);
  await handleChatMessage({ ...message, guild: null });
  await handleChatMessage({ ...message, system: true });
  await handleChatMessage({ ...message, author: { bot: true } });
  assert.equal(await User.countDocuments(), 0);
});

test('voice counts full eligible minutes, excludes muted peers and resets on leave', async () => {
  const { member, channel, client, guild } = fixture();
  channel.type = ChannelType.GuildVoice;
  const second = { ...member, id: '888888888888888888', voice: { ...member.voice } };
  channel.members = new Collection([[member.id, member], [second.id, second]]);
  const settings = getDefaultGuildConfig(guild.id);
  assert.equal(eligibleVoiceMembers(channel, settings).length, 2);
  second.voice.selfMute = true;
  assert.equal(eligibleVoiceMembers(channel, settings).length, 0);
  second.voice.selfMute = false;
  const now = Date.now();
  await processAllVoiceChannels(client, now);
  await processAllVoiceChannels(client, now + 59999);
  assert.equal(await User.countDocuments(), 0);
  await processAllVoiceChannels(client, now + 60000);
  assert.equal((await User.findOne({ guildId, userId })).totalVoiceMinutes, 1);
  channel.members.delete(second.id);
  await handleVoiceStateUpdate({ guild, id: second.id, channel }, { guild, id: second.id, channel: null });
  channel.members.set(second.id, second);
  await processAllVoiceChannels(client, now + 120000);
  assert.equal((await User.findOne({ guildId, userId })).totalVoiceMinutes, 1);
});

test('welcome renders variables safely, restricts mentions and assigns level-zero role', async () => {
  const { guild, member, sent } = fixture();
  const settings = getDefaultGuildConfig(guild.id);
  settings.welcome = { enabled: true, channelId, useEmbed: false, message: 'Chào {user} tại {server} #{memberCount} @everyone' };
  settings.roleRewards = [{ level: 0, roleId }];
  await GuildConfig.create(settings);
  await handleMemberEvent(member, 'welcome');
  assert(sent[0].content.includes(`<@${member.id}>`)); assert(sent[0].content.includes('#12'));
  assert.deepEqual(sent[0].allowedMentions, { parse: [], users: [member.id] });
  assert(member.roles.cache.has(roleId));
  assert(renderMemberMessage('{username}', member).includes('Bạn'));
});

test('rank replies with a text embed and colored progress without generating images or fetching avatars', async t => {
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('Rank must not download an avatar'); });
  const { guild, member } = fixture();
  await User.create({ guildId, userId, xp: 575, level: 1, messageCount: 5, totalVoiceMinutes: 6 });
  let reply;
  await rankCommand.execute({
    inGuild: () => true, guildId, guild, user: member.user, options: { getUser: () => null },
    deferReply: async () => {}, editReply: async payload => { reply = payload; },
  });
  assert.equal(reply.files, undefined);
  const embed = reply.embeds[0].toJSON();
  assert.equal(embed.image, undefined); assert.equal(embed.author.name, member.displayName);
  const progress = embed.fields.find(field => field.name === 'Tiến độ lên cấp 2');
  assert(progress.value.includes('🟧'.repeat(5) + '⬛'.repeat(5)));
  assert(progress.value.includes('275 / 550 XP'));
  assert.equal(embed.fields.find(field => field.name === 'Thứ hạng').value, '#1');
  assert(createProgressBar(78, 51300).includes('0,2%'));
  assert(createProgressBar(78, 51300).startsWith('🔸'));
  assert(createProgressBar(0, 550).includes('0%'));
  assert(createProgressBar(550, 550).startsWith('🟧'.repeat(10)));
  assert.equal((await User.findOne({ guildId, userId })).xp, 575);
});

test('slash commands serialize and server-only commands reject DM context', async () => {
  for (const command of [setupCommand, rankCommand, leaderboardCommand]) assert(command.data.toJSON().name);
  assert.deepEqual(rankCommand.data.toJSON().contexts, [0]);
  for (const command of [setupCommand, rankCommand, leaderboardCommand]) {
    assert.deepEqual(command.data.toJSON().integration_types, [0]);
  }
  assert.deepEqual(helpCommand.data.toJSON().integration_types, [0, 1]);
  let reply;
  await rankCommand.execute({ inGuild: () => false, reply: value => { reply = value; } });
  assert.match(reply.content, /trong server/);
});

test('help links to registered slash commands and falls back when Discord is unavailable', async () => {
  const commands = new Collection([['one', { name: 'rank', type: 1, id: roleId }], ['two', { name: 'help', type: 1, id: role2Id }]]);
  let reply;
  const interaction = { deferReply: async () => {}, editReply: async value => { reply = value; },
    client: { application: { commands: { cache: commands } } } };
  await helpCommand.execute(interaction);
  assert(reply.embeds[0].data.description.includes(`</rank:${roleId}>`));
  assert(reply.embeds[0].data.description.includes(`</help:${role2Id}>`));
  let fetched = false;
  interaction.client.application.commands = { cache: new Collection(), fetch: async () => { fetched = true; throw new Error('Discord unavailable'); } };
  await helpCommand.execute(interaction);
  assert.equal(fetched, false, 'help must not wait on another REST request for command names');
  assert(reply.embeds[0].data.description.includes('**/rank**'));
  interaction.client.registeredCommands = commands;
  await helpCommand.execute(interaction);
  assert(reply.embeds[0].data.description.includes(`</rank:${roleId}>`));
  assert.equal(fetched, false);
});

test('public pages render without OAuth; health reports disconnected bot truthfully', async () => {
  const { client } = fixture(); client.isReady = () => false;
  const app = createWebApp({ client, settings: { ...config, dashboard: { clientSecret: '', sessionSecret: '' } } });
  for (const path of ['/', '/docs']) {
    const result = await request(app).get(path).expect(200);
    assert.match(result.text, /lang="vi"/); assert(!result.text.includes('accessToken'));
    assert(result.headers['content-security-policy']);
  }
  await request(app).get('/auth/discord').expect(503);
  await request(app).get('/api/guilds/111/settings').expect(503).expect('Content-Type', /json/);
  const health = await request(app).get('/health').expect(503);
  assert.equal(health.body.discord, false); assert.equal(health.body.database, true);
});

test('local web-only mode reports the bot as disabled without claiming a Discord connection', async () => {
  const { client } = fixture(); client.isReady = () => false;
  const app = createWebApp({ client, settings: { ...config, botEnabled: false, dashboard: { clientSecret: '', sessionSecret: '' } } });
  const health = await request(app).get('/health').expect(200);
  assert.equal(health.body.botEnabled, false);
  assert.equal(health.body.discord, false);
});

test('health distinguishes a connected Gateway from rate-limited interaction callbacks', async () => {
  const { client } = fixture(); client.isReady = () => true;
  const snapshot = { interactions: 'rate_limited', lastInteractionResponse: {
    httpStatus: 429, at: '2026-10-31T09:05:46.000Z', retryAt: '2026-10-31T09:25:46.000Z',
  } };
  client.httpDiagnostics = { snapshot: () => snapshot };
  const app = createWebApp({ client, settings: { ...config, dashboard: { clientSecret: '', sessionSecret: '' } } });
  const health = await request(app).get('/health').expect(200);
  assert.equal(health.body.discord, true);
  assert.deepEqual(health.body.discordHttp, snapshot);
});

test('Render HTTPS proxy login issues a secure session cookie with the production callback', async () => {
  const { client } = fixture();
  const callbackUrl = 'https://bot-rankup-discord.onrender.com/auth/discord/callback';
  const settings = { ...config, clientId: guildId, mongoUri: mongo.getUri(), production: true,
    dashboard: { clientSecret: 'test-client-secret', sessionSecret: 'test-session-secret-longer-than-32-characters', callbackUrl } };
  const app = createWebApp({ client, settings, store: new session.MemoryStore() });
  const response = await request(app).get('/auth/discord').set('X-Forwarded-Proto', 'https').expect(302);
  assert.match(response.headers['set-cookie'][0], /; Secure/);
  assert.match(response.headers['set-cookie'][0], /; HttpOnly/);
  assert.match(response.headers['set-cookie'][0], /; SameSite=Lax/);
  assert.equal(new URL(response.headers.location).searchParams.get('redirect_uri'), callbackUrl);
});

test('dashboard enforces authentication, fresh guild permission, CSRF, revisions and tenant isolation', async () => {
  const { client, guild, member } = fixture();
  const store = new session.MemoryStore();
  const secret = 'test-only-session-secret-32-characters-minimum';
  const sid = 'test-session-123'; const csrf = 'a'.repeat(64);
  await new Promise((resolve, reject) => store.set(sid, {
    cookie: { maxAge: 86400000, originalMaxAge: 86400000, expires: new Date(Date.now() + 86400000).toISOString(), httpOnly: true },
    passport: { user: { id: userId, username: '<script>alert(1)</script>', accessToken: 'never-render-this', expiresAt: Date.now() + 86400000 } },
    csrfToken: csrf,
  }, error => error ? reject(error) : resolve()));
  const signature = createHmac('sha256', secret).update(sid).digest('base64').replace(/=+$/, '');
  const cookie = `hutao.sid=${encodeURIComponent(`s:${sid}.${signature}`)}`;
  const settings = { ...config, clientId: guildId, mongoUri: mongo.getUri(), production: false,
    dashboard: { clientSecret: 'test-secret', sessionSecret: secret, callbackUrl: 'http://localhost:3000/auth/discord/callback' } };
  const app = createWebApp({ client, settings, store, authLogger: () => {}, api: async () => [{ id: guildId, name: '<Test Guild>', owner: true, permissions: '32' }] });
  await request(app).get(`/api/guilds/${guildId}/settings`).expect(401);
  const servers = await request(app).get('/servers').set('Cookie', cookie).expect(200);
  assert(!servers.text.includes('<script>alert(1)</script>')); assert(!servers.text.includes('never-render-this'));
  assert(servers.text.includes('&lt;script&gt;'));
  await request(app).get(`/servers/${guildId}`).set('Cookie', cookie).expect(200);
  const url = `/api/guilds/${guildId}/settings`;
  const body = await request(app).get(url).set('Cookie', cookie).expect(200);
  await request(app).post(url).set('Cookie', cookie).send({ settings: body.body.settings, revision: 0 }).expect(403);
  await request(app).post(url).set('Cookie', cookie).set('x-csrf-token', 'é'.repeat(64)).send({ settings: body.body.settings, revision: 0 }).expect(403);
  await request(app).post(url).set('Cookie', cookie).set('x-csrf-token', csrf).send({ settings: body.body.settings, revision: 0 }).expect(200);
  await request(app).post(url).set('Cookie', cookie).set('x-csrf-token', csrf).send({ settings: body.body.settings, revision: 0 }).expect(409);
  await request(app).get(`/api/guilds/${otherGuildId}/settings`).set('Cookie', cookie).expect(404);
  const board = `/api/guilds/${guildId}/leaderboard`;
  await request(app).get(board).expect(401);
  const firstPage = await request(app).get(`${board}?page=1`).set('Cookie', cookie).expect(200);
  assert.equal(firstPage.body.page, 1); assert.equal(firstPage.body.pageSize, 10);
  for (const page of ['0', '-1', '1.5', 'NaN', 'Infinity']) {
    await request(app).get(`${board}?page=${page}`).set('Cookie', cookie).expect(400);
  }
  member.permissions = new PermissionsBitField([]);
  await request(app).get(board).set('Cookie', cookie).expect(403);
  await request(app).get(url).set('Cookie', cookie).expect(403);
  member.permissions = new PermissionsBitField([PermissionFlagsBits.ManageGuild]);
  const login = await request(app).get('/auth/discord').expect(302);
  const authorization = new URL(login.headers.location);
  assert.equal(authorization.hostname, 'discord.com'); assert(authorization.searchParams.get('state'));
  assert.equal(authorization.searchParams.get('scope'), 'identify guilds');
  await request(app).get('/auth/discord/callback?code=invalid&state=wrong').expect(401);
  await request(app).post('/auth/logout').set('Cookie', cookie).set('x-csrf-token', csrf).expect(302);
  await request(app).get(url).set('Cookie', cookie).expect(401);
});

test('OAuth diagnostics distinguish configuration, session and expired-code errors without exposing secrets', () => {
  assert.equal(describeAuthFailure(null, { message: 'Unable to verify authorization request state.' }).code, 'OAUTH_SESSION_MISSING');
  assert.equal(describeAuthFailure(null, { message: 'Invalid authorization request state.' }).code, 'OAUTH_STATE_MISMATCH');
  assert.equal(describeAuthFailure({ code: 'invalid_client' }).code, 'OAUTH_CLIENT_REJECTED');
  assert.equal(describeAuthFailure({ oauthError: { data: '{"error":"invalid_grant"}' } }).code, 'OAUTH_CODE_REJECTED');
  assert.equal(describeAuthFailure(null, null, 'access_denied').code, 'OAUTH_CANCELLED');
  assert.equal(describeAuthFailure({ authStage: 'profile' }).code, 'OAUTH_PROFILE_FAILED');
  assert(!JSON.stringify(describeAuthFailure({ code: 'secret-token', message: 'secret-token', oauthError: { data: 'secret-token' } })).includes('secret-token'));
});

test('OAuth callback shows a support code and logs sanitized exchange diagnostics', async t => {
  const { client } = fixture();
  const failures = [];
  const settings = { ...config, production: false,
    dashboard: { clientSecret: 'test-client-secret', sessionSecret: '0123456789abcdef'.repeat(6), callbackUrl: 'http://localhost/auth/discord/callback' } };
  let exchangeError;
  t.mock.method(OAuth2.prototype, 'getOAuthAccessToken', function(code, params, done) { done(exchangeError); });
  const cases = [
    [{ statusCode: 429, data: '<html>private-response-body</html>' }, 'OAUTH_RATE_LIMITED', { httpStatus: 429 }],
    [{ statusCode: 403, data: '<html>private-response-body</html>' }, 'OAUTH_ACCESS_BLOCKED', { httpStatus: 403 }],
    [Object.assign(new Error('private-network-message'), { code: 'ECONNRESET' }), 'OAUTH_NETWORK_FAILED', { networkCode: 'ECONNRESET' }],
    [{ statusCode: 401, data: '{"error":"invalid_client","error_description":"private-client-secret"}' }, 'OAUTH_CLIENT_REJECTED', {}],
  ];
  for (const [error, code, diagnostics] of cases) {
    const app = createWebApp({ client, settings, store: new session.MemoryStore(), authLogger: failure => failures.push(failure) });
    exchangeError = error;
    const agent = request.agent(app);
    const login = await agent.get('/auth/discord').expect(302);
    const state = new URL(login.headers.location).searchParams.get('state');
    const callback = await agent.get('/auth/discord/callback').query({ code: 'private-authorization-code', state }).expect(error.statusCode === 429 ? 429 : 401);
    assert(callback.text.includes(`Mã hỗ trợ: <code>${code}</code>`));
    assert(callback.text.includes('href="/auth/discord"'));
    const failure = failures.at(-1);
    assert.equal(failure.code, code);
    for (const [key, value] of Object.entries(diagnostics)) assert.equal(failure[key], value);
    assert(!callback.text.includes('private-'));
    assert(!JSON.stringify(failure).includes('private-'));
  }
});

test('OAuth 429 pauses new authorization attempts across sessions instead of calling Discord again', async t => {
  const { client } = fixture();
  const settings = { ...config, production: false,
    dashboard: { clientSecret: 'test-client-secret', sessionSecret: '0123456789abcdef'.repeat(6), callbackUrl: 'http://localhost/auth/discord/callback' } };
  let exchanges = 0;
  t.mock.method(OAuth2.prototype, 'getOAuthAccessToken', function(code, params, done) {
    exchanges++;
    done({ statusCode: 429, data: '{"retry_after":120,"global":false}' });
  });
  const app = createWebApp({ client, settings, store: new session.MemoryStore(), authLogger: () => {} });
  const agent = request.agent(app);
  const login = await agent.get('/auth/discord').expect(302);
  const state = new URL(login.headers.location).searchParams.get('state');
  const callback = await agent.get('/auth/discord/callback').query({ code: 'private-authorization-code', state }).expect(429);
  assert(Number(callback.headers['retry-after']) > 0);
  const blockedLogin = await request(app).get('/auth/discord').expect(429);
  assert(!blockedLogin.headers.location);
  assert(Number(blockedLogin.headers['retry-after']) <= 120);
  const blockedCallback = await agent.get('/auth/discord/callback').query({ code: 'another-private-code', state }).expect(429);
  assert(blockedCallback.text.includes('OAUTH_RATE_LIMITED'));
  assert(!blockedCallback.text.includes('another-private-code'));
  assert.equal(exchanges, 1);
});

test('OAuth callback persists state in encrypted Mongo sessions across app restart and completes login', async t => {
  const { client } = fixture();
  const settings = { ...config, clientId: guildId, mongoUri: mongo.getUri(), production: false,
    dashboard: { clientSecret: 'test-client-secret', sessionSecret: '0123456789abcdef'.repeat(6), callbackUrl: 'http://localhost:3050/auth/discord/callback' } };
  const makeStore = () => createSessionStore(settings, 'oauth_test_sessions');
  const api = async path => path === '/users/@me'
    ? { id: userId, username: 'Test OAuth' }
    : [{ id: guildId, name: 'Test Guild', owner: true, permissions: '32' }];
  let exchanges = 0;
  t.mock.method(OAuth2.prototype, 'getOAuthAccessToken', function(code, params, done) {
    exchanges++;
    assert.equal(code, 'test-authorization-code');
    assert.equal(params.redirect_uri, settings.dashboard.callbackUrl);
    done(null, 'test-access-token-never-render', 'test-refresh-token', { expires_in: 3600 });
  });
  const firstStore = makeStore();
  const secondStore = makeStore();
  try {
    const firstApp = createWebApp({ client, settings, store: firstStore, api, authLogger: () => {} });
    const login = await request(firstApp).get('/auth/discord').expect(302);
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    const state = new URL(login.headers.location).searchParams.get('state');
    const secondApp = createWebApp({ client, settings, store: secondStore, api, authLogger: () => {} });
    const agent = request.agent(secondApp);
    const callback = await agent.get('/auth/discord/callback').query({ code: 'test-authorization-code', state }).set('Cookie', cookie).expect(302);
    assert.equal(callback.headers.location, '/servers');
    assert.equal(exchanges, 1);
    const servers = await agent.get('/servers').expect(200);
    assert(servers.text.includes('Test OAuth'));
    assert(!servers.text.includes('test-access-token-never-render'));
    const storedSessions = await mongoose.connection.db.collection('oauth_test_sessions').find({}).toArray();
    assert(storedSessions.length > 0);
    assert(!JSON.stringify(storedSessions).includes('test-access-token-never-render'));
    const replay = await request(secondApp).get('/auth/discord/callback').query({ code: 'test-authorization-code', state }).set('Cookie', cookie).expect(401);
    assert(replay.text.includes('OAUTH_SESSION_MISSING'));
    assert.equal(exchanges, 1);
  } finally { await firstStore.close(); await secondStore.close(); }
});

const browserExecutable = [process.env.BROWSER_EXECUTABLE,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(path => path && existsSync(path));

test('browser: desktop/mobile layout, tabs, preview, save, roles, leaderboard and reset', { skip: !browserExecutable }, async () => {
  const { client, guild, member } = fixture();
  const members = new Collection([[member.id, member], ...Array.from({ length: 37 }, (_, index) => {
    const id = String(700000000000000000n + BigInt(index));
    return [id, { ...member, id, displayName: `Member ${index}` }];
  })]);
  let memberScans = 0;
  guild.members.list = async () => { memberScans++; return members; };
  const store = new session.MemoryStore();
  const secret = 'browser-test-session-secret-32-characters';
  const sid = 'browser-session'; const csrf = 'b'.repeat(64);
  await new Promise(resolve => store.set(sid, {
    cookie: { maxAge: 86400000, originalMaxAge: 86400000, expires: new Date(Date.now() + 86400000).toISOString(), httpOnly: true },
    passport: { user: { id: userId, username: 'Người quản lý', accessToken: 'browser-token', expiresAt: Date.now() + 86400000 } }, csrfToken: csrf,
  }, resolve));
  const settings = { ...config, clientId: guildId, mongoUri: mongo.getUri(), production: false,
    dashboard: { clientSecret: 'test', sessionSecret: secret, callbackUrl: 'http://localhost/auth/discord/callback' } };
  const app = createWebApp({ client, settings, store, api: async () => [{ id: guildId, name: guild.name, owner: true, permissions: '32' }] });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: browserExecutable, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const capture = async (name, fullPage = true) => {
      if (process.env.CAPTURE_UI !== '1') return;
      await mkdir('.cache/qa', { recursive: true });
      await page.screenshot({ path: `.cache/qa/${name}.png`, fullPage });
    };
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !message.text().includes('favicon')) errors.push(message.text()); });
    await page.goto(base); await page.locator('h1').waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert(await page.evaluate(() => getComputedStyle(document.body).fontFamily.includes('Be Vietnam Pro')));
    assert(await page.evaluate(() => document.fonts.check('400 18px "Be Vietnam Pro"', 'Tiếng Việt: đường, chào mừng, thưởng')));
    assert(!(await page.locator('h1').textContent()).trim().endsWith('.'));
    await capture('landing-desktop');
    assert.match(await page.title(), /Hutao-Chan/);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.setViewportSize({ width: 390, height: 844 });
    await capture('landing-mobile');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const signature = createHmac('sha256', secret).update(sid).digest('base64').replace(/=+$/, '');
    await context.addCookies([{ name: 'hutao.sid', value: encodeURIComponent(`s:${sid}.${signature}`), url: base }]);
    await page.goto(`${base}/servers/${guildId}`);
    await page.locator('#settings-ui').waitFor({ state: 'visible' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const navLayout = await page.locator('.topbar nav').evaluate(nav => {
      const items = [...nav.querySelectorAll(':scope > a, :scope > form > button')].map(item => item.getBoundingClientRect());
      return { heights: items.map(item => item.height), tops: items.map(item => item.top), gaps: items.slice(1).map((item, index) => item.left - items[index].right) };
    });
    assert(navLayout.heights.every(height => Math.abs(height - navLayout.heights[0]) < 1), JSON.stringify(navLayout));
    assert(navLayout.tops.every(top => Math.abs(top - navLayout.tops[0]) < 1));
    assert(navLayout.gaps.every(gap => Math.abs(gap - 16) < 1));
    await page.setViewportSize({ width: 390, height: 844 });
    const channelSelect = page.locator('[name="welcome.channelId"]');
    await channelSelect.focus();
    assert.equal(await channelSelect.evaluate(node => getComputedStyle(node).outlineStyle), 'none');
    const beforeHover = await channelSelect.boundingBox();
    await channelSelect.hover();
    const afterHover = await channelSelect.boundingBox();
    assert.equal(beforeHover.height, afterHover.height);
    assert.equal(beforeHover.width, afterHover.width);
    await page.locator('[name="welcome.message"]').fill('Chào ');
    await page.locator('[data-message-target="welcome.message"][data-insert-token="user"]').click();
    assert.equal(await page.locator('[name="welcome.message"]').inputValue(), 'Chào {user}');
    assert.match(await page.locator('[data-preview="welcome"]').textContent(), /@Bạn mới/);
    await page.locator('[name="welcome.message"]').fill('Chào {user} ở {server}!');
    assert.match(await page.locator('[data-preview="welcome"]').textContent(), /@Bạn mới/);
    await page.locator('[name="welcome.useEmbed"]').uncheck();
    assert.equal(await page.locator('[data-preview-format="welcome"]').textContent(), 'Tin nhắn thường');
    await page.locator('[name="welcome.useEmbed"]').check();
    assert.equal(await page.locator('[data-preview-format="welcome"]').textContent(), 'Khung nổi bật');
    await page.locator('[data-tab="level"]').click();
    assert.equal(await page.locator('[name="xpSettings.chat.cooldownSeconds"]').inputValue(), '30');
    await page.locator('[name="xpSettings.chat.min"]').fill('11');
    await page.locator('#save-settings').click();
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('Tất cả thay đổi'));
    assert.equal((await getGuildConfig(guildId)).xpSettings.chat.min, 11);
    await page.locator('[data-tab="roles"]').click();
    await page.locator('#add-role').click();
    await page.locator('[data-reward-level]').fill('0');
    await page.locator('[data-reward-role]').selectOption(roleId);
    await page.locator('#save-settings').click();
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('Tất cả thay đổi'));
    assert.equal((await getGuildConfig(guildId)).roleRewards[0].roleId, roleId);
    await User.create({ userId, guildId, xp: 5000, level: 5 });
    await page.locator('[data-tab="leaderboard"]').click();
    await page.locator('#leaderboard tbody tr').first().waitFor();
    const refresh = page.locator('#refresh-leaderboard');
    await refresh.focus();
    assert.equal(await refresh.evaluate(node => getComputedStyle(node).outlineStyle), 'none');
    const boardSpacing = await page.evaluate(() => ({
      buttonBottom: document.querySelector('#refresh-leaderboard').getBoundingClientRect().bottom,
      contentTop: document.querySelector('#leaderboard').getBoundingClientRect().top,
    }));
    assert(boardSpacing.contentTop - boardSpacing.buttonBottom >= 24);
    if (process.env.CAPTURE_UI === '1') await page.locator('#panel-leaderboard').screenshot({ path: '.cache/qa/leaderboard-focus-mobile.png' });
    assert.match(await page.locator('#leaderboard').textContent(), /Bạn & tôi/);
    assert.equal(await page.locator('#leaderboard tbody tr').count(), 10);
    assert.equal(await page.locator('#leaderboard-page').textContent(), 'Trang 1 / 4');
    assert.equal(await page.locator('#leaderboard-pages button').count(), 4);
    assert.equal(await page.locator('#leaderboard-pages [aria-current="page"]').textContent(), '1');
    assert(await page.locator('#leaderboard-prev').isDisabled());
    await page.locator('#leaderboard-next').click();
    await page.waitForFunction(() => document.querySelector('#leaderboard-page').textContent === 'Trang 2 / 4');
    await page.locator('#leaderboard-pagination').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#leaderboard tbody tr').count(), 10);
    assert.equal(await page.locator('#leaderboard tbody tr td').first().textContent(), '#11');
    await page.locator('#leaderboard-next').click();
    await page.waitForFunction(() => document.querySelector('#leaderboard-page').textContent === 'Trang 3 / 4');
    await page.locator('#leaderboard-pagination').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#leaderboard tbody tr').count(), 10);
    await page.locator('#leaderboard-pages').getByRole('button', {name:'Trang 4',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('#leaderboard-page').textContent === 'Trang 4 / 4');
    await page.locator('#leaderboard-pagination').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#leaderboard tbody tr').count(), 8);
    assert(await page.locator('#leaderboard-next').isDisabled());
    assert.equal(await page.locator('#leaderboard-range').textContent(), '31–38 / 38 thành viên');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('#leaderboard-prev').click();
    await page.waitForFunction(() => document.querySelector('#leaderboard-page').textContent === 'Trang 3 / 4');
    await page.locator('#leaderboard-pagination').waitFor({ state: 'visible' });
    await page.locator('#leaderboard-pages').getByRole('button', {name:'Trang 2',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('#leaderboard-page').textContent === 'Trang 2 / 4');
    await page.locator('#leaderboard-pagination').waitFor({ state: 'visible' });
    await page.locator('#refresh-leaderboard').click();
    await page.waitForFunction(() => document.querySelector('#leaderboard').getAttribute('aria-busy') === 'false');
    assert.equal(await page.locator('#leaderboard tbody tr td').first().textContent(), '#11');
    assert.equal(memberScans, 1);
    if (process.env.CAPTURE_UI === '1') await page.locator('#panel-leaderboard').screenshot({ path: '.cache/qa/leaderboard-pagination-mobile.png' });
    await page.locator('[data-tab="advanced"]').click();
    await page.locator('[data-choice-list="excludedChannels"] input[type="checkbox"]').first().check();
    await page.locator('#save-settings').click();
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('Tất cả thay đổi'));
    assert((await getGuildConfig(guildId)).excludedChannels.includes(channelId));
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#reset-settings').click();
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('khôi phục'));
    assert.equal((await getGuildConfig(guildId)).xpSettings.chat.min, 10);
    assert.equal((await User.findOne({ guildId, userId })).xp, 5000);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('[data-tab="welcome"]').click();
    await capture('dashboard-desktop');
    if (process.env.CAPTURE_UI === '1') {
      await page.locator('[data-message-preview="welcome"]').screenshot({ path: '.cache/qa/welcome-preview-desktop.png' });
      await page.locator('[data-message-preview="goodbye"]').screenshot({ path: '.cache/qa/goodbye-preview-desktop.png' });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('[data-message-preview="goodbye"]').screenshot({ path: '.cache/qa/goodbye-preview-mobile.png' });
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.goto(`${base}/docs`);
    assert.equal(await page.locator('.docs-body section').count(), 6);
    const guide = await page.locator('main').innerText();
    assert(!/MONGODB_URI|SESSION_SECRET|npm |OAuth2|tự host|mã nguồn|Client Secret/i.test(guide));
    assert(await page.locator('.docs-body p').first().evaluate(node => parseFloat(getComputedStyle(node).fontSize) >= 17));
    await capture('docs-desktop', false);
    await page.setViewportSize({ width: 390, height: 844 });
    await capture('docs-mobile', false);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
