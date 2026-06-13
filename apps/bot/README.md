# Drust Discord Bot

This service connects your Discord bot to the Drust worker API.

## Required Environment Variables

- `DISCORD_BOT_TOKEN`
- `DISCORD_APPLICATION_ID`
- `DISCORD_GUILD_ID`
- `DRUST_WORKER_URL`

## Local Start

```bash
npm --workspace @drust/bot run dev
```

## Initial Commands

- `/status`
- `/pairing-status`
- `/op-status`
- `/timer-start`
- `/timer-extend`
- `/op-close`
