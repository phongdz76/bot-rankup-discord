import { EmbedBuilder } from 'discord.js';
import { config } from '../config/index.js';
import { formatMinutes } from './time.js';

/**
 * Vẽ thanh tiến trình XP dạng ký tự đơn giản
 * @param {number} current
 * @param {number} max
 * @param {number} length
 * @returns {string}
 */
export function createProgressBar(current, max, length = 10) {
  if (max <= 0) return `[${'█'.repeat(length)}] 100%`;
  const percent = Math.min(Math.max(current / max, 0), 1);
  const filled = Math.round(percent * length);
  const empty = length - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${Math.round(percent * 100)}%`;
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
    .setColor(rankTier?.color || config.theme.color)
    .setAuthor({
      name: `Hồ Sơ Thành Viên: ${user.tag}`,
      iconURL: user.displayAvatarURL({ dynamic: true })
    })
    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      {
        name: 'Cấp độ',
        value: `**Level ${levelData.level}**`,
        inline: true
      },
      {
        name: 'Hạng Server',
        value: `#${serverRank || 1}`,
        inline: true
      },
      {
        name: 'Danh hiệu',
        value: `${rankTier?.name || 'Chưa xếp hạng'}`,
        inline: true
      },
      {
        name: 'Tiến độ kinh nghiệm',
        value: `${progressBar}\nXP hiện tại: **${levelData.currentXp.toLocaleString()} / ${levelData.nextLevelXp.toLocaleString()}** (Còn thiếu: ${remainingXp.toLocaleString()} XP)\nTổng tích lũy: **${(userDoc?.xp || 0).toLocaleString()} XP**`
      },
      {
        name: 'Thống kê hoạt động',
        value: `Tin nhắn đã gửi: **${userDoc?.messageCount || 0}**\nThời gian Voice: **${formatMinutes(userDoc?.totalVoiceMinutes || 0)}**`
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
    const rank = index + 1;
    return `**#${rank}** <@${item.userId}> - Level **${item.level}** (${item.xp.toLocaleString()} XP) | ${item.messageCount || 0} tin nhắn | ${formatMinutes(item.totalVoiceMinutes || 0)}`;
  });

  embed.setDescription(lines.join('\n\n'));
  return embed;
}
