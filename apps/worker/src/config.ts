export interface WorkerConfig {
  port: number
  discordWebhookUrl: string | null
  rustplus: {
    serverIp: string | null
    appPort: number | null
    playerId: string | null
    playerToken: string | null
    smallOilEntityId: string | null
    largeOilEntityId: string | null
  }
}

export function getConfig(): WorkerConfig {
  return {
    port: Number(process.env.PORT ?? 8787),
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL ?? null,
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
