import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import type { AlarmTriggerInput, RustplusServerPairing, TeamMember } from '@drust/domain'
import protobuf from 'protobufjs'
import WebSocket from 'ws'
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
  getTeamInfo: (callback?: (message: any) => void) => void
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
  toggleOilRigDiscordPings: () => Promise<string>
  getPlayerNoteMessage: (steamId: string) => string | null
  viewPlayerNotes: () => string[]
}

const ALARM_DEDUPE_WINDOW_MS = 30_000
const HEARTBEAT_INTERVAL_MS = 30_000
const TEAM_PRESENCE_INTERVAL_MS = 30_000
const HEARTBEAT_DEGRADED_THRESHOLD = 2
const HEARTBEAT_DISCONNECTED_THRESHOLD = 5
const TEAM_MESSAGE_DELAY_MS = 800
const RECONNECT_BASE_DELAY_MS = 5_000
const RECONNECT_MAX_DELAY_MS = 60_000
const require = createRequire(import.meta.url)
const rustplusModuleDir = path.dirname(require.resolve('@liamcottle/rustplus.js/package.json'))
const rustplusProtoPath = path.join(rustplusModuleDir, 'rustplus.proto')
const teamInfoFieldPatches = [
  ['required uint64 steamId = 1;', 'optional uint64 steamId = 1;'],
  ['required string name = 2;', 'optional string name = 2;'],
  ['required float x = 3;', 'optional float x = 3;'],
  ['required float y = 4;', 'optional float y = 4;'],
  ['required bool isOnline = 5;', 'optional bool isOnline = 5;'],
  ['required uint32 spawnTime = 6;', 'optional uint32 spawnTime = 6;'],
  ['required bool isAlive = 7;', 'optional bool isAlive = 7;'],
  ['required uint32 deathTime = 8;', 'optional uint32 deathTime = 8;'],
] as const

let patchedRustplusRoot: protobuf.Root | null = null

function getPatchedRustplusRoot(): protobuf.Root {
  if (patchedRustplusRoot) {
    return patchedRustplusRoot
  }

  const originalProto = readFileSync(rustplusProtoPath, 'utf8')
  const patchedProto = teamInfoFieldPatches.reduce(
    (source, [search, replacement]) => source.replace(search, replacement),
    originalProto,
  )

  patchedRustplusRoot = protobuf.parse(patchedProto).root
  return patchedRustplusRoot
}

const RustPlusBase = require('@liamcottle/rustplus.js') as any

class PatchedRustPlus extends RustPlusBase {
  constructor(server: string, port: number, playerId: string, playerToken: string) {
    super(server, port, playerId, playerToken)
  }

  connect(): void {
    const root = getPatchedRustplusRoot()

    if (this.websocket) {
      this.disconnect()
    }

    this.AppRequest = root.lookupType('rustplus.AppRequest')
    this.AppMessage = root.lookupType('rustplus.AppMessage')

    this.emit('connecting')

    const address = this.useFacepunchProxy
      ? `wss://companion-rust.facepunch.com/game/${this.server}/${this.port}`
      : `ws://${this.server}:${this.port}`

    this.websocket = new WebSocket(address)

    this.websocket.on('open', () => {
      this.emit('connected')
    })

    this.websocket.on('error', (error: Error) => {
      this.emit('error', error)
    })

    this.websocket.on('message', (data: WebSocket.RawData) => {
      let message: any
      try {
        const payload = data instanceof Buffer ? data : Buffer.from(data as ArrayBuffer)
        message = this.AppMessage.decode(payload)
      } catch (error) {
        this.emit('error', error)
        return
      }

      if (message.response && message.response.seq && this.seqCallbacks[message.response.seq]) {
        const callback = this.seqCallbacks[message.response.seq]
        const result = callback(message)
        delete this.seqCallbacks[message.response.seq]

        if (result) {
          return
        }
      }

      this.emit('message', message)
    })

    this.websocket.on('close', () => {
      this.emit('disconnected')
    })
  }
}

type TeamPresenceMember = {
  steamId?: string | number | bigint | null
  name?: string | null
  x?: number | null
  y?: number | null
  isOnline?: boolean | null
  isAlive?: boolean | null
}

function normalizeTeamPresenceMember(member: TeamPresenceMember, fallbackTimestamp: string): TeamMember | null {
  if (member.steamId === null || member.steamId === undefined) {
    return null
  }

  return {
    steamId: String(member.steamId),
    name: member.name?.trim() || 'Unknown',
    isOnline: Boolean(member.isOnline),
    isAlive: member.isAlive ?? true,
    x: Number(member.x ?? 0),
    y: Number(member.y ?? 0),
    lastSeenAt: fallbackTimestamp,
  }
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
  private lastTriggeredAt = new Map<string, number>()
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private teamPresenceTimer: ReturnType<typeof setInterval> | null = null
  private heartbeatFailures = 0
  private pendingTeamMessages: string[] = []
  private teamMessageQueue: Promise<void> = Promise.resolve()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private seenTeamPresence = false
  private teamOnlineStates = new Map<string, boolean>()
  private teamLastSeenAt = new Map<string, string>()

  constructor(
    private readonly state: WorkerState,
    private readonly onAlarmTriggered: (input: AlarmTriggerInput) => Promise<void>,
    private readonly teamCommands: TeamCommandCallbacks,
  ) {}

  async startFromConfig(config: WorkerConfig): Promise<void> {
    const connection = createConnectionInputFromWorkerConfig(config)
    if (!connection) {
      this.state.recordDebugLog({
        level: 'warn',
        category: 'rustplus',
        message: 'Rust+ bridge did not start because credentials are missing.',
      })
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
      this.state.recordDebugLog({
        level: 'warn',
        category: 'alarm',
        message: 'Smart Alarm binding changed while Rust+ is not connected.',
        detail: entityId ? `Target ${target}, entity ${entityId}.` : `Target ${target} removed.`,
        target,
        entityId,
      })
      return
    }

    if (target === 'small-oil') {
      this.currentConnection.smallOilEntityId = entityId
    } else {
      this.currentConnection.largeOilEntityId = entityId
    }

    if (this.client && entityId) {
      this.state.recordDebugLog({
        category: 'alarm',
        message: 'Requesting Smart Alarm entity subscription.',
        detail: `Target ${target}, entity ${entityId}.`,
        target,
        entityId,
      })
      this.client.getEntityInfo(entityId)
    } else if (!entityId) {
      this.state.recordDebugLog({
        level: 'warn',
        category: 'alarm',
        message: 'Smart Alarm entity binding removed from Rust+ bridge.',
        target,
      })
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
    this.sendTeamMessage('Drust commands: !help | !commands | !time | !timer [hours:minutes] [name] | !checktimer [name] | !alerttoggle')
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

  private clearTeamPresence(): void {
    if (this.teamPresenceTimer) {
      clearInterval(this.teamPresenceTimer)
      this.teamPresenceTimer = null
    }
  }

  private resetTeamPresenceState(): void {
    this.seenTeamPresence = false
    this.teamOnlineStates.clear()
    this.teamLastSeenAt.clear()
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

    if (/^!?alerttoggle\s*$/i.test(text)) {
      const response = await this.teamCommands.toggleOilRigDiscordPings()
      this.sendTeamMessage(response)
      return true
    }

    if (/^!?alerttoggle\b/i.test(text)) {
      this.sendTeamMessage('Usage: !alerttoggle')
      return true
    }

    if (/^!timer\b/i.test(text)) {
      this.sendTeamMessage('Usage: !timer [hours:minutes] [optional name]')
      return true
    }

    return false
  }

  private extractTeamInfo(message: any): TeamPresenceMember[] {
    const responseMembers = message?.response?.teamInfo?.members
    if (Array.isArray(responseMembers)) {
      return responseMembers as TeamPresenceMember[]
    }

    const broadcastMembers = message?.broadcast?.teamChanged?.teamInfo?.members
    if (Array.isArray(broadcastMembers)) {
      return broadcastMembers as TeamPresenceMember[]
    }

    return []
  }

  private syncTeamPresence(message: any): void {
    const syncTimestamp = new Date().toISOString()
    const changedPlayerId = message?.broadcast?.teamChanged?.playerId
      ? String(message.broadcast.teamChanged.playerId)
      : null
    const previousMemberIds = new Set(this.teamOnlineStates.keys())
    const members = this.extractTeamInfo(message)
      .map((member) => normalizeTeamPresenceMember(member, syncTimestamp))
      .filter((member): member is TeamMember => Boolean(member))
      .map((member) => {
        const lastSeenAt = member.isOnline
          ? syncTimestamp
          : this.teamLastSeenAt.get(member.steamId) ?? member.lastSeenAt

        if (member.isOnline) {
          this.teamLastSeenAt.set(member.steamId, syncTimestamp)
        }

        return {
          ...member,
          lastSeenAt,
        }
      })

    if (members.length === 0) {
      return
    }

    const currentMemberIds = new Set(members.map((member) => member.steamId))

    if (this.seenTeamPresence) {
      previousMemberIds.forEach((steamId) => {
        if (!currentMemberIds.has(steamId)) {
          this.teamOnlineStates.set(steamId, false)
        }
      })
    }

    this.state.setTeamMembers(members)

    members.forEach((member) => {
      const previousOnline = this.teamOnlineStates.get(member.steamId)
      const previousKnown = previousMemberIds.has(member.steamId)
      const shouldReplayLoginNote =
        this.seenTeamPresence &&
        member.isOnline &&
        (previousOnline === false || (!previousKnown && changedPlayerId === member.steamId))

      if (shouldReplayLoginNote) {
        const loginNote = this.teamCommands.getPlayerNoteMessage(member.steamId)
        if (loginNote) {
          this.state.recordDebugLog({
            category: 'discord',
            message: 'Replayed teammate note after login.',
            detail: member.name,
          })
          this.sendTeamMessage(loginNote)
        }
      }

      this.teamOnlineStates.set(member.steamId, member.isOnline)
    })

    this.seenTeamPresence = true
  }

  private requestTeamPresence(): void {
    if (!this.client) {
      return
    }

    this.client.getTeamInfo((message: any) => {
      if (!this.client) {
        return
      }

      this.syncTeamPresence(message)
    })
  }

  private startTeamPresencePolling(): void {
    this.clearTeamPresence()
    this.requestTeamPresence()
    this.teamPresenceTimer = setInterval(() => {
      this.requestTeamPresence()
    }, TEAM_PRESENCE_INTERVAL_MS)
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

    const client = new PatchedRustPlus(
      connection.serverIp,
      connection.appPort,
      connection.playerId,
      connection.playerToken,
    ) as RustPlusLike

    this.client = client

    client.on('connecting', () => {
      if (currentSession !== this.sessionId) {
        return
      }

      this.state.recordDebugLog({
        category: 'rustplus',
        message: 'Rust+ websocket connecting.',
        detail: `${connection.serverIp}:${connection.appPort}`,
      })
      this.state.updateServerConnection({ connectionStatus: 'connecting' })
    })

    client.on('connected', () => {
      if (currentSession !== this.sessionId) {
        return
      }

      this.reconnectAttempts = 0
      this.state.recordDebugLog({
        category: 'rustplus',
        message: 'Rust+ websocket connected.',
        detail: `${connection.serverIp}:${connection.appPort}`,
      })
      this.state.setRustplusMode('connected')
      this.startHeartbeat()
      this.startTeamPresencePolling()
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
      this.state.recordDebugLog({
        category: 'alarm',
        message: 'Subscribing to configured Smart Alarm entities.',
        detail: entityIds.length > 0 ? entityIds.join(', ') : 'No Smart Alarm entity IDs configured.',
      })
      entityIds.forEach((entityId) => {
        this.state.recordDebugLog({
          category: 'alarm',
          message: 'Requesting Smart Alarm entity info.',
          entityId,
        })
        client.getEntityInfo(entityId)
      })
    })

    client.on('disconnected', () => {
      if (currentSession !== this.sessionId) {
        return
      }

      this.clearHeartbeat()
      this.clearTeamPresence()
      this.resetTeamPresenceState()
      this.state.updateServerConnection({
        connectionStatus: 'disconnected',
        lastError: 'Rust+ disconnected.',
        lastHeartbeatAt: new Date().toISOString(),
      })
      this.state.recordDebugLog({
        level: 'warn',
        category: 'rustplus',
        message: 'Rust+ websocket disconnected.',
        detail: 'Reconnect will be scheduled.',
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
      this.state.recordDebugLog({
        level: 'error',
        category: 'rustplus',
        message: 'Rust+ websocket error.',
        detail: error.message,
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

      if (message?.broadcast?.teamChanged?.teamInfo?.members) {
        this.syncTeamPresence(message)
      }

      const entityChanged = message?.broadcast?.entityChanged
      if (!entityChanged) {
        return
      }

      const entityId = String(entityChanged.entityId)
      const target =
        entityId === activeConnection.smallOilEntityId
          ? 'small-oil'
          : entityId === activeConnection.largeOilEntityId
            ? 'large-oil'
            : null

      this.state.recordDebugLog({
        category: 'alarm',
        message: 'Rust+ entityChanged broadcast received.',
        detail: `value=${String(entityChanged.payload?.value)}, target=${target ?? 'unbound'}`,
        target,
        entityId,
      })

      if (!entityChanged.payload?.value) {
        this.state.recordDebugLog({
          category: 'alarm',
          message: 'Ignored entityChanged because payload value was not truthy.',
          detail: JSON.stringify(entityChanged.payload ?? {}),
          target,
          entityId,
        })
        return
      }

      if (!target) {
        this.state.recordDebugLog({
          level: 'warn',
          category: 'alarm',
          message: 'Ignored entityChanged because entity ID is not bound to an Oil Rig target.',
          detail: `Configured small=${activeConnection.smallOilEntityId ?? 'none'}, large=${activeConnection.largeOilEntityId ?? 'none'}.`,
          entityId,
        })
        return
      }

      if (this.isDuplicateTrigger(entityId)) {
        this.state.recordDebugLog({
          category: 'alarm',
          message: 'Ignored duplicate Smart Alarm trigger.',
          target,
          entityId,
        })
        return
      }

      this.recordTrigger(entityId)
      this.state.recordDebugLog({
        category: 'alarm',
        message: 'Dispatching Smart Alarm trigger from Rust+ broadcast.',
        target,
        entityId,
      })

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
    this.clearTeamPresence()
    this.resetTeamPresenceState()
    this.client.disconnect()
    this.client = null
  }
}
