import { EmbedBuilder } from 'discord.js'
import type { DashboardSnapshot, OperationTarget } from '@drust/domain'

function labelForTarget(target: OperationTarget): string {
  if (target === 'small-oil') return 'Small Oil'
  if (target === 'large-oil') return 'Large Oil'
  return 'Cargo'
}

function formatTime(timestamp: string | null): string {
  if (!timestamp) return 'Not available'
  return new Date(timestamp).toLocaleString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  })
}

function formatShortTime(timestamp: string | null): string {
  if (!timestamp) return 'Not yet'
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function statusEmbed(snapshot: DashboardSnapshot): EmbedBuilder {
  const op = snapshot.activeOperation
  const color = op ? (op.remainingSeconds <= 120 ? 0xef8d74 : 0xd9a35f) : 0x6dc6a2

  return new EmbedBuilder()
    .setColor(color)
    .setTitle('Drust Status')
    .addFields(
      { name: 'Rust+', value: snapshot.serverConnection.connectionStatus, inline: true },
      { name: 'Discord', value: snapshot.integrations.discord, inline: true },
      { name: 'Server', value: snapshot.serverConnection.serverName || 'N/A', inline: true },
      {
        name: 'Operation',
        value: op ? `${labelForTarget(op.target)} · ${op.status}` : 'Idle',
        inline: true,
      },
      { name: 'Last update', value: formatTime(snapshot.updatedAt), inline: true },
    )
    .setFooter({ text: 'Drust Operations Command' })
    .setTimestamp()
}

export function pairingStatusEmbed(
  snapshot: DashboardSnapshot,
  pairing: {
    rustplus: { configured: boolean; smartAlarmsConfigured: boolean; connectionStatus: string }
    discord: { deliveryConfigured: boolean; botHealthConfigured: boolean; botConnected: boolean }
  },
  botReady: boolean,
): EmbedBuilder {
  const issues: string[] = []
  if (!pairing.rustplus.configured) issues.push('Rust+ credentials missing')
  if (!pairing.rustplus.smartAlarmsConfigured) issues.push('Smart Alarm IDs missing')
  if (!pairing.discord.deliveryConfigured) issues.push('Discord delivery route missing')
  if (!botReady) issues.push('Discord bot token missing')
  if (!pairing.discord.botConnected) issues.push('Discord bot offline')

  const allOk = issues.length === 0
  const color = allOk ? 0x6dc6a2 : 0xd9a35f

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(allOk ? 'All Systems Operational' : 'Setup Incomplete')
    .setDescription(allOk
      ? 'Rust+, Discord, and Smart Alarms are configured and connected.'
      : `Missing: ${issues.join(', ')}`)
    .addFields(
      { name: 'Rust+ credentials', value: pairing.rustplus.configured ? '✅ Configured' : '❌ Missing', inline: true },
      { name: 'Rust+ connection', value: pairing.rustplus.connectionStatus, inline: true },
      { name: 'Smart Alarm IDs', value: pairing.rustplus.smartAlarmsConfigured ? '✅ Configured' : '⚠️ Missing', inline: true },
      { name: 'Discord delivery', value: pairing.discord.deliveryConfigured ? '✅ Configured' : '❌ Missing', inline: true },
      { name: 'Discord bot', value: botReady ? '✅ Ready' : '❌ Missing', inline: true },
      { name: 'Bot reachability', value: pairing.discord.botConnected ? '✅ Online' : '❌ Offline', inline: true },
    )
    .setFooter({ text: 'Drust Operations Command' })

  return embed
}

export function operationStatusEmbed(snapshot: DashboardSnapshot): EmbedBuilder {
  const op = snapshot.activeOperation

  if (!op) {
    return new EmbedBuilder()
      .setColor(0x728793)
      .setTitle('No Active Operation')
      .setDescription('The system is standing by. Operations will appear here when a Smart Alarm fires or a manual timer is started.')
  }

  const isUrgent = op.remainingSeconds <= 120
  const color = isUrgent ? 0xef8d74 : op.status === 'active' ? 0xd9a35f : 0x728793
  const mins = Math.floor(op.remainingSeconds / 60)
  const secs = op.remainingSeconds % 60
  const timeDisplay = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`${labelForTarget(op.target)} · ${op.status}`)
    .setDescription(isUrgent ? '⚠️ Timer running low!' : null)
    .addFields(
      { name: '⏱ Remaining', value: timeDisplay, inline: true },
      { name: 'Source', value: op.source, inline: true },
      { name: 'Crate ETA', value: formatShortTime(op.endsAt) || '--:--', inline: true },
      { name: 'Started', value: formatShortTime(op.startedAt) || '--:--', inline: true },
    )
    .setFooter({ text: 'Drust Operations Command' })
    .setTimestamp()
}

export function operationAlertEmbed(
  kind: 'triggered' | 'countdown' | 'completed',
  target: OperationTarget,
  source: string,
  startedAt: string,
  endsAt: string,
  remainingMinutes?: number,
): EmbedBuilder {
  const label = labelForTarget(target)
  const color = kind === 'triggered' ? 0xef8d74 : kind === 'countdown' ? 0xd9a35f : 0x6dc6a2
  const emoji = kind === 'triggered' ? '🔴' : kind === 'countdown' ? '🟡' : '🟢'

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${emoji} ${label}`)
    .setDescription(kind === 'triggered'
      ? 'Operation triggered'
      : kind === 'completed'
        ? 'Timer complete — crates should be open now.'
        : `${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'} remaining`)
    .addFields(
      { name: 'Source', value: source, inline: true },
      { name: 'Crate ETA', value: formatShortTime(endsAt) || '--:--', inline: true },
      { name: 'Started', value: formatShortTime(startedAt) || '--:--', inline: true },
    )
    .setFooter({ text: 'Drust Operations Command' })
    .setTimestamp()

  return embed
}

export function timerActionEmbed(
  action: 'started' | 'extended' | 'closed',
  result: string | null,
  snapshot: DashboardSnapshot,
  extra?: string,
): EmbedBuilder {
  const op = snapshot.activeOperation
  const color = action === 'closed'
    ? (result === 'success' ? 0x6dc6a2 : 0xef8d74)
    : 0xd9a35f

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(
      action === 'started'
        ? `Timer Started — ${op ? labelForTarget(op.target) : 'Unknown'}`
        : action === 'extended'
          ? 'Timer Extended'
          : `Operation Closed — ${result ?? 'unknown'}`,
    )

  if (extra) {
    embed.setDescription(extra)
  }

  if (op) {
    const mins = Math.floor(op.remainingSeconds / 60)
    const secs = op.remainingSeconds % 60
    embed.addFields(
      { name: '⏱ Remaining', value: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`, inline: true },
      { name: 'Crate ETA', value: formatShortTime(op.endsAt) || '--:--', inline: true },
      { name: 'Source', value: op.source, inline: true },
    )
  }

  return embed.setFooter({ text: 'Drust Operations Command' }).setTimestamp()
}
