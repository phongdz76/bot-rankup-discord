import { createHash } from 'node:crypto';
import { ActionRowBuilder, StringSelectMenuBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { getGuildConfig, SettingsError, textChannelTypes } from './guildConfig.js';
import { getErrorDiagnostics } from '../utils/errors.js';
import { createOAuthCooldown } from '../dashboard/oauthCooldown.js';

const unsafePermissions = [
  'Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels', 'ManageWebhooks', 'ManageMessages',
  'KickMembers', 'BanMembers', 'ModerateMembers', 'ManageNicknames', 'MentionEveryone', 'ViewAuditLog',
  'MuteMembers', 'DeafenMembers', 'MoveMembers', 'ManageEvents', 'ManageThreads', 'ManageGuildExpressions',
].map(name => PermissionFlagsBits[name]).filter(Boolean);
const pending = new Set();
const cooldown = createOAuthCooldown();

async function withDeadline(signal, operation) {
  signal.throwIfAborted();
  let aborted;
  const deadline = new Promise((resolve, reject) => {
    aborted = () => reject(signal.reason);
    signal.addEventListener('abort', aborted, { once: true });
  });
  try { return await Promise.race([operation(), deadline]); }
  finally { signal.removeEventListener('abort', aborted); }
}

export const gameRoleDefaults = () => ({ enabled: false, mode: 'multiple', roles: [] });
export const gameRoleSignature = settings => createHash('sha256').update(JSON.stringify(settings.gameRoles || gameRoleDefaults())).digest('hex').slice(0, 12);
export const isSafeGameRole = role => Boolean(role && !role.managed && role.editable && role.permissions && !role.permissions.any(unsafePermissions));

export function gameRoleMenu(settings, selected = []) {
  const games = settings.gameRoles || gameRoleDefaults();
  if (!games.enabled || !games.roles.length) throw new SettingsError('Server chưa bật role game. Người quản lý có thể cấu hình trong dashboard.');
  selected = games.mode === 'single' ? selected.slice(0, 1) : selected;
  const menu = new StringSelectMenuBuilder().setCustomId(`games:${gameRoleSignature(settings)}`)
    .setPlaceholder('Chọn toàn bộ game bạn muốn giữ role').setMinValues(0)
    .setMaxValues(games.mode === 'single' ? 1 : games.roles.length)
    .addOptions(games.roles.map(role => ({ label: role.label, value: role.roleId, default: selected.includes(role.roleId) })));
  return { content: `🎮 **Chọn game của bạn**\n${games.mode === 'single' ? 'Chọn tối đa một game.' : 'Bạn có thể chọn nhiều game.'} Bỏ chọn để gỡ role game; các role khác được giữ nguyên.`,
    components: [new ActionRowBuilder().addComponents(menu)], allowedMentions: { parse: [] } };
}

export async function validateGameRoleResources(guild, settings, me) {
  const games = settings.gameRoles || gameRoleDefaults();
  const rankIds = new Set([...(settings.roleRewards || []), ...(settings.roleBaselines || [])].map(role => role.roleId));
  if (games.roles.length && !me.permissions.has(PermissionFlagsBits.ManageRoles)) throw new SettingsError('Bot cần quyền Quản lý vai trò để dùng role game.');
  for (const item of games.roles) {
    const role = guild.roles.cache.get(item.roleId);
    if (item.roleId === guild.id || !isSafeGameRole(role) || rankIds.has(item.roleId)) {
      throw new SettingsError('Role game phải nằm dưới bot, không có quyền quản trị/điều hành và không trùng role cấp bậc.');
    }
  }
}

async function gameRequest(guild, path, method, signal, body) {
  signal?.throwIfAborted();
  const seconds = cooldown.remainingSeconds();
  if (seconds) throw new SettingsError(`Discord đang giới hạn yêu cầu. Thử lại sau ít nhất ${seconds} giây.`, 429);
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    method, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
    headers: { Authorization: `Bot ${guild.client.token}`, 'Content-Type': 'application/json',
      'X-Audit-Log-Reason': 'Hutao-Chan%20game%20roles' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const failure = { httpStatus: response.status, data: await response.text(), headers: Object.fromEntries(response.headers) };
    const diagnostics = getErrorDiagnostics(failure);
    cooldown.record(diagnostics);
    console.warn('[GameRoles] HTTP_ERROR', JSON.stringify(diagnostics));
    throw new SettingsError(response.status === 429 ? 'Discord đang giới hạn yêu cầu. Hãy chờ rồi mở /games để kiểm tra lại.'
      : 'Discord chưa xác nhận cập nhật. Mở /games để kiểm tra role hiện tại trước khi thử lại.', response.status === 429 ? 429 : 502);
  }
  return response;
}

export async function applyGameRoles(interaction) {
  const key = `${interaction.guildId}:${interaction.user.id}`;
  if (pending.has(key)) throw new SettingsError('Lượt chọn trước đang được xử lý. Hãy chờ rồi mở /games.');
  pending.add(key);
  try {
    const signal = interaction.signal || AbortSignal.timeout(15000);
    return await withDeadline(signal, async () => {
      const guild = interaction.guild;
      if (!guild || !interaction.client.isReady()) throw new SettingsError('Bot đang kết nối lại. Hãy thử chọn game sau.');
      const settings = await getGuildConfig(guild.id);
      signal.throwIfAborted();
      const games = settings.gameRoles || gameRoleDefaults();
      const selected = interaction.values;
      if (!games.enabled || !games.roles.length || interaction.customId !== `games:${gameRoleSignature(settings)}`) {
        throw new SettingsError('Bảng chọn đã thay đổi. Mở /games để lấy bảng chọn mới.');
      }
      if (!Array.isArray(selected) || new Set(selected).size !== selected.length ||
        selected.some(id => !games.roles.some(role => role.roleId === id)) || (games.mode === 'single' && selected.length > 1)) {
        throw new SettingsError('Lựa chọn game không hợp lệ.');
      }
      await guild.roles.fetch();
      signal.throwIfAborted();
      const me = await guild.members.fetchMe({ force: true });
      signal.throwIfAborted();
      const member = await guild.members.fetch({ user: interaction.user.id, force: true });
      signal.throwIfAborted();
      await validateGameRoleResources(guild, settings, me);
      if (gameRoleSignature(await getGuildConfig(guild.id)) !== gameRoleSignature(settings)) {
        throw new SettingsError('Cấu hình vừa thay đổi. Mở /games để chọn lại.');
      }
      const changes = games.roles.filter(role => member.roles.cache.has(role.roleId) !== selected.includes(role.roleId))
        .sort((a, b) => Number(selected.includes(b.roleId)) - Number(selected.includes(a.roleId)));
      for (const role of changes) {
        signal.throwIfAborted();
        // PUT/DELETE riêng từng role: không ghi đè toàn bộ role của thành viên.
        await gameRequest(guild, `/guilds/${guild.id}/members/${member.id}/roles/${role.roleId}`,
          selected.includes(role.roleId) ? 'PUT' : 'DELETE', signal);
      }
      return { ...gameRoleMenu(settings, selected), content: '✅ Đã cập nhật role game của bạn.\n' + gameRoleMenu(settings, selected).content };
    });
  } finally { pending.delete(key); }
}

export async function handleGameRoleInteraction(interaction) {
  if (!interaction.inGuild()) return interaction.reply({ content: 'Dùng bảng chọn trong server.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try { await interaction.editReply(await applyGameRoles(interaction)); }
  catch (error) {
    console.warn('[GameRoles] UPDATE_FAILED', JSON.stringify(getErrorDiagnostics(error)));
    await interaction.editReply({ content: error instanceof SettingsError ? error.message
      : 'Chưa xác nhận được cập nhật. Mở /games để kiểm tra role hiện tại rồi thử lại.', components: [], allowedMentions: { parse: [] } });
  }
}

export async function publishGameRolePanel(guild, channelId) {
  const signal = AbortSignal.timeout(15000);
  return withDeadline(signal, async () => {
    const settings = await getGuildConfig(guild.id);
    const payload = gameRoleMenu(settings);
    await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);
    signal.throwIfAborted();
    const me = await guild.members.fetchMe({ force: true });
    await validateGameRoleResources(guild, settings, me);
    const channel = guild.channels.cache.get(channelId);
    if (!channel || !textChannelTypes.includes(channel.type) ||
      !channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
      throw new SettingsError('Chọn kênh văn bản trong server mà bot có quyền xem và gửi tin.');
    }
    const response = await gameRequest(guild, `/channels/${channel.id}/messages`, 'POST', signal,
      { content: payload.content, components: payload.components.map(row => row.toJSON()), allowed_mentions: { parse: [] } });
    const message = await response.json();
    return { url: `https://discord.com/channels/${guild.id}/${channel.id}/${message.id}` };
  });
}
