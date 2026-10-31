import { RESTEvents } from 'discord.js';
import { getRateLimitDiagnostics } from '../utils/rateLimit.js';

// Only fixed categories leave this module. SDK paths/options can contain tokens.
function category(path = '') {
  if (path.startsWith('/interactions/')) return 'interaction';
  if (path.startsWith('/webhooks/')) return 'webhook';
  if (path.startsWith('/guilds/')) return 'guild';
  if (path.startsWith('/channels/')) return 'channel';
  if (path.startsWith('/applications/')) return 'application';
  return 'other';
}

export function attachDiscordHttpDiagnostics(rest, { now = Date.now, log = console.warn } = {}) {
  let minute = Math.floor(now() / 60000);
  let counts = {};
  let interactionResponse = null;

  const flush = () => {
    const current = Math.floor(now() / 60000);
    if (current === minute) return;
    if (Object.keys(counts).length) log('[Discord REST] REQUEST_SUMMARY', JSON.stringify({
      minute: new Date(minute * 60000).toISOString(), counts,
    }));
    minute = current;
    counts = {};
  };

  rest.on(RESTEvents.Response, (request, response) => {
    flush();
    const operation = category(request.path);
    const outcome = response.status < 400 ? 'ok' : String(response.status);
    const key = `${operation}:${outcome}`;
    counts[key] = (counts[key] || 0) + 1;
    const diagnostics = response.status === 429 ? getRateLimitDiagnostics(response) : {};
    if (operation === 'interaction') interactionResponse = {
      httpStatus: response.status, at: new Date(now()).toISOString(),
      ...(diagnostics.retryAfterSeconds !== undefined ? {
        retryAt: new Date(now() + diagnostics.retryAfterSeconds * 1000).toISOString(),
      } : {}),
    };

    if (response.status < 400) {
      // discord.js supplies a cloned response for this event. Release its body.
      void response.body?.cancel?.().catch(() => {});
      return;
    }
    // Read the SDK's clone, leaving its original body available for error handling.
    // Bound diagnostic reads even if the provider returns a large HTML document.
    void (async () => {
      let data = '';
      const reader = response.body?.getReader?.();
      if (reader) {
        try {
          const decoder = new TextDecoder();
          let bytes = 0;
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > 262144) break;
            data += decoder.decode(value, { stream: true });
          }
        } catch { /* Headers still provide useful diagnostics. */ }
        finally { void reader.cancel().catch(() => {}); }
      }
      log('[Discord REST] HTTP_ERROR', JSON.stringify({
        operation, httpStatus: response.status,
        ...(response.status === 429 ? getRateLimitDiagnostics({ headers: response.headers, data }) : {}),
      }));
    })().catch(() => {});
  });
  rest.on(RESTEvents.RateLimited, info => {
    log('[Discord REST] RATE_LIMITED', JSON.stringify({ global: info.global, retryAfterMs: info.retryAfter }));
  });

  return {
    flush,
    snapshot() {
      const limited = interactionResponse?.httpStatus === 429;
      const waiting = limited && Date.parse(interactionResponse.retryAt) > now();
      return {
        interactions: waiting ? 'rate_limited' : interactionResponse?.httpStatus < 400 ? 'available' : 'unverified',
        lastInteractionResponse: interactionResponse && { ...interactionResponse },
      };
    },
  };
}
