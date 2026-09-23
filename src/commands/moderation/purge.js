const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { embed } = require('../../utils/embed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk delete recent messages in this channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addIntegerOption((o) => o.setName('amount').setDescription('How many (1–100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption((o) => o.setName('user').setDescription('Only delete messages from this user')),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    const user = interaction.options.getUser('user');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let messages = await interaction.channel.messages.fetch({ limit: 100 });
    if (user) messages = messages.filter((m) => m.author.id === user.id);

    // bulkDelete skips messages older than 14 days (Discord limitation).
    const deleted = await interaction.channel.bulkDelete(messages.first(amount), true);
    const n = deleted.size;
    return interaction.editReply({ embeds: [embed(`Deleted **${n}** message${n === 1 ? '' : 's'}${user ? ` from ${user}` : ''}.`)] });
  },
};
