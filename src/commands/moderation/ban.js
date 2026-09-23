const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/embed');
const { checkHierarchy, notify, log } = require('../../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setMaxLength(500))
    .addIntegerOption((o) =>
      o
        .setName('delete_messages')
        .setDescription('Delete their recent messages')
        .addChoices(
          { name: "Don't delete any", value: 0 },
          { name: 'Previous hour', value: 3600 },
          { name: 'Previous 24 hours', value: 86400 },
          { name: 'Previous 7 days', value: 604800 },
        ),
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const deleteMessageSeconds = interaction.options.getInteger('delete_messages') ?? 0;
    const member = interaction.options.getMember('user');

    // Users who already left can still be banned; only check hierarchy for current members.
    if (member) {
      const error = checkHierarchy(interaction, member, 'ban');
      if (error) return reply(interaction, error);
    }

    const dmed = member ? await notify(user, interaction.guild, 'banned', reason) : false;
    await interaction.guild.members.ban(user, { reason: `${interaction.user.tag}: ${reason}`, deleteMessageSeconds });
    const caseId = await log(interaction.guild, { action: 'Ban', target: user, moderator: interaction.user, reason });

    return reply(interaction, `**${user.tag}** was banned.\n**Reason:** ${reason}`, {
      ephemeral: false,
      footer: `Case #${caseId}${dmed ? '' : ' · could not DM user'}`,
    });
  },
};
