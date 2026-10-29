import { EmbedBuilder } from 'discord.js';
import { config } from '../config/index.js';
import { formatMinutes } from './time.js';

/**
 * Thanh tiến độ bằng emoji màu, hiển thị trực tiếp trên Discord.
 * @param {number} current
 * @param {number} max
 * @param {number} length
 * @returns {string}
 */
export function createProgressBar(current, max, length = 10) {
  const percent = max <= 0 ? 1 : Math.min(Math.max(current / max, 0), 1);
  const filled = Math.floor(percent * length);
  const partial = filled < length && percent * length > filled ? '🔸' : '';
  const bar = '🟧'.repeat(filled) + partial + '⬛'.repeat(length - filled - (partial ? 1 : 0));
  const label = percent > 0 && percent < 0.001 ? '<0,1' : (percent * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  return `${bar} **${label}%**`;
}

/**
 * Tạo Embed hiển thị thông tin hồ sơ Rank của người dùng
 * @param {object} params
 * @returns {EmbedBuilder}
 */
export function createRankEmbed({ user, member, userDoc, levelData, rankTier, serverRank }) {
  const progressBar = createProgressBar(levelData.currentXp, levelData.nextLevelXp);
  const remainingXp = Math.max(levelData.nextLevelXp - levelData.currentXp, 0);

  const embed = new EmbedBuilder()
    .setColor(member?.roles.cache.get(userDoc?.rankRoleId)?.color || 0xe99b83)
    .setAuthor({
      name: member?.displayName || user.globalName || user.username,
      iconURL: user.displayAvatarURL({ extension: 'png' })
    })
    .addFields(
      {
        name: 'Cấp độ',
        value: `**Level ${levelData.level}**`,
        inline: true
      },
      {
        name: 'Thứ hạng',
        value: `#${serverRank || 1}`,
        inline: true
      },
      {
        name: 'Vai trò',
        value: `${userDoc?.rankRoleName || rankTier?.name || 'Chưa có vai trò cấp bậc'}`,
        inline: true
      },
      {
        name: `Tiến độ lên cấp ${levelData.level + 1}`,
        value: `${progressBar}\n**${levelData.currentXp.toLocaleString('vi-VN')} / ${levelData.nextLevelXp.toLocaleString('vi-VN')} XP**\nCòn ${remainingXp.toLocaleString('vi-VN')} XP để lên cấp tiếp theo`
      },
      {
        name: 'Thống kê hoạt động',
        value: `**${(userDoc?.xp || 0).toLocaleString('vi-VN')} XP** tích lũy · **${userDoc?.messageCount || 0}** tin nhắn · Thoại **${formatMinutes(userDoc?.totalVoiceMinutes || 0)}**`
      }
    )
    .setFooter({ text: config.theme.footerText })
    .setTimestamp();

  return embed;
}

/**
 * Tạo Embed hiển thị bảng xếp hạng Top 10 của Server
 * @param {string} guildName
 * @param {Array} topUsers
 * @returns {EmbedBuilder}
 */
export function createLeaderboardEmbed(guildName, topUsers) {
  const embed = new EmbedBuilder()
    .setColor(config.theme.color)
    .setTitle(`Bảng Xếp Hạng Hoạt Động - ${guildName}`)
    .setFooter({ text: config.theme.footerText })
    .setTimestamp();

  if (!topUsers || topUsers.length === 0) {
    embed.setDescription('Chưa có dữ liệu thành viên hoạt động.');
    return embed;
  }

  const lines = topUsers.map((item, index) => {
    const rank = item.rank || index + 1;
    return `**#${rank}** <@${item.userId}> - Level **${item.level}** (${item.xp.toLocaleString()} XP) | ${item.messageCount || 0} tin nhắn | ${formatMinutes(item.totalVoiceMinutes || 0)}`;
  });

  embed.setDescription(lines.join('\n\n'));
  return embed;
}
