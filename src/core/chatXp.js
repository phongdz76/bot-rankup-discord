import { config } from '../config/index.js';
import { User } from '../models/User.js';
import {
  calculateLevelData,
  syncUserRoles,
  sendLevelUpNotification,
  syncUserLevelFromRoles
} from './level.js';

// Cache bộ nhớ đệm kiểm tra cooldown 60 giây
const chatCooldowns = new Map();

/**
 * Xử lý sự kiện tin nhắn mới để tính điểm Chat XP
 * @param {import('discord.js').Message} message
 */
export async function handleChatMessage(message) {
  // Bỏ qua tin nhắn từ Bot, tin nhắn DM hoặc tin nhắn hệ thống
  if (message.author.bot || !message.guild) return;

  // Nếu có cấu hình GUILD_ID, chỉ xử lý tin nhắn trong server được chỉ định
  if (config.guildId && message.guild.id !== config.guildId) return;

  const userId = message.author.id;
  const guildId = message.guild.id;
  const now = Date.now();

  // Kiểm tra thời gian chờ Cooldown (60s)
  const lastChatTime = chatCooldowns.get(userId) || 0;
  const cooldownMs = config.xp.chat.cooldownSeconds * 1000;

  if (now - lastChatTime < cooldownMs) {
    return;
  }

  // Cập nhật mốc thời gian cooldown mới
  chatCooldowns.set(userId, now);

  // Sinh ngẫu nhiên XP từ min đến max (10 - 15)
  const earnedXp = Math.floor(
    Math.random() * (config.xp.chat.max - config.xp.chat.min + 1)
  ) + config.xp.chat.min;

  try {
    // Tìm hoặc tạo mới bản ghi user trong DB
    let userDoc = await User.findOne({ userId, guildId });
    userDoc = await syncUserLevelFromRoles(message.member, userDoc);
    if (!userDoc) {
      userDoc = new User({ userId, guildId, xp: 0, level: 0, messageCount: 0 });
    }

    const previousLevel = userDoc.level || 0;
    userDoc.xp += earnedXp;
    userDoc.messageCount += 1;
    userDoc.lastMessageAt = new Date();

    // Tính toán Level mới dựa trên tổng điểm XP
    const { level: newLevel } = calculateLevelData(userDoc.xp);

    if (newLevel > previousLevel) {
      userDoc.level = newLevel;
      await userDoc.save();

      // Đồng bộ Role trên server
      if (message.member) {
        await syncUserRoles(message.member, newLevel);
        await sendLevelUpNotification(message.guild, message.member, newLevel, 'chat');
      }

      console.log(`[RankUp] User ${message.author.tag} thang cap tu Level ${previousLevel} len Level ${newLevel}`);
    } else {
      await userDoc.save();
    }
  } catch (error) {
    console.error(`[ChatXP] [ERROR] Loi cap nhat XP cho ${message.author.tag}:`, error.message);
  }
}
