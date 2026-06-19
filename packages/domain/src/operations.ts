import { createDemoSnapshot } from './demo.js'
import { formatProjectShortTime } from './time.js'
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
  const activeOperations = snapshot.activeOperations
    .filter((op) => op.status === 'active')
    .map((op) => ({
      ...op,
      remainingSeconds: Math.max(
        0,
        Math.floor((new Date(op.endsAt).getTime() - now.getTime()) / 1000),
      ),
    }))

  return {
    ...snapshot,
    activeOperations,
    updatedAt: now.toISOString(),
  }
}

export function startOperationFromAlarm(
  snapshot: DashboardSnapshot,
  input: AlarmTriggerInput,
  now = new Date(),
): DashboardSnapshot {
  /* Guard: skip if a timer for the same target is already active. */
  if (snapshot.activeOperations.some((op) => op.target === input.target && op.status === 'active')) {
    return snapshot
  }

  const triggeredAt = input.triggeredAt ?? now.toISOString()
  const source = input.source ?? 'smart-alarm'
  const endsAt = new Date(new Date(triggeredAt).getTime() + 15 * 60 * 1000).toISOString()
  const label = input.target === 'small-oil' ? 'Small Oil' : 'Large Oil'

  const newOperation: Operation = {
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
      activeOperations: [...snapshot.activeOperations, newOperation],
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

  const newOperation: Operation = {
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
      activeOperations: [...snapshot.activeOperations, newOperation],
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
  const targetToClose = input.target
  const closedAt = input.closedAt ?? now.toISOString()

  const nextOperations = snapshot.activeOperations.map((op) => {
    if ((targetToClose && op.target === targetToClose && op.status === 'active') ||
        (!targetToClose && op.status === 'active')) {
      const closed: Operation = {
        ...op,
        status: 'closed',
        remainingSeconds: 0,
        result: input.result,
        closeNote: input.closeNote ?? null,
      }

      const activityLog = [
        createActivity(
          'operation-closed',
          `Operation closed as ${input.result}${input.closeNote ? `: ${input.closeNote}` : '.'}`,
          closed.target,
          closed.source,
          closedAt,
        ),
        ...snapshot.activityLog,
      ].slice(0, 18)

      /* We return a fully mutated snapshot from here — only close one operation. */
      snapshot = {
        ...snapshot,
        activeOperations: snapshot.activeOperations.map((o) => (o.operationId === op.operationId ? closed : o)),
        activityLog,
        updatedAt: closedAt,
      }

      return closed
    }

    return op
  })

  return {
    ...snapshot,
    activeOperations: nextOperations,
  }
}

export function extendActiveOperation(
  snapshot: DashboardSnapshot,
  input: { target?: OperationTarget; minutes: number },
  now = new Date(),
): DashboardSnapshot {
  const nextOperations = snapshot.activeOperations.map((op) => {
    const matches = !input.target || op.target === input.target
    if (!matches || op.status !== 'active') {
      return op
    }

    const endsAt = new Date(new Date(op.endsAt).getTime() + input.minutes * 60 * 1000).toISOString()

    return {
      ...op,
      endsAt,
      remainingSeconds: op.remainingSeconds + input.minutes * 60,
    }
  })

  const changed = nextOperations.some((op, i) => op !== snapshot.activeOperations[i])
  if (!changed) {
    return snapshot
  }

  return withDerivedSnapshot(
    {
      ...snapshot,
      activeOperations: nextOperations,
      activityLog: [
        createActivity(
          'countdown-sent',
          `Operation timer extended by ${input.minutes} minute${input.minutes === 1 ? '' : 's'}.`,
          snapshot.activeOperations.find((op) => op.status === 'active')?.target ?? null,
          snapshot.activeOperations.find((op) => op.status === 'active')?.source ?? null,
          now.toISOString(),
        ),
        ...snapshot.activityLog,
      ].slice(0, 18),
      updatedAt: now.toISOString(),
    },
    now,
  )
}

export function recordDiscordDelivery(
  snapshot: DashboardSnapshot,
  message: string,
  now = new Date(),
): DashboardSnapshot {
  const activeOp = snapshot.activeOperations.find((op) => op.status === 'active')
  return {
    ...snapshot,
    activityLog: [
      createActivity(
        'discord-sent',
        message,
        activeOp?.target ?? null,
        activeOp?.source ?? null,
        now.toISOString(),
      ),
      ...snapshot.activityLog,
    ].slice(0, 18),
    updatedAt: now.toISOString(),
  }
}

export function formatDiscordAlarmMessage(snapshot: DashboardSnapshot): string {
  const activeOps = snapshot.activeOperations.filter((op) => op.status === 'active')
  if (activeOps.length === 0) {
    return 'No active operation.'
  }

  return activeOps.map((operation) => {
    const roleTag = snapshot.discordConfig.operationsRoleId
      ? `<@&${snapshot.discordConfig.operationsRoleId}> `
      : ''

    return [
      `${roleTag}${operation.target === 'small-oil' ? 'Small Oil' : 'Large Oil'} triggered`,
      `Source: ${operation.source}`,
      `Started: ${formatProjectShortTime(operation.startedAt)}`,
      `Crate ETA: ${formatProjectShortTime(operation.endsAt)}`,
    ].join('\n')
  }).join('\n\n')
}

export function createMockSnapshot(): DashboardSnapshot {
  return withDerivedSnapshot(createDemoSnapshot())
}
