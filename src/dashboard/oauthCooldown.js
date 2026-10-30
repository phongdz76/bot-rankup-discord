// Không tự thử lại authorization code (mã chỉ dùng một lần).
// Khi upstream không đưa Retry-After, 60 giây là khoảng nghỉ của ứng dụng,
// không phải cam kết thời điểm Discord gỡ giới hạn.
export function createOAuthCooldown({ now = Date.now, fallbackSeconds = 60 } = {}) {
  let retryAt = 0;
  return {
    record(failure) {
      if (failure.httpStatus !== 429) return;
      const seconds = Number.isFinite(failure.retryAfterSeconds) && failure.retryAfterSeconds >= 0
        ? failure.retryAfterSeconds : fallbackSeconds;
      retryAt = Math.max(retryAt, now() + seconds * 1000);
    },
    remainingSeconds() {
      return Math.max(0, Math.ceil((retryAt - now()) / 1000));
    },
  };
}
