import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  Collection,
  Events
} from 'discord.js';
import { config } from '../config/index.js';
import { handleChatMessage } from '../core/chatXp.js';
import { startVoiceXpTracker, stopVoiceXpTracker } from '../core/voiceXp.js';
import * as rankCommand from '../commands/rank.js';
import * as leaderboardCommand from '../commands/leaderboard.js';

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

// Quản lý Slash Commands
client.commands = new Collection();
client.commands.set(rankCommand.data.name, rankCommand);
client.commands.set(leaderboardCommand.data.name, leaderboardCommand);

/**
 * Đăng ký Slash Commands với Discord API
 */
async function registerSlashCommands() {
  if (!config.token || !config.clientId) {
    console.warn('[Discord] [WARN] Thieu DISCORD_TOKEN hoac DISCORD_CLIENT_ID trong .env.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(config.token);
  const commandsBody = [rankCommand.data.toJSON(), leaderboardCommand.data.toJSON()];

  try {
    console.log('[Discord] [INFO] Dang dang ky Slash Commands...');

    if (config.guildId) {
      // Đăng ký cho Guild cụ thể (cập nhật ngay lập tức không bị delay)
      await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.guildId),
        { body: commandsBody }
      );
      console.log(`[Discord] [INFO] Da dang ky Slash Commands cho Guild: ${config.guildId}`);
    } else {
      // Đăng ký toàn cục (Global)
      await rest.put(Routes.applicationCommands(config.clientId), {
        body: commandsBody
      });
      console.log('[Discord] [INFO] Da dang ky Slash Commands Global thanh cong.');
    }
  } catch (error) {
    console.error('[Discord] [ERROR] Dang ky Slash Commands that bai:', error.message);
  }
}

/**
 * Khởi tạo sự kiện và đăng nhập bot Discord
 */
export async function initDiscordClient() {
  if (!config.token) {
    console.warn('[Discord] [WARN] Chua co DISCORD_TOKEN trong file .env!');
    return false;
  }

  // Sự kiện khi Bot online thành công
  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`[Discord] [INFO] Bot da dang nhap thanh cong voi tag: ${readyClient.user.tag}`);
    await registerSlashCommands();
    startVoiceXpTracker(readyClient);
  });

  // Sự kiện nhận tin nhắn mới
  client.on(Events.MessageCreate, async (message) => {
    await handleChatMessage(message);
  });

  // Sự kiện tương tác Slash Command
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`[Discord] [ERROR] Loi khi thuc thi lenh ${interaction.commandName}:`, error.message);
      const replyOptions = {
        content: 'Da co loi xay ra khi thuc hien lenh nay.',
        ephemeral: true
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(replyOptions).catch(() => null);
      } else {
        await interaction.reply(replyOptions).catch(() => null);
      }
    }
  });

  try {
    await client.login(config.token);
    return true;
  } catch (error) {
    console.error('[Discord] [ERROR] Dang nhap Discord that bai:', error.message);
    return false;
  }
}
