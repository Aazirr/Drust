import type { AlarmTriggerInput } from '@drust/domain'
import type { WorkerConfig } from './config.js'
import { WorkerState } from './state.js'

type RustPlusLike = {
  on: (event: string, handler: (...args: any[]) => void) => void
  connect: () => void
  getEntityInfo: (entityId: string, callback?: (message: unknown) => void) => void
  getInfo: (callback?: (message: any) => void) => void
  getTime: (callback?: (message: any) => void) => void
}

function isRustplusConfigured(config: WorkerConfig): boolean {
  return Boolean(
    config.rustplus.serverIp &&
      config.rustplus.appPort &&
      config.rustplus.playerId &&
      config.rustplus.playerToken,
  )
}

export async function startRustplusBridge(
  config: WorkerConfig,
  state: WorkerState,
  onAlarmTriggered: (input: AlarmTriggerInput) => Promise<void>,
): Promise<void> {
  if (!isRustplusConfigured(config)) {
    state.setRustplusMode('mock')
    return
  }

  const module = await import('@liamcottle/rustplus.js')
  const RustPlus = (module.default ?? module) as new (
    serverIp: string,
    appPort: number,
    playerId: string,
    playerToken: string,
  ) => RustPlusLike

  const client = new RustPlus(
    config.rustplus.serverIp as string,
    config.rustplus.appPort as number,
    config.rustplus.playerId as string,
    config.rustplus.playerToken as string,
  )

  client.on('connecting', () => {
    state.updateServerConnection({ connectionStatus: 'connecting' })
  })

  client.on('connected', () => {
    state.setRustplusMode('connected')
    client.getInfo((message: any) => {
      const info = message?.response?.info
      if (!info) {
        return
      }

      state.updateServerConnection({
        serverName: info.name ?? state.getSnapshot().serverConnection.serverName,
        mapSize: info.mapSize ?? state.getSnapshot().serverConnection.mapSize,
        wipeTime: info.wipeTime ? new Date(info.wipeTime * 1000).toISOString() : state.getSnapshot().serverConnection.wipeTime,
        lastHeartbeatAt: new Date().toISOString(),
        lastError: null,
      })
    })

    client.getTime((message: any) => {
      const time = message?.response?.time
      if (!time) {
        return
      }

      state.updateServerConnection({
        currentRustTime: `${Number(time.time).toFixed(2)} Rust`,
        lastHeartbeatAt: new Date().toISOString(),
      })
    })

    const entityIds = [config.rustplus.smallOilEntityId, config.rustplus.largeOilEntityId].filter(
      Boolean,
    ) as string[]

    entityIds.forEach((entityId) => {
      client.getEntityInfo(entityId)
    })
  })

  client.on('disconnected', () => {
    state.updateServerConnection({
      connectionStatus: 'disconnected',
      lastError: 'Rust+ disconnected.',
      lastHeartbeatAt: new Date().toISOString(),
    })
  })

  client.on('error', (error: Error) => {
    state.updateServerConnection({
      connectionStatus: 'degraded',
      lastError: error.message,
      lastHeartbeatAt: new Date().toISOString(),
    })
  })

  client.on('message', async (message: any) => {
    const entityChanged = message?.broadcast?.entityChanged
    if (!entityChanged || !entityChanged.payload?.value) {
      return
    }

    const entityId = String(entityChanged.entityId)
    const target =
      entityId === config.rustplus.smallOilEntityId
        ? 'small-oil'
        : entityId === config.rustplus.largeOilEntityId
          ? 'large-oil'
          : null

    if (!target) {
      return
    }

    await onAlarmTriggered({
      target,
      entityId,
      source: 'smart-alarm',
      triggeredAt: new Date().toISOString(),
    })
  })

  client.connect()
}
