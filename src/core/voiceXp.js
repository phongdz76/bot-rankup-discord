import { ChannelType } from 'discord.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { awardXp, isExcluded } from '../services/xp.js';

let voiceInterval;
let running = false;
const eligibleSince = new Map();
const voiceTypes = [ChannelType.GuildVoice, ChannelType.GuildStageVoice];

export function eligibleVoiceMembers(channel, settings) {
  if (!voiceTypes.includes(channel.type) || channel.id === channel.guild.afkChannelId ||
      settings.excludedChannels.includes(channel.id)) return [];
  const eligible = [...channel.members.values()].filter(member =>
    !member.user.bot && !isExcluded(member, channel.id, settings) &&
    !member.voice.selfMute && !member.voice.selfDeaf &&
    !member.voice.serverMute && !member.voice.serverDeaf && !member.voice.suppress);
  return eligible.length >= settings.xpSettings.voice.minChannelMembers ? eligible : [];
}

function refreshChannel(channel, settings, now) {
  const eligible = new Set(eligibleVoiceMembers(channel, settings).map(member => member.id));
  for (const member of channel.members.values()) {
    const key = `${channel.guild.id}:${member.id}`;
    if (!eligible.has(member.id)) eligibleSince.delete(key);
    else if (eligibleSince.get(key)?.channelId !== channel.id) eligibleSince.set(key, { channelId: channel.id, since: now });
  }
}

export async function handleVoiceStateUpdate(oldState, newState) {
  const settings = await getGuildConfig(newState.guild.id);
  // Mọi thay đổi channel/mute đều bắt đầu lại phút hợp lệ của người thay đổi.
  eligibleSince.delete(`${newState.guild.id}:${newState.id}`);
  for (const channel of new Set([oldState.channel, newState.channel].filter(Boolean))) {
    refreshChannel(channel, settings, Date.now());
  }
}

export async function processAllVoiceChannels(client, now = Date.now()) {
  const seen = new Set();
  for (const guild of client.guilds.cache.values()) {
    const settings = await getGuildConfig(guild.id);
    for (const channel of guild.channels.cache.values()) {
      if (!voiceTypes.includes(channel.type)) continue;
      refreshChannel(channel, settings, now);
      for (const member of eligibleVoiceMembers(channel, settings)) {
        const key = `${guild.id}:${member.id}`;
        seen.add(key);
        const checkpoint = eligibleSince.get(key);
        if (checkpoint && now - checkpoint.since >= 60000) {
          await awardXp(member, settings, { source: 'voice', xp: settings.xpSettings.voice.rewardPerMinute, now: new Date(now) });
          checkpoint.since = now;
        }
      }
    }
  }
  for (const key of eligibleSince.keys()) if (!seen.has(key)) eligibleSince.delete(key);
}

export function startVoiceXpTracker(client) {
  stopVoiceXpTracker();
  const tick = async () => {
    if (running) return;
    running = true;
    try { await processAllVoiceChannels(client); }
    catch (error) { console.error('[VoiceXP]', error.message); }
    finally { running = false; }
  };
  void tick();
  voiceInterval = setInterval(tick, 60000);
}

export function stopVoiceXpTracker() {
  if (voiceInterval) clearInterval(voiceInterval);
  voiceInterval = null;
  eligibleSince.clear();
}
