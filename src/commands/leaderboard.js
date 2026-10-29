import {
  SlashCommandBuilder,
  ApplicationIntegrationType,
  InteractionContextType
} from 'discord.js';
import { getGuildLeaderboard } from '../services/roleSync.js';
import { createLeaderboardEmbed } from '../utils/embed.js';

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('Xem bảng xếp hạng máy chủ, 10 thành viên mỗi trang')
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .addIntegerOption(option => option.setName('page').setDescription('Trang bảng xếp hạng (10 người mỗi trang)').setMinValue(1));

/**
 * Thực thi lệnh /leaderboard
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  if (!interaction.inGuild()) return interaction.reply({ content: 'Dùng lệnh này trong server.', ephemeral: true });
  await interaction.deferReply();

  try {
    const { entries: topUsers, page, totalPages } = await getGuildLeaderboard(interaction.guild, interaction.options.getInteger('page') || 1);

    const embed = createLeaderboardEmbed(interaction.guild.name, topUsers);
    embed.setTitle(`Bảng xếp hạng — ${interaction.guild.name} · Trang ${page}/${totalPages}`);
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error(`[Command /leaderboard] [ERROR]:`, error.message);
    await interaction.editReply({
      content: 'Đã xảy ra sự cố khi tải bảng xếp hạng.'
    });
  }
}
