import os

from dotenv import load_dotenv

load_dotenv()

TOKEN = os.getenv("DISCORD_TOKEN")

# Optional: sync slash commands to one server instantly while developing.
_dev_guild = os.getenv("DEV_GUILD_ID", "").strip()
DEV_GUILD_ID = int(_dev_guild) if _dev_guild else None

# Every embed Bunny sends uses this colour on its left bar.
COLOR = 0x222222

# Default name for new join-to-create channels. {user} is replaced with the owner's display name.
VOICE_NAME_TEMPLATE = "{user}'s channel"

# AutoMod. Both must be set for AutoMod to be available.
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY") or None
AUTOMOD_MODEL = os.getenv("AUTOMOD_MODEL") or None
