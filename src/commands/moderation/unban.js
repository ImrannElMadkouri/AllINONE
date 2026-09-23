const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/embed');
const { log } = require('../../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user by their ID.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false)
    .addStringOption((o) => o.setName('user_id').setDescription('ID of the banned user').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setMaxLength(500)),

  async execute(interaction) {
    const userId = interaction.options.getString('user_id').trim();
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
    if (!ban) return reply(interaction, `No ban found for \`${userId}\`.`);

    await interaction.guild.members.unban(userId, `${interaction.user.tag}: ${reason}`);
    const caseId = await log(interaction.guild, { action: 'Unban', target: ban.user, moderator: interaction.user, reason });

    return reply(interaction, `**${ban.user.tag}** was unbanned.`, { ephemeral: false, footer: `Case #${caseId}` });
  },
};
