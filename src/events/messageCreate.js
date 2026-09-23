const { Events } = require('discord.js');
const { handleMessage } = require('../automod/engine');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    await handleMessage(message).catch((err) => console.error('[automod] failed to check message:', err));
  },
};
