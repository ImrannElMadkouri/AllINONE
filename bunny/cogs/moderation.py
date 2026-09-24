from __future__ import annotations

import time
from datetime import timedelta

import discord
from discord import app_commands
from discord.ext import commands

from .. import store
from ..embeds import embed, reply
from ..moderation import check_hierarchy, format_duration, log, notify, parse_duration

NO_REASON = "No reason provided"
MAX_TIMEOUT = 28 * 86400  # Discord's timeout limit
Reason = app_commands.Range[str, 1, 500]


def plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def case_footer(case_id: int, dmed: bool) -> str:
    return f"Case #{case_id}" + ("" if dmed else " · could not DM user")


class Moderation(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(description="Ban a user from the server.")
    @app_commands.default_permissions(ban_members=True)
    @app_commands.guild_only()
    @app_commands.describe(user="User to ban", reason="Reason", delete_messages="Delete their recent messages")
    @app_commands.choices(
        delete_messages=[
            app_commands.Choice(name="Don't delete any", value=0),
            app_commands.Choice(name="Previous hour", value=3600),
            app_commands.Choice(name="Previous 24 hours", value=86400),
            app_commands.Choice(name="Previous 7 days", value=604800),
        ]
    )
    async def ban(self, interaction: discord.Interaction, user: discord.User, reason: Reason | None = None, delete_messages: int = 0) -> None:
        reason = reason or NO_REASON
        # Users who already left can still be banned; only check hierarchy for current members.
        member = user if isinstance(user, discord.Member) else None
        if member and (error := check_hierarchy(interaction, member, "ban")):
            return await reply(interaction, error)

        dmed = await notify(user, interaction.guild, "banned", reason) if member else False
        await interaction.guild.ban(user, reason=f"{interaction.user}: {reason}", delete_message_seconds=delete_messages)
        case_id = await log(interaction.guild, action="Ban", target=user, moderator=interaction.user, reason=reason)
        await reply(interaction, f"**{user}** was banned.\n**Reason:** {reason}", ephemeral=False, footer=case_footer(case_id, dmed))

    @app_commands.command(description="Unban a user by their ID.")
    @app_commands.default_permissions(ban_members=True)
    @app_commands.guild_only()
    @app_commands.describe(user_id="ID of the banned user", reason="Reason")
    async def unban(self, interaction: discord.Interaction, user_id: str, reason: Reason | None = None) -> None:
        reason = reason or NO_REASON
        if not user_id.strip().isdigit():
            return await reply(interaction, "That isn't a valid user ID.")
        try:
            ban = await interaction.guild.fetch_ban(discord.Object(int(user_id)))
        except discord.NotFound:
            return await reply(interaction, f"No ban found for `{user_id}`.")

        await interaction.guild.unban(ban.user, reason=f"{interaction.user}: {reason}")
        case_id = await log(interaction.guild, action="Unban", target=ban.user, moderator=interaction.user, reason=reason)
        await reply(interaction, f"**{ban.user}** was unbanned.", ephemeral=False, footer=f"Case #{case_id}")

    @app_commands.command(description="Kick a member from the server.")
    @app_commands.default_permissions(kick_members=True)
    @app_commands.guild_only()
    @app_commands.describe(user="Member to kick", reason="Reason")
    async def kick(self, interaction: discord.Interaction, user: discord.Member, reason: Reason | None = None) -> None:
        reason = reason or NO_REASON
        if error := check_hierarchy(interaction, user, "kick"):
            return await reply(interaction, error)

        dmed = await notify(user, interaction.guild, "kicked", reason)
        await user.kick(reason=f"{interaction.user}: {reason}")
        case_id = await log(interaction.guild, action="Kick", target=user, moderator=interaction.user, reason=reason)
        await reply(interaction, f"**{user}** was kicked.\n**Reason:** {reason}", ephemeral=False, footer=case_footer(case_id, dmed))

    @app_commands.command(description="Time out a member.")
    @app_commands.default_permissions(moderate_members=True)
    @app_commands.guild_only()
    @app_commands.describe(user="Member to time out", duration="e.g. 10m, 2h, 1d (max 28d)", reason="Reason")
    async def timeout(self, interaction: discord.Interaction, user: discord.Member, duration: str, reason: Reason | None = None) -> None:
        reason = reason or NO_REASON
        seconds = parse_duration(duration)
        if not seconds:
            return await reply(interaction, "Invalid duration. Use something like `10m`, `2h` or `1d12h`.")
        if seconds > MAX_TIMEOUT:
            return await reply(interaction, "Timeouts can be at most 28 days.")
        if error := check_hierarchy(interaction, user, "time out"):
            return await reply(interaction, error)

        length = format_duration(seconds)
        await user.timeout(timedelta(seconds=seconds), reason=f"{interaction.user}: {reason}")
        dmed = await notify(user, interaction.guild, "timed out", reason, f"**Duration:** {length}")
        case_id = await log(
            interaction.guild, action="Timeout", target=user, moderator=interaction.user, reason=reason, extra=f"Duration: {length}"
        )
        await reply(
            interaction,
            f"**{user}** was timed out for **{length}**.\n**Reason:** {reason}",
            ephemeral=False,
            footer=case_footer(case_id, dmed),
        )

    @app_commands.command(description="Remove a member's timeout.")
    @app_commands.default_permissions(moderate_members=True)
    @app_commands.guild_only()
    @app_commands.describe(user="Member", reason="Reason")
    async def untimeout(self, interaction: discord.Interaction, user: discord.Member, reason: Reason | None = None) -> None:
        reason = reason or NO_REASON
        if error := check_hierarchy(interaction, user, "un-timeout"):
            return await reply(interaction, error)
        if not user.is_timed_out():
            return await reply(interaction, f"{user.mention} is not timed out.")

        await user.timeout(None, reason=f"{interaction.user}: {reason}")
        case_id = await log(interaction.guild, action="Untimeout", target=user, moderator=interaction.user, reason=reason)
        await reply(interaction, f"**{user}**'s timeout was removed.", ephemeral=False, footer=f"Case #{case_id}")

    @app_commands.command(description="Warn a member.")
    @app_commands.default_permissions(moderate_members=True)
    @app_commands.guild_only()
    @app_commands.describe(user="Member to warn", reason="Reason")
    async def warn(self, interaction: discord.Interaction, user: discord.Member, reason: Reason) -> None:
        if error := check_hierarchy(interaction, user, "warn"):
            return await reply(interaction, error)

        total = store.add_warning(interaction.guild.id, user.id, reason, interaction.user.id, time.time())
        dmed = await notify(user, interaction.guild, "warned", reason)
        case_id = await log(interaction.guild, action="Warn", target=user, moderator=interaction.user, reason=reason)
        await reply(
            interaction,
            f"**{user}** was warned. They now have **{plural(total, 'warning')}**.\n**Reason:** {reason}",
            ephemeral=False,
            footer=case_footer(case_id, dmed),
        )

    @app_commands.command(description="View a member's warnings.")
    @app_commands.default_permissions(moderate_members=True)
    @app_commands.guild_only()
    @app_commands.describe(user="Member")
    async def warnings(self, interaction: discord.Interaction, user: discord.User) -> None:
        entries = store.warnings(interaction.guild.id, user.id)
        if not entries:
            return await reply(interaction, f"**{user}** has no warnings.")

        # Show the most recent 15 so the embed stays within Discord's limits.
        start = max(0, len(entries) - 15)
        lines = [
            f"**{start + i + 1}.** {w['reason']} · <@{w['moderatorId']}> <t:{int(w['at'])}:R>"
            for i, w in enumerate(entries[start:])
        ]
        await reply(
            interaction,
            "\n".join(lines),
            title=f"Warnings · {user}",
            footer=f"{len(entries)} total",
            thumbnail=user.display_avatar.url,
        )

    @app_commands.command(description="Clear all of a member's warnings.")
    @app_commands.default_permissions(moderate_members=True)
    @app_commands.guild_only()
    @app_commands.describe(user="Member")
    async def clearwarnings(self, interaction: discord.Interaction, user: discord.User) -> None:
        cleared = store.clear_warnings(interaction.guild.id, user.id)
        if not cleared:
            return await reply(interaction, f"**{user}** has no warnings.")

        await log(interaction.guild, action="Clear warnings", target=user, moderator=interaction.user, reason=f"Cleared {plural(cleared, 'warning')}")
        await reply(interaction, f"Cleared **{plural(cleared, 'warning')}** from **{user}**.", ephemeral=False)

    @app_commands.command(description="Bulk delete recent messages in this channel.")
    @app_commands.default_permissions(manage_messages=True)
    @app_commands.guild_only()
    @app_commands.describe(amount="How many (1–100)", user="Only delete messages from this user")
    async def purge(self, interaction: discord.Interaction, amount: app_commands.Range[int, 1, 100], user: discord.User | None = None) -> None:
        await interaction.response.defer(ephemeral=True)

        matched = 0

        def check(message: discord.Message) -> bool:
            nonlocal matched
            if matched >= amount or (user and message.author.id != user.id):
                return False
            matched += 1
            return True

        # Bulk delete only works on messages from the last 14 days.
        cutoff = discord.utils.utcnow() - timedelta(days=14) + timedelta(minutes=1)
        deleted = await interaction.channel.purge(limit=100 if user else amount, check=check, after=cutoff, reason=str(interaction.user))
        who = f" from {user.mention}" if user else ""
        await interaction.followup.send(embed=embed(f"Deleted **{plural(len(deleted), 'message')}**{who}."), ephemeral=True)

    @app_commands.command(description="Stop @everyone from sending messages in a channel.")
    @app_commands.default_permissions(manage_channels=True)
    @app_commands.guild_only()
    @app_commands.describe(channel="Defaults to this channel", reason="Reason")
    async def lock(self, interaction: discord.Interaction, channel: discord.TextChannel | None = None, reason: Reason | None = None) -> None:
        channel = channel or interaction.channel
        reason = reason or NO_REASON
        everyone = interaction.guild.default_role
        overwrite = channel.overwrites_for(everyone)
        overwrite.send_messages = False
        await channel.set_permissions(everyone, overwrite=overwrite, reason=f"{interaction.user}: {reason}")
        await reply(interaction, f"{channel.mention} has been locked.\n**Reason:** {reason}", ephemeral=False)

    @app_commands.command(description="Let @everyone send messages in a channel again.")
    @app_commands.default_permissions(manage_channels=True)
    @app_commands.guild_only()
    @app_commands.describe(channel="Defaults to this channel")
    async def unlock(self, interaction: discord.Interaction, channel: discord.TextChannel | None = None) -> None:
        channel = channel or interaction.channel
        everyone = interaction.guild.default_role
        overwrite = channel.overwrites_for(everyone)
        # None resets to inheriting from the category instead of forcing "allow".
        overwrite.send_messages = None
        await channel.set_permissions(everyone, overwrite=overwrite, reason=str(interaction.user))
        await reply(interaction, f"{channel.mention} has been unlocked.", ephemeral=False)

    @app_commands.command(description="Set slowmode for this channel.")
    @app_commands.default_permissions(manage_channels=True)
    @app_commands.guild_only()
    @app_commands.describe(duration='e.g. 5s, 1m, 2h, or "off"')
    async def slowmode(self, interaction: discord.Interaction, duration: str) -> None:
        seconds = 0 if duration.lower() == "off" else parse_duration(duration)
        if seconds is None:
            return await reply(interaction, "Invalid duration. Use something like `5s`, `1m` or `off`.")
        if seconds > 6 * 3600:
            return await reply(interaction, "Slowmode can be at most 6 hours.")

        await interaction.channel.edit(slowmode_delay=seconds, reason=str(interaction.user))
        await reply(interaction, f"Slowmode set to **{format_duration(seconds)}**." if seconds else "Slowmode disabled.", ephemeral=False)

    @app_commands.command(description="Change or reset a member's nickname.")
    @app_commands.default_permissions(manage_nicknames=True)
    @app_commands.guild_only()
    @app_commands.describe(user="Member", nickname="Leave empty to reset")
    async def nick(self, interaction: discord.Interaction, user: discord.Member, nickname: app_commands.Range[str, 1, 32] | None = None) -> None:
        if error := check_hierarchy(interaction, user, "rename"):
            return await reply(interaction, error)

        await user.edit(nick=nickname, reason=str(interaction.user))
        text = f"{user.mention}'s nickname is now **{nickname}**." if nickname else f"{user.mention}'s nickname was reset."
        await reply(interaction, text, ephemeral=False)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Moderation(bot))
