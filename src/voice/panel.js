const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { embed } = require('../utils/embed');

const button = (id, label, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(`vc:${id}`).setLabel(label).setStyle(style);

function components() {
  return [
    new ActionRowBuilder().addComponents(button('lock', 'Lock'), button('unlock', 'Unlock'), button('hide', 'Hide'), button('unhide', 'Unhide')),
    new ActionRowBuilder().addComponents(button('rename', 'Rename'), button('limit', 'Limit'), button('bitrate', 'Bitrate')),
    new ActionRowBuilder().addComponents(button('permit', 'Permit'), button('reject', 'Reject'), button('transfer', 'Transfer'), button('claim', 'Claim')),
    new ActionRowBuilder().addComponents(button('info', 'Info'), button('delete', 'Delete', ButtonStyle.Danger)),
  ];
}

/** Read the channel's current state straight from its permission overwrites, so the panel is never out of sync. */
function state(channel) {
  const everyone = channel.permissionOverwrites.cache.get(channel.guild.id);
  return {
    locked: everyone?.deny.has(PermissionFlagsBits.Connect) ?? false,
    hidden: everyone?.deny.has(PermissionFlagsBits.ViewChannel) ?? false,
  };
}

function panelEmbed(channel, ownerId) {
  const { locked, hidden } = state(channel);
  return embed(
    [
      `Welcome to your channel, <@${ownerId}>. Use the buttons below to manage it.`,
      '',
      '**Lock / Unlock** — control who can join',
      '**Hide / Unhide** — control who can see it',
      '**Rename · Limit · Bitrate** — change channel settings',
      '**Permit / Reject** — allow or block specific users',
      '**Transfer** — hand ownership to someone else',
      '**Claim** — take over if the owner has left',
    ].join('\n'),
    {
      title: 'Voice controls',
      fields: [
        { name: 'Owner', value: `<@${ownerId}>`, inline: true },
        { name: 'Status', value: `${locked ? 'Locked' : 'Open'} · ${hidden ? 'Hidden' : 'Visible'}`, inline: true },
        { name: 'Limit', value: channel.userLimit ? `${channel.userLimit}` : 'None', inline: true },
      ],
    },
  );
}

module.exports = { components, panelEmbed, state };
