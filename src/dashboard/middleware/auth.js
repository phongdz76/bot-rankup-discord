import { randomBytes, timingSafeEqual } from 'node:crypto';
import { PermissionFlagsBits } from 'discord.js';

export function requireLogin(req, res, next) {
  if (!req.isAuthenticated?.() || !req.user?.id || !(req.user.expiresAt > Date.now())) {
    return req.originalUrl.startsWith('/api/') ? res.status(401).json({ error: 'Hãy đăng nhập Discord.' }) : res.redirect('/auth/discord');
  }
  next();
}

export function csrfToken(req) {
  if (!req.session.csrfToken) req.session.csrfToken = randomBytes(32).toString('hex');
  return req.session.csrfToken;
}

export function csrfProtection(req, res, next) {
  const supplied = req.get('x-csrf-token') || req.body?._csrf;
  const expected = req.session?.csrfToken;
  if (typeof supplied !== 'string' || !expected || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return res.status(403).json({ error: 'Phiên biểu mẫu không hợp lệ. Hãy tải lại trang.' });
  }
  next();
}

export function requireGuildManager(client) {
  return async (req, res, next) => {
    try {
      if (!/^\d{17,20}$/.test(req.params.id)) return res.status(400).json({ error: 'Server ID không hợp lệ.' });
      if (!client.isReady()) {
        const message = 'Bot đang kết nối lại với Discord. Phiên đăng nhập vẫn được giữ; hãy quay lại sau khi kết nối được khôi phục.';
        if (req.originalUrl.startsWith('/api/')) return res.status(503).json({ error: message });
        return res.status(503).render('error', { title: 'Bot đang kết nối lại', message, supportCode: 'BOT_RECONNECTING', retryPath: req.path });
      }
      const guild = client.guilds.cache.get(req.params.id);
      if (!guild) return res.status(404).json({ error: 'Bot chưa tham gia server này.' });
      // Không tin quyền được cache trong OAuth/session: fetch role và member mới nhất.
      await guild.roles.fetch();
      const member = await guild.members.fetch({ user: req.user.id, force: true });
      if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return res.status(403).json({ error: 'Bạn cần quyền Quản lý Server.' });
      }
      req.guild = guild;
      next();
    } catch (error) {
      if ([10007, 50001, 50013].includes(error.code)) return res.status(403).json({ error: 'Bạn không còn quyền truy cập server.' });
      next(error);
    }
  };
}
