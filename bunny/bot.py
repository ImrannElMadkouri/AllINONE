from __future__ import annotations

import logging

import discord
from discord import app_commands
from discord.ext import commands

from .automod.classifier import available as automod_available
from .automod.review import ReviewButton
from .config import DEV_GUILD_ID
from .embeds import reply
from .voice import manager
from .voice.views import PanelView

log = logging.getLogger("bunny")

EXTENSIONS = (
    "bunny.cogs.moderation",
    "bunny.cogs.setup",
    "bunny.cogs.voice",
    "bunny.cogs.automod",
    "bunny.cogs.help",
)


class Bunny(commands.Bot):
    def __init__(self) -> None:
        intents = discord.Intents.none()
        intents.guilds = True
        intents.voice_states = True
        # AutoMod needs to read messages. Message Content is a privileged intent,
        # so only ask for it when AutoMod is configured.
        if automod_available():
            intents.guild_messages = True
            intents.message_content = True

        super().__init__(
            command_prefix=commands.when_mentioned,  # slash commands only
            intents=intents,
            help_command=None,
            allowed_mentions=discord.AllowedMentions(everyone=False, roles=False, users=True),
            activity=discord.Activity(type=discord.ActivityType.listening, name="/help"),
        )
        self.tree.on_error = self.on_app_command_error

    async def setup_hook(self) -> None:
        for extension in EXTENSIONS:
            await self.load_extension(extension)

        # Keep buttons working on messages sent before a restart.
        self.add_view(PanelView())
        self.add_dynamic_items(ReviewButton)

        # Guild sync is instant; global sync can take up to an hour to show up.
        if DEV_GUILD_ID:
            guild = discord.Object(DEV_GUILD_ID)
            self.tree.copy_global_to(guild=guild)
            synced = await self.tree.sync(guild=guild)
            log.info("synced %d commands to guild %s", len(synced), DEV_GUILD_ID)
        else:
            synced = await self.tree.sync()
            log.info("synced %d commands globally", len(synced))

    async def on_ready(self) -> None:
        await manager.sweep(self)
        log.info("logged in as %s · %d server(s)", self.user, len(self.guilds))

    async def on_app_command_error(self, interaction: discord.Interaction, error: app_commands.AppCommandError) -> None:
        original = getattr(error, "original", error)
        if isinstance(error, app_commands.TransformerError):
            message = "That user is not in this server."
        elif isinstance(original, discord.Forbidden):
            message = "I don't have permission to do that. Check my role and channel permissions."
        elif isinstance(error, (app_commands.MissingPermissions, app_commands.CheckFailure)):
            message = "You don't have permission to use this command."
        else:
            log.error("command %s failed", interaction.command and interaction.command.qualified_name, exc_info=original)
            message = "Something went wrong running that."
        try:
            await reply(interaction, message)
        except discord.HTTPException:
            pass
