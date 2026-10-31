import {
  SlashCommandBuilder,
  ApplicationIntegrationType,
  InteractionContextType
} from 'discord.js';
import { getGuildLeaderboard } from '../services/roleSync.js';
import { createLeaderboardEmbed } from '../utils/embed.js';
import { getSeasonLeaderboard } from '../services/seasons.js';
import { EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('Xem bảng xếp hạng máy chủ, 10 thành viên mỗi trang')
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .addIntegerOption(option => option.setName('page').setDescription('Trang bảng xếp hạng (10 người mỗi trang)').setMinValue(1))
  .addStringOption(option => option.setName('period').setDescription('Kỳ xếp hạng').addChoices(
    { name: 'Tổng', value: 'all' }, { name: 'Tuần', value: 'week' }, { name: 'Tháng', value: 'month' }))
  .addStringOption(option => option.setName('season').setDescription('Ngày thuộc mùa cũ, dạng YYYY-MM-DD').setMinLength(10).setMaxLength(10));

/**
 * Thực thi lệnh /leaderboard
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  if (!interaction.inGuild()) return interaction.reply({ content: 'Dùng lệnh này trong server.', ephemeral: true });
  await interaction.deferReply();

  try {
    const guild = interaction.guild || { id: interaction.guildId, name: 'Máy chủ' };
    const period = interaction.options.getString?.('period') || 'all';
    const date = interaction.options.getString?.('season');
    if (date && period === 'all') return interaction.editReply('Chọn period:week hoặc period:month để xem mùa cũ.');
    if (period !== 'all') {
      const board = await getSeasonLeaderboard(interaction.guildId, period, interaction.options.getInteger('page') || 1, date);
      const label = period === 'week' ? 'Tuần' : 'Tháng';
      const embed = new EmbedBuilder().setColor(0xe99b83).setTitle(`BXH ${label} ${board.season.date} · Trang ${board.page}/${board.totalPages}`)
        .setDescription(board.entries.map(entry => `**#${entry.rank}** <@${entry.userId}> — **${entry.xp.toLocaleString('vi-VN')} XP**`).join('\n\n') || 'Chưa có hoạt động được ghi nhận trong mùa này.')
        .setFooter({ text: `${board.season.closedAt ? 'Mùa đã chốt' : 'Điểm mùa được ghi nhận từ khi bật tính năng'} • Giờ Việt Nam • XP tổng giữ nguyên` });
      return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    }
    const { entries: topUsers, page, totalPages } = await getGuildLeaderboard(guild, interaction.options.getInteger('page') || 1, { syncRoles: interaction.transport !== 'http' });

    const embed = createLeaderboardEmbed(guild.name, topUsers);
    embed.setTitle(`Bảng xếp hạng — ${guild.name} · Trang ${page}/${totalPages}`);
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error(`[Command /leaderboard] [ERROR]:`, error.message);
    await interaction.editReply({
      content: error.status === 400 ? error.message : 'Đã xảy ra sự cố khi tải bảng xếp hạng.'
    });
  }
}
