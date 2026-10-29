import { createHmac } from 'node:crypto';
import MongoStore from 'connect-mongo';

export function getSessionEncryptionSecret(sessionSecret) {
  // kruptein yêu cầu đủ nhóm ký tự, kể cả với khóa hex ngẫu nhiên có entropy cao.
  // Dẫn xuất khóa riêng có nhãn cố định; tiền tố chỉ đáp ứng quy tắc định dạng.
  // Độ bí mật vẫn đến từ SESSION_SECRET, không phải tiền tố công khai.
  return 'Aa1!Bb2@' + createHmac('sha256', sessionSecret)
    .update('hutao-chan/mongo-session-encryption/v1').digest('base64url');
}

export function createSessionStore(settings, collectionName = 'dashboard_sessions') {
  // connect-mongo 6 cố định phiên bản crypto tương thích với định dạng session.
  return MongoStore.create({
    mongoUrl: settings.mongoUri, collectionName, ttl: 86400,
    crypto: { secret: getSessionEncryptionSecret(settings.dashboard.sessionSecret) },
  });
}
