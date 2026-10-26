import { SlashCommandBuilder } from 'discord.js';
import { User } from '../models/User.js';
import { calculateLevelData, getRankTierForLevel, syncUserLevelFromRoles } from '../core/level.js';
import { createRankEmbed } from '../utils/embed.js';

export const data = new SlashCommandBuilder()
  .setName('rank')
  .setDescription('Xem thông tin cấp độ và tiến trình kinh nghiệm cá nhân')
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('Chọn thành viên bạn muốn xem hồ sơ')
      .setRequired(false)
  );

/**
 * Thực thi lệnh /rank
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  await interaction.deferReply();

  const targetUser = interaction.options.getUser('user') || interaction.user;
  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

  const userId = targetUser.id;
  const guildId = interaction.guild.id;

  try {
    let userDoc = await User.findOne({ userId, guildId });
    userDoc = await syncUserLevelFromRoles(targetMember, userDoc);
    if (!userDoc) {
      userDoc = {
        userId,
        guildId,
        xp: 0,
        level: 0,
        messageCount: 0,
        totalVoiceMinutes: 0
      };
    }

    // Tính thứ hạng xếp hạng trong Server
    const serverRank =
      (await User.countDocuments({
        guildId,
        xp: { $gt: userDoc.xp || 0 }
      })) + 1;

    const levelData = calculateLevelData(userDoc.xp || 0);
    const rankTier = getRankTierForLevel(levelData.level);

    const embed = createRankEmbed({
      user: targetUser,
      member: targetMember,
      userDoc,
      levelData,
      rankTier,
      serverRank
    });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error(`[Command /rank] [ERROR]:`, error.message);
    await interaction.editReply({
      content: 'Đã xảy ra sự cố khi truy xuất dữ liệu cấp độ.'
    });
  }
}
