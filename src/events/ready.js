const { Events, ActivityType } = require('discord.js');
const { sweep } = require('../voice/manager');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    client.user.setActivity('/help', { type: ActivityType.Listening });
    await sweep(client);
    console.log(`[bunny] logged in as ${client.user.tag} · ${client.guilds.cache.size} server(s)`);
  },
};
