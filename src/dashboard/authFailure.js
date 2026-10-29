import { appendFile, mkdir } from 'node:fs/promises';

const knownCodes = new Set(['invalid_client', 'invalid_grant', 'access_denied', 'invalid_scope', 'invalid_request', 'server_error', 'temporarily_unavailable']);

export function describeAuthFailure(error, info, queryError) {
  let oauthCode = knownCodes.has(error?.code) ? error.code : undefined;
  if (!oauthCode && error?.oauthError?.data) {
    try {
      const code = JSON.parse(error.oauthError.data).error;
      if (knownCodes.has(code)) oauthCode = code;
    } catch { /* Không ghi raw response có thể chứa dữ liệu nhạy cảm. */ }
  }
  if (queryError === 'access_denied' || oauthCode === 'access_denied') {
    return { code: 'OAUTH_CANCELLED', message: 'Bạn đã hủy cấp quyền cho Hutao-Chan. Bấm Đăng nhập lại và chọn Ủy quyền để tiếp tục.' };
  }
  if (info?.message === 'Unable to verify authorization request state.') {
    return { code: 'OAUTH_SESSION_MISSING', message: 'Lượt đăng nhập trước không còn hiệu lực. Hãy quay về trang chủ, cho phép trình duyệt lưu cookie rồi bấm Đăng nhập Discord một lần nữa.' };
  }
  if (info?.message === 'Invalid authorization request state.') {
    return { code: 'OAUTH_STATE_MISMATCH', message: 'Liên kết đăng nhập đã được thay bằng một lượt đăng nhập mới. Đóng các tab đăng nhập cũ rồi bấm Đăng nhập lại tại trang chủ.' };
  }
  if (oauthCode === 'invalid_client') {
    return { code: 'OAUTH_CLIENT_REJECTED', message: 'Kết nối đăng nhập của Hutao-Chan hiện chưa sẵn sàng. Hãy báo cho người quản lý bot và thử lại sau.' };
  }
  if (oauthCode === 'invalid_grant') {
    return { code: 'OAUTH_CODE_REJECTED', message: 'Liên kết xác nhận đã hết hạn hoặc đã được dùng. Hãy bấm Đăng nhập lại để bắt đầu lượt mới.' };
  }
  if (error?.authStage === 'profile') {
    return { code: 'OAUTH_PROFILE_FAILED', message: 'Chưa lấy được hồ sơ của bạn từ Discord. Hãy thử đăng nhập lại sau ít phút.' };
  }
  return { code: 'OAUTH_EXCHANGE_FAILED', message: 'Chưa kết nối được với Discord để đăng nhập. Hãy thử lại sau ít phút. Nếu vẫn gặp lỗi, hãy báo cho người quản lý Hutao-Chan.' };
}

export async function logAuthFailure(failure) {
  // Chỉ ghi mã chẩn đoán cố định; không ghi token, secret, code, state, cookie hoặc URL callback.
  const entry = JSON.stringify({ at: new Date().toISOString(), code: failure.code }) + '\n';
  console.warn(`[OAuth] ${failure.code}`);
  try {
    await mkdir(new URL('../../logs/', import.meta.url), { recursive: true });
    await appendFile(new URL('../../logs/oauth.log', import.meta.url), entry);
  } catch { console.warn('[OAuth] Không ghi được nhật ký chẩn đoán.'); }
}
