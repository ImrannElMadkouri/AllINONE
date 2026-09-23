const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { reply } = require('../../utils/embed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Stop @everyone from sending messages in a channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false)
    .addChannelOption((o) => o.setName('channel').setDescription('Defaults to this channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setMaxLength(500)),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false }, { reason: `${interaction.user.tag}: ${reason}` });
    return reply(interaction, `${channel} has been locked.\n**Reason:** ${reason}`, { ephemeral: false });
  },
};
