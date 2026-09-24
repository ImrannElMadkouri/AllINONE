"""Delete / Warn / Timeout / Dismiss buttons on AutoMod review messages.

The buttons carry the message and user IDs in their custom ID, so they are DynamicItems:
they keep working after a restart without storing anything.
"""

from __future__ import annotations

import re
import time
from datetime import timedelta

import discord

from .. import store
from ..embeds import reply
from ..moderation import check_hierarchy, log, notify

LABELS = {"delete": "Delete", "warn": "Warn", "timeout": "Timeout 10m", "dismiss": "Dismiss"}


class ReviewButton(discord.ui.DynamicItem[discord.ui.Button], template=r"am:(?P<action>\w+):(?P<channel>\d+):(?P<message>\d+):(?P<user>\d+)"):
    def __init__(self, action: str, channel_id: int, message_id: int, user_id: int) -> None:
        self.action, self.channel_id, self.message_id, self.user_id = action, channel_id, message_id, user_id
        super().__init__(
            discord.ui.Button(
                label=LABELS[action],
                style=discord.ButtonStyle.danger if action == "delete" else discord.ButtonStyle.secondary,
                custom_id=f"am:{action}:{channel_id}:{message_id}:{user_id}",
            )
        )

    @classmethod
    async def from_custom_id(cls, interaction: discord.Interaction, item: discord.ui.Button, match: re.Match[str]) -> ReviewButton:
        return cls(match["action"], int(match["channel"]), int(match["message"]), int(match["user"]))

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.permissions.moderate_members:
            return True
        await reply(interaction, "You need the **Timeout Members** permission to review AutoMod flags.")
        return False

    async def _finish(self, interaction: discord.Interaction, text: str) -> None:
        """Record who did what. Deleting keeps the other buttons; anything else closes the review."""
        e = interaction.message.embeds[0]
        for i, field in enumerate(e.fields):
            if field.name == "Action":
                e.set_field_at(i, name="Action", value=f"{text} by {interaction.user.mention}", inline=False)

        view = None
        if self.action == "delete":
            view = discord.ui.View(timeout=None)
            for action in ("warn", "timeout", "dismiss"):
                view.add_item(ReviewButton(action, self.channel_id, self.message_id, self.user_id))
        await interaction.response.edit_message(embed=e, view=view)

    async def callback(self, interaction: discord.Interaction) -> None:
        guild = interaction.guild
        title = interaction.message.embeds[0].title or ""
        reason = f"AutoMod review: {title.replace('AutoMod · ', '') or 'flagged message'}"

        if self.action == "dismiss":
            return await self._finish(interaction, "Dismissed")

        if self.action == "delete":
            channel = guild.get_channel_or_thread(self.channel_id)
            try:
                await channel.get_partial_message(self.message_id).delete()
                return await self._finish(interaction, "Deleted")
            except (discord.HTTPException, AttributeError):
                return await self._finish(interaction, "Already deleted")

        member = guild.get_member(self.user_id)
        if member is None:
            try:
                member = await guild.fetch_member(self.user_id)
            except discord.HTTPException:
                member = None
        if error := check_hierarchy(interaction, member, "warn" if self.action == "warn" else "time out"):
            return await reply(interaction, error)

        if self.action == "warn":
            store.add_warning(guild.id, member.id, reason, interaction.user.id, time.time())
            await notify(member, guild, "warned", reason)
            await log(guild, action="Warn", target=member, moderator=interaction.user, reason=reason)
            return await self._finish(interaction, "Warned")

        if self.action == "timeout":
            await member.timeout(timedelta(minutes=10), reason=f"{interaction.user}: {reason}")
            await notify(member, guild, "timed out", reason, "**Duration:** 10m")
            await log(guild, action="Timeout", target=member, moderator=interaction.user, reason=reason, extra="Duration: 10m")
            return await self._finish(interaction, "Timed out for 10m")


def review_view(message: discord.Message, *, deleted: bool) -> discord.ui.View:
    view = discord.ui.View(timeout=None)
    actions = ("warn", "timeout", "dismiss") if deleted else ("delete", "warn", "timeout", "dismiss")
    for action in actions:
        view.add_item(ReviewButton(action, message.channel.id, message.id, message.author.id))
    return view
