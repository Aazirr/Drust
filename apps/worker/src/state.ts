import {
  closeActiveOperation,
  createMockSnapshot,
  extendActiveOperation,
  formatDiscordAlarmMessage,
  recordDiscordDelivery,
  startOperation,
  startOperationFromAlarm,
  withDerivedSnapshot,
  type AlarmTriggerInput,
  type DashboardSnapshot,
  type OperationCloseInput,
  type RustplusServerPairing,
  type StartOperationInput,
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

  syncRustplusPairingFromConfig({
    credentialsConfigured,
    smartAlarmsConfigured,
  }: {
    credentialsConfigured: boolean
    smartAlarmsConfigured: boolean
  }): void {
    if (!credentialsConfigured) {
      return
    }

    this.snapshot = {
      ...this.snapshot,
      rustplusPairing: {
        status: 'configured',
        sessionId: null,
        startedAt: this.snapshot.rustplusPairing.startedAt,
        mode: 'railway-env',
        headline: 'Rust+ connection is configured on the worker',
        detail: smartAlarmsConfigured
          ? 'Server credentials and Smart Alarm entity IDs are already available to Drust.'
          : 'Server credentials are available. Smart Alarm entity IDs still need to be paired for live Oil Rig triggers.',
        helperCommand: null,
        steps: [
          {
            label: 'Rust+ server credentials',
            detail: 'Server host, app port, player ID, and player token are configured.',
            done: true,
          },
          {
            label: 'Server paired in game',
            detail: 'The worker can now connect to the Rust+ companion websocket with the configured credentials.',
            done: true,
          },
          {
            label: 'Smart Alarm entities',
            detail: 'Bind Small Oil and Large Oil Smart Alarms so Drust can react to live triggers.',
            done: smartAlarmsConfigured,
          },
        ],
        lastImportedPairing: null,
      },
      updatedAt: new Date().toISOString(),
    }
  }

  startRustplusPairingGuide(): DashboardSnapshot {
    const startedAt = new Date().toISOString()
    this.snapshot = {
      ...this.snapshot,
      rustplusPairing: {
        status: 'awaiting-server-pair',
        sessionId: `pair-${startedAt.replaceAll(':', '').replaceAll('.', '').replaceAll('-', '')}`,
        startedAt,
        mode: 'guided',
        headline: 'Waiting for Pair with Server',
        detail:
          'Use the helper on a trusted desktop, then open Rust in game and click Pair with Server. Drust will treat this as the start of the pairing runbook.',
        helperCommand: 'npx @liamcottle/rustplus.js fcm-listen',
        steps: [
          {
            label: 'Listener registered',
            detail: 'If this is the first time, run fcm-register once. Then start fcm-listen on your trusted desktop.',
            done: true,
          },
          {
            label: 'Pair with Server in Rust',
            detail: 'Open the Rust+ menu in game and click Pair with Server for the server you want Drust to own.',
            done: false,
          },
          {
            label: 'Return captured credentials to Drust',
            detail: 'Import the captured pairing payload into Drust so the worker can connect immediately.',
            done: false,
          },
        ],
        lastImportedPairing: this.snapshot.rustplusPairing.lastImportedPairing,
      },
      updatedAt: startedAt,
    }

    return this.getSnapshot()
  }

  applyRustplusPairingImport(pairing: RustplusServerPairing): DashboardSnapshot {
    this.snapshot = {
      ...this.snapshot,
      serverConnection: {
        ...this.snapshot.serverConnection,
        serverName: pairing.serverName,
        host: pairing.serverIp,
        appPort: pairing.appPort,
        lastHeartbeatAt: pairing.receivedAt,
        lastError: null,
      },
      rustplusPairing: {
        status: 'configured',
        sessionId: null,
        startedAt: pairing.receivedAt,
        mode: 'helper-import',
        headline: 'Rust+ server pairing imported from local helper',
        detail:
          'Drust received server credentials from the desktop helper. This runtime connection is live now, but Railway still needs persistence later if you want it to survive redeploys.',
        helperCommand: null,
        steps: [
          {
            label: 'Pairing listener completed',
            detail: 'The desktop helper captured the Pair with Server notification from Rust+.',
            done: true,
          },
          {
            label: 'Worker imported credentials',
            detail: 'The Rust+ server host, app port, player ID, and player token were loaded into Drust runtime state.',
            done: true,
          },
          {
            label: 'Smart Alarm entities',
            detail: 'Bind Small Oil and Large Oil Smart Alarms next so live Oil Rig triggers can auto-start operations.',
            done: false,
          },
        ],
        lastImportedPairing: pairing,
      },
      updatedAt: pairing.receivedAt,
    }

    return this.getSnapshot()
  }

  triggerSmartAlarm(input: AlarmTriggerInput): DashboardSnapshot {
    this.snapshot = startOperationFromAlarm(this.snapshot, input)
    return this.getSnapshot()
  }

  startOperation(input: StartOperationInput): DashboardSnapshot {
    this.snapshot = startOperation(this.snapshot, input)
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
