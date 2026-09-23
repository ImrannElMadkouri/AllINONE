const { EmbedBuilder, MessageFlags } = require('discord.js');
const { color } = require('../config');

/** A plain Bunny embed. Every message the bot sends goes through here. */
function embed(description, { title, fields, footer, thumbnail } = {}) {
  const e = new EmbedBuilder().setColor(color);
  if (title) e.setTitle(title);
  if (description) e.setDescription(description);
  if (fields?.length) e.addFields(fields);
  if (footer) e.setFooter({ text: footer });
  if (thumbnail) e.setThumbnail(thumbnail);
  return e;
}

/** Reply (or follow up) with a single embed. Ephemeral by default. */
function reply(interaction, description, { ephemeral = true, components, ...opts } = {}) {
  const payload = { embeds: [embed(description, opts)] };
  if (components) payload.components = components;
  if (ephemeral) payload.flags = MessageFlags.Ephemeral;
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload);
  return interaction.reply(payload);
}

module.exports = { embed, reply };
