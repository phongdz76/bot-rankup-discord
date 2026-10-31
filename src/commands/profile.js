import { SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType, EmbedBuilder, MessageFlags } from 'discord.js';
import { User } from '../models/User.js';
import { achievementProgress, unlockAchievements } from '../services/achievements.js';
import { calculateLevelData } from '../core/level.js';
import { formatMinutes } from '../utils/time.js';

export const data = new SlashCommandBuilder().setName('profile').setDescription('Xem hồ sơ, thành tựu và tiến độ huy hiệu')
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall).setContexts(InteractionContextType.Guild)
  .addUserOption(option => option.setName('user').setDescription('Thành viên muốn xem'));

export async function execute(interaction) {
  if (!interaction.inGuild()) return interaction.reply({ content: 'Dùng lệnh này trong server.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply();
  const user = interaction.options.getUser('user') || interaction.user;
  if (user.bot) return interaction.editReply({ content: 'Bot không được tính thành tựu.' });
  let profile = await User.findOne({ guildId: interaction.guildId, userId: user.id }).lean();
  // Mở các mốc chat/voice từ bộ đếm cũ, không suy diễn lịch sử ban đêm/mùa cũ.
  profile = profile ? await unlockAchievements(profile) : {};
  const badges = achievementProgress(profile);
  const unlocked = badges.filter(badge => badge.unlockedAt);
  const embed = new EmbedBuilder().setColor(0xe99b83)
    .setAuthor({ name: user.globalName || user.username, iconURL: user.displayAvatarURL({ extension: 'png' }) })
    .setTitle('Hồ sơ & thành tựu')
    .setDescription(`**Level ${calculateLevelData(profile.xp || 0).level}** · ${(profile.xp || 0).toLocaleString('vi-VN')} XP tổng\n` +
      `${profile.messageCount || 0} lượt chat hợp lệ · Voice ${formatMinutes(profile.totalVoiceMinutes || 0)}`)
    .addFields({ name: `Huy hiệu đã đạt · ${unlocked.length}/${badges.length}`,
      value: unlocked.map(badge => `${badge.icon} **${badge.name}**`).join('\n') || 'Chưa có huy hiệu. Bắt đầu trò chuyện hoặc tham gia voice cùng mọi người nhé!' },
    { name: 'Tiến độ tiếp theo', value: badges.filter(badge => !badge.unlockedAt)
      .map(badge => `${badge.icon} **${badge.name}** — ${badge.current.toLocaleString('vi-VN')}/${badge.target.toLocaleString('vi-VN')}${badge.metric === 'totalVoiceMinutes' ? ' phút' : ''}\n${badge.description}`).join('\n\n') || 'Bạn đã mở tất cả huy hiệu!' })
    .setFooter({ text: 'Thành tựu riêng từng server • Lượt chat áp dụng cooldown XP • Giữ huy hiệu qua các mùa' });
  await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
}
