const { PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const store = require('../utils/store');
const { reply } = require('../utils/embed');
const { checkHierarchy, notify, log } = require('../utils/moderation');

/** Handle the Delete / Warn / Timeout / Dismiss buttons on an AutoMod review message. */
async function handleReviewButton(interaction) {
  const [, action, channelId, messageId, userId] = interaction.customId.split(':');

  if (!interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)) {
    return reply(interaction, 'You need the **Timeout Members** permission to review AutoMod flags.');
  }

  const original = interaction.message.embeds[0];
  const reason = `AutoMod review: ${original?.title?.replace('AutoMod · ', '') ?? 'flagged message'}`;

  // Record who did what on the review message. Deleting keeps the other buttons; anything else closes the review.
  const finish = (text) => {
    const e = EmbedBuilder.from(original).setFields(
      original.fields.map((f) => (f.name === 'Action' ? { name: f.name, value: `${text} by ${interaction.user}` } : f)),
    );
    const components =
      action === 'delete'
        ? interaction.message.components.map((row) =>
            new ActionRowBuilder().addComponents(
              row.components.filter((c) => !c.customId.startsWith('am:delete')).map((c) => ButtonBuilder.from(c)),
            ),
          )
        : [];
    return interaction.update({ embeds: [e], components });
  };

  if (action === 'dismiss') return finish('Dismissed');

  if (action === 'delete') {
    const channel = interaction.guild.channels.cache.get(channelId);
    const message = await channel?.messages.fetch(messageId).catch(() => null);
    await message?.delete().catch(() => null);
    return finish(message ? 'Deleted' : 'Already deleted');
  }

  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  const error = checkHierarchy(interaction, member, action === 'warn' ? 'warn' : 'time out');
  if (error) return reply(interaction, error);

  if (action === 'warn') {
    store.addWarning(interaction.guild.id, userId, { reason, moderatorId: interaction.user.id, at: Date.now() });
    await notify(member.user, interaction.guild, 'warned', reason);
    await log(interaction.guild, { action: 'Warn', target: member.user, moderator: interaction.user, reason });
    return finish('Warned');
  }

  if (action === 'timeout') {
    await member.timeout(10 * 60_000, `${interaction.user.tag}: ${reason}`);
    await notify(member.user, interaction.guild, 'timed out', reason, '**Duration:** 10m');
    await log(interaction.guild, { action: 'Timeout', target: member.user, moderator: interaction.user, reason, extra: 'Duration: 10m' });
    return finish('Timed out for 10m');
  }
}

module.exports = { handleReviewButton };
