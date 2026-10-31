import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { getDefaultGuildConfig } from '../config/index.js';
import { GuildConfig } from '../models/GuildConfig.js';

export class SettingsError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export const textChannelTypes = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const idPattern = /^\d{17,20}$/;
const assert = (condition, message) => { if (!condition) throw new SettingsError(message); };
const integer = (value, min, max, label) => assert(
  Number.isInteger(value) && value >= min && value <= max, `${label}: nhập số nguyên từ ${min} đến ${max}.`,
);
const optionalId = value => value === null || (typeof value === 'string' && idPattern.test(value));

// Không cache: thay đổi từ web và /setup có hiệu lực ở lần xử lý tiếp theo.
export async function getGuildConfig(guildId) {
  return await GuildConfig.findOne({ guildId }).lean() || getDefaultGuildConfig(guildId);
}

export function validateSettings(input, guildId) {
  assert(input && typeof input === 'object' && !Array.isArray(input), 'Cấu hình không hợp lệ.');
  assert(['role_mapping', 'unlimited'].includes(input.levelMode), 'Chế độ level không hợp lệ.');
  assert(optionalId(input.levelUpChannelId), 'Kênh thông báo không hợp lệ.');
  const messages = {};
  for (const key of ['welcome', 'goodbye']) {
    const value = input[key];
    assert(value && typeof value.enabled === 'boolean' && typeof value.useEmbed === 'boolean', `${key}: trạng thái không hợp lệ.`);
    assert(optionalId(value.channelId), `${key}: kênh không hợp lệ.`);
    assert(!value.enabled || value.channelId, `${key}: hãy chọn kênh trước khi bật.`);
    assert(typeof value.message === 'string' && value.message.trim().length > 0 && value.message.length <= 1800, `${key}: nội dung phải có 1–1800 ký tự.`);
    messages[key] = { enabled: value.enabled, useEmbed: value.useEmbed, channelId: value.channelId, message: value.message.trim() };
  }
  const chat = input.xpSettings?.chat;
  const voice = input.xpSettings?.voice;
  assert(chat && voice, 'Thiếu cấu hình XP.');
  integer(chat.min, 0, 10000, 'XP chat tối thiểu');
  integer(chat.max, chat.min, 10000, 'XP chat tối đa');
  integer(chat.cooldownSeconds, 1, 86400, 'Cooldown');
  integer(voice.rewardPerMinute, 0, 10000, 'XP voice');
  integer(voice.minChannelMembers, 2, 100, 'Số người trong voice');
  assert(Array.isArray(input.roleRewards) && input.roleRewards.length <= 250, 'Tối đa 250 mốc role.');
  const levels = new Set();
  const roles = new Set();
  const roleRewards = input.roleRewards.map(reward => {
    assert(reward && typeof reward === 'object', 'Mốc role không hợp lệ.');
    integer(reward.level, 0, 100000, 'Mốc level');
    assert(typeof reward.roleId === 'string' && idPattern.test(reward.roleId), 'Role ID không hợp lệ.');
    assert(!levels.has(reward.level) && !roles.has(reward.roleId), 'Mỗi mốc level và mỗi role chỉ được xuất hiện một lần.');
    levels.add(reward.level); roles.add(reward.roleId);
    return { level: reward.level, roleId: reward.roleId, roleName: String(reward.roleName || '').slice(0, 100) };
  }).sort((a, b) => a.level - b.level);
  assert(input.levelMode !== 'role_mapping' || roleRewards.length > 0, 'Role Mapping cần ít nhất một mốc role.');
  const excluded = {};
  for (const key of ['excludedChannels', 'excludedRoles']) {
    assert(Array.isArray(input[key]) && input[key].length <= 500 && input[key].every(id => typeof id === 'string' && idPattern.test(id)), `${key}: danh sách ID không hợp lệ.`);
    excluded[key] = [...new Set(input[key])];
  }
  return {
    guildId, levelMode: input.levelMode, levelUpChannelId: input.levelUpChannelId,
    roleRewards, ...messages, ...excluded,
    xpSettings: {
      chat: { min: chat.min, max: chat.max, cooldownSeconds: chat.cooldownSeconds },
      voice: { rewardPerMinute: voice.rewardPerMinute, minChannelMembers: voice.minChannelMembers },
    },
  };
}

export async function validateGuildResources(guild, settings) {
  await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);
  const me = await guild.members.fetchMe();
  const destinations = [
    { channelId: settings.levelUpChannelId, useEmbed: true },
    ...['welcome', 'goodbye'].filter(k => settings[k].enabled).map(k => settings[k]),
  ].filter(destination => destination.channelId);
  for (const { channelId: id, useEmbed } of destinations) {
    const channel = guild.channels.cache.get(id);
    assert(channel && textChannelTypes.includes(channel.type), 'Hãy chọn kênh văn bản thuộc server này.');
    const permissions = channel.permissionsFor(me);
    const required = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
    if (useEmbed) required.push(PermissionFlagsBits.EmbedLinks);
    assert(permissions?.has(required), `Bot thiếu quyền xem/gửi tin${useEmbed ? '/nhúng liên kết' : ''} trong #${channel.name}.`);
  }
  assert(settings.excludedChannels.every(id => guild.channels.cache.has(id)), 'Kênh loại trừ không thuộc server.');
  assert(settings.excludedRoles.every(id => guild.roles.cache.has(id)), 'Role loại trừ không thuộc server.');
  for (const reward of settings.roleRewards) {
    const role = guild.roles.cache.get(reward.roleId);
    assert(role && role.id !== guild.id && !role.managed && role.editable, 'Role thưởng phải thuộc server, nằm dưới role bot và không phải role tích hợp/@everyone.');
    assert(me.permissions.has(PermissionFlagsBits.ManageRoles), 'Bot cần quyền Quản lý vai trò.');
    reward.roleName = role.name;
  }
}

export async function saveGuildConfig(guild, input, revision, { signal } = {}) {
  signal?.throwIfAborted();
  integer(revision, 0, Number.MAX_SAFE_INTEGER, 'Phiên bản cấu hình');
  const settings = validateSettings(input, guild.id);
  await validateGuildResources(guild, settings);
  signal?.throwIfAborted();
  try {
    await GuildConfig.updateOne({ guildId: guild.id }, { $setOnInsert: getDefaultGuildConfig(guild.id) }, { upsert: true });
  } catch (error) { if (error.code !== 11000) throw error; }
  signal?.throwIfAborted();
  const updated = await GuildConfig.findOneAndUpdate(
    { guildId: guild.id, revision }, { $set: settings, $inc: { revision: 1 } },
    { new: true, runValidators: true },
  ).lean();
  if (!updated) throw new SettingsError('Cấu hình vừa thay đổi ở nơi khác. Tải lại trang rồi thử lại.', 409);
  return updated;
}
