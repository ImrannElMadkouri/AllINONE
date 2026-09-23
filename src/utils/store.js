const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', '..', 'data', 'bunny.json');

const defaults = () => ({ guilds: {}, warnings: {}, tempChannels: {}, caseCounter: {} });

let data = defaults();
try {
  data = { ...defaults(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
} catch (err) {
  if (err.code !== 'ENOENT') console.error('[store] could not read data file, starting fresh:', err.message);
}

let pending = null;
/** Persist to disk, coalescing bursts of writes into one. Writes via a temp file so a crash never leaves half a file. */
function save() {
  if (pending) return;
  pending = setImmediate(() => {
    pending = null;
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, FILE);
  });
}

function guild(guildId) {
  data.guilds[guildId] ??= {};
  return data.guilds[guildId];
}

function setGuild(guildId, patch) {
  Object.assign(guild(guildId), patch);
  save();
}

function nextCase(guildId) {
  data.caseCounter[guildId] = (data.caseCounter[guildId] ?? 0) + 1;
  save();
  return data.caseCounter[guildId];
}

function warnings(guildId, userId) {
  return data.warnings[guildId]?.[userId] ?? [];
}

function addWarning(guildId, userId, warning) {
  data.warnings[guildId] ??= {};
  data.warnings[guildId][userId] ??= [];
  data.warnings[guildId][userId].push(warning);
  save();
  return data.warnings[guildId][userId].length;
}

function clearWarnings(guildId, userId) {
  const count = warnings(guildId, userId).length;
  if (data.warnings[guildId]) delete data.warnings[guildId][userId];
  save();
  return count;
}

const temp = {
  get: (channelId) => data.tempChannels[channelId],
  all: () => Object.entries(data.tempChannels),
  set(channelId, value) {
    data.tempChannels[channelId] = value;
    save();
  },
  update(channelId, patch) {
    if (!data.tempChannels[channelId]) return;
    Object.assign(data.tempChannels[channelId], patch);
    save();
  },
  delete(channelId) {
    delete data.tempChannels[channelId];
    save();
  },
};

module.exports = { guild, setGuild, nextCase, warnings, addWarning, clearWarnings, temp };
