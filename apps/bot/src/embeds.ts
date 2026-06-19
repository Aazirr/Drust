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
  const activeOps = snapshot.activeOperations.filter((op) => op.status === 'active')
  const urgentOp = activeOps.find((op) => op.remainingSeconds <= 120)
  const color = urgentOp ? 0xef8d74 : activeOps.length > 0 ? 0xd9a35f : 0x6dc6a2

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('Drust Status')
    .addFields(
      { name: 'Rust+', value: snapshot.serverConnection.connectionStatus, inline: true },
      { name: 'Discord', value: snapshot.integrations.discord, inline: true },
      { name: 'Server', value: snapshot.serverConnection.serverName || 'N/A', inline: true },
    )

  if (activeOps.length > 0) {
    activeOps.forEach((op) => {
      embed.addFields({
        name: `${labelForTarget(op.target)} Timer`,
        value: `${Math.floor(op.remainingSeconds / 60)}:${String(op.remainingSeconds % 60).padStart(2, '0')} · ${op.status}`,
        inline: true,
      })
    })
  } else {
    embed.addFields({ name: 'Operation', value: 'Idle', inline: true })
  }

  embed.addFields({ name: 'Last update', value: formatTime(snapshot.updatedAt), inline: true })

  return embed.setFooter({ text: 'Drust Operations Command' }).setTimestamp()
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
  const activeOps = snapshot.activeOperations.filter((op) => op.status === 'active')

  if (activeOps.length === 0) {
    return new EmbedBuilder()
      .setColor(0x728793)
      .setTitle('No Active Operation')
      .setDescription('The system is standing by. Operations will appear here when a Smart Alarm fires or a manual timer is started.')
  }

  const urgentOp = activeOps.find((op) => op.remainingSeconds <= 120)
  const color = urgentOp ? 0xef8d74 : 0xd9a35f

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(activeOps.length > 1 ? `${activeOps.length} Active Operations` : `${labelForTarget(activeOps[0].target)} · ${activeOps[0].status}`)
    .setDescription(urgentOp ? '⚠️ Timer running low!' : null)

  activeOps.forEach((op) => {
    const mins = Math.floor(op.remainingSeconds / 60)
    const secs = op.remainingSeconds % 60
    embed.addFields({
      name: `⏱ ${labelForTarget(op.target)}`,
      value: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} · Crate ${formatShortTime(op.endsAt)}`,
      inline: true,
    })
  })

  return embed.setFooter({ text: 'Drust Operations Command' }).setTimestamp()
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
  target: OperationTarget | undefined,
  extra?: string,
): EmbedBuilder {
  const activeOps = snapshot.activeOperations.filter((op) => op.status === 'active')
  const relevantOp = target
    ? snapshot.activeOperations.find((op) => op.target === target)
    : snapshot.activeOperations.find((op) => op.status === 'active')
  const color = action === 'closed'
    ? (result === 'success' ? 0x6dc6a2 : 0xef8d74)
    : 0xd9a35f

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(
      action === 'started'
        ? `Timer Started — ${relevantOp ? labelForTarget(relevantOp.target) : 'Unknown'}`
        : action === 'extended'
          ? 'Timer Extended'
          : `Operation Closed — ${result ?? 'unknown'}`,
    )

  if (extra) {
    embed.setDescription(extra)
  }

  if (relevantOp) {
    const mins = Math.floor(relevantOp.remainingSeconds / 60)
    const secs = relevantOp.remainingSeconds % 60
    embed.addFields(
      { name: '⏱ Remaining', value: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`, inline: true },
      { name: 'Crate ETA', value: formatShortTime(relevantOp.endsAt) || '--:--', inline: true },
      { name: 'Source', value: relevantOp.source, inline: true },
    )
  } else if (activeOps.length > 0) {
    activeOps.forEach((op) => {
      const mins = Math.floor(op.remainingSeconds / 60)
      const secs = op.remainingSeconds % 60
      embed.addFields({
        name: `${labelForTarget(op.target)}`,
        value: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
        inline: true,
      })
    })
  }

  return embed.setFooter({ text: 'Drust Operations Command' }).setTimestamp()
}

export function teamAlertEmbed(title: string, body: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xd9a35f)
    .setTitle(title)
    .setDescription(body)
    .setFooter({ text: 'Drust Operations Command' })
    .setTimestamp()
}
