const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { reply } = require('../../utils/embed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Let @everyone send messages in a channel again.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false)
    .addChannelOption((o) => o.setName('channel').setDescription('Defaults to this channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    // null resets the overwrite to inherit from the category instead of forcing "allow".
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null }, { reason: interaction.user.tag });
    return reply(interaction, `${channel} has been unlocked.`, { ephemeral: false });
  },
};
