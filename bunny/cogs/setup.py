from __future__ import annotations

import discord
from discord import app_commands
from discord.ext import commands

from .. import store
from ..embeds import reply


class Setup(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    group = app_commands.Group(
        name="setup",
        description="Configure Bunny for this server.",
        default_permissions=discord.Permissions(manage_guild=True),
        guild_only=True,
    )

    @group.command(name="modlog", description="Set the channel where moderation cases are logged.")
    @app_commands.describe(channel="Log channel")
    async def modlog(self, interaction: discord.Interaction, channel: discord.TextChannel) -> None:
        perms = channel.permissions_for(interaction.guild.me)
        if not (perms.view_channel and perms.send_messages and perms.embed_links):
            return await reply(interaction, f"I need **View Channel**, **Send Messages** and **Embed Links** in {channel.mention}.")
        store.set_guild(interaction.guild.id, modLogChannelId=channel.id)
        await reply(interaction, f"Moderation cases will be logged in {channel.mention}.")

    @group.command(name="voice", description="Create the join-to-create voice hub.")
    @app_commands.describe(category="Use an existing category (a new one is created otherwise)")
    async def voice(self, interaction: discord.Interaction, category: discord.CategoryChannel | None = None) -> None:
        guild = interaction.guild
        settings = store.guild(guild.id).get("voice")
        if settings and (old := guild.get_channel(settings["hubId"])):
            return await reply(interaction, f"Join-to-create is already set up: {old.mention}. Use `/setup voice-disable` first to recreate it.")

        category = category or await guild.create_category("Voice", reason="Bunny join-to-create setup")
        hub = await guild.create_voice_channel("Join to Create", category=category, reason="Bunny join-to-create setup")
        store.set_guild(guild.id, voice={"hubId": hub.id, "categoryId": category.id})
        await reply(
            interaction,
            f"Join-to-create is ready. Members who join {hub.mention} get their own channel in **{category.name}**, "
            "with a control panel in its chat.",
        )

    @group.command(name="voice-disable", description="Turn off join-to-create and remove the hub channel.")
    async def voice_disable(self, interaction: discord.Interaction) -> None:
        guild = interaction.guild
        settings = store.guild(guild.id).get("voice")
        if not settings:
            return await reply(interaction, "Join-to-create is not set up.")

        store.set_guild(guild.id, voice=None)
        if hub := guild.get_channel(settings["hubId"]):
            try:
                await hub.delete(reason="Bunny join-to-create disabled")
            except discord.HTTPException:
                pass
        await reply(interaction, "Join-to-create disabled. Existing temporary channels will be removed as they empty.")

    @group.command(name="view", description="Show this server's Bunny settings.")
    async def view(self, interaction: discord.Interaction) -> None:
        settings = store.guild(interaction.guild.id)
        modlog = settings.get("modLogChannelId")
        voice = settings.get("voice")
        await reply(
            interaction,
            title="Bunny settings",
            fields=[
                ("Mod log", f"<#{modlog}>" if modlog else "Not set", True),
                ("Join to create", f"<#{voice['hubId']}>" if voice else "Not set", True),
            ],
        )


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Setup(bot))
