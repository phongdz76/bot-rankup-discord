import { client, registerSlashCommands } from '../src/services/discord.js';

try {
  const commands = await registerSlashCommands();
  if (!commands) process.exitCode = 1;
  else console.table(commands.map(command => ({
    command: `/${command.name}`, id: command.id,
    installs: command.integration_types.join(', '), contexts: command.contexts.join(', '),
  })));
} catch (error) {
  console.error('[Commands]', error.message);
  process.exitCode = 1;
} finally {
  await client.destroy();
}
