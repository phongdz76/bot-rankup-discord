import { SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType, AttachmentBuilder, MessageFlags } from 'discord.js';
import { User } from '../models/User.js';
import { calculateLevelData, getRankTierForLevel } from '../core/level.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { ensureUser } from '../services/xp.js';
import { createRankEmbed } from '../utils/embed.js';
import { createRankCard } from '../utils/rankCard.js';

export const data = new SlashCommandBuilder().setName('rank')
  .setDescription('Xem rank card và tiến trình XP trong server')
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .addUserOption(o => o.setName('user').setDescription('Thành viên muốn xem'));

export async function execute(interaction) {
  if (!interaction.inGuild()) return interaction.reply({ content: 'Dùng lệnh này trong server.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply();
  const user = interaction.options.getUser('user') || interaction.user;
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  const settings = await getGuildConfig(interaction.guildId);
  const userDoc = member ? await ensureUser(member, settings) :
    await User.findOne({ guildId: interaction.guildId, userId: user.id }).lean() || { xp: 0 };
  const serverRank = await User.countDocuments({ guildId: interaction.guildId, xp: { $gt: userDoc.xp } }) + 1;
  const levelData = calculateLevelData(userDoc.xp);
  const params = { user, member, userDoc, levelData, serverRank, rankTier: getRankTierForLevel(levelData.level, settings) };
  try {
    const card = await createRankCard(params);
    await interaction.editReply({ files: [new AttachmentBuilder(card, { name: 'hutao-rank.png' })] });
  } catch (error) {
    console.error('[RankCard]', error.message);
    await interaction.editReply({ embeds: [createRankEmbed(params)] });
  }
}
