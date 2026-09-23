const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/embed');
const { checkHierarchy } = require('../../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nick')
    .setDescription("Change or reset a member's nickname.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption((o) => o.setName('nickname').setDescription('Leave empty to reset').setMaxLength(32)),

  async execute(interaction) {
    const member = interaction.options.getMember('user');
    const nickname = interaction.options.getString('nickname');

    const error = checkHierarchy(interaction, member, 'rename');
    if (error) return reply(interaction, error);

    await member.setNickname(nickname, interaction.user.tag);
    return reply(interaction, nickname ? `${member}'s nickname is now **${nickname}**.` : `${member}'s nickname was reset.`, { ephemeral: false });
  },
};
