import { ChannelType } from 'discord.js';
import { config } from '../config/index.js';
import { User } from '../models/User.js';
import { calculateLevelData, syncUserRoles } from './level.js';

let voiceInterval = null;

/**
 * Khởi động vòng lặp kiểm tra kênh thoại định kỳ 60 giây
 * @param {import('discord.js').Client} client
 */
export function startVoiceXpTracker(client) {
  if (voiceInterval) {
    clearInterval(voiceInterval);
  }

  console.log('[VoiceXP] [INFO] Khoi dong bo theo doi Voice XP (quet 60s/lan).');

  voiceInterval = setInterval(async () => {
    try {
      await processAllVoiceChannels(client);
    } catch (error) {
      console.error('[VoiceXP] [ERROR] Loi khi quet phong voice:', error.message);
    }
  }, config.xp.voice.checkIntervalMs);
}

/**
 * Dừng theo dõi voice (khi bot shutdown)
 */
export function stopVoiceXpTracker() {
  if (voiceInterval) {
    clearInterval(voiceInterval);
    voiceInterval = null;
    console.log('[VoiceXP] [INFO] Da dung bo theo doi Voice XP.');
  }
}

/**
 * Quét toàn bộ kênh thoại trong server hợp lệ
 * @param {import('discord.js').Client} client
 */
async function processAllVoiceChannels(client) {
  // Lấy danh sách server mà bot đang tham gia
  const guilds = client.guilds.cache.filter(
    (g) => !config.guildId || g.id === config.guildId
  );

  for (const [, guild] of guilds) {
    // Lấy các kênh voice có thành viên
    const voiceChannels = guild.channels.cache.filter(
      (ch) =>
        (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice) &&
        ch.members.size > 0
    );

    for (const [, channel] of voiceChannels) {
      // Lọc các thành viên không phải là bot
      const activeMembers = channel.members.filter((m) => !m.user.bot);

      // Chống AFK: Phải có ít nhất 2 người không phải bot trong phòng
      if (activeMembers.size < config.xp.voice.minChannelMembers) {
        continue;
      }

      for (const [, member] of activeMembers) {
        const voiceState = member.voice;

        // Bỏ qua nếu thành viên tự tắt mic hoặc tắt tai nghe
        if (
          voiceState.selfMute ||
          voiceState.serverMute ||
          voiceState.selfDeaf ||
          voiceState.serverDeaf
        ) {
          continue;
        }

        await awardVoiceXp(guild.id, member);
      }
    }
  }
}

/**
 * Cộng điểm Voice XP và số phút hoạt động cho thành viên hợp lệ
 * @param {string} guildId
 * @param {import('discord.js').GuildMember} member
 */
async function awardVoiceXp(guildId, member) {
  const userId = member.id;
  const rewardXp = config.xp.voice.rewardPerMinute;

  try {
    let userDoc = await User.findOne({ userId, guildId });
    if (!userDoc) {
      userDoc = new User({ userId, guildId, xp: 0, level: 0, messageCount: 0, totalVoiceMinutes: 0 });
    }

    const previousLevel = userDoc.level || 0;
    userDoc.xp += rewardXp;
    userDoc.totalVoiceMinutes = (userDoc.totalVoiceMinutes || 0) + 1;

    const { level: newLevel } = calculateLevelData(userDoc.xp);

    if (newLevel > previousLevel) {
      userDoc.level = newLevel;
      await userDoc.save();

      await syncUserRoles(member, newLevel);
      console.log(`[RankUp] User ${member.user.tag} dat Level ${newLevel} tu hoat dong Voice.`);
    } else {
      await userDoc.save();
    }
  } catch (error) {
    console.error(`[VoiceXP] [ERROR] Khong the cong XP voice cho ${member.user.tag}:`, error.message);
  }
}
