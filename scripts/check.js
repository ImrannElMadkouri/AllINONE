// Loads every module and validates command definitions without connecting to Discord.
const { loadCommands } = require('../src/utils/loadCommands');
const fs = require('node:fs');
const path = require('node:path');

const commands = loadCommands();
for (const c of commands) c.data.toJSON(); // throws on invalid builders

for (const dir of ['events', 'voice', 'utils']) {
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'src', dir))) require(path.join(__dirname, '..', 'src', dir, f));
}
require('../src/voice/panel').components().forEach((row) => row.toJSON());

console.log(`ok · ${commands.length} commands: ${commands.map((c) => c.data.name).join(', ')}`);
