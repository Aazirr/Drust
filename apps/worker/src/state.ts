import {
  closeActiveOperation,
  createMockSnapshot,
  extendActiveOperation,
  formatDiscordAlarmMessage,
  recordDiscordDelivery,
  startOperationFromAlarm,
  withDerivedSnapshot,
  type AlarmTriggerInput,
  type DashboardSnapshot,
  type OperationCloseInput,
} from '@drust/domain'

export class WorkerState {
  private snapshot: DashboardSnapshot

  constructor() {
    this.snapshot = createMockSnapshot()
  }

  getSnapshot(): DashboardSnapshot {
    return withDerivedSnapshot(this.snapshot)
  }

  setRustplusMode(mode: DashboardSnapshot['integrations']['rustplus']): void {
    this.snapshot = {
      ...this.snapshot,
      integrations: {
        ...this.snapshot.integrations,
        rustplus: mode,
      },
      serverConnection: {
        ...this.snapshot.serverConnection,
        connectionStatus: mode === 'connected' ? 'connected' : 'degraded',
      },
      updatedAt: new Date().toISOString(),
    }
  }

  setDiscordMode(mode: DashboardSnapshot['integrations']['discord']): void {
    this.snapshot = {
      ...this.snapshot,
      integrations: {
        ...this.snapshot.integrations,
        discord: mode,
      },
      updatedAt: new Date().toISOString(),
    }
  }

  updateServerConnection(patch: Partial<DashboardSnapshot['serverConnection']>): void {
    this.snapshot = {
      ...this.snapshot,
      serverConnection: {
        ...this.snapshot.serverConnection,
        ...patch,
      },
      updatedAt: new Date().toISOString(),
    }
  }

  triggerSmartAlarm(input: AlarmTriggerInput): DashboardSnapshot {
    this.snapshot = startOperationFromAlarm(this.snapshot, input)
    return this.getSnapshot()
  }

  extendTimer(minutes: number): DashboardSnapshot {
    this.snapshot = extendActiveOperation(this.snapshot, minutes)
    return this.getSnapshot()
  }

  closeOperation(input: OperationCloseInput): DashboardSnapshot {
    this.snapshot = closeActiveOperation(this.snapshot, input)
    return this.getSnapshot()
  }

  recordDiscordMessage(message: string): DashboardSnapshot {
    this.snapshot = recordDiscordDelivery(this.snapshot, message)
    return this.getSnapshot()
  }

  formatDiscordAlarmMessage(): string {
    return formatDiscordAlarmMessage(this.getSnapshot())
  }
}
