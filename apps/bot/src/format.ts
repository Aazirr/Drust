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
  const activeOps = snapshot.activeOperations.filter((op) => op.status === 'active')
  const opSummary = activeOps.length > 0
    ? activeOps.map((op) => `${labelForTarget(op.target)} (${op.status})`).join(', ')
    : 'Idle'

  return [
    `Rust+: ${snapshot.serverConnection.connectionStatus}`,
    `Discord: ${snapshot.integrations.discord}`,
    `Server: ${snapshot.serverConnection.serverName}`,
    `Operation: ${opSummary}`,
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
      deliveryConfigured: boolean
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
    `Discord delivery route: ${pairing.discord.deliveryConfigured ? 'configured' : 'missing'}`,
    `Discord bot token: ${botReady ? 'configured' : 'missing'}`,
    `Discord bot health link: ${pairing.discord.botHealthConfigured ? 'configured' : 'missing'}`,
    `Discord bot reachability: ${pairing.discord.botConnected ? 'online' : 'offline'}`,
    `Worker link: ${snapshot.integrations.rustplus}`,
  ].join('\n')
}

export function formatOperationStatus(snapshot: DashboardSnapshot): string {
  const activeOps = snapshot.activeOperations.filter((op) => op.status === 'active')

  if (activeOps.length === 0) {
    return 'No active operation.'
  }

  return activeOps.map((op) =>
    [
      `Target: ${labelForTarget(op.target)}`,
      `Source: ${op.source}`,
      `Status: ${op.status}`,
      `Started: ${formatTime(op.startedAt)}`,
      `Crate ETA: ${formatTime(op.endsAt)}`,
      `Remaining: ${op.remainingSeconds}s`,
    ].join('\n'),
  ).join('\n\n')
}
