const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { reply } = require('../../utils/embed');
const store = require('../../utils/store');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure Bunny for this server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName('modlog')
        .setDescription('Set the channel where moderation cases are logged.')
        .addChannelOption((o) => o.setName('channel').setDescription('Log channel').setRequired(true).addChannelTypes(ChannelType.GuildText)),
    )
    .addSubcommand((s) =>
      s
        .setName('voice')
        .setDescription('Create the join-to-create voice hub.')
        .addChannelOption((o) =>
          o.setName('category').setDescription('Use an existing category (a new one is created otherwise)').addChannelTypes(ChannelType.GuildCategory),
        ),
    )
    .addSubcommand((s) => s.setName('voice-disable').setDescription('Turn off join-to-create and remove the hub channel.'))
    .addSubcommand((s) => s.setName('view').setDescription("Show this server's Bunny settings.")),

  async execute(interaction) {
    const { guild } = interaction;
    const settings = store.guild(guild.id);

    switch (interaction.options.getSubcommand()) {
      case 'modlog': {
        const channel = interaction.options.getChannel('channel');
        const me = guild.members.me;
        if (!channel.permissionsFor(me).has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
          return reply(interaction, `I need **View Channel**, **Send Messages** and **Embed Links** in ${channel}.`);
        }
        store.setGuild(guild.id, { modLogChannelId: channel.id });
        return reply(interaction, `Moderation cases will be logged in ${channel}.`);
      }

      case 'voice': {
        const old = settings.voice && guild.channels.cache.get(settings.voice.hubId);
        if (old) return reply(interaction, `Join-to-create is already set up: ${old}. Use \`/setup voice-disable\` first to recreate it.`);

        const category =
          interaction.options.getChannel('category') ??
          (await guild.channels.create({ name: 'Voice', type: ChannelType.GuildCategory, reason: 'Bunny join-to-create setup' }));
        const hub = await guild.channels.create({
          name: 'Join to Create',
          type: ChannelType.GuildVoice,
          parent: category.id,
          reason: 'Bunny join-to-create setup',
        });

        store.setGuild(guild.id, { voice: { hubId: hub.id, categoryId: category.id } });
        return reply(interaction, `Join-to-create is ready. Members who join ${hub} get their own channel in **${category.name}**, with a control panel in its chat.`);
      }

      case 'voice-disable': {
        if (!settings.voice) return reply(interaction, 'Join-to-create is not set up.');
        await guild.channels.cache.get(settings.voice.hubId)?.delete('Bunny join-to-create disabled').catch(() => null);
        store.setGuild(guild.id, { voice: null });
        return reply(interaction, 'Join-to-create disabled. Existing temporary channels will be removed as they empty.');
      }

      case 'view':
        return reply(interaction, null, {
          title: 'Bunny settings',
          fields: [
            { name: 'Mod log', value: settings.modLogChannelId ? `<#${settings.modLogChannelId}>` : 'Not set', inline: true },
            { name: 'Join to create', value: settings.voice ? `<#${settings.voice.hubId}>` : 'Not set', inline: true },
          ],
        });
    }
  },
};
