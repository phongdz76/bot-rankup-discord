import { describeAuthFailure } from './authFailure.js';

export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_MARGIN_MS = 60 * 1000;

export function tokenExpiresAt(expiresIn) {
  const seconds = Number(expiresIn);
  return Date.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 3600) * 1000;
}

async function refreshDiscordToken(settings, refreshToken) {
  const response = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: settings.clientId, client_secret: settings.dashboard.clientSecret,
      grant_type: 'refresh_token', refresh_token: refreshToken,
    }),
  });
  if (!response.ok) {
    const error = new Error('Không thể gia hạn phiên Discord.');
    error.oauthError = { statusCode: response.status, data: await response.text(),
      headers: Object.fromEntries(response.headers) };
    throw error;
  }
  const tokens = await response.json();
  if (typeof tokens.access_token !== 'string' || !tokens.access_token) {
    throw new Error('Discord không trả về access token.');
  }
  return tokens;
}

const storeGet = req => new Promise((resolve, reject) => {
  req.sessionStore.get(req.sessionID, (error, value) => error ? reject(error) : resolve(value));
});
const save = req => new Promise((resolve, reject) => {
  req.session.save(error => error ? reject(error) : resolve());
});
const fresh = user => user?.id && user.expiresAt > Date.now() + REFRESH_MARGIN_MS;

export function createSessionRenewal({ settings, cooldown, authLogger }) {
  // Một lần gia hạn cho các request đồng thời của cùng một phiên trong tiến trình.
  const pending = new Map();

  async function renew(req) {
    const user = (await storeGet(req))?.passport?.user;
    if (!user?.id || fresh(user) || !user.refreshToken) return user;
    const seconds = cooldown.remainingSeconds();
    if (seconds) throw Object.assign(new Error('OAuth cooldown'), { cooldownSeconds: seconds });

    let tokens;
    try { tokens = await refreshDiscordToken(settings, user.refreshToken); }
    catch (error) {
      // Chỉ quyền bị thu hồi mới cần đăng nhập lại; lỗi tạm thời giữ nguyên phiên.
      try {
        error.sessionRevoked = JSON.parse(error.oauthError?.data).error === 'invalid_grant';
      } catch { /* Không đọc/ghi raw body vào log. */ }
      throw error;
    }
    const current = (await storeGet(req))?.passport?.user;
    // Không khôi phục đăng nhập nếu người dùng đã đăng xuất trong lúc chờ Discord.
    if (!current?.id) return null;
    if (current.id !== user.id || current.refreshToken !== user.refreshToken) return current;
    const updated = { ...current, accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || user.refreshToken, expiresAt: tokenExpiresAt(tokens.expires_in) };
    req.session.passport.user = updated;
    await save(req);
    return updated;
  }

  return async (req, res, next) => {
    const needsToken = req.path === '/' || req.path === '/auth/discord' ||
      req.path === '/servers' || req.path.startsWith('/servers/') || req.path.startsWith('/api/');
    if (!needsToken || !req.user?.id || fresh(req.user) || !req.user.refreshToken) return next();
    try {
      let renewal = pending.get(req.sessionID);
      if (!renewal) {
        renewal = renew(req).finally(() => pending.delete(req.sessionID));
        pending.set(req.sessionID, renewal);
      }
      const user = await renewal;
      req.user = user;
      if (user) req.session.passport.user = user;
      else if (req.session.passport) delete req.session.passport.user;
      next();
    } catch (error) {
      if (error.sessionRevoked) {
        return req.logout(logoutError => {
          if (logoutError) return next(logoutError);
          next();
        });
      }
      const failure = describeAuthFailure(error);
      cooldown.record(failure);
      if (!error.cooldownSeconds) void Promise.resolve(authLogger(failure)).catch(() => {});
      const seconds = error.cooldownSeconds || cooldown.remainingSeconds();
      if (seconds) res.set('Retry-After', String(seconds));
      const status = seconds || failure.httpStatus === 429 ? 429 : 503;
      const message = seconds
        ? `Discord đang giới hạn yêu cầu. Phiên đăng nhập vẫn được giữ; hãy thử lại sau ít nhất ${seconds} giây.`
        : 'Chưa thể gia hạn kết nối Discord. Phiên đăng nhập vẫn được giữ, hãy thử lại sau.';
      if (req.path.startsWith('/api/')) return res.status(status).json({ error: message });
      res.status(status).render('error', { title: 'Kết nối Discord tạm gián đoạn', message,
        supportCode: seconds ? 'OAUTH_RATE_LIMITED' : failure.code, retryPath: req.path });
    }
  };
}
