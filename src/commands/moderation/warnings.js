const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/embed');
const store = require('../../utils/store');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription("View a member's warnings.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true)),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const list = store.warnings(interaction.guild.id, user.id);
    if (!list.length) return reply(interaction, `**${user.tag}** has no warnings.`);

    // Show the most recent 15 so the embed stays within Discord's limits.
    const lines = list
      .slice(-15)
      .map((w, i) => `**${list.length - Math.min(list.length, 15) + i + 1}.** ${w.reason} — <@${w.moderatorId}> <t:${Math.floor(w.at / 1000)}:R>`);

    return reply(interaction, lines.join('\n'), {
      title: `Warnings · ${user.tag}`,
      footer: `${list.length} total`,
      thumbnail: user.displayAvatarURL(),
    });
  },
};
