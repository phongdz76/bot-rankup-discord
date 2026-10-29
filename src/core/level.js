import { EmbedBuilder } from 'discord.js';
import { config } from '../config/index.js';
import { getGuildConfig } from '../services/guildConfig.js';

export function getXpForNextLevel(level) {
  return 50 * level ** 2 + 200 * level + 300;
}

// Tổng của đa thức, tránh vòng lặp hàng trăm nghìn level.
export function getTotalXpForLevel(level) {
  return 50 * level * (level - 1) * (2 * level - 1) / 6 +
    100 * level * (level - 1) + 300 * level;
}

export function calculateLevelData(totalXp) {
  if (!Number.isSafeInteger(totalXp) || totalXp < 0) throw new RangeError('XP phải là số nguyên không âm an toàn.');
  let low = 0, high = 1;
  while (getTotalXpForLevel(high) <= totalXp) high *= 2;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (getTotalXpForLevel(middle) <= totalXp) low = middle;
    else high = middle;
  }
  return { level: low, currentXp: totalXp - getTotalXpForLevel(low), nextLevelXp: getXpForNextLevel(low) };
}

export function getRankTierForLevel(level, settings = { roleRewards: [] }) {
  const tier = [...settings.roleRewards].sort((a, b) => b.level - a.level).find(item => level >= item.level);
  return tier ? { ...tier, name: tier.roleName || `Level ${tier.level}` } : null;
}

export async function syncUserRoles(member, level, settings) {
  if (!member?.roles) return;
  settings ||= await getGuildConfig(member.guild.id);
  const earned = settings.roleRewards.filter(item => item.level <= level).sort((a, b) => b.level - a.level);
  const targets = settings.levelMode === 'role_mapping' ? earned.slice(0, 1) : earned;
  try {
    // Gán thành công trước khi gỡ để tránh mất role khi Discord từ chối.
    for (const reward of targets) {
      if (!member.roles.cache.has(reward.roleId)) await member.roles.add(reward.roleId, 'Hutao-Chan: level reward');
    }
    if (settings.levelMode === 'role_mapping') {
      const keep = new Set(targets.map(item => item.roleId));
      for (const reward of settings.roleRewards) {
        if (!keep.has(reward.roleId) && member.roles.cache.has(reward.roleId)) {
          await member.roles.remove(reward.roleId, 'Hutao-Chan: replace level reward');
        }
      }
    }
  } catch (error) {
    console.error('[Role] Không thể đồng bộ role:', error.message);
  }
}

export async function sendLevelUpNotification(guild, member, level, source = 'chat', settings, fallbackChannel) {
  settings ||= await getGuildConfig(guild.id);
  const channel = settings.levelUpChannelId
    ? await guild.channels.fetch(settings.levelUpChannelId).catch(() => null)
    : fallbackChannel;
  if (!channel?.isTextBased() || !channel.send) return;
  const tier = getRankTierForLevel(level, settings);
  const embed = new EmbedBuilder().setColor(config.theme.color)
    .setAuthor({ name: 'Thăng cấp thành viên', iconURL: member.user.displayAvatarURL() })
    .setDescription(`Chúc mừng <@${member.id}> đã đạt **Level ${level}**!\n${tier ? `Danh hiệu: **${tier.name}**\n` : ''}Nguồn XP: ${source === 'voice' ? 'Voice' : 'Chat'}`)
    .setFooter({ text: config.theme.footerText }).setTimestamp();
  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } })
    .catch(error => console.error('[LevelUp]', error.message));
}


