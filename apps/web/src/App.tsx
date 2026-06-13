import { startTransition, useDeferredValue, useState } from 'react'
import type {
  AlarmBinding,
  DashboardSnapshot,
  MarkerEvent,
  Monument,
  OperationTarget,
  TeamMember,
} from '@drust/domain'
import { useDashboardState } from './useDashboardState'

type AppSection = 'overview' | 'map' | 'config'

const navItems: Array<{ id: AppSection; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'map', label: 'Map View' },
  { id: 'config', label: 'Config' },
]

function formatTargetLabel(target: OperationTarget): string {
  if (target === 'small-oil') {
    return 'Small Oil'
  }

  if (target === 'large-oil') {
    return 'Large Oil'
  }

  return 'Cargo'
}

function formatShortTime(timestamp: string | null): string {
  if (!timestamp) {
    return 'Not yet'
  }

  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRemaining(seconds: number | null): string {
  if (seconds === null) {
    return '--:--'
  }

  const clamped = Math.max(0, seconds)
  const minutes = Math.floor(clamped / 60)
  const remainingSeconds = clamped % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

function StatusBar({
  snapshot,
  state,
  error,
  onRefresh,
}: {
  snapshot: DashboardSnapshot
  state: 'loading' | 'ready' | 'offline'
  error: string | null
  onRefresh: () => Promise<void>
}) {
  const items = [
    {
      label: 'Rust+',
      value: snapshot.serverConnection.connectionStatus,
      tone: snapshot.serverConnection.connectionStatus === 'connected' ? 'good' : 'accent',
    },
    {
      label: 'Discord',
      value: snapshot.integrations.discord === 'webhook' ? 'Webhook live' : 'Dry run',
      tone: snapshot.integrations.discord === 'webhook' ? 'good' : 'neutral',
    },
    {
      label: 'Server',
      value: snapshot.serverConnection.serverName,
      tone: 'neutral',
    },
    {
      label: 'Rust Time',
      value: snapshot.serverConnection.currentRustTime,
      tone: 'accent',
    },
  ] as const

  return (
    <>
      <header className="status-bar">
        {items.map((item) => (
          <article className={`status-chip status-chip-${item.tone}`} key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
        <button className="refresh-button" type="button" onClick={() => void onRefresh()}>
          {state === 'loading' ? 'Syncing...' : 'Refresh'}
        </button>
      </header>
      {(state === 'offline' || error) && (
        <div className="warning-banner">
          Worker unavailable. Showing shared fallback state while the web app stays usable.
        </div>
      )}
    </>
  )
}

function OverviewPage({
  snapshot,
  onExtendTimer,
  onCloseOperation,
}: {
  snapshot: DashboardSnapshot
  onExtendTimer: (minutes: number) => Promise<void>
  onCloseOperation: () => Promise<void>
}) {
  const operation = snapshot.activeOperation

  return (
    <section className="content-grid">
      <div className="main-column">
        <section className="hero-panel">
          <div className="hero-copy">
            <div className="section-heading">
              <p className="section-label">Active Operation</p>
              <span className="pill pill-live">
                {operation ? operation.status === 'active' ? 'Active' : 'Closed' : 'Idle'}
              </span>
            </div>
            <h2>{operation ? formatTargetLabel(operation.target) : 'No live operation'}</h2>
            <p className="hero-summary">
              {operation
                ? 'Auto-created from a Smart Alarm trigger. Countdown and Discord callouts are live.'
                : 'Waiting for a Rust+ trigger or manual timer start.'}
            </p>

            <dl className="hero-meta">
              <div>
                <dt>Source</dt>
                <dd>{operation?.source ?? 'None'}</dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>{formatShortTime(operation?.startedAt ?? null)}</dd>
              </div>
              <div>
                <dt>Crate ETA</dt>
                <dd>{formatShortTime(operation?.endsAt ?? null)}</dd>
              </div>
            </dl>
          </div>

          <div className="timer-panel">
            <p className="timer-label">Remaining</p>
            <div className="timer-value">
              {formatRemaining(operation?.remainingSeconds ?? null)}
            </div>
            <div className="timer-actions">
              <button type="button" onClick={() => void onExtendTimer(2)}>
                +2 min
              </button>
              <button type="button" onClick={() => void onExtendTimer(5)}>
                +5 min
              </button>
              <button type="button" className="button-danger" onClick={() => void onCloseOperation()}>
                Close
              </button>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <p className="section-label">Alarm State</p>
            <span className="pill pill-neutral">RF-backed</span>
          </div>
          <div className="alarm-grid">
            {snapshot.alarmBindings.map((binding) => (
              <AlarmCard binding={binding} key={binding.bindingId} />
            ))}
          </div>
        </section>

        <section className="panel split-panel">
          <div>
            <div className="section-heading">
              <p className="section-label">Roles</p>
              <span className="pill pill-neutral">Manual for now</span>
            </div>
            <div className="list-stack">
              {snapshot.roles.map((entry) => (
                <article className="list-row" key={entry.role}>
                  <div>
                    <h3>{entry.role}</h3>
                    <p>{entry.player}</p>
                  </div>
                  <strong>{entry.status}</strong>
                </article>
              ))}
            </div>
          </div>

          <div>
            <div className="section-heading">
              <p className="section-label">Checklist</p>
              <span className="pill pill-neutral">Shore base</span>
            </div>
            <div className="list-stack">
              {snapshot.checklist.map((entry) => (
                <article className="check-row" key={entry.item}>
                  <span className={`check-indicator ${entry.done ? 'check-done' : 'check-open'}`} />
                  <p>{entry.item}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>

      <aside className="side-column">
        <section className="panel">
          <div className="section-heading">
            <p className="section-label">Event Feed</p>
            <span className="pill pill-neutral">Live sync</span>
          </div>
          <div className="timeline">
            {snapshot.activityLog.map((entry) => (
              <article className="timeline-row" key={entry.eventId}>
                <span className="timeline-time">{formatShortTime(entry.createdAt)}</span>
                <div>
                  <h3>{entry.type.replaceAll('-', ' ')}</h3>
                  <p>{entry.message}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <p className="section-label">Operation Notes</p>
            <span className="pill pill-neutral">Working draft</span>
          </div>
          <div className="notes-stack">
            {snapshot.notes.map((note) => (
              <article className="note-card" key={note}>
                <p>{note}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel map-preview">
          <div className="section-heading">
            <p className="section-label">Map Preview</p>
            <span className="pill pill-neutral">Full view live</span>
          </div>
          <MapCanvas markers={snapshot.map.markers} monuments={snapshot.map.monuments} teamMembers={snapshot.map.teamMembers} compact />
        </section>
      </aside>
    </section>
  )
}

function AlarmCard({ binding }: { binding: AlarmBinding }) {
  const isHot = Boolean(binding.lastTriggeredAt)
  return (
    <article className="alarm-card">
      <div className="alarm-topline">
        <h3>{formatTargetLabel(binding.target)}</h3>
        <span className={`pill ${isHot ? 'pill-alert' : 'pill-good'}`}>
          {binding.enabled ? 'Armed' : 'Disabled'}
        </span>
      </div>
      <p>Entity #{binding.entityId} subscribed for operation auto-start.</p>
      <div className="alarm-footer">
        <span>Last trigger</span>
        <strong>{formatShortTime(binding.lastTriggeredAt)}</strong>
      </div>
    </article>
  )
}

function MapViewPage({ snapshot }: { snapshot: DashboardSnapshot }) {
  return (
    <section className="map-layout">
      <section className="panel map-panel">
        <div className="section-heading">
          <p className="section-label">Map View</p>
          <span className="pill pill-neutral">{snapshot.map.teamMembers.length} team signals</span>
        </div>
        <MapCanvas
          markers={snapshot.map.markers}
          monuments={snapshot.map.monuments}
          teamMembers={snapshot.map.teamMembers}
        />
      </section>

      <aside className="side-column">
        <section className="panel">
          <div className="section-heading">
            <p className="section-label">Markers</p>
            <span className="pill pill-neutral">{snapshot.map.markers.length} tracked</span>
          </div>
          <div className="list-stack">
            {snapshot.map.markers.map((marker) => (
              <article className="list-row" key={marker.markerId}>
                <div>
                  <h3>{marker.markerType}</h3>
                  <p>{marker.targetGuess ? formatTargetLabel(marker.targetGuess) : 'Unmapped target'}</p>
                </div>
                <strong>{marker.isActive ? 'Live' : 'Idle'}</strong>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <p className="section-label">Team Presence</p>
            <span className="pill pill-neutral">
              {snapshot.map.teamMembers.filter((member) => member.isOnline).length} online
            </span>
          </div>
          <div className="list-stack">
            {snapshot.map.teamMembers.map((member) => (
              <article className="list-row" key={member.steamId}>
                <div>
                  <h3>{member.name}</h3>
                  <p>{member.isAlive ? 'Alive' : 'Down'} | {formatShortTime(member.lastSeenAt)}</p>
                </div>
                <strong>{member.isOnline ? 'Online' : 'Offline'}</strong>
              </article>
            ))}
          </div>
        </section>
      </aside>
    </section>
  )
}

function ConfigViewPage({
  snapshot,
  onTriggerAlarm,
}: {
  snapshot: DashboardSnapshot
  onTriggerAlarm: (target: OperationTarget, entityId: string) => Promise<void>
}) {
  return (
    <section className="config-grid">
      <section className="panel">
        <div className="section-heading">
          <p className="section-label">Rust+ Server</p>
          <span className="pill pill-neutral">{snapshot.integrations.rustplus}</span>
        </div>
        <div className="config-list">
          <ConfigItem label="Server Name" value={snapshot.serverConnection.serverName} />
          <ConfigItem label="Host" value={snapshot.serverConnection.host} />
          <ConfigItem label="App Port" value={String(snapshot.serverConnection.appPort)} />
          <ConfigItem label="Map Size" value={`${snapshot.serverConnection.mapSize}m`} />
          <ConfigItem label="Wipe Time" value={formatShortTime(snapshot.serverConnection.wipeTime)} />
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <p className="section-label">Alarm Bindings</p>
          <span className="pill pill-neutral">{snapshot.alarmBindings.length} active</span>
        </div>
        <div className="config-list">
          {snapshot.alarmBindings.map((binding) => (
            <article className="config-card" key={binding.bindingId}>
              <div>
                <h3>{formatTargetLabel(binding.target)}</h3>
                <p>Entity #{binding.entityId}</p>
              </div>
              <button type="button" onClick={() => void onTriggerAlarm(binding.target, binding.entityId)}>
                Fire test
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <p className="section-label">Discord Routing</p>
          <span className="pill pill-neutral">{snapshot.integrations.discord}</span>
        </div>
        <div className="config-list">
          <ConfigItem label="Alerts Channel" value={snapshot.discordConfig.alertsChannelId} />
          <ConfigItem label="Operations Channel" value={snapshot.discordConfig.operationsChannelId} />
          <ConfigItem label="System Channel" value={snapshot.discordConfig.systemChannelId} />
          <ConfigItem label="Operations Role" value={snapshot.discordConfig.operationsRoleId} />
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <p className="section-label">Feature Flags</p>
          <span className="pill pill-neutral">Spec-aligned</span>
        </div>
        <div className="flag-grid">
          <FlagCard
            label="Smart Alarm Mode"
            value={snapshot.featureFlags.smartAlarmMode ? 'Enabled' : 'Disabled'}
          />
          <FlagCard
            label="Marker Validation"
            value={snapshot.featureFlags.markerValidationMode ? 'Enabled' : 'Disabled'}
          />
          <FlagCard
            label="Countdown Pings"
            value={snapshot.featureFlags.countdownPings ? 'Enabled' : 'Disabled'}
          />
        </div>
      </section>
    </section>
  )
}

function ConfigItem({ label, value }: { label: string; value: string }) {
  return (
    <article className="config-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function FlagCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="mini-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function MapCanvas({
  markers,
  monuments,
  teamMembers,
  compact = false,
}: {
  markers: MarkerEvent[]
  monuments: Monument[]
  teamMembers: TeamMember[]
  compact?: boolean
}) {
  return (
    <div className={`map-surface ${compact ? 'map-surface-compact' : ''}`} aria-hidden="true">
      <div className="map-water" />
      {monuments.map((monument) => (
        <div
          className="map-node map-node-monument"
          key={monument.id}
          style={{ left: `${monument.x * 100}%`, top: `${monument.y * 100}%` }}
        >
          <span>{monument.name}</span>
        </div>
      ))}
      {teamMembers.map((member) => (
        <div
          className="map-node map-node-team"
          key={member.steamId}
          style={{ left: `${member.x * 100}%`, top: `${member.y * 100}%` }}
        >
          <span>{member.name}</span>
        </div>
      ))}
      {markers.map((marker) => (
        <div
          className={`map-node ${marker.markerType === 'CargoShip' ? 'map-node-cargo' : 'map-node-alert'}`}
          key={marker.markerId}
          style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }}
        >
          <span>{marker.markerType}</span>
        </div>
      ))}
    </div>
  )
}

function App() {
  const { snapshot, state, error, refresh, triggerAlarm, extendTimer, closeOperation } =
    useDashboardState()
  const [section, setSection] = useState<AppSection>('overview')
  const deferredSnapshot = useDeferredValue(snapshot)

  const activeSnapshot = deferredSnapshot

  function handleSectionChange(nextSection: AppSection): void {
    startTransition(() => {
      setSection(nextSection)
    })
  }

  async function handleTriggerAlarm(target: OperationTarget, entityId: string): Promise<void> {
    await triggerAlarm({
      target,
      entityId,
      source: 'smart-alarm',
    })
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="eyebrow">Drust</p>
          <h1>Operations Command</h1>
          <p className="supporting-copy">
            Rust+, web ops state, and Discord pings in one tight loop.
          </p>
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          {navItems.map((item) => (
            <button
              className={`nav-item ${section === item.id ? 'nav-item-active' : ''}`}
              key={item.id}
              type="button"
              onClick={() => handleSectionChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <section className="rail-card">
          <div className="section-heading">
            <p className="section-label">Marker Watch</p>
            <span className="pill pill-muted">
              {activeSnapshot.featureFlags.markerValidationMode ? 'Validation on' : 'Validation later'}
            </span>
          </div>
          <div className="mini-stat-grid">
            <FlagCard
              label="Cargo"
              value={activeSnapshot.map.markers.some((marker) => marker.markerType === 'CargoShip') ? 'Tracked' : 'Off map'}
            />
            <FlagCard
              label="CH47"
              value={activeSnapshot.featureFlags.markerValidationMode ? 'Validation on' : 'Validation off'}
            />
            <FlagCard
              label="Patrol Heli"
              value={activeSnapshot.map.markers.some((marker) => marker.markerType === 'PatrolHelicopter') ? 'Live' : 'No sighting'}
            />
            <FlagCard
              label="Team Online"
              value={`${activeSnapshot.map.teamMembers.filter((member) => member.isOnline).length} / ${activeSnapshot.map.teamMembers.length}`}
            />
          </div>
        </section>
      </aside>

      <section className="dashboard">
        <StatusBar snapshot={activeSnapshot} state={state} error={error} onRefresh={refresh} />

        {section === 'overview' && (
          <OverviewPage
            snapshot={activeSnapshot}
            onExtendTimer={extendTimer}
            onCloseOperation={() => closeOperation({ result: 'aborted', closeNote: 'Closed from dashboard prototype.' })}
          />
        )}
        {section === 'map' && <MapViewPage snapshot={activeSnapshot} />}
        {section === 'config' && (
          <ConfigViewPage snapshot={activeSnapshot} onTriggerAlarm={handleTriggerAlarm} />
        )}
      </section>
    </main>
  )
}

export default App
