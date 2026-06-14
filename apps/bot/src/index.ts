import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { OperationResult, OperationSource, OperationTarget } from '@drust/domain'
import {
  ChannelType,
  Client,
  GatewayIntentBits,
  type ChatInputCommandInteraction,
  Events,
} from 'discord.js'
import { commandDefinitions } from './commands.js'
import { getConfig } from './config.js'
import { formatOperationStatus, formatPairingStatus, formatStatus } from './format.js'
import { WorkerClient } from './worker-client.js'

const config = getConfig()
const worker = new WorkerClient(config.workerUrl)
let botReady = false

interface OperationAlertPayload {
  kind: 'triggered' | 'countdown' | 'completed'
  target: OperationTarget
  source: OperationSource
  startedAt: string
  endsAt: string
  operationId: string
  remainingMinutes?: number
}

function getValidatedBotConfig(): typeof config & {
  token: string
  applicationId: string
  guildId: string
} {
  if (!config.token || !config.applicationId || !config.guildId) {
    throw new Error(
      'Missing Discord bot configuration. Set DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID, and DISCORD_GUILD_ID.',
    )
  }

  return {
    ...config,
    token: config.token,
    applicationId: config.applicationId,
    guildId: config.guildId,
  }
}

async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  const snapshot = await worker.fetchSnapshot()
  await interaction.reply({
    content: formatStatus(snapshot),
    ephemeral: true,
  })
}

async function handlePairingStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  const [snapshot, pairing] = await Promise.all([
    worker.fetchSnapshot(),
    worker.fetchPairingStatus(),
  ])

  await interaction.reply({
    content: formatPairingStatus(snapshot, pairing, Boolean(config.token)),
    ephemeral: true,
  })
}

async function handleOperationStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  const snapshot = await worker.fetchSnapshot()
  await interaction.reply({
    content: formatOperationStatus(snapshot),
    ephemeral: true,
  })
}

async function handleTimerStart(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getString('target', true) as OperationTarget
  const minutes = interaction.options.getInteger('minutes', true)
  const snapshot = await worker.startOperation({
    target,
    minutes,
    source: 'manual',
  })

  await interaction.reply({
    content: `Started ${target} for ${minutes} minutes.\n\n${formatOperationStatus(snapshot)}`,
    ephemeral: false,
  })
}

async function handleTimerExtend(interaction: ChatInputCommandInteraction): Promise<void> {
  const minutes = interaction.options.getInteger('minutes', true)
  const snapshot = await worker.extendTimer(minutes)

  await interaction.reply({
    content: `Extended the active timer by ${minutes} minute${minutes === 1 ? '' : 's'}.\n\n${formatOperationStatus(snapshot)}`,
    ephemeral: false,
  })
}

async function handleOperationClose(interaction: ChatInputCommandInteraction): Promise<void> {
  const result = interaction.options.getString('result', true) as OperationResult
  const note = interaction.options.getString('note') ?? undefined
  const snapshot = await worker.closeOperation({
    result,
    closeNote: note,
  })

  await interaction.reply({
    content: `Closed the operation as ${result}.${note ? ` Note: ${note}` : ''}\n\n${formatOperationStatus(snapshot)}`,
    ephemeral: false,
  })
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

function formatAlertTarget(target: OperationTarget): string {
  if (target === 'small-oil') {
    return 'Small Oil'
  }

  if (target === 'large-oil') {
    return 'Large Oil'
  }

  return 'Cargo'
}

function formatAlertTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function createOperationAlertMessage(payload: OperationAlertPayload, rustRoleId: string | null): string {
  const rolePrefix = rustRoleId ? `<@&${rustRoleId}> ` : ''

  if (payload.kind === 'countdown') {
    return [
      `${rolePrefix}${formatAlertTarget(payload.target)} ${payload.remainingMinutes} minute${payload.remainingMinutes === 1 ? '' : 's'} left`,
      `Source: ${payload.source}`,
      `Crate ETA: ${formatAlertTimestamp(payload.endsAt)}`,
    ].join('\n')
  }

  if (payload.kind === 'completed') {
    return [
      `${rolePrefix}${formatAlertTarget(payload.target)} timer complete`,
      `Source: ${payload.source}`,
      `Started: ${formatAlertTimestamp(payload.startedAt)}`,
      '15 minutes elapsed. Crates should be open now.',
    ].join('\n')
  }

  return [
    `${rolePrefix}${formatAlertTarget(payload.target)} triggered`,
    `Source: ${payload.source}`,
    `Started: ${formatAlertTimestamp(payload.startedAt)}`,
    `Crate ETA: ${formatAlertTimestamp(payload.endsAt)}`,
  ].join('\n')
}

async function sendOperationAlert(
  client: Client,
  payload: OperationAlertPayload,
  response: ServerResponse,
): Promise<void> {
  if (!config.alertsChannelId) {
    response.writeHead(503, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ message: 'DISCORD_ALERTS_CHANNEL_ID is not configured.' }))
    return
  }

  const channel = await client.channels.fetch(config.alertsChannelId)
  if (!channel || !channel.isTextBased() || !channel.isSendable() || channel.type === ChannelType.GuildVoice) {
    response.writeHead(503, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ message: 'Configured alerts channel is not a text channel.' }))
    return
  }

  await channel.send({
    content: createOperationAlertMessage(payload, config.rustRoleId),
    allowedMentions: config.rustRoleId
      ? {
          roles: [config.rustRoleId],
        }
      : undefined,
  })

  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ status: 'sent', operationId: payload.operationId }))
}

function createHealthServer(port: number, client: Client): void {
  const server = createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          service: 'drust-bot',
          status: botReady ? 'ok' : 'starting',
          discordConfigured: Boolean(config.token),
          botReady,
          alertsChannelConfigured: Boolean(config.alertsChannelId),
          rustRoleConfigured: Boolean(config.rustRoleId),
          internalAuthConfigured: Boolean(config.internalToken),
          workerUrlConfigured: Boolean(config.workerUrl),
        }),
      )
      return
    }

    if (request.method === 'POST' && request.url === '/internal/alerts/operation') {
      if (!config.internalToken) {
        response.writeHead(503, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ message: 'DRUST_BOT_INTERNAL_TOKEN is not configured.' }))
        return
      }

      const authorization = request.headers.authorization ?? ''
      if (authorization !== `Bearer ${config.internalToken}`) {
        response.writeHead(401, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ message: 'Unauthorized.' }))
        return
      }

      if (!botReady) {
        response.writeHead(503, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ message: 'Discord bot is not ready yet.' }))
        return
      }

      try {
        const payload = await readJson<OperationAlertPayload>(request)
        await sendOperationAlert(client, payload, response)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown Discord delivery error.'
        response.writeHead(500, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ message }))
      }
      return
    }

    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ message: 'Route not found.' }))
  })

  server.listen(port, () => {
    console.log(`[drust-bot] health endpoint listening on http://localhost:${port}/health`)
  })
}

async function main(): Promise<void> {
  const botConfig = getValidatedBotConfig()

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  })

  createHealthServer(botConfig.port, client)

  client.once(Events.ClientReady, async (readyClient) => {
    botReady = true
    await readyClient.application.commands.set(commandDefinitions, botConfig.guildId)
    console.log(`[drust-bot] logged in as ${readyClient.user.tag}`)
    console.log(`[drust-bot] slash commands synced to guild ${botConfig.guildId}`)
  })

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return
    }

    try {
      if (interaction.commandName === 'status') {
        await handleStatus(interaction)
        return
      }

      if (interaction.commandName === 'pairing-status') {
        await handlePairingStatus(interaction)
        return
      }

      if (interaction.commandName === 'op-status') {
        await handleOperationStatus(interaction)
        return
      }

      if (interaction.commandName === 'timer-start') {
        await handleTimerStart(interaction)
        return
      }

      if (interaction.commandName === 'timer-extend') {
        await handleTimerExtend(interaction)
        return
      }

      if (interaction.commandName === 'op-close') {
        await handleOperationClose(interaction)
        return
      }

      await interaction.reply({
        content: 'Unknown command.',
        ephemeral: true,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown bot error.'

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: `Command failed: ${message}`,
          ephemeral: true,
        })
        return
      }

      await interaction.reply({
        content: `Command failed: ${message}`,
        ephemeral: true,
      })
    }
  })

  await client.login(botConfig.token)
}

main().catch((error) => {
  console.error('[drust-bot] failed to start', error)
  process.exit(1)
})
