const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/embed');
const { checkHierarchy, log } = require('../../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription("Remove a member's timeout.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setMaxLength(500)),

  async execute(interaction) {
    const member = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    const error = checkHierarchy(interaction, member, 'un-timeout');
    if (error) return reply(interaction, error);
    if (!member.isCommunicationDisabled()) return reply(interaction, `${member} is not timed out.`);

    await member.timeout(null, `${interaction.user.tag}: ${reason}`);
    const caseId = await log(interaction.guild, { action: 'Untimeout', target: member.user, moderator: interaction.user, reason });

    return reply(interaction, `**${member.user.tag}**'s timeout was removed.`, { ephemeral: false, footer: `Case #${caseId}` });
  },
};
