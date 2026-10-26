import { config } from '../config/index.js';

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
