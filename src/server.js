import express from 'express';
import { config } from './config/index.js';

const app = express();

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'online',
    bot: 'Hutao Rankup Bot',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  const memoryUsage = process.memoryUsage();
  res.status(200).json({
    status: 'healthy',
    uptimeSeconds: Math.floor(process.uptime()),
    ramUsedMb: Math.round(memoryUsage.rss / 1024 / 1024),
    timestamp: new Date().toISOString()
  });
});

/**
 * Khởi động Express Server phục vụ Keep-Alive 24/7
 */
export function startWebServer() {
  const port = config.port;
  const server = app.listen(port, () => {
    console.log(`[Express] [INFO] Web server Keep-Alive dang hoat dong tai cong ${port}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Express] [WARN] Cong ${port} dang bi chiem dung boi ung dung khac. Chuyen sang che do du phong.`);
    } else {
      console.error('[Express] [ERROR] Loi web server:', err.message);
    }
  });

  return server;
}
