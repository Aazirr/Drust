import type { DashboardSnapshot, OperationTarget } from '@drust/domain'

function labelForTarget(target: OperationTarget): string {
  if (target === 'small-oil') {
    return 'Small Oil'
  }

  if (target === 'large-oil') {
    return 'Large Oil'
  }

  return 'Cargo'
}

function formatTime(timestamp: string | null): string {
  if (!timestamp) {
    return 'Not available'
  }

  return new Date(timestamp).toLocaleString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  })
}

export function formatStatus(snapshot: DashboardSnapshot): string {
  const activeOperation = snapshot.activeOperation

  return [
    `Rust+: ${snapshot.serverConnection.connectionStatus}`,
    `Discord: ${snapshot.integrations.discord}`,
    `Server: ${snapshot.serverConnection.serverName}`,
    `Operation: ${activeOperation ? `${labelForTarget(activeOperation.target)} (${activeOperation.status})` : 'Idle'}`,
    `Last update: ${formatTime(snapshot.updatedAt)}`,
  ].join('\n')
}

export function formatPairingStatus(
  snapshot: DashboardSnapshot,
  pairing: {
    rustplus: {
      configured: boolean
      smartAlarmsConfigured: boolean
      connectionStatus: string
    }
    discord: {
      webhookConfigured: boolean
      botHealthConfigured: boolean
      botConnected: boolean
    }
  },
  botReady: boolean,
): string {
  return [
    `Rust+ credentials: ${pairing.rustplus.configured ? 'configured' : 'missing'}`,
    `Rust+ connection: ${pairing.rustplus.connectionStatus}`,
    `Smart Alarm IDs: ${pairing.rustplus.smartAlarmsConfigured ? 'configured' : 'missing'}`,
    `Discord webhook: ${pairing.discord.webhookConfigured ? 'configured' : 'missing'}`,
    `Discord bot token: ${botReady ? 'configured' : 'missing'}`,
    `Discord bot health link: ${pairing.discord.botHealthConfigured ? 'configured' : 'missing'}`,
    `Discord bot reachability: ${pairing.discord.botConnected ? 'online' : 'offline'}`,
    `Worker link: ${snapshot.integrations.rustplus}`,
  ].join('\n')
}

export function formatOperationStatus(snapshot: DashboardSnapshot): string {
  const activeOperation = snapshot.activeOperation

  if (!activeOperation) {
    return 'No active operation.'
  }

  return [
    `Target: ${labelForTarget(activeOperation.target)}`,
    `Source: ${activeOperation.source}`,
    `Status: ${activeOperation.status}`,
    `Started: ${formatTime(activeOperation.startedAt)}`,
    `Crate ETA: ${formatTime(activeOperation.endsAt)}`,
    `Remaining: ${activeOperation.remainingSeconds}s`,
  ].join('\n')
}
