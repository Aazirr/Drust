import type { AlarmTriggerInput, RustplusServerPairing } from '@drust/domain'
import type { WorkerConfig } from './config.js'
import { WorkerState } from './state.js'

function formatRustTime(decimal: number): string {
  const rawHours = Math.floor(decimal)
  const minutes = Math.round((decimal - rawHours) * 60)
  const hours = rawHours % 24
  const period = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 || 12
  return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`
}

type RustPlusLike = {
  on: (event: string, handler: (...args: any[]) => void) => void
  connect: () => void
  disconnect: () => void
  getEntityInfo: (entityId: string, callback?: (message: unknown) => void) => void
  getInfo: (callback?: (message: any) => void) => void
  getTime: (callback?: (message: any) => void) => void
  sendTeamMessage: (message: string) => void
}

export interface RustplusConnectionInput {
  serverIp: string
  appPort: number
  playerId: string
  playerToken: string
  smallOilEntityId: string | null
  largeOilEntityId: string | null
}

export interface TeamTimerRequest {
  durationHours: number
  durationMinutes: number
  name: string | null
  creatorSteamId: string
  creatorName: string
}

export interface TeamCommandCallbacks {
  createTeamTimer: (request: TeamTimerRequest) => Promise<string>
  checkTeamTimer: (name: string) => string
  addPlayerNote: (steamId: string, playerName: string, content: string) => Promise<string>
  deletePlayerNote: (steamId: string) => Promise<string>
  viewPlayerNotes: () => string[]
}

const ALARM_DEDUPE_WINDOW_MS = 30_000
const HEARTBEAT_INTERVAL_MS = 30_000
const HEARTBEAT_DEGRADED_THRESHOLD = 2
const HEARTBEAT_DISCONNECTED_THRESHOLD = 5
const TEAM_MESSAGE_DELAY_MS = 800
const RECONNECT_BASE_DELAY_MS = 5_000
const RECONNECT_MAX_DELAY_MS = 60_000

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
  private pendingTeamMessages: string[] = []
  private teamMessageQueue: Promise<void> = Promise.resolve()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0

  constructor(
    private readonly state: WorkerState,
    private readonly onAlarmTriggered: (input: AlarmTriggerInput) => Promise<void>,
    private readonly teamCommands: TeamCommandCallbacks,
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

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private scheduleReconnect(reason: string): void {
    if (!this.currentConnection || this.reconnectTimer) {
      return
    }

    const delayMs = Math.min(
      RECONNECT_MAX_DELAY_MS,
      RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts),
    )
    this.reconnectAttempts += 1

    this.state.updateServerConnection({
      connectionStatus: 'degraded',
      lastError: `${reason} Reconnecting in ${Math.round(delayMs / 1000)}s.`,
      lastHeartbeatAt: new Date().toISOString(),
    })

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.currentConnection) {
        return
      }

      void this.connect(this.currentConnection).catch((error) => {
        const message = error instanceof Error ? error.message : 'Unknown Rust+ reconnect error.'
        this.state.updateServerConnection({
          connectionStatus: 'degraded',
          lastError: message,
          lastHeartbeatAt: new Date().toISOString(),
        })
        this.scheduleReconnect(message)
      })
    }, delayMs)
  }

  sendTeamMessage(message: string): void {
    if (!message.trim()) {
      return
    }

    this.pendingTeamMessages.push(message)
    this.flushPendingTeamMessages()
  }

  private sendCommandHelp(): void {
    this.sendTeamMessage('Drust commands: !help | !commands | !time | !timer [hours:minutes] [name] | !checktimer [name]')
    this.sendTeamMessage('Notes: !addnote [content] | !deletenote | !viewnotes')
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

  private flushPendingTeamMessages(): void {
    if (!this.client) {
      return
    }

    if (this.pendingTeamMessages.length === 0) {
      return
    }

    this.teamMessageQueue = this.teamMessageQueue
      .catch(() => undefined)
      .then(async () => {
        while (this.client && this.pendingTeamMessages.length > 0) {
          const nextMessage = this.pendingTeamMessages.shift()
          if (!nextMessage) {
            continue
          }

          this.client.sendTeamMessage(nextMessage)
          await new Promise((resolve) => setTimeout(resolve, TEAM_MESSAGE_DELAY_MS))
        }
      })
  }

  private async handleTeamCommand(rawText: string, senderSteamId: string, senderName: string): Promise<boolean> {
    const text = rawText.trim()
    if (text === '!help' || text === '!commands') {
      this.sendCommandHelp()
      return true
    }

    if (text === '!time') {
      if (!this.client) {
        return true
      }

      this.client.getTime((timeMsg: any) => {
        const time = timeMsg?.response?.time
        if (!time) {
          return
        }

        this.sendTeamMessage(`Current in-game time: ${formatRustTime(Number(time.time))}`)
      })
      return true
    }

    const timerMatch = text.match(/^!timer\s+(\d+):([0-5]\d)(?:\s+(.+))?$/i)
    if (timerMatch) {
      const durationHours = Number(timerMatch[1])
      const durationMinutes = Number(timerMatch[2])
      const name = timerMatch[3]?.trim() || null

      if (durationHours === 0 && durationMinutes === 0) {
        this.sendTeamMessage('Timer duration must be greater than 00:00.')
        return true
      }

      const response = await this.teamCommands.createTeamTimer({
        durationHours,
        durationMinutes,
        name,
        creatorSteamId: senderSteamId,
        creatorName: senderName,
      })
      this.sendTeamMessage(response)
      return true
    }

    const checkTimerMatch = text.match(/^!checktimer(?:\s+(.+))?$/i)
    if (checkTimerMatch) {
      const name = checkTimerMatch[1]?.trim()
      if (!name) {
        this.sendTeamMessage('Usage: !checktimer [name]')
        return true
      }

      this.sendTeamMessage(this.teamCommands.checkTeamTimer(name))
      return true
    }

    const addNoteMatch = text.match(/^!?addnote\s+(.+)$/i)
    if (addNoteMatch) {
      const content = addNoteMatch[1].trim()
      if (!content) {
        this.sendTeamMessage('Usage: !addnote [content]')
        return true
      }

      const response = await this.teamCommands.addPlayerNote(senderSteamId, senderName, content)
      this.sendTeamMessage(response)
      return true
    }

    if (/^!?deletenote\s*$/i.test(text)) {
      const response = await this.teamCommands.deletePlayerNote(senderSteamId)
      this.sendTeamMessage(response)
      return true
    }

    if (/^!?viewnotes\s*$/i.test(text)) {
      const notes = this.teamCommands.viewPlayerNotes()
      if (notes.length === 0) {
        this.sendTeamMessage('No saved player notes.')
        return true
      }

      notes.forEach((note) => this.sendTeamMessage(note))
      return true
    }

    if (/^!timer\b/i.test(text)) {
      this.sendTeamMessage('Usage: !timer [hours:minutes] [optional name]')
      return true
    }

    return false
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
            this.scheduleReconnect(`Rust+ heartbeat lost after ${this.heartbeatFailures} failures.`)
          }

          return
        }

        this.heartbeatFailures = 0
        this.reconnectAttempts = 0
        this.state.updateServerConnection({
          currentRustTime: formatRustTime(Number(time.time)),
          lastHeartbeatAt: new Date().toISOString(),
        })
      })
    }, HEARTBEAT_INTERVAL_MS)
  }

  private async connect(connection: RustplusConnectionInput): Promise<void> {
    const currentSession = ++this.sessionId
    this.clearReconnectTimer()
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

      this.reconnectAttempts = 0
      this.state.setRustplusMode('connected')
      this.startHeartbeat()
      this.flushPendingTeamMessages()

      client.getTime((message: any) => {
        if (currentSession !== this.sessionId) {
          return
        }

        const time = message?.response?.time
        if (!time) {
          return
        }

        this.state.updateServerConnection({
          currentRustTime: formatRustTime(Number(time.time)),
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
      this.scheduleReconnect('Rust+ disconnected.')
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
      this.scheduleReconnect(error.message)
    })

    client.on('message', async (message: any) => {
      if (currentSession !== this.sessionId) {
        return
      }

      const teamMessage = message?.broadcast?.teamMessage?.message
      if (teamMessage?.message) {
        const handled = await this.handleTeamCommand(
          String(teamMessage.message).trim(),
          String(teamMessage.steamId),
          String(teamMessage.name ?? 'Unknown'),
        )
        if (handled) {
          return
        }
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
