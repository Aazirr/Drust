import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { formatProjectShortTime } from '@drust/domain'
import { getConfig } from './config.js'
import { DiscordNotifier, type BotOperationAlertPayload, type BotTeamAlertPayload } from './discord.js'
import {
  WorkerPersistence,
  type PersistedChatTimer,
  type PersistedPlayerNote,
} from './persistence.js'
import { RustplusBridgeManager, type TeamTimerRequest } from './rustplus.js'
import { WorkerState } from './state.js'
import type {
  AlarmTriggerInput,
  OperationCloseInput,
  OperationTarget,
  RustplusEntityPairing,
  RustplusServerPairing,
  StartOperationInput,
} from '@drust/domain'

const config = getConfig()
const state = new WorkerState()
const discord = new DiscordNotifier(config.discordBotUrl, config.discordBotToken)
const persistence = new WorkerPersistence(config.databaseUrl)
let rustplusBridge: RustplusBridgeManager
const rustplusCredentialsConfigured = Boolean(
  config.rustplus.serverIp &&
    config.rustplus.appPort &&
    config.rustplus.playerId &&
    config.rustplus.playerToken,
)
const smartAlarmIdsConfigured = Boolean(
  config.rustplus.smallOilEntityId && config.rustplus.largeOilEntityId,
)
let countdownTimers: ReturnType<typeof setTimeout>[] = []
let customTimerHandles = new Map<string, ReturnType<typeof setTimeout>>()
let completedCheckpoints = new Map<string, string[]>()
let chatTimers = new Map<string, PersistedChatTimer>()
let playerNotes = new Map<string, PersistedPlayerNote>()
const TRIGGERED_CHECKPOINT_ID = 'triggered'
const COUNTDOWN_CHECKPOINTS = [
  { kind: 'countdown' as const, remainingMinutes: 5, activityMessage: 'Discord bot delivered 5 minute warning.', checkpointId: 'countdown-5' },
  { kind: 'countdown' as const, remainingMinutes: 2, activityMessage: 'Discord bot delivered 2 minute warning.', checkpointId: 'countdown-2' },
  { kind: 'countdown' as const, remainingMinutes: 1, activityMessage: 'Discord bot delivered 1 minute warning.', checkpointId: 'countdown-1' },
  { kind: 'completed' as const, remainingMinutes: 0, activityMessage: 'Discord bot delivered timer complete alert.', checkpointId: 'completed' },
]
const DISCORD_STATUS_TTL_MS = 30_000
let lastDiscordStatusCheckAt = 0
let discordStatusRefreshInFlight: Promise<void> | null = null

state.syncDiscordMode({
  botDeliveryConfigured: discord.enabled,
  botConnected: false,
})
state.syncRustplusPairingFromConfig({
  credentialsConfigured: rustplusCredentialsConfigured,
  smartAlarmsConfigured: smartAlarmIdsConfigured,
})

function formatTimerDuration(hours: number, minutes: number): string {
  return `${hours}:${String(minutes).padStart(2, '0')}`
}

function formatRemainingDuration(endsAt: string): string {
  const remainingSeconds = Math.max(0, Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000))
  const hours = Math.floor(remainingSeconds / 3600)
  const minutes = Math.floor((remainingSeconds % 3600) / 60)
  const seconds = remainingSeconds % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function normalizeTimerName(name: string): string {
  return name.trim().toLowerCase()
}

function clearCustomTimerSchedule(timerId: string): void {
  const handle = customTimerHandles.get(timerId)
  if (handle) {
    clearTimeout(handle)
    customTimerHandles.delete(timerId)
  }
}

async function sendTeamDiscordAlert(payload: BotTeamAlertPayload, activityMessage: string): Promise<boolean> {
  if (!discord.enabled) {
    return false
  }

  try {
    await discord.sendTeamAlert(payload)
    state.recordDiscordMessage(activityMessage)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Discord team alert delivery error.'
    state.updateServerConnection({
      lastError: message,
      lastHeartbeatAt: new Date().toISOString(),
    })
    return false
  }
}

async function completeChatTimer(timerId: string): Promise<void> {
  const timer = chatTimers.get(timerId)
  if (!timer) {
    return
  }

  clearCustomTimerSchedule(timerId)
  chatTimers.delete(timerId)
  await persistence.deleteChatTimer(timerId)

  const label = timer.name ? `Timer "${timer.name}"` : 'Timer'
  rustplusBridge.sendTeamMessage(
    `${label} from ${timer.createdByName} is done. Finished at ${formatProjectShortTime(timer.endsAt)}.`,
  )

  await sendTeamDiscordAlert(
    {
      title: timer.name ? `Timer Complete: ${timer.name}` : 'Timer Complete',
      body: `Created by ${timer.createdByName}. Finished at ${formatProjectShortTime(timer.endsAt)}.`,
    },
    'Discord bot delivered custom timer completion alert.',
  )
}

function scheduleChatTimer(timer: PersistedChatTimer): void {
  clearCustomTimerSchedule(timer.timerId)
  const delayMs = new Date(timer.endsAt).getTime() - Date.now()
  const safeDelayMs = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 0

  const handle = setTimeout(() => {
    void completeChatTimer(timer.timerId).catch((error) => {
      const message = error instanceof Error ? error.message : 'Unknown custom timer completion error.'
      state.updateServerConnection({
        lastError: message,
        lastHeartbeatAt: new Date().toISOString(),
      })
    })
  }, safeDelayMs)

  customTimerHandles.set(timer.timerId, handle)
}

async function createTeamTimer(request: TeamTimerRequest): Promise<string> {
  const requestedName = request.name
  const existingNamedTimer = requestedName
    ? Array.from(chatTimers.values()).find((timer) => timer.name && normalizeTimerName(timer.name) === normalizeTimerName(requestedName))
    : null
  if (existingNamedTimer) {
    return `A timer named "${existingNamedTimer.name}" is already running.`
  }

  const createdAt = new Date().toISOString()
  const endsAt = new Date(
    Date.now() + (request.durationHours * 60 * 60 + request.durationMinutes * 60) * 1000,
  ).toISOString()
  const timer: PersistedChatTimer = {
    timerId: `team-timer-${Date.now()}`,
    name: request.name,
    createdBySteamId: request.creatorSteamId,
    createdByName: request.creatorName,
    createdAt,
    endsAt,
  }

  chatTimers.set(timer.timerId, timer)
  await persistence.saveChatTimer(timer)
  scheduleChatTimer(timer)

  return request.name
    ? `Started timer "${request.name}" for ${formatTimerDuration(request.durationHours, request.durationMinutes)}. It ends at ${formatProjectShortTime(endsAt)}.`
    : `Started timer for ${formatTimerDuration(request.durationHours, request.durationMinutes)}. It ends at ${formatProjectShortTime(endsAt)}.`
}

function checkTeamTimer(name: string): string {
  const timer = Array.from(chatTimers.values()).find(
    (entry) => entry.name && normalizeTimerName(entry.name) === normalizeTimerName(name),
  )
  if (!timer) {
    return `No active timer named "${name}".`
  }

  return `Timer "${timer.name}" by ${timer.createdByName} has ${formatRemainingDuration(timer.endsAt)} remaining.`
}

async function addPlayerNote(steamId: string, playerName: string, content: string): Promise<string> {
  const note: PersistedPlayerNote = {
    steamId,
    playerName,
    content,
    createdAt: new Date().toISOString(),
  }

  playerNotes.set(steamId, note)
  await persistence.savePlayerNote(note)
  return `Saved note for ${playerName}.`
}

async function deletePlayerNote(steamId: string): Promise<string> {
  const existing = playerNotes.get(steamId)
  if (!existing) {
    return 'No saved note to delete.'
  }

  playerNotes.delete(steamId)
  await persistence.deletePlayerNote(steamId)
  return `Deleted note for ${existing.playerName}.`
}

function viewPlayerNotes(): string[] {
  return Array.from(playerNotes.values())
    .sort((left, right) => left.playerName.localeCompare(right.playerName))
    .map((note) => `${note.playerName}: ${note.content}`)
}

rustplusBridge = new RustplusBridgeManager(state, handleAlarmTriggered, {
  createTeamTimer,
  checkTeamTimer,
  addPlayerNote,
  deletePlayerNote,
  viewPlayerNotes,
})

async function refreshDiscordStatus(force = false): Promise<void> {
  const now = Date.now()
  if (!force && now - lastDiscordStatusCheckAt < DISCORD_STATUS_TTL_MS) {
    return
  }

  if (discordStatusRefreshInFlight) {
    await discordStatusRefreshInFlight
    return
  }

  discordStatusRefreshInFlight = (async () => {
    let botConnected = false

    if (config.discordBotHealthUrl) {
      try {
        const response = await fetch(config.discordBotHealthUrl)
        botConnected = response.ok
      } catch {
        botConnected = false
      }
    }

    state.syncDiscordMode({
      botDeliveryConfigured: discord.enabled,
      botConnected,
    })
    lastDiscordStatusCheckAt = Date.now()
  })()

  try {
    await discordStatusRefreshInFlight
  } finally {
    discordStatusRefreshInFlight = null
  }
}

async function hydratePersistedRustplusState(): Promise<void> {
  await persistence.init()

  const persistedState = await persistence.loadRustplusState()
  const { serverPairing, alarmBindings } = persistedState
  const [persistedChatTimers, persistedPlayerNotes] = await Promise.all([
    persistence.loadChatTimers(),
    persistence.loadPlayerNotes(),
  ])

  chatTimers = new Map(persistedChatTimers.map((timer) => [timer.timerId, timer]))
  playerNotes = new Map(persistedPlayerNotes.map((note) => [note.steamId, note]))
  persistedChatTimers.forEach((timer) => scheduleChatTimer(timer))

  if (serverPairing) {
    state.applyRustplusPairingImport(serverPairing)
    await rustplusBridge.importPairing(serverPairing, config)
  } else {
    await rustplusBridge.startFromConfig(config)
  }

  alarmBindings.forEach((binding) => {
    state.applySmartAlarmBindingImport(binding)
    const target = binding.target as 'small-oil' | 'large-oil'
    rustplusBridge.updateAlarmBinding(target, binding.entityId)
  })

  /* Rehydrate persisted active operation and reschedule countdowns. */
  const persistedOperation = await persistence.loadLatestOperation()
  if (persistedOperation.operation && persistedOperation.operation.status === 'active') {
    state.setPersistedOperation(persistedOperation.operation)
    const opId = persistedOperation.operation.operationId
    completedCheckpoints.set(opId, persistedOperation.completedCheckpoints)
    syncCountdownSchedule()
    await fireMissedCheckpoints()
  }
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-type': 'application/json',
    'cache-control': 'no-store, no-cache, must-revalidate, private',
  })
  response.end(JSON.stringify(payload))
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  if (chunks.length === 0) {
    return {} as T
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
}

async function handleAlarmTriggered(input: AlarmTriggerInput): Promise<void> {
  state.triggerSmartAlarm(input)

  /* Test fires skip countdown scheduling — only verify the alert pathway. */
  if (!input.test) {
    syncCountdownSchedule()
  }

  await persistOperation()

  if (!discord.enabled) {
    return
  }

  const snapshot = state.getSnapshot()
  const operation = snapshot.activeOperations.find((op) => op.target === input.target && op.status === 'active')
  if (!operation) {
    return
  }

  try {
    if (hasCompletedCheckpoint(operation.operationId, TRIGGERED_CHECKPOINT_ID)) {
      return
    }

    const delivered = await sendOperationAlert({
      kind: 'triggered',
      target: operation.target,
      source: operation.source,
      startedAt: operation.startedAt,
      endsAt: operation.endsAt,
      operationId: operation.operationId,
    }, 'Discord bot delivered operation alert.')

    if (delivered) {
      markCheckpointCompleted(operation.operationId, TRIGGERED_CHECKPOINT_ID)
      await persistOperation(operation.operationId)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Discord alert delivery error.'
    state.updateServerConnection({
      lastError: message,
      lastHeartbeatAt: new Date().toISOString(),
    })
    state.recordDiscordMessage('Alarm triggered, but Discord delivery failed.')
  }
}

async function persistOperation(operationId?: string): Promise<void> {
  try {
    const snapshot = state.getSnapshot()
    const opsToPersist = operationId
      ? snapshot.activeOperations.filter((op) => op.operationId === operationId)
      : snapshot.activeOperations
    for (const operation of opsToPersist) {
      await persistence.saveOperation(operation, completedCheckpoints.get(operation.operationId) ?? [])
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown persistence error.'
    state.updateServerConnection({
      lastError: message,
      lastHeartbeatAt: new Date().toISOString(),
    })
  }
}

function clearCountdownSchedule(): void {
  countdownTimers.forEach((timer) => clearTimeout(timer))
  countdownTimers = []
}

function getCompletedCheckpointIds(operationId: string): string[] {
  const existing = completedCheckpoints.get(operationId)
  if (existing) {
    return existing
  }

  const checkpoints: string[] = []
  completedCheckpoints.set(operationId, checkpoints)
  return checkpoints
}

function hasCompletedCheckpoint(operationId: string, checkpointId: string): boolean {
  return getCompletedCheckpointIds(operationId).includes(checkpointId)
}

function markCheckpointCompleted(operationId: string, checkpointId: string): void {
  const checkpoints = getCompletedCheckpointIds(operationId)
  if (checkpoints.includes(checkpointId)) {
    return
  }

  completedCheckpoints.set(operationId, [...checkpoints, checkpointId])
}

function pruneCheckpointState(activeOperationIds: string[]): void {
  const activeIdSet = new Set(activeOperationIds)
  Array.from(completedCheckpoints.keys()).forEach((operationId) => {
    if (!activeIdSet.has(operationId)) {
      completedCheckpoints.delete(operationId)
    }
  })
}

async function sendOperationAlert(payload: BotOperationAlertPayload, activityMessage: string): Promise<boolean> {
  if (!discord.enabled) {
    return false
  }

  try {
    await discord.sendOperationAlert(payload)
    state.recordDiscordMessage(activityMessage)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Discord countdown delivery error.'
    state.updateServerConnection({
      lastError: message,
      lastHeartbeatAt: new Date().toISOString(),
    })
    return false
  }
}

async function fireMissedCheckpoints(): Promise<void> {
  const snapshot = state.getSnapshot()
  const activeOps = snapshot.activeOperations.filter(
    (op) => op.status === 'active' && (op.target === 'small-oil' || op.target === 'large-oil'),
  )

  for (const operation of activeOps) {
    const opId = operation.operationId
    const endsAtMs = new Date(operation.endsAt).getTime()
    const nowMs = Date.now()

    if (!hasCompletedCheckpoint(opId, TRIGGERED_CHECKPOINT_ID)) {
      const delivered = await sendOperationAlert(
        {
          kind: 'triggered',
          target: operation.target,
          source: operation.source,
          startedAt: operation.startedAt,
          endsAt: operation.endsAt,
          operationId: operation.operationId,
        },
        'Discord bot delivered operation alert.',
      )

      if (delivered) {
        markCheckpointCompleted(opId, TRIGGERED_CHECKPOINT_ID)
        await persistence.saveOperation(operation, completedCheckpoints.get(opId) ?? [])
      }
    }

    for (const checkpoint of COUNTDOWN_CHECKPOINTS) {
      if (hasCompletedCheckpoint(opId, checkpoint.checkpointId)) {
        continue
      }

      const triggerAtMs =
        checkpoint.kind === 'completed'
          ? endsAtMs
          : endsAtMs - checkpoint.remainingMinutes * 60 * 1000

      /* Guard: skip if timestamp is invalid or not yet reached. */
      if (!Number.isFinite(triggerAtMs) || nowMs < triggerAtMs) {
        continue
      }

      const delivered = await sendOperationAlert(
        {
          kind: checkpoint.kind,
          target: operation.target,
          source: operation.source,
          startedAt: operation.startedAt,
          endsAt: operation.endsAt,
          operationId: operation.operationId,
          remainingMinutes: checkpoint.kind === 'countdown' ? checkpoint.remainingMinutes : undefined,
        },
        checkpoint.activityMessage,
      )

      if (delivered) {
        markCheckpointCompleted(opId, checkpoint.checkpointId)
        await persistence.saveOperation(operation, completedCheckpoints.get(opId) ?? [])
      }
    }
  }
}

function syncCountdownSchedule(): void {
  clearCountdownSchedule()

  const snapshot = state.getSnapshot()
  const activeOps = snapshot.activeOperations.filter(
    (op) => op.status === 'active' && op.source === 'smart-alarm' && (op.target === 'small-oil' || op.target === 'large-oil'),
  )

  pruneCheckpointState(activeOps.map((operation) => operation.operationId))

  activeOps.forEach((operation) => {
    const opId = operation.operationId
    getCompletedCheckpointIds(opId)
    const endsAtMs = new Date(operation.endsAt).getTime()

    COUNTDOWN_CHECKPOINTS.forEach((checkpoint) => {
      if (hasCompletedCheckpoint(opId, checkpoint.checkpointId)) {
        return
      }

      const triggerAtMs =
        checkpoint.kind === 'completed'
          ? endsAtMs
          : endsAtMs - checkpoint.remainingMinutes * 60 * 1000
      const delayMs = triggerAtMs - Date.now()

      /* Guard: skip past checkpoints and invalid (NaN) timestamps. */
      if (!Number.isFinite(delayMs) || delayMs <= 0) {
        return
      }

      const timer = setTimeout(() => {
        void (async () => {
          const currentSnapshot = state.getSnapshot()
          const currentOperation = currentSnapshot.activeOperations.find(
            (op) => op.operationId === operation.operationId && op.status === 'active',
          )
          if (!currentOperation) {
            return
          }

          if (hasCompletedCheckpoint(opId, checkpoint.checkpointId)) {
            return
          }

          const delivered = await sendOperationAlert(
            {
              kind: checkpoint.kind,
              target: currentOperation.target,
              source: currentOperation.source,
              startedAt: currentOperation.startedAt,
              endsAt: currentOperation.endsAt,
              operationId: currentOperation.operationId,
              remainingMinutes: checkpoint.kind === 'countdown' ? checkpoint.remainingMinutes : undefined,
            },
            checkpoint.activityMessage,
          )

          if (delivered) {
            markCheckpointCompleted(opId, checkpoint.checkpointId)
            await persistence.saveOperation(currentOperation, completedCheckpoints.get(opId) ?? [])
          }
        })().catch((error) => {
          const message = error instanceof Error ? error.message : 'Unknown Discord countdown delivery error.'
          state.updateServerConnection({
            lastError: message,
            lastHeartbeatAt: new Date().toISOString(),
          })
        })
      }, delayMs)

      countdownTimers.push(timer)
    })
  })
}

const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

  if (request.method === 'OPTIONS') {
    writeJson(response, 204, {})
    return
  }

  if (request.method === 'GET' && requestUrl.pathname === '/health') {
    await refreshDiscordStatus()
    writeJson(response, 200, {
      service: 'drust-worker',
      status: 'ok',
      integrations: state.getSnapshot().integrations,
    })
    return
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/snapshot') {
    await refreshDiscordStatus()
    await fireMissedCheckpoints()
    writeJson(response, 200, state.getSnapshot())
    return
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/pairing-status') {
    await refreshDiscordStatus()
    const snapshot = state.getSnapshot()
    const importedPairing = snapshot.rustplusPairing.lastImportedPairing
    const smartAlarmsConfigured =
      snapshot.alarmBindings.some((binding) => binding.target === 'small-oil' && Boolean(binding.entityId)) &&
      snapshot.alarmBindings.some((binding) => binding.target === 'large-oil' && Boolean(binding.entityId))

    writeJson(response, 200, {
      rustplus: {
        configured: rustplusCredentialsConfigured || Boolean(importedPairing),
        smartAlarmsConfigured,
        connectionStatus: snapshot.serverConnection.connectionStatus,
        pairingMode: snapshot.rustplusPairing.mode,
      },
      discord: {
        deliveryConfigured: discord.enabled,
        botHealthConfigured: Boolean(config.discordBotHealthUrl),
        botConnected: snapshot.integrations.discord === 'bot-only',
      },
    })
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/events/smart-alarm') {
    const payload = await readJson<AlarmTriggerInput>(request)
    await handleAlarmTriggered(payload)
    writeJson(response, 200, state.getSnapshot())
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/rustplus/pairing/start') {
    writeJson(response, 200, state.startRustplusPairingGuide())
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/rustplus/device-binding/start') {
    const payload = await readJson<{ target: OperationTarget }>(request)
    if (payload.target !== 'small-oil' && payload.target !== 'large-oil') {
      writeJson(response, 400, { message: 'Smart Alarm binding only supports small-oil or large-oil.' })
      return
    }

    const target = payload.target as 'small-oil' | 'large-oil'
    writeJson(response, 200, state.startSmartAlarmBindingGuide(target))
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/rustplus/pairing/import') {
    const payload = await readJson<RustplusServerPairing>(request)
    const nextSnapshot = state.applyRustplusPairingImport(payload)

    try {
      await persistence.saveServerPairing(payload)
      await rustplusBridge.importPairing(payload, config)
      writeJson(response, 200, state.getSnapshot())
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Rust+ import error.'
      state.updateServerConnection({
        connectionStatus: 'degraded',
        lastError: message,
        lastHeartbeatAt: new Date().toISOString(),
      })
      writeJson(response, 200, nextSnapshot)
    }
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/rustplus/device-binding/import') {
    const payload = await readJson<RustplusEntityPairing>(request)
    if (payload.target !== 'small-oil' && payload.target !== 'large-oil') {
      writeJson(response, 400, { message: 'Smart Alarm import only supports small-oil or large-oil.' })
      return
    }

    await persistence.saveAlarmBinding(payload)
    const nextSnapshot = state.applySmartAlarmBindingImport(payload)
    rustplusBridge.updateAlarmBinding(payload.target, payload.entityId)
    writeJson(response, 200, nextSnapshot)
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/rustplus/device-binding/remove') {
    const payload = await readJson<{ target: OperationTarget }>(request)
    if (payload.target !== 'small-oil' && payload.target !== 'large-oil') {
      writeJson(response, 400, { message: 'Smart Alarm removal only supports small-oil or large-oil.' })
      return
    }

    await persistence.deleteAlarmBinding(payload.target)
    const nextSnapshot = state.removeSmartAlarmBinding(payload.target)
    rustplusBridge.updateAlarmBinding(payload.target, null)
    writeJson(response, 200, nextSnapshot)
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/actions/start-operation') {
    const payload = await readJson<StartOperationInput>(request)
    const nextSnapshot = state.startOperation(payload)
    syncCountdownSchedule()
    await persistOperation()
    writeJson(response, 200, nextSnapshot)
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/actions/timer-extend') {
    const payload = await readJson<{ target?: OperationTarget; minutes: number }>(request)
    const nextSnapshot = state.extendTimer(payload.target, payload.minutes ?? 0)
    syncCountdownSchedule()
    await persistOperation()
    writeJson(response, 200, nextSnapshot)
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/actions/close-operation') {
    const payload = await readJson<OperationCloseInput>(request)
    const nextSnapshot = state.closeOperation(payload)
    syncCountdownSchedule()
    await persistOperation()
    writeJson(response, 200, nextSnapshot)
    return
  }

  writeJson(response, 404, {
    message: 'Route not found.',
  })
})

server.listen(config.port, async () => {
  console.log(`[drust-worker] listening on http://localhost:${config.port}`)

  try {
    if (persistence.enabled) {
      console.log('[drust-worker] postgres persistence enabled')
    } else {
      console.log('[drust-worker] postgres persistence disabled')
    }

    await hydratePersistedRustplusState()
    await refreshDiscordStatus(true)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Rust+ startup error.'
    state.updateServerConnection({
      connectionStatus: 'degraded',
      lastError: message,
      lastHeartbeatAt: new Date().toISOString(),
    })
  }
})
