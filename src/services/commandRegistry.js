import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { Routes } from 'discord.js';
import { CommandRegistry } from '../models/CommandRegistry.js';

export async function registerCommandsOnce(rest, applicationId, body, { force = false } = {}) {
  const fingerprint = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const persistent = mongoose.connection.readyState === 1;
  if (persistent && !force) {
    const saved = await CommandRegistry.findOne({ applicationId }).lean();
    if (saved?.fingerprint === fingerprint && Array.isArray(saved.commands) && saved.commands.length === body.length &&
      saved.commands.every(command => /^\d{17,20}$/.test(command.id))) {
      return { commands: saved.commands, cached: true };
    }
  }
  const commands = await rest.put(Routes.applicationCommands(applicationId), { body });
  if (persistent) {
    await CommandRegistry.updateOne({ applicationId }, { $set: { fingerprint,
      commands: commands.map(({ id, name, type }) => ({ id, name, type })) } }, { upsert: true });
  }
  return { commands, cached: false };
}
