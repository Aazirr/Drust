export interface BotConfig {
  port: number
  token: string | null
  applicationId: string | null
  guildId: string | null
  alertsChannelId: string | null
  rustRoleId: string | null
  internalToken: string | null
  workerUrl: string
}

function normalizeBaseUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  return value.replace(/\/+$/, '')
}

export function getConfig(): BotConfig {
  return {
    port: Number(process.env.PORT ?? 3001),
    token: process.env.DISCORD_BOT_TOKEN ?? null,
    applicationId: process.env.DISCORD_APPLICATION_ID ?? null,
    guildId: process.env.DISCORD_GUILD_ID ?? null,
    alertsChannelId: process.env.DISCORD_ALERTS_CHANNEL_ID ?? null,
    rustRoleId: process.env.DISCORD_RUST_ROLE_ID ?? null,
    internalToken: process.env.DRUST_BOT_INTERNAL_TOKEN ?? null,
    workerUrl: normalizeBaseUrl(process.env.DRUST_WORKER_URL) ?? 'http://localhost:8787',
  }
}
