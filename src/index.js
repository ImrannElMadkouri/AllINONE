const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const { token } = require('./config');
const { loadCommands } = require('./utils/loadCommands');

if (!token) {
  console.error('[bunny] DISCORD_TOKEN is missing. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.commands = new Collection(loadCommands().map((c) => [c.data.name, c]));

const eventsDir = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsDir).filter((f) => f.endsWith('.js'))) {
  const event = require(path.join(eventsDir, file));
  client[event.once ? 'once' : 'on'](event.name, (...args) => event.execute(...args));
}

process.on('unhandledRejection', (err) => console.error('[bunny] unhandled rejection:', err));

client.login(token);
