import dotenv from 'dotenv';
dotenv.config();

const snowflake = value => /^\d{17,20}$/.test(value || '') ? value : '';
const baseUrl = (process.env.DASHBOARD_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${Number(process.env.PORT) || 3000}`).trim().replace(/\/$/, '');

export const config = {
  botEnabled: process.env.BOT_ENABLED !== 'false',
  token: process.env.DISCORD_TOKEN || '',
  clientId: snowflake(process.env.DISCORD_CLIENT_ID),
  interactionsPublicKey: process.env.DISCORD_PUBLIC_KEY || '',
  // Chỉ dùng để nhập cấu hình v1, không giới hạn server.
  guildId: snowflake(process.env.GUILD_ID),
  levelUpChannelId: snowflake(process.env.LEVEL_UP_CHANNEL_ID),
  mongoUri: process.env.MONGODB_URI || '',
  port: Number(process.env.PORT) || 3000,
  baseUrl,
  production: process.env.NODE_ENV === 'production',
  dashboard: {
    clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
    callbackUrl: process.env.OAUTH2_CALLBACK_URL || `${baseUrl}/auth/discord/callback`,
    sessionSecret: process.env.SESSION_SECRET || '',
  },
  roles: Object.fromEntries([0, 5, 15, 30].map(level => [
    `lvl${level}`, snowflake(process.env[`ROLE_LVL${level}_ID`]),
  ])),
  theme: { color: '#b31e1e', footerText: 'Vãng Sinh Đường đời thứ 77 • Hutao-Chan' },
};

export function getDashboardConfigurationIssues(settings = config) {
  return [
    !settings.clientId && 'DISCORD_CLIENT_ID',
    !settings.mongoUri && 'MONGODB_URI',
    !settings.dashboard.clientSecret && 'DISCORD_CLIENT_SECRET',
    settings.dashboard.sessionSecret.length < 32 && 'SESSION_SECRET (ít nhất 32 ký tự)',
  ].filter(Boolean);
}

export const dashboardEnabled = (settings = config) => getDashboardConfigurationIssues(settings).length === 0;

export function getDefaultGuildConfig(guildId) {
  const legacy = Boolean(config.guildId && guildId === config.guildId);
  const roleRewards = legacy ? [0, 5, 15, 30]
    .filter(level => config.roles[`lvl${level}`])
    .map(level => ({ level, roleId: config.roles[`lvl${level}`], roleName: `Level ${level}` })) : [];
  return {
    guildId, levelMode: roleRewards.length ? 'role_mapping' : 'unlimited',
    levelUpChannelId: legacy ? config.levelUpChannelId || null : null, roleRewards, roleBaselines: [],
    welcome: {
      enabled: false, channelId: null, useEmbed: true,
      message: '🎊 Chào mừng {user} đã gia nhập **{server}**! Bạn là thành viên thứ **#{memberCount}**. Hãy bắt đầu trò chuyện để tích lũy kinh nghiệm nhé~',
    },
    goodbye: {
      enabled: false, channelId: null, useEmbed: true,
      message: '👋 **{username}** đã rời khỏi **{server}**. Tạm biệt và hẹn gặp lại~',
    },
    xpSettings: {
      chat: { min: 10, max: 15, cooldownSeconds: 30 },
      voice: { rewardPerMinute: 2, minChannelMembers: 2 },
    },
    excludedChannels: [], excludedRoles: [], revision: 0,
  };
}
