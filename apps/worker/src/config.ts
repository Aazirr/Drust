export interface WorkerConfig {
  port: number
  databaseUrl: string | null
  discordBotUrl: string | null
  discordBotToken: string | null
  discordBotHealthUrl: string | null
  rustplus: {
    serverIp: string | null
    appPort: number | null
    playerId: string | null
    playerToken: string | null
    smallOilEntityId: string | null
    largeOilEntityId: string | null
  }
}

function normalizeBaseUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  return value.replace(/\/+$/, '')
}

export function getConfig(): WorkerConfig {
  return {
    port: Number(process.env.PORT ?? 8787),
    databaseUrl: process.env.DATABASE_URL ?? null,
    discordBotUrl: normalizeBaseUrl(process.env.DRUST_DISCORD_BOT_URL),
    discordBotToken: process.env.DRUST_BOT_INTERNAL_TOKEN ?? null,
    discordBotHealthUrl: normalizeBaseUrl(process.env.DRUST_DISCORD_BOT_HEALTH_URL),
    rustplus: {
      serverIp: process.env.RUSTPLUS_SERVER_IP ?? null,
      appPort: process.env.RUSTPLUS_APP_PORT ? Number(process.env.RUSTPLUS_APP_PORT) : null,
      playerId: process.env.RUSTPLUS_PLAYER_ID ?? null,
      playerToken: process.env.RUSTPLUS_PLAYER_TOKEN ?? null,
      smallOilEntityId: process.env.RUSTPLUS_SMALL_OIL_ENTITY_ID ?? null,
      largeOilEntityId: process.env.RUSTPLUS_LARGE_OIL_ENTITY_ID ?? null,
    },
  }
}
