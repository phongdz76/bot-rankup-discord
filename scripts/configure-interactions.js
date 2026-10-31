import { config } from '../src/config/index.js';
import { getErrorDiagnostics } from '../src/utils/errors.js';

// Run after deploying and setting DISCORD_PUBLIC_KEY on the host. This changes
// only the interaction delivery URL; it does not register commands or send messages.
async function main() {
  const disable = process.argv.includes('--disable');
  const endpoint = process.argv.find(value => value.startsWith('--endpoint='))?.slice('--endpoint='.length);
  if (!config.token || !config.clientId) throw new Error('Missing bot token or application ID');
  if (!disable && (!endpoint || new URL(endpoint).protocol !== 'https:')) throw new Error('Provide --endpoint=https://your-host/discord/interactions');
  const headers = { Authorization: `Bot ${config.token}`, 'Content-Type': 'application/json' };
  const metadata = await fetch('https://discord.com/api/v10/applications/@me', { headers, signal: AbortSignal.timeout(15000) });
  if (!metadata.ok) throw Object.assign(new Error('Cannot verify application identity'), { status: metadata.status });
  const current = await metadata.json();
  if (current.id !== config.clientId) throw new Error('Bot token and application ID do not match');
  if (!disable) {
    const probe = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"type":1}', signal: AbortSignal.timeout(15000) });
    if (probe.status !== 401) throw new Error('Endpoint must reject unsigned requests with HTTP 401 before activation');
  }
  const response = await fetch('https://discord.com/api/v10/applications/@me', {
    method: 'PATCH', headers, body: JSON.stringify({ interactions_endpoint_url: disable ? '' : endpoint }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw Object.assign(new Error('Discord rejected endpoint configuration'), { status: response.status });
  const updated = await response.json();
  if (disable ? Boolean(updated.interactions_endpoint_url) : updated.interactions_endpoint_url !== endpoint) {
    throw new Error('Discord did not confirm the expected delivery URL');
  }
  console.log(disable ? 'Slash command delivery restored to Gateway.' : 'Discord validated and enabled HTTP slash command delivery.');
}

main().catch(error => {
  console.error('[Interactions configuration]', error.message, JSON.stringify(getErrorDiagnostics(error)));
  process.exitCode = 1;
});
