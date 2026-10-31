import { Router } from 'express';
import { requireLogin, requireGuildManager } from '../middleware/auth.js';
import { createGuildDirectory } from '../guildDirectory.js';

export function serverRoutes(client, api) {
  const router = Router();
  const directory = createGuildDirectory(client, api);
  router.get('/servers', requireLogin, async (req, res, next) => {
    try {
      const result = await directory(req.user, req.session.guildDirectory);
      // Request danh sách có thể đang chờ mạng trong lúc người dùng đăng xuất.
      const active = await new Promise((resolve, reject) => req.sessionStore.get(req.sessionID,
        (error, value) => error ? reject(error) : resolve(value)));
      if (active?.passport?.user?.id !== req.user.id) {
        return req.session.destroy(error => error ? next(error) : res.redirect('/auth/discord'));
      }
      req.session.guildDirectory = result.snapshot;
      const seconds = Math.max(0, Math.ceil(((result.problem?.retryAt || 0) - Date.now()) / 1000));
      if (seconds) res.set('Retry-After', String(seconds));
      const guilds = (result.hasCache ? result.snapshot.guilds : []).map(guild => ({ ...guild,
        botPresent: client.isReady() ? client.guilds.cache.has(guild.id) : guild.botPresent,
        memberCount: client.guilds.cache.get(guild.id)?.memberCount }));
      res.status(result.problem && !result.hasCache ? result.problem.status : 200).render('servers', {
        title: 'Chọn máy chủ của bạn', guilds, problem: result.problem, cached: Boolean(result.problem && result.hasCache), botReady: client.isReady(),
      });
    } catch (error) {
      if (error.status === 401) return req.logout(logoutError => {
        if (logoutError) return next(logoutError);
        res.locals.user = null; next(error);
      });
      next(error);
    }
  });
  router.get('/servers/:id', requireLogin, requireGuildManager(client), (req, res) => {
    res.render('settings', { title: 'Quản lý máy chủ', guild: req.guild });
  });
  return router;
}
