const { Events } = require('discord.js');
const store = require('../utils/store');
const manager = require('../voice/manager');

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    if (oldState.channelId === newState.channelId) return; // mute/deafen etc.

    const settings = store.guild(newState.guild.id).voice;

    if (settings && newState.channelId === settings.hubId && newState.member && !newState.member.user.bot) {
      await manager.create(newState.member, settings).catch((err) => console.error('[bunny] join-to-create failed:', err));
    }

    const left = oldState.channel;
    if (left && store.temp.get(left.id) && left.members.size === 0) {
      await manager.remove(left);
    }
  },
};
