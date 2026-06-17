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

const ALARM_DEDUPE_WINDOW_MS = 30_000
const HEARTBEAT_INTERVAL_MS = 30_000
const HEARTBEAT_DEGRADED_THRESHOLD = 2
const HEARTBEAT_DISCONNECTED_THRESHOLD = 5

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
  private lastTriggeredAt = new Map<string, number>()
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private heartbeatFailures = 0

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

  updateAlarmBinding(target: 'small-oil' | 'large-oil', entityId: string | null): void {
    if (!this.currentConnection) {
      return
    }

    if (target === 'small-oil') {
      this.currentConnection.smallOilEntityId = entityId
    } else {
      this.currentConnection.largeOilEntityId = entityId
    }

    if (this.client && entityId) {
      this.client.getEntityInfo(entityId)
    }
  }

  private isDuplicateTrigger(entityId: string): boolean {
    const lastTrigger = this.lastTriggeredAt.get(entityId) ?? 0
    return Date.now() - lastTrigger < ALARM_DEDUPE_WINDOW_MS
  }

  private recordTrigger(entityId: string): void {
    this.lastTriggeredAt.set(entityId, Date.now())
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }

    this.heartbeatFailures = 0
  }

  private startHeartbeat(): void {
    this.clearHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (!this.client) {
        return
      }

      this.client.getTime((message: any) => {
        if (!this.client) {
          return
        }

        const time = message?.response?.time
        if (!time) {
          this.heartbeatFailures++

          if (this.heartbeatFailures === HEARTBEAT_DEGRADED_THRESHOLD) {
            this.state.updateServerConnection({
              connectionStatus: 'degraded',
              lastError: 'Rust+ heartbeat missed.',
              lastHeartbeatAt: new Date().toISOString(),
            })
          }

          if (this.heartbeatFailures >= HEARTBEAT_DISCONNECTED_THRESHOLD) {
            this.state.updateServerConnection({
              connectionStatus: 'disconnected',
              lastError: `Rust+ heartbeat lost after ${this.heartbeatFailures} failures.`,
              lastHeartbeatAt: new Date().toISOString(),
            })
          }

          return
        }

        this.heartbeatFailures = 0
        this.state.updateServerConnection({
          currentRustTime: `${Number(time.time).toFixed(2)} Rust`,
          lastHeartbeatAt: new Date().toISOString(),
        })
      })
    }, HEARTBEAT_INTERVAL_MS)
  }

  private async connect(connection: RustplusConnectionInput): Promise<void> {
    const currentSession = ++this.sessionId
    this.disconnectCurrentClient()
    const activeConnection = { ...connection }
    this.currentConnection = activeConnection

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
      this.startHeartbeat()

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

      const entityIds = [activeConnection.smallOilEntityId, activeConnection.largeOilEntityId].filter(Boolean) as string[]

      entityIds.forEach((entityId) => {
        client.getEntityInfo(entityId)
      })
    })

    client.on('disconnected', () => {
      if (currentSession !== this.sessionId) {
        return
      }

      this.clearHeartbeat()
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
        entityId === activeConnection.smallOilEntityId
          ? 'small-oil'
          : entityId === activeConnection.largeOilEntityId
            ? 'large-oil'
            : null

      if (!target) {
        return
      }

      /* Deduplicate: skip triggers from the same entity within the cooldown window. */
      if (this.isDuplicateTrigger(entityId)) {
        return
      }

      this.recordTrigger(entityId)

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

    this.clearHeartbeat()

    this.client.disconnect()
    this.client = null
  }
}
