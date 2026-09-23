# Bunny

A clean all-in-one Discord moderation bot with join-to-create voice channels. Every message Bunny sends is an embed with a `#222222` bar.

## Features

**Moderation**: `/ban` `/unban` `/kick` `/timeout` `/untimeout` `/warn` `/warnings` `/clearwarnings` `/purge` `/lock` `/unlock` `/slowmode` `/nick`

- Role hierarchy checks, so moderators can't act on people at or above their own role or Bunny's.
- The user gets a DM explaining the action and the reason.
- Numbered cases are posted to a mod-log channel (`/setup modlog`).

**AutoMod**: AI moderation that reads what a message means, not just which words it uses. It catches harassment, hate, threats, sexual content, scams/phishing and spam, including bypass spellings. It works in any language.

| Mode | What happens |
| --- | --- |
| Flag only (default) | Nothing is deleted. Flags go to a review channel with **Delete / Warn / Timeout 10m / Dismiss** buttons. |
| Delete | Clear violations are removed. Everything is still sent for review. |
| Auto-punish | Clear violations are removed and the author is warned, or timed out for 10m when severe. The action is logged as a normal case. |

- Self-harm messages are never deleted or punished. They are only flagged so staff can reach out.
- Skipped: bots, staff with Manage Messages, exempt channels, categories and roles, and very short messages.
- Cost controls: each user can have at most 6 messages checked per 30s, and identical copy-paste messages reuse the earlier result.
- If the AI service is down or out of credit, AutoMod pauses itself and the rest of the bot keeps working.
- Commands: `/automod enable` `disable` `mode` `sensitivity` `exempt` `status`.

**Join to create**: `/setup voice` creates a **Join to Create** channel. When a member joins it, Bunny creates a voice channel for them and moves them into it. It also posts a control panel in that channel's chat:

| Button | What it does |
| --- | --- |
| Lock / Unlock | Stop or allow `@everyone` joining |
| Hide / Unhide | Hide or show the channel |
| Rename | Change the name (Discord allows 2 renames per 10 min) |
| Limit | Set the user limit (0–99) |
| Bitrate | Set the audio quality (up to the server's boost limit) |
| Permit | Let specific users join and see it, even when it's locked or hidden |
| Reject | Block users and disconnect them |
| Transfer | Give ownership to someone in the channel |
| Claim | Take ownership once the owner has left |
| Info | Show the channel's details, permitted users and rejected users |
| Delete | Delete the channel |

Only the owner can use the controls, except Claim and Info. The channel is deleted when it's empty. `/voice panel` resends the panel.

## Setup

1. Create an application at https://discord.com/developers/applications and add a bot. If you use AutoMod, turn on **Message Content Intent** under *Bot → Privileged Gateway Intents*. Nothing else needs it.
2. Install and configure:
   ```sh
   npm install
   cp .env.example .env   # fill in DISCORD_TOKEN and CLIENT_ID
   ```
   For AutoMod, also set `OPENROUTER_API_KEY` and `AUTOMOD_MODEL` (an OpenRouter model ID). Leave them empty to run without AutoMod.
3. Invite the bot with the permissions it needs (replace `CLIENT_ID`):
   ```
   https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot+applications.commands&permissions=1099932199958
   ```
   Put Bunny's role **above** the roles it should moderate.
4. Register the slash commands, then start the bot:
   ```sh
   npm run deploy
   npm start
   ```
   Set `DEV_GUILD_ID` in `.env` while testing so commands register in your server instantly. Global registration can take up to an hour.
5. In Discord, run `/setup modlog`, `/setup voice` and `/automod enable`.

## Project layout

```
src/
  index.js              client + event loading
  deploy-commands.js    registers slash commands
  config.js             token, embed colour, voice name template
  commands/moderation/  moderation commands
  commands/config/      /setup, /voice, /help
  events/               ready, interactions, voice state, channel delete
  voice/                join-to-create: manager, panel, controls
  automod/              AutoMod: classifier, engine, review buttons
  utils/                embed helper, JSON store, moderation helpers
data/                   bunny.json (settings, warnings, temp channels) — created at runtime
```

`npm run check` loads every module and validates the command definitions without connecting to Discord.
