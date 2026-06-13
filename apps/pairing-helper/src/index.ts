import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import type { OperationTarget, RustplusEntityPairing, RustplusServerPairing } from '@drust/domain'

type PushReceiverClientLike = {
  on: (event: string, handler: (...args: any[]) => void) => void
  connect: () => Promise<void>
  destroy: () => void
}

interface FcmConfig {
  fcm_credentials?: {
    gcm?: {
      androidId?: string
      securityToken?: string
    }
  }
}

interface PairingNotificationData {
  appData?: Record<string, string> | Array<{ key?: string; value?: string }>
  from?: string
  persistentId?: string
}

interface EncryptedNotificationData {
  notification?: unknown
  persistentId?: string
  object?: {
    appData?: Record<string, string> | Array<{ key?: string; value?: string }>
  }
}

const helperRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = resolve(helperRoot, '..', '..')
const runtimeDir = resolve(repoRoot, '.drust', 'pairing')
const configPath = resolve(runtimeDir, 'rustplus.config.json')
const capturePath = resolve(runtimeDir, 'latest-rustplus-pairing.json')
const workerBaseUrl = process.env.DRUST_PAIRING_IMPORT_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:8787'

function printUsage(): void {
  console.log('Drust Rust+ pairing helper')
  console.log('')
  console.log('Commands:')
  console.log('  register   Launch rustplus.js fcm-register with a project-local config file')
  console.log('  listen     Listen for Pair with Server notifications and import them into Drust')
  console.log('  bind-alarm <small-oil|large-oil>   Listen for a Smart Alarm pairing and bind it to Drust')
}

async function ensureRuntimeDir(): Promise<void> {
  await mkdir(runtimeDir, { recursive: true })
}

async function readConfig(): Promise<FcmConfig> {
  const raw = await readFile(configPath, 'utf8')
  return JSON.parse(raw) as FcmConfig
}

function normalizeAppData(
  appData: PairingNotificationData['appData'],
): Record<string, string> {
  if (!appData) {
    return {}
  }

  if (Array.isArray(appData)) {
    return appData.reduce<Record<string, string>>((accumulator, entry) => {
      if (entry.key && typeof entry.value === 'string') {
        accumulator[entry.key] = entry.value
      }
      return accumulator
    }, {})
  }

  return appData
}

function parseBodyAppData(body: string | undefined): Record<string, string> {
  if (!body) {
    return {}
  }

  try {
    const parsed = JSON.parse(body) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    return Object.entries(parsed).reduce<Record<string, string>>((accumulator, [key, value]) => {
      if (value === null || value === undefined) {
        return accumulator
      }

      accumulator[key] = String(value)
      return accumulator
    }, {})
  } catch {
    return {}
  }
}

function parsePairingNotification(data: PairingNotificationData): RustplusServerPairing | null {
  const rawAppData = normalizeAppData(data.appData)
  const appData = {
    ...rawAppData,
    ...parseBodyAppData(rawAppData.body),
  }
  const serverIp = appData.ip
  const appPort = Number(appData.port)
  const playerId = appData.playerId
  const playerToken = appData.playerToken

  if (appData.type !== 'server') {
    return null
  }

  if (!serverIp || !Number.isFinite(appPort) || !playerId || !playerToken) {
    return null
  }

  return {
    source: 'local-helper',
    receivedAt: new Date().toISOString(),
    serverName: appData.name ?? 'Unknown Rust Server',
    serverDescription: appData.desc ?? null,
    serverUrl: appData.url ?? null,
    serverIp,
    appPort,
    playerId,
    playerToken,
  }
}

function parseEntityPairingNotification(
  data: PairingNotificationData,
  target: OperationTarget,
): RustplusEntityPairing | null {
  const rawAppData = normalizeAppData(data.appData)
  const appData = {
    ...rawAppData,
    ...parseBodyAppData(rawAppData.body),
  }

  if (appData.type !== 'entity') {
    return null
  }

  if (!appData.entityId) {
    return null
  }

  return {
    source: 'local-helper',
    receivedAt: new Date().toISOString(),
    target,
    entityId: appData.entityId,
    entityType: appData.entityType ?? null,
    entityName: appData.entityName ?? appData.name ?? null,
  }
}

function logIncomingNotification(label: string, data: PairingNotificationData): void {
  const appData = normalizeAppData(data.appData)
  const type = appData.type ?? 'unknown'
  console.log(`[drust-pairing-helper] ${label} notification received (type: ${type})`)

  if (Object.keys(appData).length > 0) {
    console.log(appData)
  }
}

async function writeCapture(pairing: RustplusServerPairing): Promise<void> {
  await ensureRuntimeDir()
  await writeFile(capturePath, JSON.stringify(pairing, null, 2), 'utf8')
}

async function writeAlarmCapture(pairing: RustplusEntityPairing): Promise<string> {
  await ensureRuntimeDir()
  const path = resolve(runtimeDir, `${pairing.target}-smart-alarm.json`)
  await writeFile(path, JSON.stringify(pairing, null, 2), 'utf8')
  return path
}

async function postPairingToWorker(pairing: RustplusServerPairing): Promise<void> {
  const response = await fetch(`${workerBaseUrl}/api/rustplus/pairing/import`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(pairing),
  })

  if (!response.ok) {
    throw new Error(`Worker import failed with status ${response.status}`)
  }
}

async function postAlarmPairingToWorker(pairing: RustplusEntityPairing): Promise<void> {
  const response = await fetch(`${workerBaseUrl}/api/rustplus/device-binding/import`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(pairing),
  })

  if (!response.ok) {
    throw new Error(`Worker alarm import failed with status ${response.status}`)
  }
}

async function runRegister(): Promise<void> {
  await ensureRuntimeDir()

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.execPath,
      [
        resolve(repoRoot, 'node_modules', '@liamcottle', 'rustplus.js', 'cli', 'index.js'),
        'fcm-register',
        '--config-file',
        configPath,
      ],
      {
        cwd: repoRoot,
        stdio: 'inherit',
      },
    )

    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }

      rejectPromise(new Error(`fcm-register exited with code ${code ?? 'unknown'}`))
    })
    child.on('error', rejectPromise)
  })
}

async function runListen(): Promise<void> {
  await ensureRuntimeDir()

  let config: FcmConfig
  try {
    config = await readConfig()
  } catch {
    throw new Error(
      `Missing ${configPath}. Run "npm --workspace @drust/pairing-helper start -- register" first.`,
    )
  }

  const androidId = config.fcm_credentials?.gcm?.androidId
  const securityToken = config.fcm_credentials?.gcm?.securityToken

  if (!androidId || !securityToken) {
    throw new Error('FCM credentials are missing. Run the register command again.')
  }

  const pushReceiverModule = await import('@liamcottle/push-receiver/src/client.js')
  const PushReceiverClient = (pushReceiverModule.default ?? pushReceiverModule) as new (
    androidId: string,
    securityToken: string,
    persistentIds: string[],
  ) => PushReceiverClientLike

  const client = new PushReceiverClient(androidId, securityToken, [])

  client.on('ON_DATA_RECEIVED', async (data: PairingNotificationData) => {
    logIncomingNotification('raw', data)

    const pairing = parsePairingNotification(data)
    if (!pairing) {
      return
    }

    console.log(`[drust-pairing-helper] captured Pair with Server for ${pairing.serverName}`)
    await writeCapture(pairing)
    console.log(`[drust-pairing-helper] saved pairing payload to ${capturePath}`)

    try {
      await postPairingToWorker(pairing)
      console.log(`[drust-pairing-helper] imported pairing into ${workerBaseUrl}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown worker import error.'
      console.error(`[drust-pairing-helper] worker import failed: ${message}`)
      console.error('[drust-pairing-helper] the pairing file was still saved locally for reuse.')
    }

    client.destroy()
    process.exit(0)
  })

  client.on('ON_NOTIFICATION_RECEIVED', (data: EncryptedNotificationData) => {
    console.log('[drust-pairing-helper] encrypted push notification received')
    if (data.object?.appData) {
      console.log(data.object.appData)
    }
  })

  client.on('connect', () => {
    console.log('[drust-pairing-helper] listening for Rust+ pairing notifications')
    console.log('[drust-pairing-helper] next step: open Rust and click Pair with Server')
  })

  client.on('disconnect', () => {
    console.log('[drust-pairing-helper] push listener disconnected from FCM')
  })

  await client.connect()
}

async function runBindAlarm(target: OperationTarget): Promise<void> {
  await ensureRuntimeDir()

  let config: FcmConfig
  try {
    config = await readConfig()
  } catch {
    throw new Error(
      `Missing ${configPath}. Run "npm --workspace @drust/pairing-helper start -- register" first.`,
    )
  }

  const androidId = config.fcm_credentials?.gcm?.androidId
  const securityToken = config.fcm_credentials?.gcm?.securityToken

  if (!androidId || !securityToken) {
    throw new Error('FCM credentials are missing. Run the register command again.')
  }

  const pushReceiverModule = await import('@liamcottle/push-receiver/src/client.js')
  const PushReceiverClient = (pushReceiverModule.default ?? pushReceiverModule) as new (
    androidId: string,
    securityToken: string,
    persistentIds: string[],
  ) => PushReceiverClientLike

  const client = new PushReceiverClient(androidId, securityToken, [])
  const label = target === 'small-oil' ? 'Small Oil' : 'Large Oil'

  client.on('ON_DATA_RECEIVED', async (data: PairingNotificationData) => {
    logIncomingNotification('raw', data)

    const pairing = parseEntityPairingNotification(data, target)
    if (!pairing) {
      return
    }

    console.log(`[drust-pairing-helper] captured ${label} Smart Alarm entity ${pairing.entityId}`)
    const alarmCapturePath = await writeAlarmCapture(pairing)
    console.log(`[drust-pairing-helper] saved alarm binding payload to ${alarmCapturePath}`)

    try {
      await postAlarmPairingToWorker(pairing)
      console.log(`[drust-pairing-helper] imported ${label} alarm binding into ${workerBaseUrl}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown worker import error.'
      console.error(`[drust-pairing-helper] alarm binding import failed: ${message}`)
      console.error('[drust-pairing-helper] the alarm binding file was still saved locally for reuse.')
    }

    client.destroy()
    process.exit(0)
  })

  client.on('ON_NOTIFICATION_RECEIVED', (data: EncryptedNotificationData) => {
    console.log('[drust-pairing-helper] encrypted push notification received')
    if (data.object?.appData) {
      console.log(data.object.appData)
    }
  })

  client.on('connect', () => {
    console.log(`[drust-pairing-helper] listening for ${label} Smart Alarm pairing notifications`)
    console.log('[drust-pairing-helper] next step: power the Smart Alarm, use wire tool, hold E, and pair it')
  })

  client.on('disconnect', () => {
    console.log('[drust-pairing-helper] push listener disconnected from FCM')
  })

  await client.connect()
}

async function main(): Promise<void> {
  const command = process.argv[2]

  if (!command || command === 'help' || command === '--help') {
    printUsage()
    return
  }

  if (command === 'register') {
    await runRegister()
    return
  }

  if (command === 'listen') {
    await runListen()
    return
  }

  if (command === 'bind-alarm') {
    const target = process.argv[3] as OperationTarget | undefined
    if (target !== 'small-oil' && target !== 'large-oil') {
      throw new Error('bind-alarm requires a target: small-oil or large-oil')
    }

    await runBindAlarm(target)
    return
  }

  throw new Error(`Unknown command "${command}"`)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown helper error.'
  console.error(`[drust-pairing-helper] ${message}`)
  process.exit(1)
})
