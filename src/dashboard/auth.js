import { Passport } from 'passport';
import { Strategy as OAuth2Strategy } from 'passport-oauth2';
import { rateLimit } from 'express-rate-limit';
import { csrfProtection } from './middleware/auth.js';
import { describeAuthFailure, logAuthFailure } from './authFailure.js';

export function configureAuth(app, settings, api, authLogger = logAuthFailure) {
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
      // Chỉ lưu thông tin cần thiết và access token trong session Mongo đã mã hóa.
      done(null, { id: user.id, username: user.global_name || user.username,
        avatar: user.avatar, accessToken, expiresAt: Date.now() + Math.min(Number(params.expires_in) || 3600, 86400) * 1000 });
    } catch (error) { error.authStage = 'profile'; done(error); }
  }));
  app.use(passport.initialize());
  app.use(passport.session());
  const limiter = rateLimit({ windowMs: 60000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });
  app.get('/auth/discord', limiter, passport.authenticate('discord'));
  app.get('/auth/discord/callback', limiter, (req, res, next) => {
    passport.authenticate('discord', (error, user, info) => {
      if (error || !user) {
        const failure = describeAuthFailure(error, info, req.query.error);
        void Promise.resolve(authLogger(failure)).catch(() => {});
        return res.status(401).render('error', {
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
