import type {
  DashboardSnapshot,
  DiscordConfiguration,
  FeatureFlags,
  MapSnapshot,
  RustplusPairingGuide,
} from './types.js'

const discordConfig: DiscordConfiguration = {
  guildId: '',
  alertsChannelId: '',
  operationsChannelId: '',
  systemChannelId: '',
  operationsRoleId: '',
  oilCounterRoleId: '',
}

const featureFlags: FeatureFlags = {
  smartAlarmMode: true,
  markerValidationMode: false,
  countdownPings: true,
}

const alertSettings = {
  oilRigDiscordPingsEnabled: true,
}

const rustplusPairing: RustplusPairingGuide = {
  status: 'idle',
  sessionId: null,
  startedAt: null,
  mode: 'guided',
  headline: 'Connect Rust+ without pasting raw credentials',
  detail:
    'Start a guided pairing session, then use a trusted desktop helper to listen for the Pair with Server notification while you pair in game.',
  helperCommand: 'npx @liamcottle/rustplus.js fcm-register',
  steps: [
    {
      label: 'Start listener flow',
      detail: 'Launch the Rust+ helper on a trusted desktop and sign in with the Steam account you use in Rust+.',
      done: false,
    },
    {
      label: 'Pair with Server in Rust',
      detail: 'Open Rust, connect to the target server, and click Pair with Server from the Rust+ menu.',
      done: false,
    },
    {
      label: 'Capture Smart Alarm IDs later',
      detail: 'After server pairing is stable, pair the Small Oil and Large Oil Smart Alarms to capture entity IDs.',
      done: false,
    },
  ],
  deviceBindingTarget: null,
  lastImportedPairing: null,
  lastImportedDevicePairing: null,
}

const map: MapSnapshot = {
  imageUrl: null,
  monuments: [],
  markers: [],
  teamMembers: [],
}

export function createDemoSnapshot(now = new Date()): DashboardSnapshot {
  return {
    serverConnection: {
      serverId: '',
      serverName: 'N/A',
      host: 'N/A',
      appPort: 0,
      mapSize: 0,
      wipeTime: '',
      connectionStatus: 'disconnected',
      currentRustTime: 'N/A',
      lastHeartbeatAt: '',
      lastError: null,
    },
    activeOperations: [],
    alarmBindings: [],
    map,
    discordConfig,
    alertSettings,
    activityLog: [],
    debugLog: [],
    roles: [],
    checklist: [],
    notes: [],
    featureFlags,
    rustplusPairing,
    integrations: {
      rustplus: 'mock',
      discord: 'disabled',
    },
    updatedAt: now.toISOString(),
  }
}
