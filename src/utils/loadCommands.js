const fs = require('node:fs');
const path = require('node:path');

/** Load every command module under src/commands/<group>/. */
function loadCommands() {
  const root = path.join(__dirname, '..', 'commands');
  const commands = [];
  for (const group of fs.readdirSync(root)) {
    for (const file of fs.readdirSync(path.join(root, group)).filter((f) => f.endsWith('.js'))) {
      const command = require(path.join(root, group, file));
      if (!command.data || !command.execute) throw new Error(`Command ${group}/${file} is missing data or execute`);
      commands.push(command);
    }
  }
  return commands;
}

module.exports = { loadCommands };
