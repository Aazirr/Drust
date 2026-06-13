import type {
  ActivityLog,
  AlarmBinding,
  ChecklistItem,
  DashboardSnapshot,
  DiscordConfiguration,
  FeatureFlags,
  MapSnapshot,
  MarkerEvent,
  Monument,
  RoleAssignment,
  TeamMember,
} from './types.js'

const monuments: Monument[] = [
  { id: 'large-oil', name: 'Large Oil', x: 0.39, y: 0.55 },
  { id: 'small-oil', name: 'Small Oil', x: 0.78, y: 0.42 },
  { id: 'cargo-lane', name: 'Cargo Lane', x: 0.18, y: 0.26 },
]

const markers: MarkerEvent[] = [
  {
    markerId: 'cargo-watch',
    markerType: 'CargoShip',
    targetGuess: 'cargo',
    firstSeenAt: '2026-06-13T14:01:00.000Z',
    lastSeenAt: '2026-06-13T14:01:00.000Z',
    isActive: false,
    x: 0.14,
    y: 0.24,
  },
  {
    markerId: 'team-anchor',
    markerType: 'Player',
    targetGuess: 'large-oil',
    firstSeenAt: '2026-06-13T14:20:00.000Z',
    lastSeenAt: '2026-06-13T14:28:00.000Z',
    isActive: true,
    x: 0.34,
    y: 0.51,
  },
  {
    markerId: 'team-water',
    markerType: 'Player',
    targetGuess: 'large-oil',
    firstSeenAt: '2026-06-13T14:20:00.000Z',
    lastSeenAt: '2026-06-13T14:28:00.000Z',
    isActive: true,
    x: 0.46,
    y: 0.57,
  },
]

const teamMembers: TeamMember[] = [
  {
    steamId: '76561198000000001',
    name: 'Aazirr',
    isOnline: true,
    isAlive: true,
    x: 0.34,
    y: 0.51,
    lastSeenAt: '2026-06-13T14:28:00.000Z',
  },
  {
    steamId: '76561198000000002',
    name: 'Jace',
    isOnline: true,
    isAlive: true,
    x: 0.46,
    y: 0.57,
    lastSeenAt: '2026-06-13T14:28:00.000Z',
  },
  {
    steamId: '76561198000000003',
    name: 'Mako',
    isOnline: true,
    isAlive: true,
    x: 0.27,
    y: 0.61,
    lastSeenAt: '2026-06-13T14:28:00.000Z',
  },
  {
    steamId: '76561198000000004',
    name: 'Nova',
    isOnline: false,
    isAlive: true,
    x: 0.12,
    y: 0.74,
    lastSeenAt: '2026-06-13T14:10:00.000Z',
  },
]

const roles: RoleAssignment[] = [
  { role: 'Mini Pilot', player: 'Aazirr', status: 'Ready' },
  { role: 'Crate Breach', player: 'Jace', status: 'Ready' },
  { role: 'Water Cutoff', player: 'Mako', status: 'Staging' },
  { role: 'Shore Cover', player: 'Nova', status: 'Missing kit' },
]

const checklist: ChecklistItem[] = [
  { item: 'Mini fuel and spare low grade', done: true },
  { item: 'Homing missiles in launch box', done: true },
  { item: 'Boat and diving kits at shore base', done: true },
  { item: 'Extra meds for counter squad', done: false },
]

const notes = [
  'Enemy team likely rotates off Large by mini if crate opens uncontested.',
  'Shore base south lane is the cleanest fallback route tonight.',
  'Keep marker validation mode off until live CH47 tests are in place.',
]

const bindings: AlarmBinding[] = [
  {
    bindingId: 'bind-small-oil',
    target: 'small-oil',
    entityId: '480132',
    enabled: true,
    lastTriggeredAt: '2026-06-13T13:54:00.000Z',
  },
  {
    bindingId: 'bind-large-oil',
    target: 'large-oil',
    entityId: '480233',
    enabled: true,
    lastTriggeredAt: '2026-06-13T14:11:00.000Z',
  },
]

const activityLog: ActivityLog[] = [
  {
    eventId: 'event-1',
    type: 'alarm-triggered',
    target: 'large-oil',
    source: 'smart-alarm',
    message: 'Large Oil alarm fired and opened a live operation.',
    createdAt: '2026-06-13T14:11:00.000Z',
  },
  {
    eventId: 'event-2',
    type: 'discord-sent',
    target: 'large-oil',
    source: 'smart-alarm',
    message: '@operations ping posted to #oil-alerts.',
    createdAt: '2026-06-13T14:12:00.000Z',
  },
  {
    eventId: 'event-3',
    type: 'countdown-sent',
    target: 'large-oil',
    source: 'smart-alarm',
    message: '10-minute call scheduled for 22:16 local operation time.',
    createdAt: '2026-06-13T14:16:00.000Z',
  },
  {
    eventId: 'event-4',
    type: 'connection-change',
    target: null,
    source: null,
    message: 'Dashboard heartbeat stable. No duplicate trigger detected.',
    createdAt: '2026-06-13T14:18:00.000Z',
  },
]

const discordConfig: DiscordConfiguration = {
  guildId: 'guild-drust',
  alertsChannelId: 'alerts-channel',
  operationsChannelId: 'operations-channel',
  systemChannelId: 'system-channel',
  operationsRoleId: 'operations-role',
  oilCounterRoleId: 'oil-counter-role',
}

const featureFlags: FeatureFlags = {
  smartAlarmMode: true,
  markerValidationMode: false,
  countdownPings: true,
}

const map: MapSnapshot = {
  imageUrl: null,
  monuments,
  markers,
  teamMembers,
}

export function createDemoSnapshot(now = new Date()): DashboardSnapshot {
  return {
    serverConnection: {
      serverId: 'sea-main-2x',
      serverName: 'SEA Main 2x',
      host: '203.0.113.18',
      appPort: 28017,
      mapSize: 4250,
      wipeTime: '2026-06-13T08:00:00.000Z',
      connectionStatus: 'connected',
      currentRustTime: '14:48 Day',
      lastHeartbeatAt: now.toISOString(),
      lastError: null,
    },
    activeOperation: {
      operationId: 'op-large-oil-active',
      target: 'large-oil',
      source: 'smart-alarm',
      status: 'active',
      startedAt: '2026-06-13T14:11:00.000Z',
      endsAt: '2026-06-13T14:26:00.000Z',
      remainingSeconds: 872,
      triggerEntityId: '480233',
      triggerMarkerId: null,
      result: null,
      closeNote: null,
    },
    alarmBindings: bindings,
    map,
    discordConfig,
    activityLog,
    roles,
    checklist,
    notes,
    featureFlags,
    integrations: {
      rustplus: 'mock',
      discord: 'disabled',
    },
    updatedAt: now.toISOString(),
  }
}
