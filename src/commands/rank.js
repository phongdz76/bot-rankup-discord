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
  const inline = interaction.transport === 'http';
  if (!inline) await ensureGuildRoleSync(interaction.guild);
  const settings = await getGuildConfig(interaction.guildId);
  // HTTP commands use signed resolved data / Gateway cache and stored profiles.
  // Do not queue a fresh REST fetch before the inline response deadline.
  const resolved = inline ? interaction.options.getMember('user') || (user.id === interaction.user.id ? interaction.member : null) : null;
  const cached = inline ? interaction.guild?.members.cache?.get(user.id) : null;
  const member = inline ? (resolved?.roles?.cache ? resolved : cached) || null
    : await interaction.guild.members.fetch({ user: user.id, force: true }).catch(() => null);
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
