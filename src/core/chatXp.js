import { getGuildConfig } from '../services/guildConfig.js';
import { awardXp, isExcluded } from '../services/xp.js';

export async function handleChatMessage(message) {
  if (!message.guild || message.author.bot || message.system) return;
  try {
    const settings = await getGuildConfig(message.guild.id);
    const member = message.member || await message.guild.members.fetch(message.author.id);
    if (isExcluded(member, message.channelId, settings)) return;
    const { min, max } = settings.xpSettings.chat;
    const xp = Math.floor(Math.random() * (max - min + 1)) + min;
    await awardXp(member, settings, { source: 'chat', xp, channel: message.channel });
  } catch (error) {
    console.error('[ChatXP]', error.message);
  }
}
