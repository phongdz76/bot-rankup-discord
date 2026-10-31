import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import { PermissionFlagsBits } from 'discord.js';
import { config, dashboardEnabled, getDashboardConfigurationIssues } from './config/index.js';
import { configureAuth } from './dashboard/auth.js';
import { createSessionStore } from './dashboard/sessionStore.js';
import { SESSION_MAX_AGE_MS } from './dashboard/sessionRenewal.js';
import { csrfToken } from './dashboard/middleware/auth.js';
import { createDiscordApi } from './dashboard/discordApi.js';
import { publicRoutes } from './dashboard/routes/index.js';
import { serverRoutes } from './dashboard/routes/servers.js';
import { settingsRoutes } from './dashboard/routes/settings.js';
import { interactionHttpRoutes } from './services/interactionHttp.js';

export function createWebApp({ client, settings = config, store, api = createDiscordApi(), authLogger } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Một reverse proxy (Render); không tin X-Forwarded-For tùy ý.
  if (settings.production) app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', fileURLToPath(new URL('./dashboard/views', import.meta.url)));
  app.use(helmet({
    contentSecurityPolicy: { directives: {
      'img-src': ["'self'", 'https://cdn.discordapp.com', 'data:'],
      'upgrade-insecure-requests': settings.production ? [] : null,
    } },
    strictTransportSecurity: settings.production ? undefined : false,
  }));
  // Signature verification requires the exact body, before any JSON/session middleware.
  const interactions = interactionHttpRoutes({ client, settings });
  app.use('/discord/interactions', interactions);
  app.get('/health', (req, res) => {
    const database = mongoose.connection.readyState === 1;
    const discord = Boolean(client?.isReady());
    const ready = database && (settings.botEnabled === false || discord);
    res.status(ready ? 200 : 503).json({
      status: ready ? 'healthy' : 'degraded', database, discord,
      botEnabled: settings.botEnabled !== false,
      discordHttp: client?.httpDiagnostics?.snapshot() || null,
      interactionsHttp: interactions.snapshot(),
      revision: /^[a-f0-9]{40}$/i.test(process.env.RENDER_GIT_COMMIT || '') ? process.env.RENDER_GIT_COMMIT.slice(0, 7) : null,
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });
  app.use('/assets', express.static(fileURLToPath(new URL('./dashboard/public', import.meta.url)), { maxAge: '1h' }));
  app.use(express.json({ limit: '64kb' }));
  app.use(express.urlencoded({ extended: false, limit: '8kb' }));
  const enabled = dashboardEnabled(settings);
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    Object.assign(res.locals, { user: null, csrf: '', dashboardEnabled: enabled, inviteUrl: '#' });
    next();
  });
  if (enabled) {
    const sessionStore = store || createSessionStore(settings);
    app.locals.sessionStore = sessionStore;
    app.use(session({
      name: 'hutao.sid', store: sessionStore, secret: settings.dashboard.sessionSecret,
      resave: false, saveUninitialized: false, rolling: true,
      cookie: { httpOnly: true, secure: settings.production, sameSite: 'lax', maxAge: SESSION_MAX_AGE_MS },
    }));
    app.use((req, res, next) => {
      req.session.cookie.maxAge = SESSION_MAX_AGE_MS;
      next();
    });
    configureAuth(app, settings, api, authLogger);
  }
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/servers')) res.set('Cache-Control', 'no-store');
    const permissions = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages |
      PermissionFlagsBits.EmbedLinks | PermissionFlagsBits.AttachFiles | PermissionFlagsBits.ManageRoles;
    res.locals.user = req.user && req.user.expiresAt > Date.now() ? req.user : null;
    res.locals.csrf = res.locals.user ? csrfToken(req) : '';
    res.locals.dashboardEnabled = enabled;
    res.locals.inviteUrl = `https://discord.com/oauth2/authorize?client_id=${settings.clientId}&scope=bot%20applications.commands&permissions=${permissions}&integration_type=0`;
    next();
  });
  app.use(publicRoutes());
  if (enabled) {
    app.use(serverRoutes(client, api));
    app.use(settingsRoutes(client));
  } else {
    app.use(['/auth', '/servers', '/api'], (req, res) => {
      const message = 'Hutao-Chan hiện chưa sẵn sàng để đăng nhập. Bạn có thể xem hướng dẫn sử dụng và quay lại sau. Nếu cần hỗ trợ, hãy liên hệ người quản lý bot.';
      if (req.originalUrl.startsWith('/api/')) return res.status(503).json({ error: message });
      res.status(503).render('error', { title: 'Dashboard chưa sẵn sàng', message });
    });
  }
  app.use((req, res) => res.status(404).render('error', { title: 'Không tìm thấy trang', message: 'Đường dẫn này không tồn tại.' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || 500;
    if (status >= 500) console.error('[Dashboard]', error.message);
    const message = status < 500 || error.supportCode ? error.message : 'Không thể xử lý yêu cầu. Hãy thử lại sau.';
    if (error.retryAfterSeconds > 0) res.set('Retry-After', String(Math.ceil(error.retryAfterSeconds)));
    if (req.path.startsWith('/api/')) return res.status(status).json({ error: message });
    res.status(status).render('error', { title: status === 429 ? 'Discord đang giới hạn yêu cầu' : 'Chưa thể tiếp tục', message,
      ...(error.supportCode ? { supportCode: error.supportCode } : {}) });
  });
  return app;
}

export function startWebServer(client) {
  const missing = getDashboardConfigurationIssues(config);
  if (missing.length) console.warn(`[Web] Thiếu cấu hình: ${missing.join(', ')}`);
  const app = createWebApp({ client });
  const server = app.listen(config.port, () => console.log(`[Web] ${config.baseUrl} (port ${config.port})`));
  server.on('error', error => console.error('[Web]', error.message));
  return { server, store: app.locals.sessionStore };
}
