const { Events } = require('discord.js');
const store = require('../utils/store');

module.exports = {
  name: Events.ChannelDelete,
  execute(channel) {
    if (!channel.guild) return;
    store.temp.delete(channel.id);
    if (store.guild(channel.guild.id).voice?.hubId === channel.id) store.setGuild(channel.guild.id, { voice: null });
  },
};
