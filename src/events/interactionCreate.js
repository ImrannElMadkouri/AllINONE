const { Events } = require('discord.js');
const { reply } = require('../utils/embed');
const controls = require('../voice/controls');
const { handleReviewButton } = require('../automod/review');

async function route(interaction) {
  if (interaction.isChatInputCommand()) {
    const command = interaction.client.commands.get(interaction.commandName);
    return command?.execute(interaction);
  }
  if (!interaction.inGuild()) return;
  if (interaction.isButton() && interaction.customId.startsWith('am:')) return handleReviewButton(interaction);
  if (interaction.isButton() && interaction.customId.startsWith('vc:')) return controls.handleButton(interaction);
  if (interaction.isModalSubmit() && interaction.customId.startsWith('vcmodal:')) return controls.handleModal(interaction);
  if (interaction.isUserSelectMenu() && interaction.customId.startsWith('vcselect:')) return controls.handleSelect(interaction);
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    try {
      await route(interaction);
    } catch (err) {
      console.error(`[bunny] interaction ${interaction.commandName ?? interaction.customId} failed:`, err);
      // 50013 = Missing Permissions — the most common failure, worth a clearer message.
      const message = err.code === 50013 ? "I don't have permission to do that. Check my role and channel permissions." : 'Something went wrong running that.';
      if (interaction.isRepliable()) {
        if (interaction.deferred && !interaction.replied) await interaction.deleteReply().catch(() => null);
        await reply(interaction, message).catch(() => null);
      }
    }
  },
};
