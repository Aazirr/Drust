export type ConnectionStatus = 'connected' | 'connecting' | 'degraded' | 'disconnected'
export type OperationTarget = 'small-oil' | 'large-oil' | 'cargo'
export type OperationSource = 'manual' | 'smart-alarm' | 'marker'
export type OperationStatus = 'idle' | 'active' | 'closed'
export type OperationResult = 'success' | 'failed' | 'aborted'
export type ActivityType =
  | 'alarm-triggered'
  | 'operation-started'
  | 'countdown-sent'
  | 'operation-closed'
  | 'marker-detected'
  | 'connection-change'
  | 'discord-sent'

export interface ServerConnection {
  serverId: string
  serverName: string
  host: string
  appPort: number
  mapSize: number
  wipeTime: string
  connectionStatus: ConnectionStatus
  currentRustTime: string
  lastHeartbeatAt: string
  lastError: string | null
}

export interface Operation {
  operationId: string
  target: OperationTarget
  source: OperationSource
  status: OperationStatus
  startedAt: string
  endsAt: string
  remainingSeconds: number
  triggerEntityId: string | null
  triggerMarkerId: string | null
  result: OperationResult | null
  closeNote: string | null
}

export interface AlarmBinding {
  bindingId: string
  target: OperationTarget
  entityId: string
  enabled: boolean
  lastTriggeredAt: string | null
}

export interface MarkerEvent {
  markerId: string
  markerType: string
  targetGuess: OperationTarget | null
  firstSeenAt: string
  lastSeenAt: string
  isActive: boolean
  x: number
  y: number
}

export interface TeamMember {
  steamId: string
  name: string
  isOnline: boolean
  isAlive: boolean
  x: number
  y: number
  lastSeenAt: string
}

export interface DiscordConfiguration {
  guildId: string
  alertsChannelId: string
  operationsChannelId: string
  systemChannelId: string
  operationsRoleId: string
  oilCounterRoleId: string
}

export interface ActivityLog {
  eventId: string
  type: ActivityType
  target: OperationTarget | null
  source: OperationSource | null
  message: string
  createdAt: string
}

export interface RoleAssignment {
  role: string
  player: string
  status: string
}

export interface ChecklistItem {
  item: string
  done: boolean
}

export interface Monument {
  id: string
  name: string
  x: number
  y: number
}

export interface MapSnapshot {
  imageUrl: string | null
  monuments: Monument[]
  markers: MarkerEvent[]
  teamMembers: TeamMember[]
}

export interface FeatureFlags {
  smartAlarmMode: boolean
  markerValidationMode: boolean
  countdownPings: boolean
}

export type RustplusPairingStatus = 'idle' | 'awaiting-server-pair' | 'configured'
export type RustplusPairingMode = 'guided' | 'railway-env' | 'helper-import'

export interface RustplusPairingStep {
  label: string
  detail: string
  done: boolean
}

export interface RustplusServerPairing {
  source: 'local-helper'
  receivedAt: string
  serverName: string
  serverDescription: string | null
  serverUrl: string | null
  serverIp: string
  appPort: number
  playerId: string
  playerToken: string
}

export interface RustplusEntityPairing {
  source: 'local-helper'
  receivedAt: string
  target: OperationTarget
  entityId: string
  entityType: string | null
  entityName: string | null
}

export interface RustplusPairingGuide {
  status: RustplusPairingStatus
  sessionId: string | null
  startedAt: string | null
  mode: RustplusPairingMode
  headline: string
  detail: string
  helperCommand: string | null
  steps: RustplusPairingStep[]
  deviceBindingTarget: OperationTarget | null
  lastImportedPairing: RustplusServerPairing | null
  lastImportedDevicePairing: RustplusEntityPairing | null
}

export interface IntegrationStatus {
  rustplus: 'mock' | 'connected' | 'disabled'
  discord: 'disabled' | 'webhook-only' | 'bot-only' | 'bot-and-webhook'
}

export interface DashboardSnapshot {
  serverConnection: ServerConnection
  activeOperation: Operation | null
  alarmBindings: AlarmBinding[]
  map: MapSnapshot
  discordConfig: DiscordConfiguration
  activityLog: ActivityLog[]
  roles: RoleAssignment[]
  checklist: ChecklistItem[]
  notes: string[]
  featureFlags: FeatureFlags
  rustplusPairing: RustplusPairingGuide
  integrations: IntegrationStatus
  updatedAt: string
}

export interface AlarmTriggerInput {
  target: OperationTarget
  entityId: string
  source?: OperationSource
  triggeredAt?: string
}

export interface StartOperationInput {
  target: OperationTarget
  minutes: number
  source?: OperationSource
  entityId?: string
  markerId?: string
  startedAt?: string
}

export interface OperationCloseInput {
  result: OperationResult
  closeNote?: string
  closedAt?: string
}
