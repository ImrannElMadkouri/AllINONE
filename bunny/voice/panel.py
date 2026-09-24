"""The dashboard embed shown in each temporary voice channel's chat."""

from __future__ import annotations

import discord

from ..embeds import embed


def state(channel: discord.VoiceChannel) -> tuple[bool, bool]:
    """(locked, hidden), read straight from the permission overwrites so the panel is never out of sync."""
    overwrite = channel.overwrites_for(channel.guild.default_role)
    return overwrite.connect is False, overwrite.view_channel is False


def status_text(channel: discord.VoiceChannel) -> str:
    locked, hidden = state(channel)
    return f"{'Locked' if locked else 'Open'} · {'Hidden' if hidden else 'Visible'}"


def panel_embed(channel: discord.VoiceChannel, owner_id: int) -> discord.Embed:
    return embed(
        "\n".join(
            [
                f"Welcome to your channel, <@{owner_id}>. Use the buttons below to manage it.",
                "",
                "**Lock / Unlock**: control who can join",
                "**Hide / Unhide**: control who can see it",
                "**Rename · Limit · Bitrate**: change channel settings",
                "**Permit / Reject**: allow or block specific users",
                "**Transfer**: hand ownership to someone else",
                "**Claim**: take over if the owner has left",
            ]
        ),
        title="Voice controls",
        fields=[
            ("Owner", f"<@{owner_id}>", True),
            ("Status", status_text(channel), True),
            ("Limit", str(channel.user_limit) if channel.user_limit else "None", True),
        ],
    )
