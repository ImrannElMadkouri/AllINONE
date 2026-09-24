from __future__ import annotations

import discord
from discord import app_commands
from discord.ext import commands

from ..embeds import reply


class Help(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="help", description="See everything Bunny can do.")
    async def help(self, interaction: discord.Interaction) -> None:
        await reply(
            interaction,
            title="Bunny",
            thumbnail=self.bot.user.display_avatar.url,
            fields=[
                (
                    "Moderation",
                    "`/ban` `/unban` `/kick`\n`/timeout` `/untimeout`\n`/warn` `/warnings` `/clearwarnings`\n"
                    "`/purge` `/lock` `/unlock` `/slowmode` `/nick`",
                    False,
                ),
                ("AutoMod", "`/automod enable` `disable` `mode` `sensitivity` `exempt` `status`", False),
                (
                    "Voice",
                    "Join the **Join to Create** channel to get your own voice channel.\n`/voice panel` resends your control panel.",
                    False,
                ),
                ("Setup", "`/setup modlog` `/setup voice` `/setup voice-disable` `/setup view`", False),
            ],
        )


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Help(bot))
