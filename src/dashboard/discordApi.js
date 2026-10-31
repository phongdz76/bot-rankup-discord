import { createOAuthCooldown } from './oauthCooldown.js';
import { getErrorDiagnostics } from '../utils/errors.js';

export function createDiscordApi({ now = Date.now, fetcher = (...args) => fetch(...args), log = console.warn } = {}) {
  const cooldowns = new Map();
  const globalCooldown = createOAuthCooldown({ now });
  const limited = seconds => Object.assign(new Error(`Discord đang giới hạn yêu cầu. Phiên đăng nhập vẫn được giữ; thử lại sau ít nhất ${seconds} giây.`), {
    status: 429, httpStatus: 429, supportCode: 'DISCORD_API_RATE_LIMITED', retryAfterSeconds: seconds,
  });
  return async (path, accessToken) => {
    const operation = path.startsWith('/users/@me/guilds') ? 'guilds' : path === '/users/@me' ? 'profile' : 'other';
    if (!cooldowns.has(operation)) cooldowns.set(operation, createOAuthCooldown({ now }));
    const cooldown = cooldowns.get(operation);
    const seconds = Math.max(cooldown.remainingSeconds(), globalCooldown.remainingSeconds());
    if (seconds) throw limited(seconds);
    let response;
    try {
      response = await fetcher(`https://discord.com/api/v10${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10000),
      });
    } catch (cause) {
      const error = Object.assign(new Error('Chưa kết nối được với Discord. Phiên đăng nhập vẫn được giữ.', { cause }),
        { status: 503, supportCode: 'DISCORD_API_UNAVAILABLE' });
      log('[Dashboard Discord] REQUEST_FAILED', JSON.stringify({ operation, ...getErrorDiagnostics(error) }));
      throw error;
    }
    if (!response.ok) {
      const diagnostics = getErrorDiagnostics({ httpStatus: response.status, headers: response.headers, data: await response.text() });
      log('[Dashboard Discord] REQUEST_FAILED', JSON.stringify({ operation, ...diagnostics }));
      if (response.status === 429) {
        cooldown.record(diagnostics);
        if (diagnostics.global) globalCooldown.record(diagnostics);
        throw Object.assign(limited(cooldown.remainingSeconds()), diagnostics);
      }
      throw Object.assign(new Error(response.status === 401 ? 'Quyền kết nối Discord không còn hiệu lực. Hãy đăng nhập lại.'
        : 'Discord tạm thời chưa trả được dữ liệu. Phiên đăng nhập vẫn được giữ.'), diagnostics, {
        status: response.status === 401 ? 401 : response.status === 403 ? 403 : 503,
        supportCode: response.status === 401 ? 'DISCORD_TOKEN_REJECTED' : 'DISCORD_API_UNAVAILABLE',
      });
    }
    return response.json();
  };
}

export const discordApi = createDiscordApi();
