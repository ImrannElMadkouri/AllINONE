const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const store = require('../utils/store');
const { embed } = require('../utils/embed');
const { notify, log } = require('../utils/moderation');
const { classify } = require('./classifier');

const MIN_LENGTH = 4;
const CONFIDENCE = { low: 0.9, medium: 0.75, high: 0.6 };
const LABELS = {
  harassment: 'Harassment',
  hate: 'Hate speech',
  threat: 'Threat',
  sexual: 'Sexual content',
  scam: 'Scam / phishing',
  spam: 'Spam',
  self_harm: 'Self-harm risk',
};

// Per-user rate limit on checks, so one person flooding can't run up the API bill.
const USER_WINDOW = 30_000;
const USER_MAX = 6;
const recentChecks = new Map();

// Identical messages (copy-paste spam) reuse the earlier verdict for a while.
const CACHE_TTL = 10 * 60_000;
const cache = new Map();

function defaults() {
  return { enabled: false, mode: 'flag', sensitivity: 'medium', reviewChannelId: null, exemptChannels: [], exemptRoles: [] };
}

function settings(guildId) {
  return { ...defaults(), ...store.guild(guildId).automod };
}

function shouldCheck(message, s) {
  if (!s.enabled || message.author.bot || message.webhookId || !message.member) return false;
  if (message.content.trim().length < MIN_LENGTH) return false;
  if (s.exemptChannels.includes(message.channelId) || s.exemptChannels.includes(message.channel.parentId)) return false;
  if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return false;
  if (message.member.roles.cache.some((r) => s.exemptRoles.includes(r.id))) return false;

  const now = Date.now();
  const times = (recentChecks.get(message.author.id) ?? []).filter((t) => now - t < USER_WINDOW);
  if (times.length >= USER_MAX) return false;
  times.push(now);
  recentChecks.set(message.author.id, times);
  return true;
}

async function verdictFor(message) {
  const key = `${message.guildId}:${message.content}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.verdict;

  const replied = message.reference?.messageId ? message.channel.messages.cache.get(message.reference.messageId) : null;
  const verdict = await classify(message.content.slice(0, 2000), replied?.content?.slice(0, 500));
  if (verdict) cache.set(key, { verdict, at: Date.now() });
  if (cache.size > 5000) cache.delete(cache.keys().next().value);
  return verdict;
}

function reviewButtons(message, { deleted }) {
  const id = (action) => `am:${action}:${message.channelId}:${message.id}:${message.author.id}`;
  const row = new ActionRowBuilder();
  if (!deleted) row.addComponents(new ButtonBuilder().setCustomId(id('delete')).setLabel('Delete').setStyle(ButtonStyle.Danger));
  row.addComponents(
    new ButtonBuilder().setCustomId(id('warn')).setLabel('Warn').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(id('timeout')).setLabel('Timeout 10m').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(id('dismiss')).setLabel('Dismiss').setStyle(ButtonStyle.Secondary),
  );
  return [row];
}

async function postReview(message, verdict, s, outcome) {
  const channelId = s.reviewChannelId ?? store.guild(message.guildId).modLogChannelId;
  const channel = channelId && message.guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return;

  const deleted = outcome !== 'Flagged for review';
  const e = embed(message.content.slice(0, 1000), {
    title: `AutoMod · ${LABELS[verdict.category]}`,
    fields: [
      { name: 'User', value: `${message.author} \`${message.author.id}\``, inline: true },
      { name: 'Channel', value: `${message.channel}`, inline: true },
      { name: 'Confidence', value: `${Math.round(verdict.confidence * 100)}%`, inline: true },
      { name: 'Reason', value: verdict.reason || '—' },
      { name: 'Action', value: deleted ? outcome : `${outcome} · [Jump to message](${message.url})` },
    ],
    thumbnail: message.author.displayAvatarURL(),
  }).setTimestamp();

  const done = outcome.startsWith('Deleted and');
  await channel.send({ embeds: [e], components: done ? [] : reviewButtons(message, { deleted }) }).catch(() => null);
}

async function removeMessage(message) {
  await message.delete().catch(() => null);
  const notice = await message.channel
    .send({ embeds: [embed(`A message from ${message.author} was removed by AutoMod.`)], allowedMentions: { parse: [] } })
    .catch(() => null);
  if (notice) setTimeout(() => notice.delete().catch(() => null), 6000);
}

async function punish(message, verdict) {
  const reason = `AutoMod: ${LABELS[verdict.category]}${verdict.reason ? ` — ${verdict.reason}` : ''}`;
  const me = message.guild.members.me;
  const canAct = message.member.moderatable && message.member.roles.highest.position < me.roles.highest.position;

  if (verdict.severity >= 3 && canAct) {
    await message.member.timeout(10 * 60_000, reason).catch(() => null);
    await notify(message.author, message.guild, 'timed out', reason, '**Duration:** 10m');
    await log(message.guild, { action: 'Timeout', target: message.author, moderator: me.user, reason, extra: 'Duration: 10m' });
    return 'Deleted and timed out for 10m';
  }

  store.addWarning(message.guildId, message.author.id, { reason, moderatorId: me.id, at: Date.now() });
  await notify(message.author, message.guild, 'warned', reason);
  await log(message.guild, { action: 'Warn', target: message.author, moderator: me.user, reason });
  return 'Deleted and warned';
}

async function handleMessage(message) {
  if (!message.inGuild()) return;
  const s = settings(message.guildId);
  if (!shouldCheck(message, s)) return;

  const verdict = await verdictFor(message);
  if (!verdict?.flagged || verdict.confidence < CONFIDENCE[s.sensitivity]) return;

  // Someone who may be at risk gets a human, never a punishment.
  if (verdict.category === 'self_harm') return postReview(message, verdict, s, 'Flagged for review');

  let outcome = 'Flagged for review';
  if (s.mode === 'delete' && verdict.severity >= 2) {
    await removeMessage(message);
    outcome = 'Deleted';
  } else if (s.mode === 'punish' && verdict.severity >= 2) {
    await removeMessage(message);
    outcome = await punish(message, verdict);
  }
  await postReview(message, verdict, s, outcome);
}

module.exports = { handleMessage, settings, defaults, LABELS };
