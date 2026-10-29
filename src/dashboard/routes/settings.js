import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireLogin, requireGuildManager, csrfProtection } from '../middleware/auth.js';
import { getGuildConfig, saveGuildConfig } from '../../services/guildConfig.js';
import { getDefaultGuildConfig } from '../../config/index.js';
import { getGuildLeaderboard } from '../../services/roleSync.js';

export function settingsRoutes(client) {
  const router = Router();
  router.use('/api/guilds/:id', requireLogin,
    rateLimit({ windowMs: 60000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false }),
    requireGuildManager(client));
  const route = handler => async (req, res, next) => { try { await handler(req, res); } catch (error) { next(error); } };
  router.get('/api/guilds/:id/settings', route(async (req, res) => {
    await req.guild.channels.fetch();
    const me = await req.guild.members.fetchMe();
    res.json({
      settings: await getGuildConfig(req.guild.id),
      channels: [...req.guild.channels.cache.values()].map(ch => ({ id: ch.id, name: ch.name, type: ch.type })),
      roles: [...req.guild.roles.cache.values()].filter(r => r.id !== req.guild.id && !r.managed && r.editable && me.permissions.has('ManageRoles'))
        .map(r => ({ id: r.id, name: r.name })),
      excludedRoleOptions: [...req.guild.roles.cache.values()].filter(r => r.id !== req.guild.id).map(r => ({ id: r.id, name: r.name })),
    });
  }));
  router.post('/api/guilds/:id/settings', csrfProtection, route(async (req, res) => {
    res.json({ settings: await saveGuildConfig(req.guild, req.body.settings, req.body.revision) });
  }));
  router.post('/api/guilds/:id/reset', csrfProtection, route(async (req, res) => {
    if (req.body.confirm !== true) return res.status(400).json({ error: 'Cần xác nhận đặt lại cấu hình.' });
    res.json({ settings: await saveGuildConfig(req.guild, getDefaultGuildConfig(req.guild.id), req.body.revision) });
  }));
  router.get('/api/guilds/:id/leaderboard', route(async (req, res) => {
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    res.json(await getGuildLeaderboard(req.guild, page));
  }));
  return router;
}
