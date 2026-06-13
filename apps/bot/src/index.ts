import { createServer } from 'node:http'
import type { OperationResult, OperationTarget } from '@drust/domain'
import { Client, GatewayIntentBits, type ChatInputCommandInteraction, Events } from 'discord.js'
import { commandDefinitions } from './commands.js'
import { getConfig } from './config.js'
import { formatOperationStatus, formatPairingStatus, formatStatus } from './format.js'
import { WorkerClient } from './worker-client.js'

const config = getConfig()
const worker = new WorkerClient(config.workerUrl)

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

function createHealthServer(port: number): void {
  const server = createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      try {
        const health = await worker.fetchHealth()
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(
          JSON.stringify({
            service: 'drust-bot',
            status: 'ok',
            discordConfigured: Boolean(config.token),
            worker: health,
          }),
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown worker error.'
        response.writeHead(503, { 'content-type': 'application/json' })
        response.end(
          JSON.stringify({
            service: 'drust-bot',
            status: 'degraded',
            discordConfigured: Boolean(config.token),
            workerError: message,
          }),
        )
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

  createHealthServer(botConfig.port)

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  })

  client.once(Events.ClientReady, async (readyClient) => {
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
