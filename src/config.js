require('dotenv').config({ quiet: true });

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  devGuildId: process.env.DEV_GUILD_ID || null,

  // Every embed Bunny sends uses this colour on its left bar.
  color: 0x222222,

  // Default name for new join-to-create channels. {user} is replaced with the owner's display name.
  voiceNameTemplate: "{user}'s channel",
};
