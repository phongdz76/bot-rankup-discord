const networkCodes = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN',
  'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET',
]);
const clientCodes = new Set(['TokenInvalid', 'DisallowedIntents', 'UsedDisallowedIntents', 'ShardingReadyTimeout']);

// Chỉ lấy trạng thái và mã cố định; tuyệt đối không lấy message, URL, body hoặc headers.
export function getErrorDiagnostics(error) {
  const diagnostics = {};
  const pending = [error];
  const seen = new Set();
  while (pending.length && seen.size < 12) {
    const current = pending.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    const status = current.httpStatus ?? current.statusCode ?? current.status;
    if (!diagnostics.httpStatus && Number.isInteger(status) && status >= 100 && status <= 599) diagnostics.httpStatus = status;
    const networkCode = current.networkCode ?? current.code;
    if (!diagnostics.networkCode && networkCodes.has(networkCode)) diagnostics.networkCode = networkCode;
    const clientCode = current.clientCode ?? current.code;
    if (!diagnostics.clientCode && clientCodes.has(clientCode)) diagnostics.clientCode = clientCode;
    const discordCode = current.discordCode ?? current.code;
    if (!diagnostics.discordCode && Number.isSafeInteger(discordCode) && discordCode > 0 && discordCode <= 1000000) diagnostics.discordCode = discordCode;
    pending.push(current.oauthError, current.cause);
    if (Array.isArray(current.errors)) pending.push(...current.errors.slice(0, 12));
  }
  return diagnostics;
}
