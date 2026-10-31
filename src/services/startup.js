import { setTimeout as delay } from 'node:timers/promises';
import { getErrorDiagnostics } from '../utils/errors.js';

// Retry transient connection failures, never invalid credentials or configuration.
export async function retryStartup(task, {
  signal, label, sleep = delay, log = console.warn,
} = {}) {
  let backoff = 15000;
  while (!signal?.aborted) {
    try { return await task(); }
    catch (error) {
      const diagnostics = getErrorDiagnostics(error);
      const transient = diagnostics.networkCode || diagnostics.httpStatus === 429 ||
        diagnostics.httpStatus >= 500 || diagnostics.clientCode === 'ShardingReadyTimeout' ||
        error.name === 'MongooseServerSelectionError';
      if (!transient) throw error;
      const waitMs = Math.max(backoff, (diagnostics.retryAfterSeconds || 0) * 1000);
      log(`[Startup] ${label}: retry`, JSON.stringify({ ...diagnostics, retryAfterSeconds: waitMs / 1000 }));
      // Split long provider cooldowns to avoid overflowing Node's timer range.
      let remaining = waitMs;
      while (remaining > 0 && !signal?.aborted) {
        const chunk = Math.min(remaining, 60000);
        try { await sleep(chunk, undefined, { signal }); }
        catch (error) { if (signal?.aborted) return false; throw error; }
        remaining -= chunk;
      }
      backoff = Math.min(backoff * 2, 300000);
    }
  }
  return false;
}

// Registering commands can be queued by Discord. It must not delay voice tracking.
export function startReadyServices(client, {
  startVoice, registerCommands, syncGuilds, log = console.error,
}) {
  startVoice(client);
  return Promise.allSettled([
    Promise.resolve().then(() => registerCommands()),
    Promise.resolve().then(() => syncGuilds(client)),
  ]).then(results => {
    for (const [index, result] of results.entries()) {
      if (result.status === 'rejected') log('[Startup] BACKGROUND_FAILED', JSON.stringify({
        task: index === 0 ? 'commands' : 'roles', ...getErrorDiagnostics(result.reason),
      }));
    }
  });
}
