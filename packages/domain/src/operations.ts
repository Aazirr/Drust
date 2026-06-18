import { createDemoSnapshot } from './demo.js'
import type {
  ActivityLog,
  AlarmBinding,
  AlarmTriggerInput,
  DashboardSnapshot,
  Operation,
  OperationCloseInput,
  StartOperationInput,
  OperationTarget,
} from './types.js'

function createId(prefix: string, timestamp: string): string {
  return `${prefix}-${timestamp.replaceAll(':', '').replaceAll('.', '').replaceAll('-', '')}`
}

function createActivity(
  type: ActivityLog['type'],
  message: string,
  target: OperationTarget | null,
  source: Operation['source'] | null,
  createdAt: string,
): ActivityLog {
  return {
    eventId: createId(type, createdAt),
    type,
    target,
    source,
    message,
    createdAt,
  }
}

function updateBinding(bindings: AlarmBinding[], input: AlarmTriggerInput, triggeredAt: string): AlarmBinding[] {
  return bindings.map((binding) =>
    binding.target === input.target && binding.entityId === input.entityId
      ? { ...binding, lastTriggeredAt: triggeredAt }
      : binding,
  )
}

export function withDerivedSnapshot(snapshot: DashboardSnapshot, now = new Date()): DashboardSnapshot {
  const activeOperation =
    snapshot.activeOperation && snapshot.activeOperation.status === 'active'
      ? {
          ...snapshot.activeOperation,
          remainingSeconds: Math.max(
            0,
            Math.floor((new Date(snapshot.activeOperation.endsAt).getTime() - now.getTime()) / 1000),
          ),
        }
      : snapshot.activeOperation

  return {
    ...snapshot,
    activeOperation,
    updatedAt: now.toISOString(),
  }
}

export function startOperationFromAlarm(
  snapshot: DashboardSnapshot,
  input: AlarmTriggerInput,
  now = new Date(),
): DashboardSnapshot {
  /* Guard: never overwrite an already-active operation. */
  if (snapshot.activeOperation && snapshot.activeOperation.status === 'active') {
    return snapshot
  }

  const triggeredAt = input.triggeredAt ?? now.toISOString()
  const source = input.source ?? 'smart-alarm'
  const endsAt = new Date(new Date(triggeredAt).getTime() + 15 * 60 * 1000).toISOString()
  const label = input.target === 'small-oil' ? 'Small Oil' : 'Large Oil'

  const activeOperation: Operation = {
    operationId: createId(`op-${input.target}`, triggeredAt),
    target: input.target,
    source,
    status: 'active',
    startedAt: triggeredAt,
    endsAt,
    remainingSeconds: 15 * 60,
    triggerEntityId: input.entityId,
    triggerMarkerId: null,
    result: null,
    closeNote: null,
  }

  const activityLog = [
    createActivity('alarm-triggered', `${label} alarm fired and opened a live operation.`, input.target, source, triggeredAt),
    createActivity('operation-started', `${label} timer started for 15 minutes.`, input.target, source, triggeredAt),
    ...snapshot.activityLog,
  ].slice(0, 18)

  return withDerivedSnapshot(
    {
      ...snapshot,
      activeOperation,
      alarmBindings: updateBinding(snapshot.alarmBindings, input, triggeredAt),
      activityLog,
      updatedAt: triggeredAt,
    },
    now,
  )
}

export function startOperation(
  snapshot: DashboardSnapshot,
  input: StartOperationInput,
  now = new Date(),
): DashboardSnapshot {
  const startedAt = input.startedAt ?? now.toISOString()
  const source = input.source ?? 'manual'
  const minutes = Math.max(1, input.minutes)
  const endsAt = new Date(new Date(startedAt).getTime() + minutes * 60 * 1000).toISOString()
  const labels: Record<OperationTarget, string> = {
    'small-oil': 'Small Oil',
    'large-oil': 'Large Oil',
    cargo: 'Cargo',
  }

  const activeOperation: Operation = {
    operationId: createId(`op-${input.target}`, startedAt),
    target: input.target,
    source,
    status: 'active',
    startedAt,
    endsAt,
    remainingSeconds: minutes * 60,
    triggerEntityId: input.entityId ?? null,
    triggerMarkerId: input.markerId ?? null,
    result: null,
    closeNote: null,
  }

  const activityLog = [
    createActivity(
      'operation-started',
      `${labels[input.target]} timer started for ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      input.target,
      source,
      startedAt,
    ),
    ...snapshot.activityLog,
  ].slice(0, 18)

  return withDerivedSnapshot(
    {
      ...snapshot,
      activeOperation,
      activityLog,
      updatedAt: startedAt,
    },
    now,
  )
}

export function closeActiveOperation(
  snapshot: DashboardSnapshot,
  input: OperationCloseInput,
  now = new Date(),
): DashboardSnapshot {
  if (!snapshot.activeOperation) {
    return snapshot
  }

  const closedAt = input.closedAt ?? now.toISOString()
  const closedOperation: Operation = {
    ...snapshot.activeOperation,
    status: 'closed',
    remainingSeconds: 0,
    result: input.result,
    closeNote: input.closeNote ?? null,
  }

  const activityLog = [
    createActivity(
      'operation-closed',
      `Operation closed as ${input.result}${input.closeNote ? `: ${input.closeNote}` : '.'}`,
      closedOperation.target,
      closedOperation.source,
      closedAt,
    ),
    ...snapshot.activityLog,
  ].slice(0, 18)

  return {
    ...snapshot,
    activeOperation: closedOperation,
    activityLog,
    updatedAt: closedAt,
  }
}

export function extendActiveOperation(
  snapshot: DashboardSnapshot,
  minutes: number,
  now = new Date(),
): DashboardSnapshot {
  if (!snapshot.activeOperation || snapshot.activeOperation.status !== 'active') {
    return snapshot
  }

  const endsAt = new Date(new Date(snapshot.activeOperation.endsAt).getTime() + minutes * 60 * 1000).toISOString()
  const nextSnapshot: DashboardSnapshot = {
    ...snapshot,
    activeOperation: {
      ...snapshot.activeOperation,
      endsAt,
      remainingSeconds: snapshot.activeOperation.remainingSeconds + minutes * 60,
    },
    activityLog: [
      createActivity(
        'countdown-sent',
        `Operation timer extended by ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        snapshot.activeOperation.target,
        snapshot.activeOperation.source,
        now.toISOString(),
      ),
      ...snapshot.activityLog,
    ].slice(0, 18),
    updatedAt: now.toISOString(),
  }

  return withDerivedSnapshot(nextSnapshot, now)
}

export function recordDiscordDelivery(
  snapshot: DashboardSnapshot,
  message: string,
  now = new Date(),
): DashboardSnapshot {
  return {
    ...snapshot,
    activityLog: [
      createActivity(
        'discord-sent',
        message,
        snapshot.activeOperation?.target ?? null,
        snapshot.activeOperation?.source ?? null,
        now.toISOString(),
      ),
      ...snapshot.activityLog,
    ].slice(0, 18),
    updatedAt: now.toISOString(),
  }
}

export function formatDiscordAlarmMessage(snapshot: DashboardSnapshot): string {
  if (!snapshot.activeOperation) {
    return 'No active operation.'
  }

  const operation = snapshot.activeOperation
  const roleTag = snapshot.discordConfig.operationsRoleId
    ? `<@&${snapshot.discordConfig.operationsRoleId}> `
    : ''

  return [
    `${roleTag}${operation.target === 'small-oil' ? 'Small Oil' : 'Large Oil'} triggered`,
    `Source: ${operation.source}`,
    `Started: ${new Date(operation.startedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
    `Crate ETA: ${new Date(operation.endsAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
  ].join('\n')
}

export function createMockSnapshot(): DashboardSnapshot {
  return withDerivedSnapshot(createDemoSnapshot())
}
