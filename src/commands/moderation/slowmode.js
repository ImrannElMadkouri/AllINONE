const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/embed');
const { parseDuration, formatDuration } = require('../../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set slowmode for this channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false)
    .addStringOption((o) => o.setName('duration').setDescription('e.g. 5s, 1m, 2h — or "off"').setRequired(true)),

  async execute(interaction) {
    const input = interaction.options.getString('duration');
    const ms = input.toLowerCase() === 'off' ? 0 : parseDuration(input);
    if (ms === null) return reply(interaction, 'Invalid duration. Use something like `5s`, `1m` or `off`.');
    if (ms > 6 * 36e5) return reply(interaction, 'Slowmode can be at most 6 hours.');

    await interaction.channel.setRateLimitPerUser(Math.floor(ms / 1000), interaction.user.tag);
    return reply(interaction, ms ? `Slowmode set to **${formatDuration(ms)}**.` : 'Slowmode disabled.', { ephemeral: false });
  },
};
