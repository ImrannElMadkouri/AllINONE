const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/embed');

module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription("See everything Bunny can do."),

  async execute(interaction) {
    return reply(interaction, null, {
      title: 'Bunny',
      thumbnail: interaction.client.user.displayAvatarURL(),
      fields: [
        {
          name: 'Moderation',
          value: [
            '`/ban` `/unban` `/kick`',
            '`/timeout` `/untimeout`',
            '`/warn` `/warnings` `/clearwarnings`',
            '`/purge` `/lock` `/unlock` `/slowmode` `/nick`',
          ].join('\n'),
        },
        { name: 'AutoMod', value: '`/automod enable` `disable` `mode` `sensitivity` `exempt` `status`' },
        { name: 'Voice', value: 'Join the **Join to Create** channel to get your own voice channel.\n`/voice panel` resends your control panel.' },
        { name: 'Setup', value: '`/setup modlog` `/setup voice` `/setup voice-disable` `/setup view`' },
      ],
    });
  },
};
