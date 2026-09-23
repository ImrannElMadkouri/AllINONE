const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/embed');
const { checkHierarchy, notify, log } = require('../../utils/moderation');
const store = require('../../utils/store');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Member to warn').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true).setMaxLength(500)),

  async execute(interaction) {
    const member = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason');

    const error = checkHierarchy(interaction, member, 'warn');
    if (error) return reply(interaction, error);

    const total = store.addWarning(interaction.guild.id, member.id, {
      reason,
      moderatorId: interaction.user.id,
      at: Date.now(),
    });
    const dmed = await notify(member.user, interaction.guild, 'warned', reason);
    const caseId = await log(interaction.guild, { action: 'Warn', target: member.user, moderator: interaction.user, reason });

    return reply(interaction, `**${member.user.tag}** was warned. They now have **${total}** warning${total === 1 ? '' : 's'}.\n**Reason:** ${reason}`, {
      ephemeral: false,
      footer: `Case #${caseId}${dmed ? '' : ' · could not DM user'}`,
    });
  },
};
