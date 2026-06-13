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
  type OperationTarget,
  type RustplusEntityPairing,
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

  syncDiscordMode({
    webhookConfigured,
    botConnected,
  }: {
    webhookConfigured: boolean
    botConnected: boolean
  }): void {
    const mode = webhookConfigured
      ? botConnected
        ? 'bot-and-webhook'
        : 'webhook-only'
      : botConnected
        ? 'bot-only'
        : 'disabled'

    this.setDiscordMode(mode)
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
        deviceBindingTarget: null,
        lastImportedPairing: null,
        lastImportedDevicePairing: null,
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
        deviceBindingTarget: null,
        lastImportedPairing: this.snapshot.rustplusPairing.lastImportedPairing,
        lastImportedDevicePairing: this.snapshot.rustplusPairing.lastImportedDevicePairing,
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
        deviceBindingTarget: this.snapshot.rustplusPairing.deviceBindingTarget,
        lastImportedPairing: pairing,
        lastImportedDevicePairing: this.snapshot.rustplusPairing.lastImportedDevicePairing,
      },
      updatedAt: pairing.receivedAt,
    }

    return this.getSnapshot()
  }

  startSmartAlarmBindingGuide(target: OperationTarget): DashboardSnapshot {
    const startedAt = new Date().toISOString()
    const label = target === 'small-oil' ? 'Small Oil' : 'Large Oil'
    this.snapshot = {
      ...this.snapshot,
      rustplusPairing: {
        ...this.snapshot.rustplusPairing,
        status: 'configured',
        sessionId: `bind-${target}-${startedAt.replaceAll(':', '').replaceAll('.', '').replaceAll('-', '')}`,
        startedAt,
        mode: this.snapshot.rustplusPairing.mode,
        headline: `Waiting for ${label} Smart Alarm pair`,
        detail:
          `Run the local helper for ${label}, then use the wire tool in game to pair that Smart Alarm with Rust+. Drust will bind the next captured device notification to this target.`,
        helperCommand: `npm.cmd --workspace @drust/pairing-helper start -- bind-alarm ${target}`,
        steps: [
          {
            label: 'Helper listener ready',
            detail: `Start the local helper in bind mode for ${label}.`,
            done: true,
          },
          {
            label: 'Pair Smart Alarm in game',
            detail: 'Power the Smart Alarm, equip the wire tool, hold E on the device, and pair it to Rust+.',
            done: false,
          },
          {
            label: 'Worker binds entity ID',
            detail: `Drust will store the next paired Smart Alarm entity ID for ${label} and subscribe to its broadcasts.`,
            done: false,
          },
        ],
        deviceBindingTarget: target,
        lastImportedPairing: this.snapshot.rustplusPairing.lastImportedPairing,
        lastImportedDevicePairing: this.snapshot.rustplusPairing.lastImportedDevicePairing,
      },
      updatedAt: startedAt,
    }

    return this.getSnapshot()
  }

  applySmartAlarmBindingImport(pairing: RustplusEntityPairing): DashboardSnapshot {
    const label = pairing.target === 'small-oil' ? 'Small Oil' : 'Large Oil'
    const existingBinding = this.snapshot.alarmBindings.find((binding) => binding.target === pairing.target)
    const nextBindings = existingBinding
      ? this.snapshot.alarmBindings.map((binding) =>
          binding.target === pairing.target
            ? {
                ...binding,
                entityId: pairing.entityId,
                enabled: true,
              }
            : binding,
        )
      : [
          ...this.snapshot.alarmBindings,
          {
            bindingId: `bind-${pairing.target}`,
            target: pairing.target,
            entityId: pairing.entityId,
            enabled: true,
            lastTriggeredAt: null,
          },
        ]

    const smallOilBound = nextBindings.some(
      (binding) => binding.target === 'small-oil' && Boolean(binding.entityId),
    )
    const largeOilBound = nextBindings.some(
      (binding) => binding.target === 'large-oil' && Boolean(binding.entityId),
    )

    this.snapshot = {
      ...this.snapshot,
      alarmBindings: nextBindings,
      rustplusPairing: {
        ...this.snapshot.rustplusPairing,
        status: 'configured',
        sessionId: null,
        startedAt: pairing.receivedAt,
        headline: `${label} Smart Alarm bound from local helper`,
        detail:
          `${label} now points at entity ${pairing.entityId}. Once both Oil Rig alarms are bound, Drust can auto-start operations from live Rust+ device broadcasts.`,
        helperCommand: null,
        steps: [
          {
            label: 'Helper listener completed',
            detail: `The local helper captured the ${label} device pairing notification from Rust+.`,
            done: true,
          },
          {
            label: 'Entity stored in Drust',
            detail: `Drust saved ${label} as entity ${pairing.entityId} and can subscribe to its state changes.`,
            done: true,
          },
          {
            label: 'Both Oil Rig alarms ready',
            detail: 'Bind both Small Oil and Large Oil Smart Alarms to complete the live trigger path.',
            done: smallOilBound && largeOilBound,
          },
        ],
        deviceBindingTarget: null,
        lastImportedPairing: this.snapshot.rustplusPairing.lastImportedPairing,
        lastImportedDevicePairing: pairing,
      },
      activityLog: [
        {
          eventId: `connection-change-${pairing.receivedAt.replaceAll(':', '').replaceAll('.', '').replaceAll('-', '')}`,
          type: 'connection-change' as const,
          target: pairing.target,
          source: 'smart-alarm' as const,
          message: `${label} Smart Alarm bound to entity ${pairing.entityId}.`,
          createdAt: pairing.receivedAt,
        },
        ...this.snapshot.activityLog,
      ].slice(0, 18),
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
