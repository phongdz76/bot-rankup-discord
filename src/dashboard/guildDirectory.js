import { PermissionFlagsBits } from 'discord.js';

const FRESH_MS = 5 * 60000;
const MAX_STALE_MS = 24 * 3600000;

export function createGuildDirectory(client, api, { now = Date.now } = {}) {
  const pending = new Map();
  async function fetchGuilds(user) {
    const guilds = [];
    let after = '';
    for (;;) {
      const batch = await api(`/users/@me/guilds?limit=200${after ? `&after=${after}` : ''}`, user.accessToken);
      if (!Array.isArray(batch)) throw new Error('Discord trả danh sách máy chủ không hợp lệ.');
      for (const guild of batch) {
        if (guild.owner || (BigInt(guild.permissions || 0) & (PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator)) !== 0n) {
          guilds.push({ id: guild.id, name: guild.name, icon: guild.icon || null,
            botPresent: client.isReady() ? client.guilds.cache.has(guild.id) : null });
        }
      }
      if (batch.length < 200) break;
      const next = batch.at(-1).id;
      if (!next || next === after) throw new Error('Discord không trả được trang máy chủ tiếp theo.');
      after = next;
    }
    return { userId: user.id, fetchedAt: now(), retryAt: 0, guilds };
  }

  return async (user, saved) => {
    const cache = saved?.userId === user.id ? saved : null;
    const hasCache = Array.isArray(cache?.guilds) && cache.fetchedAt > now() - MAX_STALE_MS;
    if (hasCache && now() - cache.fetchedAt < FRESH_MS) return { snapshot: cache, hasCache, problem: null };
    if (cache?.retryAt > now()) {
      return { snapshot: cache, hasCache, problem: {
        status: cache.status || 429, supportCode: cache.supportCode || 'DISCORD_API_RATE_LIMITED', retryAt: cache.retryAt,
      } };
    }
    try {
      let loading = pending.get(user.id);
      if (!loading) {
        loading = fetchGuilds(user).finally(() => pending.delete(user.id));
        pending.set(user.id, loading);
      }
      return { snapshot: await loading, hasCache: true, problem: null };
    } catch (error) {
      if ([401, 403].includes(error.status)) throw error;
      const seconds = Number.isFinite(error.retryAfterSeconds) && error.retryAfterSeconds >= 0
        ? Math.ceil(error.retryAfterSeconds) : 60;
      const problem = { status: error.httpStatus === 429 || error.status === 429 ? 429 : 503,
        supportCode: error.supportCode || (error.httpStatus === 429 ? 'DISCORD_API_RATE_LIMITED' : 'DISCORD_API_UNAVAILABLE'),
        retryAt: now() + seconds * 1000 };
      return { hasCache, problem, snapshot: {
        userId: user.id, guilds: hasCache ? cache.guilds : null, fetchedAt: hasCache ? cache.fetchedAt : 0,
        ...problem,
      } };
    }
  };
}
