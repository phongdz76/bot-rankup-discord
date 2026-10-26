import { SlashCommandBuilder } from 'discord.js';
import { User } from '../models/User.js';
import { createLeaderboardEmbed } from '../utils/embed.js';

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('Hiển thị bảng xếp hạng Top 10 thành viên năng nổ nhất server');

/**
 * Thực thi lệnh /leaderboard
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  await interaction.deferReply();

  const guildId = interaction.guild.id;

  try {
    const topUsers = await User.find({ guildId })
      .sort({ level: -1, xp: -1 })
      .limit(10)
      .lean();

    const embed = createLeaderboardEmbed(interaction.guild.name, topUsers);
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error(`[Command /leaderboard] [ERROR]:`, error.message);
    await interaction.editReply({
      content: 'Đã xảy ra sự cố khi tải bảng xếp hạng.'
    });
  }
}
