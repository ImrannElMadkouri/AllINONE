const { embed } = require('./embed');
const store = require('./store');

/**
 * Check that `moderator` and the bot can both act on `target`.
 * Returns an error message, or null when the action is allowed.
 */
function checkHierarchy(interaction, target, action) {
  const { guild, member: moderator } = interaction;
  const me = guild.members.me;

  if (!target) return 'That user is not in this server.';
  if (target.id === moderator.id) return `You can't ${action} yourself.`;
  if (target.id === me.id) return `I can't ${action} myself.`;
  if (target.id === guild.ownerId) return `You can't ${action} the server owner.`;
  if (moderator.id !== guild.ownerId && target.roles.highest.position >= moderator.roles.highest.position) {
    return `You can't ${action} someone with an equal or higher role.`;
  }
  if (target.roles.highest.position >= me.roles.highest.position) {
    return `I can't ${action} ${target} — their highest role is above or equal to mine.`;
  }
  return null;
}

/** Try to DM the user about an action. Returns whether it was delivered. */
async function notify(user, guild, action, reason, extra) {
  const lines = [`You were **${action}** in **${guild.name}**.`, `**Reason:** ${reason}`];
  if (extra) lines.push(extra);
  try {
    await user.send({ embeds: [embed(lines.join('\n'))] });
    return true;
  } catch {
    return false;
  }
}

/** Post a case to the guild's mod-log channel, if one is configured. Returns the case number. */
async function log(guild, { action, target, moderator, reason, extra }) {
  const caseId = store.nextCase(guild.id);
  const channelId = store.guild(guild.id).modLogChannelId;
  if (!channelId) return caseId;

  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return caseId;

  const fields = [
    { name: 'User', value: `${target} \`${target.id}\``, inline: true },
    { name: 'Moderator', value: `${moderator}`, inline: true },
    { name: 'Reason', value: reason },
  ];
  if (extra) fields.push({ name: 'Details', value: extra });

  await channel
    .send({ embeds: [embed(null, { title: `Case #${caseId} · ${action}`, fields }).setTimestamp()] })
    .catch(() => null);
  return caseId;
}

/** Parse durations like 10m, 2h, 1d, 1h30m into milliseconds. Returns null if invalid. */
function parseDuration(input) {
  const units = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 };
  const parts = String(input).toLowerCase().replace(/\s+/g, '').match(/\d+[smhdw]/g);
  if (!parts || parts.join('') !== String(input).toLowerCase().replace(/\s+/g, '')) return null;
  return parts.reduce((ms, p) => ms + Number(p.slice(0, -1)) * units[p.at(-1)], 0) || null;
}

function formatDuration(ms) {
  const units = [['d', 864e5], ['h', 36e5], ['m', 6e4], ['s', 1e3]];
  const out = [];
  for (const [u, size] of units) {
    const n = Math.floor(ms / size);
    if (n) {
      out.push(`${n}${u}`);
      ms -= n * size;
    }
  }
  return out.join(' ') || '0s';
}

module.exports = { checkHierarchy, notify, log, parseDuration, formatDuration };
