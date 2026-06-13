import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { getConfig } from './config.js'
import { DiscordNotifier } from './discord.js'
import { startRustplusBridge } from './rustplus.js'
import { WorkerState } from './state.js'
import type { AlarmTriggerInput, OperationCloseInput } from '@drust/domain'

const config = getConfig()
const state = new WorkerState()
const discord = new DiscordNotifier(config.discordWebhookUrl)

state.setDiscordMode(discord.enabled ? 'webhook' : 'disabled')

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
    writeJson(response, 200, {
      service: 'drust-worker',
      status: 'ok',
      integrations: state.getSnapshot().integrations,
    })
    return
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/snapshot') {
    writeJson(response, 200, state.getSnapshot())
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/events/smart-alarm') {
    const payload = await readJson<AlarmTriggerInput>(request)
    await handleAlarmTriggered(payload)
    writeJson(response, 200, state.getSnapshot())
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
    await startRustplusBridge(config, state, handleAlarmTriggered)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Rust+ startup error.'
    state.updateServerConnection({
      connectionStatus: 'degraded',
      lastError: message,
      lastHeartbeatAt: new Date().toISOString(),
    })
  }
})
