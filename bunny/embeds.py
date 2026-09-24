from __future__ import annotations

import discord

from .config import COLOR


def embed(
    description: str | None = None,
    *,
    title: str | None = None,
    fields: list[tuple[str, str, bool]] | None = None,
    footer: str | None = None,
    thumbnail: str | None = None,
) -> discord.Embed:
    """A plain Bunny embed. Every message the bot sends goes through here."""
    e = discord.Embed(color=COLOR, title=title, description=description)
    for name, value, inline in fields or []:
        e.add_field(name=name, value=value, inline=inline)
    if footer:
        e.set_footer(text=footer)
    if thumbnail:
        e.set_thumbnail(url=thumbnail)
    return e


async def reply(
    interaction: discord.Interaction,
    description: str | None = None,
    *,
    ephemeral: bool = True,
    view: discord.ui.View | None = None,
    **options,
) -> None:
    """Reply (or follow up) with a single embed. Ephemeral by default."""
    kwargs = {"embed": embed(description, **options), "ephemeral": ephemeral}
    if view is not None:
        kwargs["view"] = view
    if interaction.response.is_done():
        await interaction.followup.send(**kwargs)
    else:
        await interaction.response.send_message(**kwargs)
