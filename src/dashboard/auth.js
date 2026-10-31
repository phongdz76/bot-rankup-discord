import { Passport } from 'passport';
import { Strategy as OAuth2Strategy } from 'passport-oauth2';
import { rateLimit } from 'express-rate-limit';
import { csrfProtection } from './middleware/auth.js';
import { describeAuthFailure, logAuthFailure } from './authFailure.js';
import { createOAuthCooldown } from './oauthCooldown.js';
import { createSessionRenewal, tokenExpiresAt } from './sessionRenewal.js';

export function configureAuth(app, settings, api, authLogger = logAuthFailure) {
  const cooldown = createOAuthCooldown();
  const passport = new Passport();
  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user, done) => done(null, user));
  passport.use('discord', new OAuth2Strategy({
    authorizationURL: 'https://discord.com/oauth2/authorize',
    tokenURL: 'https://discord.com/api/oauth2/token',
    clientID: settings.clientId, clientSecret: settings.dashboard.clientSecret,
    callbackURL: settings.dashboard.callbackUrl, scope: ['identify', 'guilds'], state: true,
  }, async (accessToken, refreshToken, params, profile, done) => {
    try {
      const user = await api('/users/@me', accessToken);
      // Token chỉ nằm trong session Mongo đã mã hóa, không gửi về trình duyệt.
      done(null, { id: user.id, username: user.global_name || user.username,
        avatar: user.avatar, accessToken, refreshToken, expiresAt: tokenExpiresAt(params.expires_in) });
    } catch (error) { error.authStage = 'profile'; done(error); }
  }));
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(createSessionRenewal({ settings, cooldown, authLogger }));
  const limiter = rateLimit({ windowMs: 60000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });
  const waitForDiscord = (req, res, next) => {
    const seconds = cooldown.remainingSeconds();
    if (!seconds) return next();
    res.set('Retry-After', String(seconds));
    return res.status(429).render('error', {
      title: 'Đăng nhập tạm gián đoạn', supportCode: 'OAUTH_RATE_LIMITED',
      message: `Máy chủ đang tạm nghỉ sau khi Discord giới hạn yêu cầu. Hãy thử lại sau ít nhất ${seconds} giây.`,
    });
  };
  app.get('/auth/discord', (req, res, next) => {
    if (req.isAuthenticated() && req.user?.expiresAt > Date.now()) return res.redirect('/servers');
    next();
  }, limiter, waitForDiscord, passport.authenticate('discord'));
  app.get('/auth/discord/callback', limiter, waitForDiscord, (req, res, next) => {
    passport.authenticate('discord', (error, user, info) => {
      if (error || !user) {
        const failure = describeAuthFailure(error, info, req.query.error);
        cooldown.record(failure);
        void Promise.resolve(authLogger(failure)).catch(() => {});
        const seconds = cooldown.remainingSeconds();
        if (seconds) res.set('Retry-After', String(seconds));
        return res.status(failure.httpStatus === 429 ? 429 : 401).render('error', {
          title: 'Đăng nhập chưa thành công', message: failure.message, supportCode: failure.code,
        });
      }
      // Passport 0.6+ tái tạo session khi logIn, chống cố định phiên.
      req.logIn(user, error => {
        if (error) return next(error);
        req.session.save(error => error ? next(error) : res.redirect('/servers'));
      });
    })(req, res, next);
  });
  app.post('/auth/logout', csrfProtection, (req, res, next) => {
    req.logout(error => {
      if (error) return next(error);
      req.session.destroy(error => {
        if (error) return next(error);
        res.clearCookie('hutao.sid'); res.redirect('/');
      });
    });
  });
}
