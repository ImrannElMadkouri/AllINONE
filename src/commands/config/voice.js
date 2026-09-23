const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/embed');
const { components, panelEmbed } = require('../../voice/panel');
const manager = require('../../voice/manager');
const store = require('../../utils/store');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('voice')
    .setDescription('Your join-to-create channel.')
    .setDMPermission(false)
    .addSubcommand((s) => s.setName('panel').setDescription("Resend your channel's control panel.")),

  async execute(interaction) {
    const channel = manager.ownedChannel(interaction.guild, interaction.user.id);
    if (!channel) return reply(interaction, "You don't own a temporary voice channel right now.");

    const panel = await channel.send({ embeds: [panelEmbed(channel, interaction.user.id)], components: components() });
    store.temp.update(channel.id, { panelMessageId: panel.id });
    return reply(interaction, `Control panel sent in ${channel}.`);
  },
};
