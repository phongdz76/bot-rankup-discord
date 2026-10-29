import { Router } from 'express';
import { PermissionFlagsBits } from 'discord.js';
import { requireLogin, requireGuildManager } from '../middleware/auth.js';

export function serverRoutes(client, api) {
  const router = Router();
  router.get('/servers', requireLogin, async (req, res, next) => {
    try {
      // Phân trang để không bỏ sót người dùng tham gia hơn 200 server.
      const all = [];
      let after = '';
      for (;;) {
        const batch = await api(`/users/@me/guilds?limit=200${after ? `&after=${after}` : ''}`, req.user.accessToken);
        all.push(...batch);
        if (batch.length < 200) break;
        after = batch.at(-1).id;
      }
      const guilds = all.filter(g => g.owner || (BigInt(g.permissions) & (PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator)) !== 0n)
        .map(g => ({ ...g, botPresent: client.guilds.cache.has(g.id), memberCount: client.guilds.cache.get(g.id)?.memberCount }));
      res.render('servers', { title: 'Chọn máy chủ của bạn', guilds });
    } catch (error) { next(error); }
  });
  router.get('/servers/:id', requireLogin, requireGuildManager(client), (req, res) => {
    res.render('settings', { title: 'Quản lý máy chủ', guild: req.guild });
  });
  return router;
}
