import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import type { RustplusServerPairing } from '@drust/domain'

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
  appData?: Record<string, string>
  from?: string
  persistentId?: string
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
}

async function ensureRuntimeDir(): Promise<void> {
  await mkdir(runtimeDir, { recursive: true })
}

async function readConfig(): Promise<FcmConfig> {
  const raw = await readFile(configPath, 'utf8')
  return JSON.parse(raw) as FcmConfig
}

function parsePairingNotification(data: PairingNotificationData): RustplusServerPairing | null {
  const appData = data.appData ?? {}
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

async function writeCapture(pairing: RustplusServerPairing): Promise<void> {
  await ensureRuntimeDir()
  await writeFile(capturePath, JSON.stringify(pairing, null, 2), 'utf8')
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

  client.on('connect', () => {
    console.log('[drust-pairing-helper] listening for Rust+ pairing notifications')
    console.log('[drust-pairing-helper] next step: open Rust and click Pair with Server')
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

  throw new Error(`Unknown command "${command}"`)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown helper error.'
  console.error(`[drust-pairing-helper] ${message}`)
  process.exit(1)
})
