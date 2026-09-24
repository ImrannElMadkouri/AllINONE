from __future__ import annotations

import logging

import discord
from discord import app_commands
from discord.ext import commands

from .. import store
from ..embeds import reply
from ..voice import manager
from ..voice.panel import panel_embed
from ..voice.views import PanelView

log = logging.getLogger("bunny.voice")


class Voice(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    voice = app_commands.Group(name="voice", description="Your join-to-create channel.", guild_only=True)

    @voice.command(name="panel", description="Resend your channel's control panel.")
    async def panel(self, interaction: discord.Interaction) -> None:
        channel = manager.owned_channel(interaction.guild, interaction.user.id)
        if channel is None:
            return await reply(interaction, "You don't own a temporary voice channel right now.")

        message = await channel.send(embed=panel_embed(channel, interaction.user.id), view=PanelView())
        store.temp.update(channel.id, panelMessageId=message.id)
        await reply(interaction, f"Control panel sent in {channel.mention}.")

    @commands.Cog.listener()
    async def on_voice_state_update(self, member: discord.Member, before: discord.VoiceState, after: discord.VoiceState) -> None:
        if before.channel == after.channel:
            return  # mute, deafen, stream etc.

        settings = store.guild(member.guild.id).get("voice")
        if settings and after.channel and after.channel.id == settings["hubId"] and not member.bot:
            try:
                await manager.create(member, settings)
            except discord.HTTPException:
                log.exception("join-to-create failed for %s", member)

        left = before.channel
        if left and store.temp.get(left.id) and not left.members:
            await manager.remove(left)

    @commands.Cog.listener()
    async def on_guild_channel_delete(self, channel: discord.abc.GuildChannel) -> None:
        store.temp.delete(channel.id)
        settings = store.guild(channel.guild.id).get("voice")
        if settings and settings["hubId"] == channel.id:
            store.set_guild(channel.guild.id, voice=None)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Voice(bot))
