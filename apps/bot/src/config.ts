export interface BotConfig {
  port: number
  token: string | null
  applicationId: string | null
  guildId: string | null
  workerUrl: string
}

export function getConfig(): BotConfig {
  return {
    port: Number(process.env.PORT ?? 3001),
    token: process.env.DISCORD_BOT_TOKEN ?? null,
    applicationId: process.env.DISCORD_APPLICATION_ID ?? null,
    guildId: process.env.DISCORD_GUILD_ID ?? null,
    workerUrl: process.env.DRUST_WORKER_URL ?? 'http://localhost:8787',
  }
}
