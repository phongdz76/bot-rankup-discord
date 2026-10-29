import { EmbedBuilder, escapeMarkdown } from 'discord.js';
import { config } from '../config/index.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { ensureUser } from '../services/xp.js';
import { syncUserRoles } from './level.js';

export function renderMemberMessage(template, member) {
  const variables = {
    user: `<@${member.id}>`, username: escapeMarkdown(member.displayName || member.user.username),
    server: escapeMarkdown(member.guild.name), memberCount: String(member.guild.memberCount),
  };
  return template.replace(/\{(user|username|server|memberCount)\}/g, (_, key) => variables[key]).slice(0, 2000);
}

export async function handleMemberEvent(member, type) {
  if (member.user.bot) return;
  const settings = await getGuildConfig(member.guild.id);
  if (type === 'welcome') {
    const user = await ensureUser(member, settings);
    await syncUserRoles(member, user.level, settings);
  }
  const message = settings[type];
  if (!message.enabled || !message.channelId) return;
  const channel = await member.guild.channels.fetch(message.channelId).catch(() => null);
  if (!channel?.isTextBased() || !channel.send) return;
  const content = renderMemberMessage(message.message, member);
  const payload = message.useEmbed ? {
    embeds: [new EmbedBuilder().setColor(config.theme.color).setDescription(content)
      .setThumbnail(member.user.displayAvatarURL()).setFooter({ text: config.theme.footerText }).setTimestamp()],
  } : { content };
  await channel.send({ ...payload, allowedMentions: { parse: [], users: type === 'welcome' ? [member.id] : [] } });
}
