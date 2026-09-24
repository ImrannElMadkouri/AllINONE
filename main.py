import sys

from bunny.bot import Bunny
from bunny.config import TOKEN

if __name__ == "__main__":
    if not TOKEN:
        sys.exit("DISCORD_TOKEN is missing. Copy .env.example to .env and fill it in.")
    Bunny().run(TOKEN)
