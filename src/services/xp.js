import { User } from '../models/User.js';
import { calculateLevelData, syncUserRoles, sendLevelUpNotification } from '../core/level.js';
import { syncMemberRoleLevel as ensureUser } from './roleSync.js';

export { ensureUser };

const pending = new Map();
export function isExcluded(member, channelId, settings) {
  const channel = member.guild.channels.cache.get(channelId);
  const ids = [channelId, channel?.parentId, channel?.parent?.parentId].filter(Boolean);
  return ids.some(id => settings.excludedChannels.includes(id)) ||
    Boolean(member.roles?.cache.some(role => settings.excludedRoles.includes(role.id)));
}

// Tuần tự hóa tác dụng phụ chat/voice trên cùng thành viên. $inc và cooldown
// vẫn nguyên tử trong MongoDB, không mất XP khi nhiều nguồn cập nhật đồng thời.
export async function awardXp(member, settings, award) {
  const key = `${member.guild.id}:${member.id}`;
  const previous = pending.get(key) || Promise.resolve();
  const task = previous.catch(() => {}).then(() => applyAward(member, settings, award));
  pending.set(key, task);
  try { return await task; }
  finally { if (pending.get(key) === task) pending.delete(key); }
}

async function applyAward(member, settings, { source, xp, channel, now = new Date() }) {
  await ensureUser(member, settings);
  const filter = { guildId: member.guild.id, userId: member.id };
  const increments = { xp };
  const update = { $inc: increments };
  if (source === 'chat') {
    filter.$or = [{ lastMessageAt: null }, { lastMessageAt: { $lte: new Date(now.getTime() - settings.xpSettings.chat.cooldownSeconds * 1000) } }];
    increments.messageCount = 1;
    update.$set = { lastMessageAt: now };
  } else {
    increments.totalVoiceMinutes = 1;
  }
  const user = await User.findOneAndUpdate(filter, update, { new: true });
  if (!user) return null;
  const { level } = calculateLevelData(user.xp);
  const before = await User.findOneAndUpdate(
    { _id: user._id, level: { $lt: level } }, { $max: { level } }, { new: false },
  );
  // Đồng bộ cả khi chưa lên level để cấu hình role mới có tác dụng ở lần nhận XP kế tiếp.
  await syncUserRoles(member, level, settings);
  if (before) await sendLevelUpNotification(member.guild, member, level, source, settings, channel);
  user.level = level;
  return user;
}
