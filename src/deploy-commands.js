const { REST, Routes } = require('discord.js');
const { token, clientId, devGuildId } = require('./config');
const { loadCommands } = require('./utils/loadCommands');

if (!token || !clientId) {
  console.error('[bunny] DISCORD_TOKEN and CLIENT_ID must be set in .env');
  process.exit(1);
}

const body = loadCommands().map((c) => c.data.toJSON());
const rest = new REST().setToken(token);

(async () => {
  // Guild commands update instantly; global commands can take up to an hour to appear.
  const route = devGuildId ? Routes.applicationGuildCommands(clientId, devGuildId) : Routes.applicationCommands(clientId);
  await rest.put(route, { body });
  console.log(`[bunny] registered ${body.length} commands ${devGuildId ? `to guild ${devGuildId}` : 'globally'}`);
})().catch((err) => {
  console.error('[bunny] failed to register commands:', err);
  process.exit(1);
});
