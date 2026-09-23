const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { reply } = require('../../utils/embed');
const store = require('../../utils/store');
const { settings } = require('../../automod/engine');
const { available } = require('../../automod/classifier');

const MODES = {
  flag: 'Flag only: nothing is deleted, staff review every flag',
  delete: 'Delete: clear violations are removed, staff review the rest',
  punish: 'Auto-punish: clear violations are removed, the author is warned (or timed out when severe)',
};
const SENSITIVITY = {
  low: 'Low: only very obvious violations',
  medium: 'Medium: balanced',
  high: 'High: catches more, with more false positives',
};

const toggle = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configure AutoMod.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName('enable')
        .setDescription('Turn AutoMod on.')
        .addChannelOption((o) =>
          o.setName('review_channel').setDescription('Where flagged messages go (defaults to the mod log)').addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((s) => s.setName('disable').setDescription('Turn AutoMod off.'))
    .addSubcommand((s) =>
      s
        .setName('mode')
        .setDescription('What AutoMod does with violations.')
        .addStringOption((o) =>
          o
            .setName('mode')
            .setDescription('Mode')
            .setRequired(true)
            .addChoices(...Object.keys(MODES).map((m) => ({ name: MODES[m].split(':')[0], value: m }))),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('sensitivity')
        .setDescription('How strict AutoMod is.')
        .addStringOption((o) =>
          o
            .setName('level')
            .setDescription('Level')
            .setRequired(true)
            .addChoices(...Object.keys(SENSITIVITY).map((l) => ({ name: SENSITIVITY[l].split(':')[0], value: l }))),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('exempt')
        .setDescription('Toggle a channel, category or role being skipped by AutoMod.')
        .addChannelOption((o) =>
          o.setName('channel').setDescription('Channel or category').addChannelTypes(ChannelType.GuildText, ChannelType.GuildCategory, ChannelType.GuildAnnouncement),
        )
        .addRoleOption((o) => o.setName('role').setDescription('Role')),
    )
    .addSubcommand((s) => s.setName('status').setDescription('Show the AutoMod settings.')),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const s = settings(guildId);
    const save = (patch) => store.setGuild(guildId, { automod: { ...s, ...patch } });

    if (!available()) return reply(interaction, 'AutoMod is not configured on this bot. The bot owner needs to add the AutoMod settings to `.env`.');

    switch (interaction.options.getSubcommand()) {
      case 'enable': {
        const channel = interaction.options.getChannel('review_channel');
        const reviewChannelId = channel?.id ?? s.reviewChannelId;
        if (!reviewChannelId && !store.guild(guildId).modLogChannelId) {
          return reply(interaction, 'Pick a `review_channel`, or set a mod log first with `/setup modlog`.');
        }
        save({ enabled: true, reviewChannelId });
        return reply(interaction, `AutoMod is on.\n**Mode:** ${MODES[s.mode]}\n**Review channel:** <#${reviewChannelId ?? store.guild(guildId).modLogChannelId}>`);
      }

      case 'disable':
        save({ enabled: false });
        return reply(interaction, 'AutoMod is off.');

      case 'mode': {
        const mode = interaction.options.getString('mode');
        save({ mode });
        return reply(interaction, `**Mode:** ${MODES[mode]}`);
      }

      case 'sensitivity': {
        const level = interaction.options.getString('level');
        save({ sensitivity: level });
        return reply(interaction, `**Sensitivity:** ${SENSITIVITY[level]}`);
      }

      case 'exempt': {
        const channel = interaction.options.getChannel('channel');
        const role = interaction.options.getRole('role');
        if (!channel && !role) return reply(interaction, 'Pick a channel or a role.');
        const patch = {};
        const lines = [];
        if (channel) {
          patch.exemptChannels = toggle(s.exemptChannels, channel.id);
          lines.push(`${channel} is ${patch.exemptChannels.includes(channel.id) ? 'now exempt' : 'no longer exempt'}.`);
        }
        if (role) {
          patch.exemptRoles = toggle(s.exemptRoles, role.id);
          lines.push(`${role} is ${patch.exemptRoles.includes(role.id) ? 'now exempt' : 'no longer exempt'}.`);
        }
        save(patch);
        return reply(interaction, lines.join('\n'));
      }

      case 'status': {
        const review = s.reviewChannelId ?? store.guild(guildId).modLogChannelId;
        return reply(interaction, null, {
          title: 'AutoMod',
          fields: [
            { name: 'Status', value: s.enabled ? 'On' : 'Off', inline: true },
            { name: 'Sensitivity', value: SENSITIVITY[s.sensitivity].split(':')[0], inline: true },
            { name: 'Review channel', value: review ? `<#${review}>` : 'Not set', inline: true },
            { name: 'Mode', value: MODES[s.mode] },
            { name: 'Exempt channels', value: s.exemptChannels.map((id) => `<#${id}>`).join(' ') || 'None' },
            { name: 'Exempt roles', value: s.exemptRoles.map((id) => `<@&${id}>`).join(' ') || 'None' },
          ],
          footer: 'Staff with Manage Messages are always skipped',
        });
      }
    }
  },
};
