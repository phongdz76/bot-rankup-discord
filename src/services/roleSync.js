import { User } from '../models/User.js';
import { getGuildConfig, SettingsError } from './guildConfig.js';
import { calculateLevelData, getMappedRole, getMappedRoleLevel, getTotalXpForLevel } from '../core/level.js';

function baselineUpdate(member, settings) {
  const role = getMappedRole(member, settings);
  const level = getMappedRoleLevel(member, settings);
  return {
    $max: { xp: getTotalXpForLevel(level), level },
    $set: {
      inGuild: true, displayName: member.displayName || member.user.globalName || member.user.username || member.id,
      roleLevel: role?.level || 0, rolePosition: member.roles.cache.get(role?.roleId)?.position || 0, rankRoleId: role?.roleId || '',
      rankRoleName: member.roles.cache.get(role?.roleId)?.name || role?.roleName || '',
    },
  };
}

export async function syncMemberRoleLevel(member, settings) {
  if (member.user.bot) return null;
  const filter = { guildId: member.guild.id, userId: member.id };
  const update = baselineUpdate(member, settings);
  try {
    return await User.findOneAndUpdate(filter, update, { upsert: true, new: true, setDefaultsOnInsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    // Một nguồn XP khác vừa tạo hồ sơ: chỉ nâng mốc, không ghi đè XP mới.
    return User.findOneAndUpdate(filter, update, { new: true });
  }
}

const synchronizing = new Map();
const synchronized = new Map();

const rewardSignature = settings => JSON.stringify([settings.roleRewards, settings.roleBaselines || []]
  .map(mappings => mappings.map(({ level, roleId }) => [level, roleId])));

export function invalidateRoleSync(guildId) {
  if (guildId) synchronized.delete(guildId);
  else synchronized.clear();
}

export async function ensureGuildRoleSync(guild) {
  const settings = await getGuildConfig(guild.id);
  if (synchronized.get(guild.id)?.signature !== rewardSignature(settings)) await syncGuildMembersFromRoles(guild);
  return synchronized.get(guild.id);
}

export async function syncGuildMembersFromRoles(guild) {
  if (synchronizing.has(guild.id)) return synchronizing.get(guild.id);
  const task = synchronize(guild);
  synchronizing.set(guild.id, task);
  try { return await task; }
  finally { if (synchronizing.get(guild.id) === task) synchronizing.delete(guild.id); }
}

async function synchronize(guild) {
  const startedAt = new Date();
  const settings = await getGuildConfig(guild.id);
  await guild.roles.fetch();
  let memberCount = 0;
  let after;
  for (;;) {
    // REST phân trang, không chỉ đọc những người đang có trong cache/từng chat.
    const page = await guild.members.list({ limit: 1000, cache: false, ...(after ? { after } : {}) });
    const operations = [];
    for (const member of page.values()) {
      if (member.user.bot) continue;
      memberCount++;
      const update = baselineUpdate(member, settings);
      update.$set.lastRoleSyncAt = startedAt;
      operations.push({ updateOne: {
        filter: { guildId: guild.id, userId: member.id },
        update, upsert: true,
      } });
    }
    if (operations.length) {
      try { await User.bulkWrite(operations, { ordered: false }); }
      catch (error) {
        if (!error.writeErrors?.length || !error.writeErrors.every(item => item.code === 11000)) throw error;
        await User.bulkWrite(error.writeErrors.map(item => operations[item.index]), { ordered: false });
      }
    }
    if (page.size < 1000) break;
    const next = page.lastKey();
    if (!next || next === after) throw new Error('Discord không trả về trang thành viên tiếp theo.');
    after = next;
  }
  // Chỉ đánh dấu hồ sơ cũ đã rời server. Không đụng người vừa tham gia/cập nhật trong lúc quét.
  await User.updateMany({
    guildId: guild.id, lastRoleSyncAt: { $ne: startedAt },
    inGuild: { $ne: false }, updatedAt: { $lt: startedAt },
  }, { $set: { inGuild: false } });
  synchronized.set(guild.id, { signature: rewardSignature(settings), syncedAt: new Date() });
  return { memberCount, settings };
}

export async function getGuildLeaderboard(guild, requestedPage = 1, { syncRoles = true } = {}) {
  if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) throw new SettingsError('Số trang không hợp lệ.');
  if (syncRoles) await ensureGuildRoleSync(guild);
  const filter = { guildId: guild.id, inGuild: true };
  const memberCount = await User.countDocuments(filter);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(memberCount / pageSize));
  const page = Math.min(requestedPage, totalPages);
  // Các trang sau chỉ count + lấy 10 hồ sơ bằng index, không gọi lại Discord cho cả server.
  const profiles = await User.find(filter)
    .sort({ rolePosition: -1, roleLevel: -1, xp: -1, userId: 1 }).skip((page - 1) * pageSize).limit(pageSize)
    .select('userId displayName roleLevel rankRoleName level xp messageCount totalVoiceMinutes -_id').lean();
  return {
    memberCount, page, pageSize, totalPages,
    entries: profiles.map((profile, index) => ({
      userId: profile.userId, xp: profile.xp, level: calculateLevelData(profile.xp).level,
      roleLevel: profile.roleLevel, roleName: profile.rankRoleName,
      messageCount: profile.messageCount, totalVoiceMinutes: profile.totalVoiceMinutes,
      rank: (page - 1) * pageSize + index + 1, username: profile.displayName || profile.userId,
    })),
  };
}

export async function handleMemberRoleUpdate(oldMember, member) {
  if (member.user.bot) return;
  await syncMemberRoleLevel(member, await getGuildConfig(member.guild.id));
}

export async function handleMemberLeave(member) {
  await User.updateOne({ guildId: member.guild.id, userId: member.id }, { $set: { inGuild: false } });
}

export async function handleRoleRename(oldRole, role) {
  if (oldRole.position !== role.position) invalidateRoleSync(role.guild.id);
  if (oldRole.name !== role.name) await User.updateMany({ guildId: role.guild.id, rankRoleId: role.id }, { $set: { rankRoleName: role.name } });
}

export async function syncClientGuilds(client) {
  for (const guild of client.guilds.cache.values()) {
    try {
      const { memberCount } = await syncGuildMembersFromRoles(guild);
      console.log(`[RoleSync] Đã đối chiếu ${memberCount} thành viên trong guild ${guild.id}.`);
    } catch (error) { console.error(`[RoleSync] Guild ${guild.id}:`, error.message); }
  }
}
