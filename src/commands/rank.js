import { SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType, MessageFlags } from 'discord.js';
import { User } from '../models/User.js';
import { calculateLevelData, getRankTierForLevel } from '../core/level.js';
import { ensureUser } from '../services/xp.js';
import { ensureGuildRoleSync } from '../services/roleSync.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { createRankEmbed } from '../utils/embed.js';

export const data = new SlashCommandBuilder().setName('rank')
  .setDescription('Xem cấp độ, thứ hạng và tiến độ XP trong máy chủ')
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .addUserOption(o => o.setName('user').setDescription('Thành viên muốn xem'));

export async function execute(interaction) {
  if (!interaction.inGuild()) return interaction.reply({ content: 'Dùng lệnh này trong server.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply();
  const user = interaction.options.getUser('user') || interaction.user;
  if (user.bot) return interaction.editReply({ content: 'Bot không được tính điểm và xếp hạng.' });
  await ensureGuildRoleSync(interaction.guild);
  const settings = await getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch({ user: user.id, force: true }).catch(() => null);
  const userDoc = member ? await ensureUser(member, settings) :
    await User.findOne({ guildId: interaction.guildId, userId: user.id }).lean() || { xp: 0 };
  const serverRank = await User.countDocuments({
    guildId: interaction.guildId, inGuild: true,
    $or: [
      { rolePosition: { $gt: userDoc.rolePosition || 0 } },
      { rolePosition: userDoc.rolePosition || 0, roleLevel: { $gt: userDoc.roleLevel || 0 } },
      { rolePosition: userDoc.rolePosition || 0, roleLevel: userDoc.roleLevel || 0, xp: { $gt: userDoc.xp } },
      { rolePosition: userDoc.rolePosition || 0, roleLevel: userDoc.roleLevel || 0, xp: userDoc.xp, userId: { $lt: user.id } },
    ],
  }) + 1;
  const levelData = calculateLevelData(userDoc.xp);
  const params = { user, member, userDoc, levelData, serverRank, rankTier: getRankTierForLevel(levelData.level, settings) };
  await interaction.editReply({ embeds: [createRankEmbed(params)], allowedMentions: { parse: [] } });
}
