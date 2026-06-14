import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { getConfig } from './config.js'
import { DiscordNotifier, type BotOperationAlertPayload } from './discord.js'
import { WorkerPersistence } from './persistence.js'
import { RustplusBridgeManager } from './rustplus.js'
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
const rustplusBridge = new RustplusBridgeManager(state, handleAlarmTriggered)
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
let scheduledOperationId: string | null = null
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
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-type': 'application/json',
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

  if (!discord.enabled) {
    return
  }

  const snapshot = state.getSnapshot()
  const operation = snapshot.activeOperation
  if (!operation) {
    return
  }

  await discord.sendOperationAlert({
    kind: 'triggered',
    target: operation.target,
    source: operation.source,
    startedAt: operation.startedAt,
    endsAt: operation.endsAt,
    operationId: operation.operationId,
  })
  state.recordDiscordMessage('Discord bot delivered operation alert.')
  syncCountdownSchedule()
}

function clearCountdownSchedule(): void {
  countdownTimers.forEach((timer) => clearTimeout(timer))
  countdownTimers = []
  scheduledOperationId = null
}

async function sendCountdownAlert(payload: BotOperationAlertPayload, activityMessage: string): Promise<void> {
  if (!discord.enabled) {
    return
  }

  await discord.sendOperationAlert(payload)
  state.recordDiscordMessage(activityMessage)
}

function syncCountdownSchedule(): void {
  clearCountdownSchedule()

  const snapshot = state.getSnapshot()
  const operation = snapshot.activeOperation
  if (!operation || operation.status !== 'active' || operation.source !== 'smart-alarm') {
    return
  }

  if (operation.target !== 'small-oil' && operation.target !== 'large-oil') {
    return
  }

  scheduledOperationId = operation.operationId
  const checkpoints = [
    { kind: 'countdown' as const, remainingMinutes: 5, activityMessage: 'Discord bot delivered 5 minute warning.' },
    { kind: 'countdown' as const, remainingMinutes: 2, activityMessage: 'Discord bot delivered 2 minute warning.' },
    { kind: 'countdown' as const, remainingMinutes: 1, activityMessage: 'Discord bot delivered 1 minute warning.' },
    { kind: 'completed' as const, remainingMinutes: 0, activityMessage: 'Discord bot delivered timer complete alert.' },
  ]
  const endsAtMs = new Date(operation.endsAt).getTime()

  checkpoints.forEach((checkpoint) => {
    const triggerAtMs =
      checkpoint.kind === 'completed'
        ? endsAtMs
        : endsAtMs - checkpoint.remainingMinutes * 60 * 1000
    const delayMs = triggerAtMs - Date.now()

    if (delayMs <= 0) {
      return
    }

    const timer = setTimeout(() => {
      void (async () => {
        const currentSnapshot = state.getSnapshot()
        const currentOperation = currentSnapshot.activeOperation
        if (
          !currentOperation ||
          currentOperation.operationId !== operation.operationId ||
          currentOperation.status !== 'active' ||
          scheduledOperationId !== operation.operationId
        ) {
          return
        }

        await sendCountdownAlert(
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

  if (request.method === 'POST' && requestUrl.pathname === '/api/actions/start-operation') {
    const payload = await readJson<StartOperationInput>(request)
    const nextSnapshot = state.startOperation(payload)
    syncCountdownSchedule()
    writeJson(response, 200, nextSnapshot)
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/actions/timer-extend') {
    const payload = await readJson<{ minutes: number }>(request)
    const nextSnapshot = state.extendTimer(payload.minutes ?? 0)
    syncCountdownSchedule()
    writeJson(response, 200, nextSnapshot)
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/actions/close-operation') {
    const payload = await readJson<OperationCloseInput>(request)
    const nextSnapshot = state.closeOperation(payload)
    syncCountdownSchedule()
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
