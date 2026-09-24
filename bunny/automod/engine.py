"""Decides which messages AutoMod checks and what happens when one is flagged."""

from __future__ import annotations

import logging
import time
from datetime import timedelta

import discord

from .. import store
from ..embeds import embed
from ..moderation import log, notify
from .classifier import Verdict, classifier

logger = logging.getLogger("bunny.automod")

MIN_LENGTH = 4
CONFIDENCE = {"low": 0.9, "medium": 0.75, "high": 0.6}
LABELS = {
    "harassment": "Harassment",
    "hate": "Hate speech",
    "threat": "Threat",
    "sexual": "Sexual content",
    "scam": "Scam / phishing",
    "spam": "Spam",
    "self_harm": "Self-harm risk",
}
FLAGGED = "Flagged for review"

# Per-user rate limit on checks, so one person flooding can't run up the API bill.
USER_WINDOW = 30
USER_MAX = 6
_recent_checks: dict[int, list[float]] = {}

# Identical messages (copy-paste spam) reuse the earlier verdict for a while.
CACHE_TTL = 600
CACHE_MAX = 5000
_cache: dict[str, tuple[Verdict, float]] = {}

DEFAULTS = {
    "enabled": False,
    "mode": "flag",
    "sensitivity": "medium",
    "reviewChannelId": None,
    "exemptChannels": [],
    "exemptRoles": [],
}


def settings(guild_id: int) -> dict:
    return {**DEFAULTS, **(store.guild(guild_id).get("automod") or {})}


def should_check(message: discord.Message, s: dict) -> bool:
    author = message.author
    if not s["enabled"] or author.bot or message.webhook_id or not isinstance(author, discord.Member):
        return False
    if len(message.content.strip()) < MIN_LENGTH:
        return False
    parent_id = getattr(message.channel, "category_id", None) or getattr(message.channel, "parent_id", None)
    if message.channel.id in s["exemptChannels"] or parent_id in s["exemptChannels"]:
        return False
    if message.channel.permissions_for(author).manage_messages:
        return False
    if any(role.id in s["exemptRoles"] for role in author.roles):
        return False

    now = time.time()
    times = [t for t in _recent_checks.get(author.id, []) if now - t < USER_WINDOW]
    if len(times) >= USER_MAX:
        return False
    times.append(now)
    _recent_checks[author.id] = times
    return True


async def verdict_for(message: discord.Message) -> Verdict | None:
    key = f"{message.guild.id}:{message.content}"
    if (hit := _cache.get(key)) and time.time() - hit[1] < CACHE_TTL:
        return hit[0]

    replied = message.reference.resolved if message.reference else None
    reply_text = replied.content[:500] if isinstance(replied, discord.Message) else None
    verdict = await classifier.classify(message.content[:2000], reply_text)
    if verdict:
        _cache[key] = (verdict, time.time())
        if len(_cache) > CACHE_MAX:
            _cache.pop(next(iter(_cache)))
    return verdict


async def post_review(message: discord.Message, verdict: Verdict, s: dict, outcome: str) -> None:
    from .review import review_view  # imported here to avoid a circular import

    channel_id = s["reviewChannelId"] or store.guild(message.guild.id).get("modLogChannelId")
    channel = message.guild.get_channel(channel_id or 0)
    if not isinstance(channel, discord.TextChannel):
        return

    deleted = outcome != FLAGGED
    e = embed(
        message.content[:1000],
        title=f"AutoMod · {LABELS[verdict.category]}",
        fields=[
            ("User", f"{message.author.mention} `{message.author.id}`", True),
            ("Channel", message.channel.mention, True),
            ("Confidence", f"{round(verdict.confidence * 100)}%", True),
            ("Reason", verdict.reason or "—", False),
            ("Action", outcome if deleted else f"{outcome} · [Jump to message]({message.jump_url})", False),
        ],
        thumbnail=message.author.display_avatar.url,
    )
    e.timestamp = discord.utils.utcnow()

    # Once AutoMod has already punished, there's nothing left for staff to click.
    view = None if outcome.startswith("Deleted and") else review_view(message, deleted=deleted)
    try:
        await channel.send(embed=e, view=view) if view else await channel.send(embed=e)
    except discord.HTTPException:
        pass


async def remove_message(message: discord.Message) -> None:
    try:
        await message.delete()
    except discord.HTTPException:
        pass
    try:
        await message.channel.send(
            embed=embed(f"A message from {message.author.mention} was removed by AutoMod."),
            allowed_mentions=discord.AllowedMentions.none(),
            delete_after=6,
        )
    except discord.HTTPException:
        pass


async def punish(message: discord.Message, verdict: Verdict) -> str:
    member: discord.Member = message.author
    guild = message.guild
    me = guild.me
    reason = f"AutoMod: {LABELS[verdict.category]}" + (f" · {verdict.reason}" if verdict.reason else "")
    can_act = member.top_role < me.top_role and guild.owner_id != member.id and me.guild_permissions.moderate_members

    if verdict.severity >= 3 and can_act:
        try:
            await member.timeout(timedelta(minutes=10), reason=reason)
            await notify(member, guild, "timed out", reason, "**Duration:** 10m")
            await log(guild, action="Timeout", target=member, moderator=me, reason=reason, extra="Duration: 10m")
            return "Deleted and timed out for 10m"
        except discord.HTTPException:
            pass  # fall back to a warning

    store.add_warning(guild.id, member.id, reason, me.id, time.time())
    await notify(member, guild, "warned", reason)
    await log(guild, action="Warn", target=member, moderator=me, reason=reason)
    return "Deleted and warned"


async def handle_message(message: discord.Message) -> None:
    if message.guild is None:
        return
    s = settings(message.guild.id)
    if not should_check(message, s):
        return

    verdict = await verdict_for(message)
    if not verdict or not verdict.flagged or verdict.confidence < CONFIDENCE[s["sensitivity"]]:
        return

    # Someone who may be at risk gets a human, never a punishment.
    if verdict.category == "self_harm":
        return await post_review(message, verdict, s, FLAGGED)

    outcome = FLAGGED
    if s["mode"] == "delete" and verdict.severity >= 2:
        await remove_message(message)
        outcome = "Deleted"
    elif s["mode"] == "punish" and verdict.severity >= 2:
        await remove_message(message)
        outcome = await punish(message, verdict)
    await post_review(message, verdict, s, outcome)
