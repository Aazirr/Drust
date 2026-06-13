import type { AlarmTriggerInput, RustplusServerPairing } from '@drust/domain'
import type { WorkerConfig } from './config.js'
import { WorkerState } from './state.js'

type RustPlusLike = {
  on: (event: string, handler: (...args: any[]) => void) => void
  connect: () => void
  disconnect: () => void
  getEntityInfo: (entityId: string, callback?: (message: unknown) => void) => void
  getInfo: (callback?: (message: any) => void) => void
  getTime: (callback?: (message: any) => void) => void
}

export interface RustplusConnectionInput {
  serverIp: string
  appPort: number
  playerId: string
  playerToken: string
  smallOilEntityId: string | null
  largeOilEntityId: string | null
}

function isRustplusConfigured(config: {
  serverIp: string | null
  appPort: number | null
  playerId: string | null
  playerToken: string | null
}): config is {
  serverIp: string
  appPort: number
  playerId: string
  playerToken: string
} {
  return Boolean(config.serverIp && config.appPort && config.playerId && config.playerToken)
}

function createConnectionInputFromWorkerConfig(config: WorkerConfig): RustplusConnectionInput | null {
  if (!isRustplusConfigured(config.rustplus)) {
    return null
  }

  return {
    serverIp: config.rustplus.serverIp,
    appPort: config.rustplus.appPort,
    playerId: config.rustplus.playerId,
    playerToken: config.rustplus.playerToken,
    smallOilEntityId: config.rustplus.smallOilEntityId,
    largeOilEntityId: config.rustplus.largeOilEntityId,
  }
}

export function createConnectionInputFromPairing(
  pairing: RustplusServerPairing,
  config: WorkerConfig,
): RustplusConnectionInput {
  return {
    serverIp: pairing.serverIp,
    appPort: pairing.appPort,
    playerId: pairing.playerId,
    playerToken: pairing.playerToken,
    smallOilEntityId: config.rustplus.smallOilEntityId,
    largeOilEntityId: config.rustplus.largeOilEntityId,
  }
}

export class RustplusBridgeManager {
  private client: RustPlusLike | null = null
  private sessionId = 0
  private currentConnection: RustplusConnectionInput | null = null

  constructor(
    private readonly state: WorkerState,
    private readonly onAlarmTriggered: (input: AlarmTriggerInput) => Promise<void>,
  ) {}

  async startFromConfig(config: WorkerConfig): Promise<void> {
    const connection = createConnectionInputFromWorkerConfig(config)
    if (!connection) {
      this.state.setRustplusMode('mock')
      return
    }

    await this.connect(connection)
  }

  async importPairing(pairing: RustplusServerPairing, config: WorkerConfig): Promise<void> {
    const connection = createConnectionInputFromPairing(pairing, config)
    await this.connect(connection)
  }

  updateAlarmBinding(target: 'small-oil' | 'large-oil', entityId: string): void {
    if (!this.currentConnection) {
      return
    }

    if (target === 'small-oil') {
      this.currentConnection.smallOilEntityId = entityId
    } else {
      this.currentConnection.largeOilEntityId = entityId
    }

    if (this.client) {
      this.client.getEntityInfo(entityId)
    }
  }

  private async connect(connection: RustplusConnectionInput): Promise<void> {
    const currentSession = ++this.sessionId
    this.disconnectCurrentClient()
    this.currentConnection = { ...connection }

    const module = await import('@liamcottle/rustplus.js')
    const RustPlus = (module.default ?? module) as new (
      serverIp: string,
      appPort: number,
      playerId: string,
      playerToken: string,
    ) => RustPlusLike

    const client = new RustPlus(
      connection.serverIp,
      connection.appPort,
      connection.playerId,
      connection.playerToken,
    )

    this.client = client

    client.on('connecting', () => {
      if (currentSession !== this.sessionId) {
        return
      }

      this.state.updateServerConnection({ connectionStatus: 'connecting' })
    })

    client.on('connected', () => {
      if (currentSession !== this.sessionId) {
        return
      }

      this.state.setRustplusMode('connected')
      client.getInfo((message: any) => {
        if (currentSession !== this.sessionId) {
          return
        }

        const info = message?.response?.info
        if (!info) {
          return
        }

        this.state.updateServerConnection({
          serverName: info.name ?? this.state.getSnapshot().serverConnection.serverName,
          mapSize: info.mapSize ?? this.state.getSnapshot().serverConnection.mapSize,
          wipeTime: info.wipeTime
            ? new Date(info.wipeTime * 1000).toISOString()
            : this.state.getSnapshot().serverConnection.wipeTime,
          lastHeartbeatAt: new Date().toISOString(),
          lastError: null,
        })
      })

      client.getTime((message: any) => {
        if (currentSession !== this.sessionId) {
          return
        }

        const time = message?.response?.time
        if (!time) {
          return
        }

        this.state.updateServerConnection({
          currentRustTime: `${Number(time.time).toFixed(2)} Rust`,
          lastHeartbeatAt: new Date().toISOString(),
        })
      })

      const entityIds = [connection.smallOilEntityId, connection.largeOilEntityId].filter(Boolean) as string[]

      entityIds.forEach((entityId) => {
        client.getEntityInfo(entityId)
      })
    })

    client.on('disconnected', () => {
      if (currentSession !== this.sessionId) {
        return
      }

      this.state.updateServerConnection({
        connectionStatus: 'disconnected',
        lastError: 'Rust+ disconnected.',
        lastHeartbeatAt: new Date().toISOString(),
      })
    })

    client.on('error', (error: Error) => {
      if (currentSession !== this.sessionId) {
        return
      }

      this.state.updateServerConnection({
        connectionStatus: 'degraded',
        lastError: error.message,
        lastHeartbeatAt: new Date().toISOString(),
      })
    })

    client.on('message', async (message: any) => {
      if (currentSession !== this.sessionId) {
        return
      }

      const entityChanged = message?.broadcast?.entityChanged
      if (!entityChanged || !entityChanged.payload?.value) {
        return
      }

      const entityId = String(entityChanged.entityId)
      const target =
        entityId === connection.smallOilEntityId
          ? 'small-oil'
          : entityId === connection.largeOilEntityId
            ? 'large-oil'
            : null

      if (!target) {
        return
      }

      await this.onAlarmTriggered({
        target,
        entityId,
        source: 'smart-alarm',
        triggeredAt: new Date().toISOString(),
      })
    })

    client.connect()
  }

  private disconnectCurrentClient(): void {
    if (!this.client) {
      return
    }

    this.client.disconnect()
    this.client = null
  }
}
