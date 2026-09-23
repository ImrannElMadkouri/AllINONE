const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  MessageFlags,
  OverwriteType,
} = require('discord.js');
const store = require('../utils/store');
const { embed, reply } = require('../utils/embed');
const manager = require('./manager');
const { state } = require('./panel');

// Discord only allows 2 renames per channel every 10 minutes. Track it ourselves so the
// interaction fails fast instead of silently waiting on the rate limit.
const RENAME_WINDOW = 10 * 60_000;
const renames = new Map();

function modal(id, title, label, { placeholder, value, max = 100 } = {}) {
  const input = new TextInputBuilder()
    .setCustomId('value')
    .setLabel(label)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(max);
  if (placeholder) input.setPlaceholder(placeholder);
  if (value) input.setValue(String(value));
  return new ModalBuilder().setCustomId(`vcmodal:${id}`).setTitle(title).addComponents(new ActionRowBuilder().addComponents(input));
}

function userSelect(id, placeholder, max = 10) {
  return [
    new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder().setCustomId(`vcselect:${id}`).setPlaceholder(placeholder).setMinValues(1).setMaxValues(max),
    ),
  ];
}

/** Resolve the temp channel this interaction belongs to and check the user may control it. */
function resolve(interaction, { ownerOnly = true } = {}) {
  const t = store.temp.get(interaction.channelId);
  const channel = interaction.guild.channels.cache.get(interaction.channelId);
  if (!t || !channel) return { error: 'This channel is no longer managed by Bunny.' };
  if (ownerOnly && t.ownerId !== interaction.user.id) {
    return { error: `Only the channel owner <@${t.ownerId}> can do that.` };
  }
  return { t, channel };
}

async function handleButton(interaction) {
  const action = interaction.customId.split(':')[1];
  const { t, channel, error } = resolve(interaction, { ownerOnly: !['claim', 'info'].includes(action) });
  if (error) return reply(interaction, error);

  const everyone = interaction.guild.id;

  switch (action) {
    case 'lock':
      await channel.permissionOverwrites.edit(everyone, { Connect: false });
      await manager.refreshPanel(channel);
      return reply(interaction, 'Channel locked. Only permitted users can join.');

    case 'unlock':
      await channel.permissionOverwrites.edit(everyone, { Connect: null });
      await manager.refreshPanel(channel);
      return reply(interaction, 'Channel unlocked.');

    case 'hide':
      await channel.permissionOverwrites.edit(everyone, { ViewChannel: false });
      await manager.refreshPanel(channel);
      return reply(interaction, 'Channel hidden. Only permitted users can see it.');

    case 'unhide':
      await channel.permissionOverwrites.edit(everyone, { ViewChannel: null });
      await manager.refreshPanel(channel);
      return reply(interaction, 'Channel visible again.');

    case 'rename':
      return interaction.showModal(modal('rename', 'Rename channel', 'New name', { value: channel.name }));

    case 'limit':
      return interaction.showModal(modal('limit', 'User limit', 'Limit (0–99, 0 = no limit)', { value: channel.userLimit, max: 2 }));

    case 'bitrate': {
      const max = interaction.guild.maximumBitrate / 1000;
      return interaction.showModal(modal('bitrate', 'Bitrate', `Bitrate in kbps (8–${max})`, { value: channel.bitrate / 1000, max: 3 }));
    }

    case 'permit':
      return reply(interaction, 'Pick who can join and see your channel.', { components: userSelect('permit', 'Select users to permit') });

    case 'reject':
      return reply(interaction, 'Pick who to block. They will be disconnected if they are in the channel.', {
        components: userSelect('reject', 'Select users to reject'),
      });

    case 'transfer':
      return reply(interaction, 'Pick the new owner. They must be in the channel.', { components: userSelect('transfer', 'Select new owner', 1) });

    case 'claim': {
      if (t.ownerId === interaction.user.id) return reply(interaction, 'You already own this channel.');
      if (channel.members.has(t.ownerId)) return reply(interaction, `<@${t.ownerId}> is still in the channel.`);
      if (!channel.members.has(interaction.user.id)) return reply(interaction, 'You need to be in the channel to claim it.');
      await manager.setOwner(channel, interaction.member);
      return reply(interaction, `${interaction.user} now owns this channel.`, { ephemeral: false });
    }

    case 'info': {
      const { locked, hidden } = state(channel);
      const permitted = channel.permissionOverwrites.cache
        .filter((o) => o.type === OverwriteType.Member && o.id !== t.ownerId && o.id !== interaction.client.user.id && o.allow.has('Connect'))
        .map((o) => `<@${o.id}>`);
      const rejected = channel.permissionOverwrites.cache
        .filter((o) => o.type === OverwriteType.Member && o.deny.has('Connect'))
        .map((o) => `<@${o.id}>`);
      return reply(interaction, null, {
        title: channel.name,
        fields: [
          { name: 'Owner', value: `<@${t.ownerId}>`, inline: true },
          { name: 'Created', value: `<t:${Math.floor(t.createdAt / 1000)}:R>`, inline: true },
          { name: 'Members', value: `${channel.members.size}${channel.userLimit ? ` / ${channel.userLimit}` : ''}`, inline: true },
          { name: 'Status', value: `${locked ? 'Locked' : 'Open'} · ${hidden ? 'Hidden' : 'Visible'}`, inline: true },
          { name: 'Bitrate', value: `${channel.bitrate / 1000} kbps`, inline: true },
          { name: 'Permitted', value: permitted.join(' ') || 'None' },
          { name: 'Rejected', value: rejected.join(' ') || 'None' },
        ],
      });
    }

    case 'delete':
      await reply(interaction, 'Deleting channel…');
      return manager.remove(channel);
  }
}

async function handleModal(interaction) {
  const action = interaction.customId.split(':')[1];
  const { channel, error } = resolve(interaction);
  if (error) return reply(interaction, error);
  const value = interaction.fields.getTextInputValue('value').trim();

  switch (action) {
    case 'rename': {
      const recent = (renames.get(channel.id) ?? []).filter((at) => Date.now() - at < RENAME_WINDOW);
      if (recent.length >= 2) {
        const retry = Math.ceil((recent[0] + RENAME_WINDOW) / 1000);
        return reply(interaction, `Discord only allows 2 renames every 10 minutes. Try again <t:${retry}:R>.`);
      }
      if (!value) return reply(interaction, 'Name cannot be empty.');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await channel.setName(value.slice(0, 100));
      renames.set(channel.id, [...recent, Date.now()]);
      return interaction.editReply({ embeds: [embed(`Channel renamed to **${channel.name}**.`)] });
    }

    case 'limit': {
      const limit = Number(value);
      if (!Number.isInteger(limit) || limit < 0 || limit > 99) return reply(interaction, 'Limit must be a whole number from 0 to 99.');
      await channel.setUserLimit(limit);
      await manager.refreshPanel(channel);
      return reply(interaction, limit ? `User limit set to **${limit}**.` : 'User limit removed.');
    }

    case 'bitrate': {
      const kbps = Number(value);
      const max = interaction.guild.maximumBitrate / 1000;
      if (!Number.isInteger(kbps) || kbps < 8 || kbps > max) return reply(interaction, `Bitrate must be a whole number from 8 to ${max}.`);
      await channel.setBitrate(kbps * 1000);
      return reply(interaction, `Bitrate set to **${kbps} kbps**.`);
    }
  }
}

async function handleSelect(interaction) {
  const action = interaction.customId.split(':')[1];
  const { t, channel, error } = resolve(interaction);
  if (error) return interaction.update({ embeds: [embed(error)], components: [] });

  const members = interaction.values.filter((id) => id !== t.ownerId && id !== interaction.client.user.id);
  const done = (text) => interaction.update({ embeds: [embed(text)], components: [] });

  switch (action) {
    case 'permit': {
      if (!members.length) return done('No valid users selected.');
      for (const id of members) await channel.permissionOverwrites.edit(id, { ViewChannel: true, Connect: true });
      return done(`Permitted ${members.map((id) => `<@${id}>`).join(', ')}.`);
    }

    case 'reject': {
      if (!members.length) return done('No valid users selected.');
      for (const id of members) {
        await channel.permissionOverwrites.edit(id, { Connect: false });
        const inChannel = channel.members.get(id);
        if (inChannel) await inChannel.voice.disconnect('Rejected by channel owner').catch(() => null);
      }
      return done(`Rejected ${members.map((id) => `<@${id}>`).join(', ')}.`);
    }

    case 'transfer': {
      const target = channel.members.get(members[0]);
      if (!target || target.user.bot) return done('The new owner must be a person in your channel.');
      await manager.setOwner(channel, target);
      await channel.send({ embeds: [embed(`Ownership transferred to ${target}.`)] }).catch(() => null);
      return done(`${target} now owns this channel.`);
    }
  }
}

module.exports = { handleButton, handleModal, handleSelect };
