const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/embed');
const { log } = require('../../utils/moderation');
const store = require('../../utils/store');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clearwarnings')
    .setDescription("Clear all of a member's warnings.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true)),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const cleared = store.clearWarnings(interaction.guild.id, user.id);
    if (!cleared) return reply(interaction, `**${user.tag}** has no warnings.`);

    await log(interaction.guild, {
      action: 'Clear warnings',
      target: user,
      moderator: interaction.user,
      reason: `Cleared ${cleared} warning${cleared === 1 ? '' : 's'}`,
    });
    return reply(interaction, `Cleared **${cleared}** warning${cleared === 1 ? '' : 's'} from **${user.tag}**.`, { ephemeral: false });
  },
};
