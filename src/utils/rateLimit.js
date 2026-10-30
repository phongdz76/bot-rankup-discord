const scopes = new Set(['user', 'global', 'shared']);

// Chỉ giữ metadata của giới hạn; không đưa body, cookie, token hoặc URL vào log.
export function getRateLimitDiagnostics(input = {}, now = Date.now()) {
  const result = {};
  const header = name => typeof input.headers?.get === 'function'
    ? input.headers.get(name) : input.headers?.[name];
  let payload;
  if (typeof input.data === 'string' && input.data.length <= 262144) {
    try { payload = JSON.parse(input.data); } catch { /* Có thể là trang HTML của edge. */ }
  }
  const retry = header('retry-after');
  let seconds = input.retryAfterSeconds ?? payload?.retry_after;
  if (typeof retry === 'string' && retry.trim()) {
    if (/^\d+(?:\.\d+)?$/.test(retry.trim())) seconds = Number(retry);
    else if (/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), /i.test(retry)) {
      const retryAt = Date.parse(retry);
      if (Number.isFinite(retryAt)) seconds = Math.max(0, (retryAt - now) / 1000);
    }
  }
  if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0) result.retryAfterSeconds = seconds;
  const scope = header('x-ratelimit-scope') ?? input.scope;
  if (scopes.has(scope)) result.scope = scope;
  const global = header('x-ratelimit-global') === 'true' ? true : input.global ?? payload?.global;
  if (typeof global === 'boolean') result.global = global;
  const contentType = header('content-type') || '';
  if (contentType.includes('application/json') || input.responseFormat === 'json' || payload) result.responseFormat = 'json';
  else if (contentType.includes('text/html') || input.responseFormat === 'html') result.responseFormat = 'html';
  const ray = header('cf-ray') ?? input.cfRay;
  if (typeof ray === 'string' && /^[a-f0-9]{16,32}-[a-z]{3}$/i.test(ray)) result.cfRay = ray;
  // Cloudflare 1015 xác nhận giới hạn tại edge. Không suy ra điều này chỉ từ HTTP 429.
  if (input.cloudflareError === 1015 || (typeof input.data === 'string' &&
      /cloudflare/i.test(input.data.slice(0, 262144)) && /(?:error\s*(?:code\s*)?[:\s]*1015|1015\s*[:\s]*error)/i.test(input.data.slice(0, 262144)))) {
    result.cloudflareError = 1015;
  }
  return result;
}
