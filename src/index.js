import mongoose from 'mongoose';
import { connectDatabase } from './services/database.js';
import { initDiscordClient, client } from './services/discord.js';
import { startWebServer } from './server.js';
import { stopVoiceXpTracker } from './core/voiceXp.js';
import { retryStartup } from './services/startup.js';
import { config } from './config/index.js';
import { startSeasonTracker, stopSeasonTracker } from './services/seasons.js';

let web;
let stopping = false;
const startupAbort = new AbortController();
async function bootstrap() {
  console.log('[Bootstrap] Khởi động Hutao-Chan v2');
  const connected = await retryStartup(connectDatabase, { signal: startupAbort.signal, label: 'MongoDB' });
  if (stopping) return;
  web = startWebServer(client);
  if (!connected) {
    console.warn('[Bootstrap] MongoDB chưa sẵn sàng; bot không đăng nhập để tránh mất XP. /health trả 503.');
    return;
  }
  startSeasonTracker();
  if (!config.botEnabled) {
    console.log('[Bootstrap] BOT_ENABLED=false: chỉ chạy dashboard, không kết nối bot Discord.');
    return;
  }
  // discord.js destroys its Client after a failed login. Exit on failure so the
  // host starts a fresh process, instead of leaving a dead bot beside a live web server.
  await initDiscordClient();
}

async function shutdown(signal, code = 0) {
  if (stopping) return;
  stopping = true;
  startupAbort.abort();
  console.log(`[Process] ${signal}: đang đóng kết nối...`);
  const timeout = setTimeout(() => process.exit(1), 10000).unref();
  stopVoiceXpTracker();
  stopSeasonTracker();
  client.emit('diagnosticsStop');
  await client.destroy();
  if (web?.server) await new Promise(resolve => web.server.close(resolve));
  await web?.store?.close();
  await mongoose.disconnect();
  clearTimeout(timeout);
  process.exitCode = code;
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', error => {
  console.error('[Process] Unhandled rejection:', error instanceof Error ? error.message : 'Unknown error');
  void shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', error => {
  console.error('[Process] Uncaught exception:', error.message);
  void shutdown('uncaughtException', 1);
});
bootstrap().catch(error => {
  console.error('[Bootstrap]', error.message);
  void shutdown('bootstrap failed', 1);
});
