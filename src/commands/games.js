import { SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType, MessageFlags } from 'discord.js';
import { getGuildConfig, SettingsError } from '../services/guildConfig.js';
import { gameRoleMenu } from '../services/gameRoles.js';

export const data = new SlashCommandBuilder().setName('games').setDescription('Tự chọn hoặc gỡ role game của bạn')
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall).setContexts(InteractionContextType.Guild);

export async function execute(interaction) {
  if (!interaction.inGuild()) return interaction.reply({ content: 'Dùng lệnh này trong server.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const roles = interaction.member?.roles;
    const selected = roles?.cache ? [...roles.cache.keys()] : Array.isArray(roles) ? roles : [];
    const payload = gameRoleMenu(await getGuildConfig(interaction.guildId), selected);
    await interaction.editReply(payload);
  } catch (error) {
    if (!(error instanceof SettingsError)) throw error;
    await interaction.editReply({ content: error.message });
  }
}
