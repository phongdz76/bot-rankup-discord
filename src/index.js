import { connectDatabase } from './services/database.js';
import { initDiscordClient, client } from './services/discord.js';
import { startWebServer } from './server.js';
import { stopVoiceXpTracker } from './core/voiceXp.js';

async function bootstrap() {
  console.log('--- KHOI DONG BOT DISCORD RANKUP (HUTAO) ---');

  // 1. Khoi dong Express Web Server (Keep-Alive 24/7)
  startWebServer();

  // 2. Ket noi Co so du lieu MongoDB Atlas
  const dbConnected = await connectDatabase();
  if (!dbConnected) {
    console.warn('[Bootstrap] [WARN] Bot tiep tuc khoi dong nhung tinh nang luu tru se bi han che neu chua cau hinh MongoDB.');
  }

  // 3. Ket noi Discord Gateway
  await initDiscordClient();
}

// Xu ly tat bot an toan khi dung chuong trinh
function handleGracefulShutdown(signal) {
  console.log(`\n[Process] [INFO] Nhan tin hieu ${signal}, dang tat bot an toan...`);
  stopVoiceXpTracker();
  if (client) {
    client.destroy();
  }
  process.exit(0);
}

process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] [ERROR] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[Process] [ERROR] Uncaught Exception:', error);
});

bootstrap().catch((error) => {
  console.error('[Bootstrap] [FATAL] Khoi dong bot that bai:', error);
});
