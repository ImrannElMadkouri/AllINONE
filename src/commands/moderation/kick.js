const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/embed');
const { checkHierarchy, notify, log } = require('../../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Member to kick').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setMaxLength(500)),

  async execute(interaction) {
    const member = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    const error = checkHierarchy(interaction, member, 'kick');
    if (error) return reply(interaction, error);

    const dmed = await notify(member.user, interaction.guild, 'kicked', reason);
    await member.kick(`${interaction.user.tag}: ${reason}`);
    const caseId = await log(interaction.guild, { action: 'Kick', target: member.user, moderator: interaction.user, reason });

    return reply(interaction, `**${member.user.tag}** was kicked.\n**Reason:** ${reason}`, {
      ephemeral: false,
      footer: `Case #${caseId}${dmed ? '' : ' · could not DM user'}`,
    });
  },
};
