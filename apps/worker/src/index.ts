import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { getConfig } from './config.js'
import { DiscordNotifier } from './discord.js'
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
const discord = new DiscordNotifier(config.discordWebhookUrl)
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

state.syncDiscordMode({
  webhookConfigured: discord.enabled,
  botConnected: false,
})
state.syncRustplusPairingFromConfig({
  credentialsConfigured: rustplusCredentialsConfigured,
  smartAlarmsConfigured: smartAlarmIdsConfigured,
})

async function refreshDiscordStatus(): Promise<void> {
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
    webhookConfigured: discord.enabled,
    botConnected,
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

  const message = state.formatDiscordAlarmMessage()
  await discord.send(message)
  state.recordDiscordMessage('Discord webhook delivered operation alert.')
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

    writeJson(response, 200, {
      rustplus: {
        configured: rustplusCredentialsConfigured || Boolean(importedPairing),
        smartAlarmsConfigured: smartAlarmIdsConfigured,
        connectionStatus: snapshot.serverConnection.connectionStatus,
        pairingMode: snapshot.rustplusPairing.mode,
      },
      discord: {
        webhookConfigured: discord.enabled,
        botHealthConfigured: Boolean(config.discordBotHealthUrl),
        botConnected:
          snapshot.integrations.discord === 'bot-only' ||
          snapshot.integrations.discord === 'bot-and-webhook',
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

    const nextSnapshot = state.applySmartAlarmBindingImport(payload)
    rustplusBridge.updateAlarmBinding(payload.target, payload.entityId)
    writeJson(response, 200, nextSnapshot)
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/actions/start-operation') {
    const payload = await readJson<StartOperationInput>(request)
    writeJson(response, 200, state.startOperation(payload))
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/actions/timer-extend') {
    const payload = await readJson<{ minutes: number }>(request)
    writeJson(response, 200, state.extendTimer(payload.minutes ?? 0))
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/actions/close-operation') {
    const payload = await readJson<OperationCloseInput>(request)
    writeJson(response, 200, state.closeOperation(payload))
    return
  }

  writeJson(response, 404, {
    message: 'Route not found.',
  })
})

server.listen(config.port, async () => {
  console.log(`[drust-worker] listening on http://localhost:${config.port}`)

  try {
    await rustplusBridge.startFromConfig(config)
    await refreshDiscordStatus()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Rust+ startup error.'
    state.updateServerConnection({
      connectionStatus: 'degraded',
      lastError: message,
      lastHeartbeatAt: new Date().toISOString(),
    })
  }
})
