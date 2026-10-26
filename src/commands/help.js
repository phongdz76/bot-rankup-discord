import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../config/index.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Xem hướng dẫn sử dụng và danh sách lệnh của Bot');

/**
 * Thực thi lệnh /help
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  const embed = new EmbedBuilder()
    .setColor(config.theme.color)
    .setTitle('Hướng dẫn sử dụng')
    .setDescription(
      '**Cấp độ & Xếp hạng**\n' +
      '**/rank** `[user]` – Xem hồ sơ cấp độ, thanh tiến trình XP và thống kê cá nhân.\n' +
      '**/leaderboard** – Xem bảng vinh danh Top 10 thành viên năng nổ nhất server.\n\n' +
      '**Cơ chế nhận điểm**\n' +
      '• **Chat văn bản:** Nhận 10 - 15 XP mỗi tin nhắn hợp lệ (cooldown 60 giây).\n' +
      '• **Kênh thoại (Voice):** Nhận 2 XP mỗi phút (yêu cầu phòng từ 2 người trở lên, không tắt mic/tai nghe).\n\n' +
      '**Lộ trình thăng tiến 4 bậc**\n' +
      '• **Level 0:** Đáy xã hội (Khởi đầu)\n' +
      '• **Level 5:** Người do thái (~5,000 XP)\n' +
      '• **Level 15:** Nigger Boy (~32,000 XP)\n' +
      '• **Level 30:** Người nhà nước (~110,000 XP)\n\n' +
      '**Kênh thông báo thăng cấp**\n' +
      `Tất cả thông báo lên cấp từ Chat và Voice được gửi tập trung về kênh <#${config.levelUpChannelId}>.\n\n` +
      '**Hướng dẫn**\n' +
      '**/help** – Xem danh sách lệnh và cơ chế hoạt động.'
    )
    .setFooter({ text: config.theme.footerText })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
