from __future__ import annotations

import logging

import discord
from discord import app_commands
from discord.ext import commands

from .. import store
from ..automod.classifier import available, classifier
from ..automod.engine import handle_message, settings
from ..embeds import reply

log = logging.getLogger("bunny.automod")

MODES = {
    "flag": ("Flag only", "nothing is deleted, staff review every flag"),
    "delete": ("Delete", "clear violations are removed, staff review the rest"),
    "punish": ("Auto-punish", "clear violations are removed, the author is warned (or timed out when severe)"),
}
SENSITIVITY = {
    "low": ("Low", "only very obvious violations"),
    "medium": ("Medium", "balanced"),
    "high": ("High", "catches more, with more false positives"),
}


def describe(options: dict, key: str) -> str:
    name, detail = options[key]
    return f"{name}: {detail}"


class AutoMod(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    async def cog_unload(self) -> None:
        await classifier.close()

    group = app_commands.Group(
        name="automod",
        description="Configure AutoMod.",
        default_permissions=discord.Permissions(manage_guild=True),
        guild_only=True,
    )

    async def _ready(self, interaction: discord.Interaction) -> bool:
        if available():
            return True
        await reply(interaction, "AutoMod is not configured on this bot. The bot owner needs to add the AutoMod settings to `.env`.")
        return False

    def _save(self, guild_id: int, **patch) -> None:
        store.set_guild(guild_id, automod={**settings(guild_id), **patch})

    @group.command(name="enable", description="Turn AutoMod on.")
    @app_commands.describe(review_channel="Where flagged messages go (defaults to the mod log)")
    async def enable(self, interaction: discord.Interaction, review_channel: discord.TextChannel | None = None) -> None:
        if not await self._ready(interaction):
            return
        s = settings(interaction.guild.id)
        review_id = review_channel.id if review_channel else s["reviewChannelId"]
        target = review_id or store.guild(interaction.guild.id).get("modLogChannelId")
        if not target:
            return await reply(interaction, "Pick a `review_channel`, or set a mod log first with `/setup modlog`.")

        self._save(interaction.guild.id, enabled=True, reviewChannelId=review_id)
        await reply(interaction, f"AutoMod is on.\n**Mode:** {describe(MODES, s['mode'])}\n**Review channel:** <#{target}>")

    @group.command(name="disable", description="Turn AutoMod off.")
    async def disable(self, interaction: discord.Interaction) -> None:
        self._save(interaction.guild.id, enabled=False)
        await reply(interaction, "AutoMod is off.")

    @group.command(name="mode", description="What AutoMod does with violations.")
    @app_commands.choices(mode=[app_commands.Choice(name=name, value=key) for key, (name, _) in MODES.items()])
    async def mode(self, interaction: discord.Interaction, mode: app_commands.Choice[str]) -> None:
        if not await self._ready(interaction):
            return
        self._save(interaction.guild.id, mode=mode.value)
        await reply(interaction, f"**Mode:** {describe(MODES, mode.value)}")

    @group.command(name="sensitivity", description="How strict AutoMod is.")
    @app_commands.choices(level=[app_commands.Choice(name=name, value=key) for key, (name, _) in SENSITIVITY.items()])
    async def sensitivity(self, interaction: discord.Interaction, level: app_commands.Choice[str]) -> None:
        if not await self._ready(interaction):
            return
        self._save(interaction.guild.id, sensitivity=level.value)
        await reply(interaction, f"**Sensitivity:** {describe(SENSITIVITY, level.value)}")

    @group.command(name="exempt", description="Toggle a channel, category or role being skipped by AutoMod.")
    @app_commands.describe(channel="Channel or category", role="Role")
    async def exempt(
        self,
        interaction: discord.Interaction,
        channel: discord.TextChannel | discord.CategoryChannel | None = None,
        role: discord.Role | None = None,
    ) -> None:
        if not channel and not role:
            return await reply(interaction, "Pick a channel or a role.")
        s = settings(interaction.guild.id)
        patch, lines = {}, []
        for key, target in (("exemptChannels", channel), ("exemptRoles", role)):
            if target is None:
                continue
            ids = list(s[key])
            if target.id in ids:
                ids.remove(target.id)
                lines.append(f"{target.mention} is no longer exempt.")
            else:
                ids.append(target.id)
                lines.append(f"{target.mention} is now exempt.")
            patch[key] = ids
        self._save(interaction.guild.id, **patch)
        await reply(interaction, "\n".join(lines))

    @group.command(name="status", description="Show the AutoMod settings.")
    async def status(self, interaction: discord.Interaction) -> None:
        s = settings(interaction.guild.id)
        review = s["reviewChannelId"] or store.guild(interaction.guild.id).get("modLogChannelId")
        await reply(
            interaction,
            title="AutoMod",
            fields=[
                ("Status", "On" if s["enabled"] and available() else "Off", True),
                ("Sensitivity", SENSITIVITY[s["sensitivity"]][0], True),
                ("Review channel", f"<#{review}>" if review else "Not set", True),
                ("Mode", describe(MODES, s["mode"]), False),
                ("Exempt channels", " ".join(f"<#{i}>" for i in s["exemptChannels"]) or "None", False),
                ("Exempt roles", " ".join(f"<@&{i}>" for i in s["exemptRoles"]) or "None", False),
            ],
            footer="Staff with Manage Messages are always skipped",
        )

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message) -> None:
        try:
            await handle_message(message)
        except Exception:
            log.exception("failed to check message %s", message.id)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(AutoMod(bot))
