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

const navItems: Array<{ id: AppSection; label: string; detail: string }> = [
  { id: 'overview', label: 'Overview', detail: 'Live operation, alarms, team prep' },
  { id: 'map', label: 'Map', detail: 'Markers, team positions, target watch' },
  { id: 'config', label: 'Config', detail: 'Rust+, Discord, alarm bindings' },
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

function formatLongTime(timestamp: string | null): string {
  if (!timestamp) {
    return 'Not available'
  }

  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
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

function formatStatusLabel(value: string): string {
  return value.replaceAll('-', ' ')
}

function SectionHeading({
  title,
  detail,
  meta,
}: {
  title: string
  detail?: string
  meta?: string
}) {
  return (
    <div className="section-heading">
      <div>
        <h2 className="section-title">{title}</h2>
        {detail ? <p className="section-detail">{detail}</p> : null}
      </div>
      {meta ? <span className="meta-chip">{meta}</span> : null}
    </div>
  )
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
      value: formatStatusLabel(snapshot.serverConnection.connectionStatus),
      tone: snapshot.serverConnection.connectionStatus === 'connected' ? 'good' : 'warn',
    },
    {
      label: 'Discord',
      value: snapshot.integrations.discord === 'webhook' ? 'Webhook live' : 'Pending',
      tone: snapshot.integrations.discord === 'webhook' ? 'good' : 'neutral',
    },
    {
      label: 'Server',
      value: snapshot.serverConnection.serverName,
      tone: 'neutral',
    },
    {
      label: 'Rust time',
      value: snapshot.serverConnection.currentRustTime,
      tone: 'neutral',
    },
  ] as const

  return (
    <>
      <header className="status-bar">
        <div className="status-bar-copy">
          <p className="kicker">Live board</p>
          <h2>Operations remain visible even when the squad is split between game and Discord.</h2>
        </div>
        <div className="status-grid">
          {items.map((item) => (
            <article className={`status-chip status-chip-${item.tone}`} key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>
        <div className="status-bar-actions">
          <div className="sync-meta">
            <span>Last sync</span>
            <strong>{formatLongTime(snapshot.updatedAt)}</strong>
          </div>
          <button className="refresh-button" type="button" onClick={() => void onRefresh()}>
            {state === 'loading' ? 'Syncing...' : 'Refresh state'}
          </button>
        </div>
      </header>
      {(state === 'offline' || error) && (
        <div className="warning-banner">
          Worker unreachable. The dashboard is still showing fallback state so the runbook stays readable.
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
            <div className="hero-topline">
              <p className="kicker">Active operation</p>
              <span className={`state-pill ${operation ? (operation.status === 'active' ? 'state-live' : 'state-muted') : 'state-muted'}`}>
                {operation ? (operation.status === 'active' ? 'Operation live' : 'Operation closed') : 'No active operation'}
              </span>
            </div>
            <h1>{operation ? formatTargetLabel(operation.target) : 'Standing by for the next trigger'}</h1>
            <p className="hero-summary">
              {operation
                ? 'Smart Alarm input created the board state, the timer, and the Discord callout. The rest of the page is now about execution.'
                : 'The board will fill itself when Rust+ sends an alarm event, or a manual timer is started from Discord.'}
            </p>

            <dl className="hero-facts">
              <div>
                <dt>Source</dt>
                <dd>{operation?.source ?? 'none'}</dd>
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
            <div>
              <p className="kicker">Countdown</p>
              <div className="timer-value">{formatRemaining(operation?.remainingSeconds ?? null)}</div>
              <p className="timer-caption">Use quick corrections only when the live state needs help.</p>
            </div>
            <div className="timer-actions">
              <button type="button" onClick={() => void onExtendTimer(2)}>
                Add 2 min
              </button>
              <button type="button" onClick={() => void onExtendTimer(5)}>
                Add 5 min
              </button>
              <button type="button" className="button-danger" onClick={() => void onCloseOperation()}>
                Close run
              </button>
            </div>
          </div>
        </section>

        <section className="panel">
          <SectionHeading
            title="Alarm watch"
            detail="Bound entities that can open an operation automatically."
            meta="Smart Alarm"
          />
          <div className="alarm-grid">
            {snapshot.alarmBindings.map((binding) => (
              <AlarmCard binding={binding} key={binding.bindingId} />
            ))}
          </div>
        </section>

        <section className="panel split-panel">
          <div>
            <SectionHeading title="Roles" detail="Current squad assignments for this run." meta="Manual today" />
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
            <SectionHeading title="Checklist" detail="Fast prep items before the launch leaves." meta="Shore base" />
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
          <SectionHeading
            title="Event feed"
            detail="Recent state changes from alarms, timers, and delivery."
            meta="Live sync"
          />
          <div className="timeline">
            {snapshot.activityLog.map((entry) => (
              <article className="timeline-row" key={entry.eventId}>
                <div className="timeline-stamp">
                  <strong>{formatShortTime(entry.createdAt)}</strong>
                  <span>{entry.type.replaceAll('-', ' ')}</span>
                </div>
                <p>{entry.message}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <SectionHeading
            title="Run notes"
            detail="Supporting context that should stay visible beside the clock."
            meta="Working draft"
          />
          <div className="notes-stack">
            {snapshot.notes.map((note) => (
              <article className="note-card" key={note}>
                <p>{note}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel map-preview">
          <SectionHeading
            title="Map preview"
            detail="Condensed awareness for the current board."
            meta="Operational view"
          />
          <MapCanvas
            markers={snapshot.map.markers}
            monuments={snapshot.map.monuments}
            teamMembers={snapshot.map.teamMembers}
            compact
          />
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
        <div>
          <h3>{formatTargetLabel(binding.target)}</h3>
          <p>Entity #{binding.entityId}</p>
        </div>
        <span className={`state-pill ${isHot ? 'state-alert' : 'state-good'}`}>
          {binding.enabled ? 'Armed' : 'Disabled'}
        </span>
      </div>
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
        <SectionHeading
          title="Map board"
          detail="Monuments, squad presence, and active markers in one tactical surface."
          meta={`${snapshot.map.teamMembers.length} team signals`}
        />
        <MapCanvas
          markers={snapshot.map.markers}
          monuments={snapshot.map.monuments}
          teamMembers={snapshot.map.teamMembers}
        />
      </section>

      <aside className="side-column">
        <section className="panel">
          <SectionHeading
            title="Markers"
            detail="Signals that may matter for the current run."
            meta={`${snapshot.map.markers.length} tracked`}
          />
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
          <SectionHeading
            title="Team presence"
            detail="The board view of who is visible and where."
            meta={`${snapshot.map.teamMembers.filter((member) => member.isOnline).length} online`}
          />
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
  onStartRustplusPairing,
}: {
  snapshot: DashboardSnapshot
  onTriggerAlarm: (target: OperationTarget, entityId: string) => Promise<void>
  onStartRustplusPairing: () => Promise<void>
}) {
  return (
    <section className="config-grid">
      <section className="panel config-grid-span">
        <SectionHeading
          title="Rust+ pairing"
          detail="Start the guided pairing runbook instead of hand-typing server credentials into Railway."
          meta={snapshot.rustplusPairing.status.replaceAll('-', ' ')}
        />
        <div className="pairing-panel">
          <div className="pairing-copy">
            <h3>{snapshot.rustplusPairing.headline}</h3>
            <p>{snapshot.rustplusPairing.detail}</p>
            {snapshot.rustplusPairing.helperCommand ? (
              <code className="pairing-command">{snapshot.rustplusPairing.helperCommand}</code>
            ) : null}
          </div>
          <div className="pairing-actions">
            <button type="button" onClick={() => void onStartRustplusPairing()}>
              {snapshot.rustplusPairing.status === 'awaiting-server-pair'
                ? 'Restart pairing guide'
                : 'Connect Rust+'}
            </button>
            {snapshot.rustplusPairing.startedAt ? (
              <p className="pairing-meta">Started {formatLongTime(snapshot.rustplusPairing.startedAt)}</p>
            ) : (
              <p className="pairing-meta">No guided session started yet.</p>
            )}
          </div>
          <div className="pairing-steps">
            {snapshot.rustplusPairing.steps.map((step) => (
              <article className="pairing-step" key={step.label}>
                <span className={`check-indicator ${step.done ? 'check-done' : 'check-open'}`} />
                <div>
                  <strong>{step.label}</strong>
                  <p>{step.detail}</p>
                </div>
              </article>
            ))}
          </div>
          {snapshot.rustplusPairing.lastImportedPairing ? (
            <div className="pairing-imported">
              <strong>Latest imported pairing</strong>
              <p>
                {snapshot.rustplusPairing.lastImportedPairing.serverName} via{' '}
                {snapshot.rustplusPairing.lastImportedPairing.serverIp}:
                {snapshot.rustplusPairing.lastImportedPairing.appPort}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <SectionHeading
          title="Rust+ connection"
          detail="Core server information pulled into the board."
          meta={snapshot.integrations.rustplus}
        />
        <div className="config-list">
          <ConfigItem label="Server Name" value={snapshot.serverConnection.serverName} />
          <ConfigItem label="Host" value={snapshot.serverConnection.host} />
          <ConfigItem label="App Port" value={String(snapshot.serverConnection.appPort)} />
          <ConfigItem label="Map Size" value={`${snapshot.serverConnection.mapSize}m`} />
          <ConfigItem label="Wipe Time" value={formatShortTime(snapshot.serverConnection.wipeTime)} />
        </div>
      </section>

      <section className="panel">
        <SectionHeading
          title="Alarm bindings"
          detail="Targets that can be triggered directly into the worker."
          meta={`${snapshot.alarmBindings.length} active`}
        />
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
        <SectionHeading
          title="Discord routing"
          detail="Where operation alerts and system traffic should land."
          meta={snapshot.integrations.discord}
        />
        <div className="config-list">
          <ConfigItem label="Alerts Channel" value={snapshot.discordConfig.alertsChannelId} />
          <ConfigItem label="Operations Channel" value={snapshot.discordConfig.operationsChannelId} />
          <ConfigItem label="System Channel" value={snapshot.discordConfig.systemChannelId} />
          <ConfigItem label="Operations Role" value={snapshot.discordConfig.operationsRoleId} />
        </div>
      </section>

      <section className="panel">
        <SectionHeading
          title="Feature flags"
          detail="Spec-driven switches for current behavior."
          meta="Controlled"
        />
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
      <div className="map-grid" />
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
      <div className="map-legend">
        <span>Monuments</span>
        <span>Team</span>
        <span>Events</span>
      </div>
    </div>
  )
}

function App() {
  const { snapshot, state, error, refresh, triggerAlarm, extendTimer, closeOperation, startRustplusPairing } =
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

  const activeItem = navItems.find((item) => item.id === section) ?? navItems[0]

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="kicker">Drust command</p>
          <h1>Fast board clarity for live Rust operations.</h1>
          <p className="supporting-copy">
            A tactical dashboard for Rust+, timer discipline, and Discord coordination without the admin drag.
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
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
            </button>
          ))}
        </nav>

        <section className="rail-card">
          <SectionHeading
            title="Watchlist"
            detail="Signals worth tracking while marker validation is still experimental."
          />
          <div className="mini-stat-grid">
            <FlagCard
              label="Cargo"
              value={
                activeSnapshot.map.markers.some((marker) => marker.markerType === 'CargoShip')
                  ? 'Tracked'
                  : 'Off map'
              }
            />
            <FlagCard
              label="CH47"
              value={activeSnapshot.featureFlags.markerValidationMode ? 'Validation on' : 'Validation off'}
            />
            <FlagCard
              label="Patrol Heli"
              value={
                activeSnapshot.map.markers.some((marker) => marker.markerType === 'PatrolHelicopter')
                  ? 'Live'
                  : 'No sighting'
              }
            />
            <FlagCard
              label="Team Online"
              value={`${activeSnapshot.map.teamMembers.filter((member) => member.isOnline).length} / ${activeSnapshot.map.teamMembers.length}`}
            />
          </div>
        </section>
      </aside>

      <section className="dashboard">
        <div className="workspace-header">
          <div>
            <p className="kicker">Workspace</p>
            <h2>{activeItem.label}</h2>
          </div>
          <p className="workspace-detail">{activeItem.detail}</p>
        </div>

        <StatusBar snapshot={activeSnapshot} state={state} error={error} onRefresh={refresh} />

        {section === 'overview' && (
          <OverviewPage
            snapshot={activeSnapshot}
            onExtendTimer={extendTimer}
            onCloseOperation={() =>
              closeOperation({ result: 'aborted', closeNote: 'Closed from dashboard prototype.' })
            }
          />
        )}
        {section === 'map' && <MapViewPage snapshot={activeSnapshot} />}
        {section === 'config' && (
          <ConfigViewPage
            snapshot={activeSnapshot}
            onTriggerAlarm={handleTriggerAlarm}
            onStartRustplusPairing={startRustplusPairing}
          />
        )}
      </section>
    </main>
  )
}

export default App
