require('dotenv').config({ quiet: true });

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  devGuildId: process.env.DEV_GUILD_ID || null,

  // Every embed Bunny sends uses this colour on its left bar.
  color: 0x222222,

  // Default name for new join-to-create channels. {user} is replaced with the owner's display name.
  voiceNameTemplate: "{user}'s channel",

  // AutoMod. Both must be set for AutoMod to be available.
  automod: {
    apiKey: process.env.OPENROUTER_API_KEY || null,
    model: process.env.AUTOMOD_MODEL || null,
  },
};
