"""Shared helpers for moderation actions: hierarchy checks, DM notices, mod-log cases, durations."""

from __future__ import annotations

import re

import discord

from . import store
from .embeds import embed

_UNITS = {"s": 1, "m": 60, "h": 3600, "d": 86400, "w": 604800}


def check_hierarchy(interaction: discord.Interaction, target: discord.Member | None, action: str) -> str | None:
    """Return an error message if the moderator or the bot can't act on `target`, else None."""
    guild = interaction.guild
    moderator = interaction.user
    me = guild.me

    if target is None:
        return "That user is not in this server."
    if target.id == moderator.id:
        return f"You can't {action} yourself."
    if target.id == me.id:
        return f"I can't {action} myself."
    if target.id == guild.owner_id:
        return f"You can't {action} the server owner."
    if moderator.id != guild.owner_id and target.top_role >= moderator.top_role:
        return f"You can't {action} someone with an equal or higher role."
    if target.top_role >= me.top_role:
        return f"I can't {action} {target.mention}: their highest role is above or equal to mine."
    return None


async def notify(user: discord.abc.User, guild: discord.Guild, action: str, reason: str, extra: str | None = None) -> bool:
    """Try to DM the user about an action. Returns whether it was delivered."""
    lines = [f"You were **{action}** in **{guild.name}**.", f"**Reason:** {reason}"]
    if extra:
        lines.append(extra)
    try:
        await user.send(embed=embed("\n".join(lines)))
        return True
    except discord.HTTPException:
        return False


async def log(
    guild: discord.Guild,
    *,
    action: str,
    target: discord.abc.User,
    moderator: discord.abc.User,
    reason: str,
    extra: str | None = None,
) -> int:
    """Post a case to the guild's mod-log channel, if one is configured. Returns the case number."""
    case_id = store.next_case(guild.id)
    channel = guild.get_channel(store.guild(guild.id).get("modLogChannelId") or 0)
    if not isinstance(channel, discord.TextChannel):
        return case_id

    fields = [
        ("User", f"{target.mention} `{target.id}`", True),
        ("Moderator", moderator.mention, True),
        ("Reason", reason, False),
    ]
    if extra:
        fields.append(("Details", extra, False))

    e = embed(title=f"Case #{case_id} · {action}", fields=fields)
    e.timestamp = discord.utils.utcnow()
    try:
        await channel.send(embed=e)
    except discord.HTTPException:
        pass
    return case_id


def parse_duration(text: str) -> int | None:
    """Parse durations like 10m, 2h, 1d, 1h30m into seconds. Returns None if invalid."""
    text = re.sub(r"\s+", "", text.lower())
    parts = re.findall(r"(\d+)([smhdw])", text)
    if not parts or "".join(n + u for n, u in parts) != text:
        return None
    return sum(int(n) * _UNITS[u] for n, u in parts) or None


def format_duration(seconds: int) -> str:
    out = []
    for unit, size in (("d", 86400), ("h", 3600), ("m", 60), ("s", 1)):
        n, seconds = divmod(seconds, size)
        if n:
            out.append(f"{n}{unit}")
    return " ".join(out) or "0s"
