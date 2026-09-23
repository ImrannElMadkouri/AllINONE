const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/embed');
const { checkHierarchy, notify, log, parseDuration, formatDuration } = require('../../utils/moderation');

const MAX = 28 * 864e5; // Discord's timeout limit

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Time out a member.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Member to time out').setRequired(true))
    .addStringOption((o) => o.setName('duration').setDescription('e.g. 10m, 2h, 1d (max 28d)').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setMaxLength(500)),

  async execute(interaction) {
    const member = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const ms = parseDuration(interaction.options.getString('duration'));

    if (!ms) return reply(interaction, 'Invalid duration. Use something like `10m`, `2h` or `1d12h`.');
    if (ms > MAX) return reply(interaction, 'Timeouts can be at most 28 days.');

    const error = checkHierarchy(interaction, member, 'time out');
    if (error) return reply(interaction, error);

    const length = formatDuration(ms);
    await member.timeout(ms, `${interaction.user.tag}: ${reason}`);
    const dmed = await notify(member.user, interaction.guild, 'timed out', reason, `**Duration:** ${length}`);
    const caseId = await log(interaction.guild, {
      action: 'Timeout',
      target: member.user,
      moderator: interaction.user,
      reason,
      extra: `Duration: ${length}`,
    });

    return reply(interaction, `**${member.user.tag}** was timed out for **${length}**.\n**Reason:** ${reason}`, {
      ephemeral: false,
      footer: `Case #${caseId}${dmed ? '' : ' · could not DM user'}`,
    });
  },
};
