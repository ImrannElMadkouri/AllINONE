"""Tiny JSON-file store for settings, warnings, cases and temporary voice channels."""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

FILE = Path(__file__).resolve().parent.parent / "data" / "bunny.json"
log = logging.getLogger("bunny.store")


def _defaults() -> dict[str, Any]:
    return {"guilds": {}, "warnings": {}, "tempChannels": {}, "caseCounter": {}}


def _load() -> dict[str, Any]:
    try:
        return {**_defaults(), **json.loads(FILE.read_text("utf-8"))}
    except FileNotFoundError:
        return _defaults()
    except (OSError, json.JSONDecodeError) as err:
        log.error("could not read data file, starting fresh: %s", err)
        return _defaults()


data = _load()


def save() -> None:
    """Write via a temp file so a crash never leaves half a file."""
    FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2), "utf-8")
    os.replace(tmp, FILE)


def guild(guild_id: int) -> dict[str, Any]:
    return data["guilds"].setdefault(str(guild_id), {})


def set_guild(guild_id: int, **patch: Any) -> None:
    guild(guild_id).update(patch)
    save()


def next_case(guild_id: int) -> int:
    key = str(guild_id)
    data["caseCounter"][key] = data["caseCounter"].get(key, 0) + 1
    save()
    return data["caseCounter"][key]


def warnings(guild_id: int, user_id: int) -> list[dict[str, Any]]:
    return data["warnings"].get(str(guild_id), {}).get(str(user_id), [])


def add_warning(guild_id: int, user_id: int, reason: str, moderator_id: int, at: float) -> int:
    entries = data["warnings"].setdefault(str(guild_id), {}).setdefault(str(user_id), [])
    entries.append({"reason": reason, "moderatorId": moderator_id, "at": at})
    save()
    return len(entries)


def clear_warnings(guild_id: int, user_id: int) -> int:
    count = len(warnings(guild_id, user_id))
    data["warnings"].get(str(guild_id), {}).pop(str(user_id), None)
    save()
    return count


class _Temp:
    """Temporary (join-to-create) voice channels, keyed by channel ID."""

    def get(self, channel_id: int) -> dict[str, Any] | None:
        return data["tempChannels"].get(str(channel_id))

    def all(self) -> list[tuple[int, dict[str, Any]]]:
        return [(int(k), v) for k, v in data["tempChannels"].items()]

    def set(self, channel_id: int, value: dict[str, Any]) -> None:
        data["tempChannels"][str(channel_id)] = value
        save()

    def update(self, channel_id: int, **patch: Any) -> None:
        if entry := self.get(channel_id):
            entry.update(patch)
            save()

    def delete(self, channel_id: int) -> None:
        if data["tempChannels"].pop(str(channel_id), None) is not None:
            save()


temp = _Temp()
