import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Discord Bot
  token: process.env.DISCORD_TOKEN || '',
  clientId: process.env.DISCORD_CLIENT_ID || '',
  guildId: process.env.GUILD_ID || '',

  // Database
  mongoUri: process.env.MONGODB_URI || '',

  // Server Keep-Alive
  port: parseInt(process.env.PORT, 10) || 3000,

  // Role IDs
  roles: {
    lvl0: process.env.ROLE_LVL0_ID || '', // Đáy xã hội
    lvl5: process.env.ROLE_LVL5_ID || '', // Người do thái
    lvl15: process.env.ROLE_LVL15_ID || '', // Nigger Boy
    lvl30: process.env.ROLE_LVL30_ID || '', // Người nhà nước
  },

  // Danh hiệu theo cấp bậc (đã bỏ icon rườm rà)
  rankTiers: [
    { level: 30, roleKey: 'lvl30', name: 'Người nhà nước', color: '#ff4d4f' },
    { level: 15, roleKey: 'lvl15', name: 'Nigger Boy', color: '#ff7875' },
    { level: 5, roleKey: 'lvl5', name: 'Người do thái', color: '#ffa39e' },
    { level: 0, roleKey: 'lvl0', name: 'Đáy xã hội', color: '#d9d9d9' }
  ],

  // Hệ thống tính điểm XP
  xp: {
    chat: {
      min: 10,
      max: 15,
      cooldownSeconds: 60
    },
    voice: {
      rewardPerMinute: 2,
      checkIntervalMs: 60 * 1000, // 60s
      minChannelMembers: 2
    }
  },

  // Hu Tao Aesthetic Theme
  theme: {
    color: '#b31e1e', // Đỏ bỉ ngạn đặc trưng Hu Tao
    thumbnail: 'https://i.imgur.com/KqW2WvR.png', // Hu Tao icon hoặc placeholder cute
    footerText: 'Vãng Sinh Đường đời thứ 77 • Hu Tao Bot'
  }
};
