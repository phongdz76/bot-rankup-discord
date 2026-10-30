import {
  Client,
  GatewayIntentBits,
  REST,
  RESTEvents,
  Routes,
  Collection,
  Events,
  MessageFlags
} from 'discord.js';
import { config } from '../config/index.js';
import { getErrorDiagnostics } from '../utils/errors.js';
import { handleChatMessage } from '../core/chatXp.js';
import { startVoiceXpTracker, handleVoiceStateUpdate } from '../core/voiceXp.js';
import { handleMemberEvent } from '../core/welcome.js';
import { syncClientGuilds, syncGuildMembersFromRoles, handleMemberRoleUpdate, handleMemberLeave, handleRoleRename, invalidateRoleSync } from './roleSync.js';
import * as rankCommand from '../commands/rank.js';
import * as leaderboardCommand from '../commands/leaderboard.js';
import * as helpCommand from '../commands/help.js';
import * as setupCommand from '../commands/setup.js';

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

// Không ghi route/URL: đường dẫn phản hồi tương tác có chứa token.
function attachRestDiagnostics(rest) {
  rest.on(RESTEvents.Response, (_request, response) => {
    if (response.status >= 400) console.warn('[Discord REST] HTTP_ERROR', JSON.stringify({ httpStatus: response.status }));
  });
  rest.on(RESTEvents.RateLimited, info => {
    console.warn('[Discord REST] RATE_LIMITED', JSON.stringify({
      global: info.global, retryAfterMs: info.retryAfter,
    }));
  });
}
attachRestDiagnostics(client.rest);
client.on(Events.Error, error => console.error('[Discord] CLIENT_ERROR', JSON.stringify(getErrorDiagnostics(error))));
client.on(Events.ShardError, (error, shardId) => console.error('[Discord] SHARD_ERROR', JSON.stringify({ shardId, ...getErrorDiagnostics(error) })));
client.on(Events.ShardDisconnect, (event, shardId) => console.warn('[Discord] SHARD_DISCONNECTED', JSON.stringify({ shardId, closeCode: event.code })));
client.on(Events.ShardReconnecting, shardId => console.warn('[Discord] SHARD_RECONNECTING', JSON.stringify({ shardId })));

// Quản lý Slash Commands
client.commands = new Collection();
client.commands.set(rankCommand.data.name, rankCommand);
client.commands.set(leaderboardCommand.data.name, leaderboardCommand);
client.commands.set(helpCommand.data.name, helpCommand);
client.commands.set(setupCommand.data.name, setupCommand);

/**
 * Đăng ký Slash Commands với Discord API
 */
export async function registerSlashCommands() {
  if (!config.token || !config.clientId) {
    console.warn('[Discord] [WARN] Thieu DISCORD_TOKEN hoac DISCORD_CLIENT_ID trong .env.');
    return null;
  }

  const rest = new REST({ version: '10' }).setToken(config.token);
  attachRestDiagnostics(rest);
  const commandsBody = [
    rankCommand.data.toJSON(),
    leaderboardCommand.data.toJSON(),
    helpCommand.data.toJSON(),
    setupCommand.data.toJSON()
  ];

  try {
    console.log('[Discord] [INFO] Dang dang ky Slash Commands Global...');
    const registered = await rest.put(Routes.applicationCommands(config.clientId), {
      body: commandsBody
    });
    console.log('[Discord] [INFO] Da dang ky Slash Commands Global thanh cong.');
    return registered;
  } catch (error) {
    console.error('[Discord] [ERROR] Dang ky Slash Commands that bai:', error.message);
    return null;
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
    void syncClientGuilds(readyClient);
  });

  // Sự kiện nhận tin nhắn mới
  client.on(Events.MessageCreate, async (message) => {
    await handleChatMessage(message);
  });

  const safeEvent = handler => (...args) => Promise.resolve(handler(...args))
    .catch(error => console.error('[Discord event]', error.message));
  client.on(Events.GuildMemberAdd, safeEvent(member => handleMemberEvent(member, 'welcome')));
  client.on(Events.GuildMemberRemove, safeEvent(async member => {
    await handleMemberLeave(member);
    await handleMemberEvent(member, 'goodbye');
  }));
  client.on(Events.GuildMemberUpdate, safeEvent(handleMemberRoleUpdate));
  client.on(Events.GuildMemberAvailable, safeEvent(member => handleMemberRoleUpdate(null, member)));
  client.on(Events.GuildRoleUpdate, safeEvent(handleRoleRename));
  client.on(Events.GuildCreate, safeEvent(syncGuildMembersFromRoles));
  client.on(Events.GuildDelete, guild => invalidateRoleSync(guild.id));
  client.on(Events.VoiceStateUpdate, safeEvent(handleVoiceStateUpdate));

  // Sự kiện tương tác Slash Command
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      console.warn(`[Discord] [WARN] Khong tim thay handler cho lenh: /${interaction.commandName}`);
      await interaction.reply({ content: 'Lệnh không tồn tại hoặc chưa được cập nhật!', ephemeral: true }).catch(() => null);
      return;
    }

    try {
      console.log(`[Discord] [INFO] Dang thuc thi /${interaction.commandName} tu user ${interaction.user.tag} (${interaction.user.id})`);
      await command.execute(interaction);
    } catch (error) {
      console.error(`[Discord] [ERROR] Loi khi thuc thi lenh ${interaction.commandName}:`, error.message);
      // Token hết hạn hoặc một kết nối bot khác đã nhận lệnh: không gửi phản hồi lần nữa.
      if ([10062, 40060].includes(error.code)) return;
      const replyOptions = {
        content: 'Không thể thực hiện lệnh lúc này. Hãy thử lại sau.',
        flags: MessageFlags.Ephemeral
      };
      if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({ content: replyOptions.content, embeds: [], components: [] }).catch(() => null);
      } else if (interaction.replied) {
        await interaction.followUp(replyOptions).catch(() => null);
      } else {
        await interaction.reply(replyOptions).catch(() => null);
      }
    }
  });

  console.log('[Discord] LOGIN_STARTED');
  const loginWarning = setTimeout(() => {
    if (!client.isReady()) console.warn('[Discord] LOGIN_PENDING', JSON.stringify({ elapsedSeconds: 30, gatewayStatus: client.ws.status }));
  }, 30000).unref();
  try {
    await client.login(config.token);
    return true;
  } catch (error) {
    console.error('[Discord] [ERROR] Dang nhap Discord that bai:', JSON.stringify(getErrorDiagnostics(error)));
    return false;
  } finally {
    clearTimeout(loginWarning);
  }
}
