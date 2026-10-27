import { config } from '../config/index.js';
import { User } from '../models/User.js';

/**
 * Tính lượng XP cần để thăng cấp từ Level hiện tại lên Level tiếp theo
 * Công thức: 50 * (Level^2) + (200 * Level) + 300
 * @param {number} level
 * @returns {number}
 */
export function getXpForNextLevel(level) {
  return 50 * Math.pow(level, 2) + 200 * level + 300;
}

/**
 * Tính Level hiện tại và số XP dư dựa trên tổng XP tích lũy
 * @param {number} totalXp
 * @returns {{ level: number, currentXp: number, nextLevelXp: number }}
 */
export function calculateLevelData(totalXp) {
  let level = 0;
  let accumulatedXp = 0;

  while (true) {
    const requiredXp = getXpForNextLevel(level);
    if (totalXp >= accumulatedXp + requiredXp) {
      accumulatedXp += requiredXp;
      level++;
    } else {
      break;
    }
  }

  const currentXp = totalXp - accumulatedXp;
  const nextLevelXp = getXpForNextLevel(level);

  return {
    level,
    currentXp,
    nextLevelXp
  };
}

/**
 * Lấy vai trò tương ứng với Level hiện tại (sắp xếp từ cấp cao nhất xuống)
 * @param {number} level
 * @returns {object|null}
 */
export function getRankTierForLevel(level) {
  for (const tier of config.rankTiers) {
    if (level >= tier.level) {
      return tier;
    }
  }
  return config.rankTiers[config.rankTiers.length - 1];
}

/**
 * Đồng bộ hóa vai trò Discord của thành viên khi thăng cấp:
 * Gán role mới tương ứng và gỡ bỏ các role bậc dưới
 * @param {import('discord.js').GuildMember} member
 * @param {number} newLevel
 */
export async function syncUserRoles(member, newLevel) {
  if (!member || !member.roles) return;

  const currentTier = getRankTierForLevel(newLevel);
  if (!currentTier) return;

  const targetRoleId = config.roles[currentTier.roleKey];
  if (!targetRoleId) return;

  try {
    // 1. Thêm role mới nếu chưa có
    if (!member.roles.cache.has(targetRoleId)) {
      await member.roles.add(targetRoleId);
      console.log(`[Role] Da gan role "${currentTier.name}" cho user ${member.user.tag}`);
    }

    // 2. Gỡ các role rank khác thuộc hệ thống rankup
    for (const tier of config.rankTiers) {
      const otherRoleId = config.roles[tier.roleKey];
      if (otherRoleId && otherRoleId !== targetRoleId && member.roles.cache.has(otherRoleId)) {
        await member.roles.remove(otherRoleId);
        console.log(`[Role] Da go role "${tier.name}" khoi user ${member.user.tag}`);
      }
    }
  } catch (error) {
    console.error(`[Role] [ERROR] Khong the cap nhat role cho ${member.user.tag}:`, error.message);
  }
}

/**
 * Gửi thông báo thăng cấp tập trung về kênh cố định (#bot-command)
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').GuildMember} member
 * @param {number} newLevel
 * @param {'chat'|'voice'} source
 */
export async function sendLevelUpNotification(guild, member, newLevel, source = 'chat') {
  if (!guild || !member) return;

  const targetChannelId = config.levelUpChannelId;
  let channel = null;

  if (targetChannelId) {
    channel = guild.channels.cache.get(targetChannelId);
  }

  // Fallback: Tìm kênh text có tên 'rank-up' hoặc 'rank' nếu không tìm thấy theo ID
  if (!channel) {
    channel = guild.channels.cache.find(
      (c) => c.isTextBased() && (c.name.includes('rank-up') || c.name.includes('rank') || c.name.includes('bot-command'))
    );
  }

  if (!channel || !channel.isTextBased()) {
    console.warn('[RankUp] [WARN] Khong tim thay kenh thong bao rank-up.');
    return;
  }

  const currentTier = getRankTierForLevel(newLevel);
  const sourceText = source === 'voice' ? 'Hoạt động đàm thoại Voice' : 'Trò chuyện kênh Chat';

  try {
    const { EmbedBuilder } = await import('discord.js');
    const embed = new EmbedBuilder()
      .setColor(currentTier?.color || config.theme.color)
      .setAuthor({
        name: 'Thăng Cấp Thành Viên',
        iconURL: member.user.displayAvatarURL({ dynamic: true })
      })
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 128 }))
      .setDescription(
        `Chúc mừng <@${member.id}> đã đạt **Cấp độ ${newLevel}**!\n\n` +
        `• Danh hiệu đạt được: **${currentTier?.name || 'Thành viên'}**\n` +
        `• Nguồn tích lũy: **${sourceText}**`
      )
      .setFooter({ text: config.theme.footerText })
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[RankUp] [ERROR] Khong the gui thong bao len kenh:', err.message);
  }
}

/**
 * Tính tổng lượng XP tích lũy tối thiểu cần có để đạt mốc Level chỉ định
 * @param {number} targetLevel
 * @returns {number}
 */
export function getTotalXpForLevel(targetLevel) {
  let accumulatedXp = 0;
  for (let l = 0; l < targetLevel; l++) {
    accumulatedXp += getXpForNextLevel(l);
  }
  return accumulatedXp;
}

/**
 * Tự động đồng bộ cấp độ khởi đầu từ Role hiện có trên Discord cho thành viên:
 * Nếu thành viên đã có sẵn role Người nhà nước / Đức quốc xã / Nigger Boy / Người do thái trên server
 * thì tự động khởi tạo Level và XP tương ứng thay vì để họ ở Level 0 Đáy xã hội.
 * @param {import('discord.js').GuildMember} member
 * @param {object} userDoc
 * @returns {Promise<object>}
 */
export async function syncUserLevelFromRoles(member, userDoc) {
  if (!member || !member.roles) return userDoc;

  const roles = member.roles.cache;
  let targetLevel = 0;

  // Kiểm tra từ cấp cao nhất xuống
  if (
    roles.has(config.roles.lvl30) ||
    roles.has('1291487393811136562') || // Đức quốc xã
    roles.some((r) => r.name === 'Người nhà nước' || r.name === 'Đức quốc xã')
  ) {
    targetLevel = 30;
  } else if (
    roles.has(config.roles.lvl15) ||
    roles.some((r) => r.name === 'Nigger Boy')
  ) {
    targetLevel = 15;
  } else if (
    roles.has(config.roles.lvl5) ||
    roles.some((r) => r.name === 'Người do thái')
  ) {
    targetLevel = 5;
  }

  const targetXp = getTotalXpForLevel(targetLevel);
  const currentXp = userDoc?.xp || 0;

  // Nếu user chưa có trong DB hoặc level/XP hiện tại thấp hơn vai trò đang giữ trên server
  if (targetLevel > (userDoc?.level || 0) || currentXp < targetXp) {
    if (!userDoc || !userDoc.save) {
      userDoc = await User.findOneAndUpdate(
        { userId: member.id, guildId: member.guild.id },
        {
          $setOnInsert: {
            messageCount: 0,
            totalVoiceMinutes: 0
          },
          $set: {
            level: targetLevel,
            xp: targetXp
          }
        },
        { upsert: true, new: true }
      );
    } else {
      userDoc.level = targetLevel;
      if (userDoc.xp < targetXp) {
        userDoc.xp = targetXp;
      }
      await userDoc.save().catch(() => null);
    }
  }

  return userDoc;
}


