"""The control panel buttons, plus the modals and user pickers they open."""

from __future__ import annotations

import time

import discord

from .. import store
from ..embeds import embed, reply
from . import manager
from .panel import status_text

# Discord only allows 2 renames per channel every 10 minutes. Track it ourselves so the
# owner gets a clear answer instead of the request silently waiting on the rate limit.
RENAME_WINDOW = 600
_renames: dict[int, list[float]] = {}

# Buttons anyone in the server can use; everything else is owner-only.
PUBLIC_ACTIONS = {"claim", "info"}


def resolve(interaction: discord.Interaction, *, owner_only: bool = True) -> tuple[dict | None, discord.VoiceChannel | None, str | None]:
    """Find the temp channel this interaction belongs to and check the user may control it."""
    entry = store.temp.get(interaction.channel_id)
    channel = interaction.guild.get_channel(interaction.channel_id) if interaction.guild else None
    if not entry or not isinstance(channel, discord.VoiceChannel):
        return None, None, "This channel is no longer managed by Bunny."
    if owner_only and entry["ownerId"] != interaction.user.id:
        return None, None, f"Only the channel owner <@{entry['ownerId']}> can do that."
    return entry, channel, None


def is_member_target(target: object) -> bool:
    return isinstance(target, discord.Member) or (isinstance(target, discord.Object) and target.type is discord.Member)


async def set_everyone(channel: discord.VoiceChannel, **perms: bool | None) -> None:
    everyone = channel.guild.default_role
    overwrite = channel.overwrites_for(everyone)
    overwrite.update(**perms)
    await channel.set_permissions(everyone, overwrite=overwrite)
    await manager.refresh_panel(channel)


class PanelView(discord.ui.View):
    """Persistent view: the custom IDs are fixed, so the buttons keep working after a restart."""

    def __init__(self) -> None:
        super().__init__(timeout=None)

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        action = interaction.data["custom_id"].split(":", 1)[1]
        _, _, error = resolve(interaction, owner_only=action not in PUBLIC_ACTIONS)
        if error:
            await reply(interaction, error)
            return False
        return True

    @discord.ui.button(label="Lock", custom_id="vc:lock", row=0)
    async def lock(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        _, channel, _ = resolve(interaction)
        await set_everyone(channel, connect=False)
        await reply(interaction, "Channel locked. Only permitted users can join.")

    @discord.ui.button(label="Unlock", custom_id="vc:unlock", row=0)
    async def unlock(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        _, channel, _ = resolve(interaction)
        await set_everyone(channel, connect=None)
        await reply(interaction, "Channel unlocked.")

    @discord.ui.button(label="Hide", custom_id="vc:hide", row=0)
    async def hide(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        _, channel, _ = resolve(interaction)
        await set_everyone(channel, view_channel=False)
        await reply(interaction, "Channel hidden. Only permitted users can see it.")

    @discord.ui.button(label="Unhide", custom_id="vc:unhide", row=0)
    async def unhide(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        _, channel, _ = resolve(interaction)
        await set_everyone(channel, view_channel=None)
        await reply(interaction, "Channel visible again.")

    @discord.ui.button(label="Rename", custom_id="vc:rename", row=1)
    async def rename(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        _, channel, _ = resolve(interaction)
        await interaction.response.send_modal(RenameModal(channel.name))

    @discord.ui.button(label="Limit", custom_id="vc:limit", row=1)
    async def limit(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        _, channel, _ = resolve(interaction)
        await interaction.response.send_modal(LimitModal(channel.user_limit))

    @discord.ui.button(label="Bitrate", custom_id="vc:bitrate", row=1)
    async def bitrate(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        _, channel, _ = resolve(interaction)
        await interaction.response.send_modal(BitrateModal(channel.bitrate // 1000, int(interaction.guild.bitrate_limit) // 1000))

    @discord.ui.button(label="Permit", custom_id="vc:permit", row=2)
    async def permit(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await reply(interaction, "Pick who can join and see your channel.", view=UserPickView("permit", "Select users to permit"))

    @discord.ui.button(label="Reject", custom_id="vc:reject", row=2)
    async def reject(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await reply(
            interaction,
            "Pick who to block. They will be disconnected if they are in the channel.",
            view=UserPickView("reject", "Select users to reject"),
        )

    @discord.ui.button(label="Transfer", custom_id="vc:transfer", row=2)
    async def transfer(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await reply(interaction, "Pick the new owner. They must be in the channel.", view=UserPickView("transfer", "Select new owner", max_values=1))

    @discord.ui.button(label="Claim", custom_id="vc:claim", row=2)
    async def claim(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        entry, channel, _ = resolve(interaction, owner_only=False)
        member_ids = {m.id for m in channel.members}
        if entry["ownerId"] == interaction.user.id:
            return await reply(interaction, "You already own this channel.")
        if entry["ownerId"] in member_ids:
            return await reply(interaction, f"<@{entry['ownerId']}> is still in the channel.")
        if interaction.user.id not in member_ids:
            return await reply(interaction, "You need to be in the channel to claim it.")
        await manager.set_owner(channel, interaction.user)
        await reply(interaction, f"{interaction.user.mention} now owns this channel.", ephemeral=False)

    @discord.ui.button(label="Info", custom_id="vc:info", row=3)
    async def info(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        entry, channel, _ = resolve(interaction, owner_only=False)
        bot_id = interaction.client.user.id
        members = [(t, o) for t, o in channel.overwrites.items() if is_member_target(t)]
        permitted = [f"<@{t.id}>" for t, o in members if t.id not in (entry["ownerId"], bot_id) and o.connect is True]
        rejected = [f"<@{t.id}>" for t, o in members if o.connect is False]
        size = f"{len(channel.members)}" + (f" / {channel.user_limit}" if channel.user_limit else "")
        await reply(
            interaction,
            title=channel.name,
            fields=[
                ("Owner", f"<@{entry['ownerId']}>", True),
                ("Created", f"<t:{int(entry['createdAt'])}:R>", True),
                ("Members", size, True),
                ("Status", status_text(channel), True),
                ("Bitrate", f"{channel.bitrate // 1000} kbps", True),
                ("Permitted", " ".join(permitted) or "None", False),
                ("Rejected", " ".join(rejected) or "None", False),
            ],
        )

    @discord.ui.button(label="Delete", custom_id="vc:delete", style=discord.ButtonStyle.danger, row=3)
    async def delete(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        _, channel, _ = resolve(interaction)
        await reply(interaction, "Deleting channel…")
        await manager.remove(channel)


class _ValueModal(discord.ui.Modal):
    def __init__(self, title: str, label: str, *, default: str, max_length: int) -> None:
        super().__init__(title=title)
        self.value = discord.ui.TextInput(label=label, default=default, max_length=max_length, required=True)
        self.add_item(self.value)


class RenameModal(_ValueModal):
    def __init__(self, current: str) -> None:
        super().__init__("Rename channel", "New name", default=current, max_length=100)

    async def on_submit(self, interaction: discord.Interaction) -> None:
        _, channel, error = resolve(interaction)
        if error:
            return await reply(interaction, error)
        name = self.value.value.strip()
        if not name:
            return await reply(interaction, "Name cannot be empty.")

        now = time.time()
        recent = [t for t in _renames.get(channel.id, []) if now - t < RENAME_WINDOW]
        if len(recent) >= 2:
            retry = int(recent[0] + RENAME_WINDOW)
            return await reply(interaction, f"Discord only allows 2 renames every 10 minutes. Try again <t:{retry}:R>.")

        await interaction.response.defer(ephemeral=True)
        await channel.edit(name=name[:100])
        _renames[channel.id] = [*recent, now]
        await interaction.followup.send(embed=embed(f"Channel renamed to **{channel.name}**."), ephemeral=True)


class LimitModal(_ValueModal):
    def __init__(self, current: int) -> None:
        super().__init__("User limit", "Limit (0–99, 0 = no limit)", default=str(current), max_length=2)

    async def on_submit(self, interaction: discord.Interaction) -> None:
        _, channel, error = resolve(interaction)
        if error:
            return await reply(interaction, error)
        text = self.value.value.strip()
        if not text.isdigit() or not 0 <= int(text) <= 99:
            return await reply(interaction, "Limit must be a whole number from 0 to 99.")

        limit = int(text)
        await channel.edit(user_limit=limit)
        await manager.refresh_panel(channel)
        await reply(interaction, f"User limit set to **{limit}**." if limit else "User limit removed.")


class BitrateModal(_ValueModal):
    def __init__(self, current: int, maximum: int) -> None:
        self.maximum = maximum
        super().__init__("Bitrate", f"Bitrate in kbps (8–{maximum})", default=str(current), max_length=3)

    async def on_submit(self, interaction: discord.Interaction) -> None:
        _, channel, error = resolve(interaction)
        if error:
            return await reply(interaction, error)
        text = self.value.value.strip()
        if not text.isdigit() or not 8 <= int(text) <= self.maximum:
            return await reply(interaction, f"Bitrate must be a whole number from 8 to {self.maximum}.")

        await channel.edit(bitrate=int(text) * 1000)
        await reply(interaction, f"Bitrate set to **{text} kbps**.")


class UserPickView(discord.ui.View):
    """A short-lived user picker for Permit, Reject and Transfer."""

    def __init__(self, action: str, placeholder: str, *, max_values: int = 10) -> None:
        super().__init__(timeout=120)
        self.action = action
        self.select = discord.ui.UserSelect(placeholder=placeholder, min_values=1, max_values=max_values)
        self.select.callback = self.on_select
        self.add_item(self.select)

    async def on_select(self, interaction: discord.Interaction) -> None:
        entry, channel, error = resolve(interaction)

        async def done(text: str) -> None:
            await interaction.response.edit_message(embed=embed(text), view=None)

        if error:
            return await done(error)

        bot_id = interaction.client.user.id
        users = [u for u in self.select.values if u.id not in (entry["ownerId"], bot_id)]
        mentions = ", ".join(u.mention for u in users)

        if self.action == "permit":
            if not users:
                return await done("No valid users selected.")
            for user in users:
                overwrite = channel.overwrites_for(user)
                overwrite.update(view_channel=True, connect=True)
                await channel.set_permissions(user, overwrite=overwrite)
            return await done(f"Permitted {mentions}.")

        if self.action == "reject":
            if not users:
                return await done("No valid users selected.")
            for user in users:
                overwrite = channel.overwrites_for(user)
                overwrite.update(connect=False)
                await channel.set_permissions(user, overwrite=overwrite)
                if isinstance(user, discord.Member) and user.voice and user.voice.channel == channel:
                    try:
                        await user.move_to(None, reason="Rejected by channel owner")
                    except discord.HTTPException:
                        pass
            return await done(f"Rejected {mentions}.")

        if self.action == "transfer":
            target = next((m for m in channel.members if users and m.id == users[0].id), None)
            if target is None or target.bot:
                return await done("The new owner must be a person in your channel.")
            await manager.set_owner(channel, target)
            try:
                await channel.send(embed=embed(f"Ownership transferred to {target.mention}."))
            except discord.HTTPException:
                pass
            return await done(f"{target.mention} now owns this channel.")
