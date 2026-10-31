import { SlashCommandBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType, chatInputApplicationCommandMention } from 'discord.js';
import { config } from '../config/index.js';
import { getGuildConfig } from '../services/guildConfig.js';

export const data = new SlashCommandBuilder().setName('help').setDescription('Hướng dẫn sử dụng Hutao-Chan')
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
  .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel);

export async function execute(interaction) {
  await interaction.deferReply();
  const manager = interaction.client?.application?.commands;
  // Help remains useful even while Discord's command-list endpoint is rate limited.
  const commands = manager?.cache?.size ? manager.cache : interaction.client?.registeredCommands;
  const mention = name => {
    const command = commands?.find(command => command.name === name && command.type === 1);
    return command ? chatInputApplicationCommandMention(name, command.id) : `**/${name}**`;
  };
  const settings = interaction.guildId ? await getGuildConfig(interaction.guildId) : null;
  const chat = settings?.xpSettings.chat;
  const voice = settings?.xpSettings.voice;
  const embed = new EmbedBuilder().setColor(config.theme.color).setTitle('Hutao-Chan • Hướng dẫn')
    .setDescription([
      `${mention('rank')} [user] — Cấp độ, thứ hạng và thanh tiến độ XP.`,
      `${mention('leaderboard')} — Bảng xếp hạng, 10 người mỗi trang. Chọn page để xem trang khác.`,
      `${mention('setup')} — Cấu hình server (cần quyền Quản lý Server).`,
      `${mention('help')} — Xem hướng dẫn này.`,
      '',
      chat ? `**Chat:** ${chat.min}–${chat.max} XP, cooldown ${chat.cooldownSeconds} giây.` : 'XP và role thưởng được cấu hình riêng cho từng server.',
      voice ? `**Voice:** ${voice.rewardPerMinute} XP/phút; ít nhất ${voice.minChannelMembers} người hợp lệ, không tắt mic/tai nghe.` : '',
      settings ? `**Chế độ:** ${settings.levelMode === 'role_mapping' ? 'Role Mapping (thay thế role)' : 'Unlimited (tích lũy role)'}.` : '',
      '',
      `[Dashboard](${config.baseUrl}/servers) • [Hướng dẫn tiếng Việt](${config.baseUrl}/docs)`,
    ].filter(Boolean).join('\n')).setFooter({ text: config.theme.footerText });
  await interaction.editReply({ embeds: [embed] });
}
