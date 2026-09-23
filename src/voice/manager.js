const { ChannelType, PermissionFlagsBits, OverwriteType } = require('discord.js');
const store = require('../utils/store');
const config = require('../config');
const { components, panelEmbed } = require('./panel');

// What the owner of a temp channel is allowed to do directly in Discord.
const OWNER_ALLOW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
  PermissionFlagsBits.Stream,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.MoveMembers,
];

// What Bunny needs inside each temp channel to run the dashboard.
const BOT_ALLOW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.MoveMembers,
];

const CREATE_COOLDOWN = 10_000;
const lastCreate = new Map();

/** The temp channel a user currently owns in a guild, if any. */
function ownedChannel(guild, userId) {
  for (const [channelId, t] of store.temp.all()) {
    if (t.guildId === guild.id && t.ownerId === userId && guild.channels.cache.has(channelId)) {
      return guild.channels.cache.get(channelId);
    }
  }
  return null;
}

async function create(member, settings) {
  const { guild } = member;

  // Already own one? Just move them back into it instead of creating a second.
  const existing = ownedChannel(guild, member.id);
  if (existing) return member.voice.setChannel(existing).catch(() => null);

  const now = Date.now();
  if (now - (lastCreate.get(member.id) ?? 0) < CREATE_COOLDOWN) {
    return member.voice.disconnect('Join-to-create cooldown').catch(() => null);
  }
  lastCreate.set(member.id, now);

  const category = guild.channels.cache.get(settings.categoryId);
  const hub = guild.channels.cache.get(settings.hubId);

  // Start from the category's permissions so server-wide rules (muted roles etc.) still apply.
  const inherited = (category ?? hub)?.permissionOverwrites.cache.map((o) => ({
    id: o.id,
    type: o.type,
    allow: o.allow.bitfield,
    deny: o.deny.bitfield,
  })) ?? [];

  const channel = await guild.channels.create({
    name: config.voiceNameTemplate.replace('{user}', member.displayName).slice(0, 100),
    type: ChannelType.GuildVoice,
    parent: category?.id ?? hub?.parentId ?? null,
    bitrate: hub?.bitrate,
    permissionOverwrites: [
      ...inherited.filter((o) => o.id !== member.id && o.id !== guild.members.me.id),
      { id: member.id, type: OverwriteType.Member, allow: OWNER_ALLOW },
      { id: guild.members.me.id, type: OverwriteType.Member, allow: BOT_ALLOW },
    ],
    reason: `Join-to-create for ${member.user.tag}`,
  });

  store.temp.set(channel.id, { guildId: guild.id, ownerId: member.id, createdAt: now });

  const moved = await member.voice.setChannel(channel).catch(() => null);
  if (!moved) {
    // They left before we could move them — don't leave an empty channel behind.
    return remove(channel);
  }

  const panel = await channel
    .send({
      content: `${member}`,
      embeds: [panelEmbed(channel, member.id)],
      components: components(),
      allowedMentions: { users: [member.id] },
    })
    .catch(() => null);
  if (panel) store.temp.update(channel.id, { panelMessageId: panel.id });
}

async function remove(channel) {
  store.temp.delete(channel.id);
  await channel.delete('Temporary voice channel empty').catch(() => null);
}

/** Re-render the dashboard after a change. */
async function refreshPanel(channel) {
  const t = store.temp.get(channel.id);
  if (!t?.panelMessageId) return;
  const message = await channel.messages.fetch(t.panelMessageId).catch(() => null);
  await message?.edit({ embeds: [panelEmbed(channel, t.ownerId)], components: components() }).catch(() => null);
}

/** Give ownership to `member`, moving the owner-only overwrite across. */
async function setOwner(channel, member) {
  const t = store.temp.get(channel.id);
  if (t.ownerId !== member.id) {
    await channel.permissionOverwrites.edit(t.ownerId, { MoveMembers: null }).catch(() => null);
  }
  const allow = Object.fromEntries(
    Object.entries(PermissionFlagsBits)
      .filter(([, bit]) => OWNER_ALLOW.includes(bit))
      .map(([name]) => [name, true]),
  );
  await channel.permissionOverwrites.edit(member.id, allow);
  store.temp.update(channel.id, { ownerId: member.id });
  await refreshPanel(channel);
}

/** On startup, drop channels that were deleted or emptied while the bot was offline. */
async function sweep(client) {
  for (const [channelId, t] of store.temp.all()) {
    const guild = client.guilds.cache.get(t.guildId);
    const channel = guild?.channels.cache.get(channelId);
    if (!channel) store.temp.delete(channelId);
    else if (channel.members.size === 0) await remove(channel);
  }
}

module.exports = { create, remove, refreshPanel, setOwner, sweep, ownedChannel };
