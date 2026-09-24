"""Creating, cleaning up and transferring join-to-create voice channels."""

from __future__ import annotations

import logging
import time

import discord

from .. import store
from ..config import VOICE_NAME_TEMPLATE
from .panel import panel_embed

log = logging.getLogger("bunny.voice")

# What the owner of a temp channel is allowed to do directly in Discord.
OWNER_PERMS = dict(view_channel=True, connect=True, speak=True, stream=True, send_messages=True, move_members=True)

# What Bunny needs inside each temp channel to run the dashboard.
BOT_PERMS = dict(
    view_channel=True,
    connect=True,
    send_messages=True,
    embed_links=True,
    read_message_history=True,
    manage_channels=True,
    manage_permissions=True,
    move_members=True,
)

CREATE_COOLDOWN = 10
_last_create: dict[int, float] = {}


def owned_channel(guild: discord.Guild, user_id: int) -> discord.VoiceChannel | None:
    """The temp channel a user currently owns in a guild, if any."""
    for channel_id, entry in store.temp.all():
        if entry["guildId"] == guild.id and entry["ownerId"] == user_id:
            channel = guild.get_channel(channel_id)
            if isinstance(channel, discord.VoiceChannel):
                return channel
    return None


async def create(member: discord.Member, settings: dict) -> None:
    from .views import PanelView  # imported here to avoid a circular import

    guild = member.guild

    # Already own one? Just move them back into it instead of creating a second.
    if existing := owned_channel(guild, member.id):
        try:
            await member.move_to(existing)
        except discord.HTTPException:
            pass
        return

    now = time.time()
    if now - _last_create.get(member.id, 0) < CREATE_COOLDOWN:
        try:
            await member.move_to(None, reason="Join-to-create cooldown")
        except discord.HTTPException:
            pass
        return
    _last_create[member.id] = now

    category = guild.get_channel(settings.get("categoryId") or 0)
    hub = guild.get_channel(settings.get("hubId") or 0)
    if not isinstance(category, discord.CategoryChannel):
        category = hub.category if hub else None

    # Start from the category's permissions so server-wide rules (muted roles etc.) still apply.
    overwrites = dict((category or hub).overwrites) if (category or hub) else {}
    overwrites[member] = discord.PermissionOverwrite(**OWNER_PERMS)
    overwrites[guild.me] = discord.PermissionOverwrite(**BOT_PERMS)

    channel = await guild.create_voice_channel(
        VOICE_NAME_TEMPLATE.replace("{user}", member.display_name)[:100],
        category=category,
        bitrate=hub.bitrate if isinstance(hub, discord.VoiceChannel) else None,
        overwrites=overwrites,
        reason=f"Join-to-create for {member}",
    )
    store.temp.set(channel.id, {"guildId": guild.id, "ownerId": member.id, "createdAt": now})

    try:
        await member.move_to(channel)
    except discord.HTTPException:
        # They left before we could move them. Don't leave an empty channel behind.
        return await remove(channel)

    try:
        panel = await channel.send(
            content=member.mention,
            embed=panel_embed(channel, member.id),
            view=PanelView(),
            allowed_mentions=discord.AllowedMentions(users=[member]),
        )
        store.temp.update(channel.id, panelMessageId=panel.id)
    except discord.HTTPException as err:
        log.warning("could not send voice panel in %s: %s", channel.id, err)


async def remove(channel: discord.abc.GuildChannel) -> None:
    store.temp.delete(channel.id)
    try:
        await channel.delete(reason="Temporary voice channel empty")
    except discord.HTTPException:
        pass


async def refresh_panel(channel: discord.VoiceChannel) -> None:
    """Re-render the dashboard after a change."""
    entry = store.temp.get(channel.id)
    if not entry or not entry.get("panelMessageId"):
        return
    try:
        message = channel.get_partial_message(entry["panelMessageId"])
        await message.edit(embed=panel_embed(channel, entry["ownerId"]))
    except discord.HTTPException:
        pass


async def set_owner(channel: discord.VoiceChannel, member: discord.Member) -> None:
    """Give ownership to `member`, moving the owner-only permissions across."""
    entry = store.temp.get(channel.id)
    old_owner = channel.guild.get_member(entry["ownerId"])
    if old_owner and old_owner.id != member.id:
        overwrite = channel.overwrites_for(old_owner)
        overwrite.move_members = None
        await channel.set_permissions(old_owner, overwrite=overwrite)

    overwrite = channel.overwrites_for(member)
    overwrite.update(**OWNER_PERMS)
    await channel.set_permissions(member, overwrite=overwrite)
    store.temp.update(channel.id, ownerId=member.id)
    await refresh_panel(channel)


async def sweep(client: discord.Client) -> None:
    """On startup, drop channels that were deleted or emptied while the bot was offline."""
    for channel_id, entry in store.temp.all():
        guild = client.get_guild(entry["guildId"])
        channel = guild.get_channel(channel_id) if guild else None
        if channel is None:
            store.temp.delete(channel_id)
        elif not channel.members:
            await remove(channel)
