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

/* ── Animated timer ring ── */

const TIMER_RING_RADIUS = 58
const TIMER_RING_CIRCUMFERENCE = 2 * Math.PI * TIMER_RING_RADIUS

function AnimatedTimerRing({ remainingSeconds, totalSeconds }: { remainingSeconds: number; totalSeconds: number }) {
  const progress = totalSeconds > 0 ? Math.max(0, Math.min(1, remainingSeconds / totalSeconds)) : 1
  const offset = TIMER_RING_CIRCUMFERENCE * (1 - progress)
  const isUrgent = remainingSeconds <= 120
  const strokeColor = isUrgent ? '#ef8d74' : '#d9a35f'

  return (
    <svg className="timer-ring" viewBox="0 0 140 140" fill="none" aria-hidden="true">
      {/* Background track */}
      <circle cx="70" cy="70" r={TIMER_RING_RADIUS} stroke="#15242d" strokeWidth="6" />
      {/* Progress arc */}
      <circle
        cx="70"
        cy="70"
        r={TIMER_RING_RADIUS}
        stroke={strokeColor}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={TIMER_RING_CIRCUMFERENCE}
        strokeDashoffset={offset}
        transform="rotate(-90 70 70)"
        style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
      />
    </svg>
  )
}

function AssetImg({ path, className, alt, style }: { path: string; className?: string; alt?: string; style?: React.CSSProperties }) {
  return <img src={`/ui-rework-assets/${path}`} className={className} alt={alt ?? ''} draggable={false} style={style} />
}

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

function formatDisplayValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return 'N/A'
  }

  if (typeof value === 'number') {
    return value > 0 ? String(value) : 'N/A'
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : 'N/A'
}

function formatDiscordStatus(value: DashboardSnapshot['integrations']['discord']): string {
  if (value === 'bot-and-webhook') {
    return 'Bot + webhook live'
  }

  if (value === 'bot-only') {
    return 'Bot live'
  }

  if (value === 'webhook-only') {
    return 'Webhook live'
  }

  return 'Pending'
}

function SectionHeading({
  title,
  detail,
  meta,
  action,
}: {
  title: string
  detail?: string
  meta?: string
  action?: React.ReactNode
}) {
  return (
    <div className="section-heading">
      <div>
        <h2 className="section-title">{title}</h2>
        {detail ? <p className="section-detail">{detail}</p> : null}
      </div>
      <div className="section-heading-actions">
        {action}
        {meta ? <span className="meta-chip">{meta}</span> : null}
      </div>
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
  const statusIcon = (tone: string): string => {
    if (tone === 'good') return 'icons/connection-connected.svg'
    if (tone === 'warn') return 'icons/connection-degraded.svg'
    return 'icons/connection-disconnected.svg'
  }

  const items = [
    {
      label: 'Rust+',
      value: formatStatusLabel(snapshot.serverConnection.connectionStatus),
      tone: snapshot.serverConnection.connectionStatus === 'connected' ? 'good' : 'warn',
    },
    {
      label: 'Discord',
      value: formatDiscordStatus(snapshot.integrations.discord),
      tone: snapshot.integrations.discord === 'disabled' ? 'neutral' : 'good',
    },
    {
      label: 'Server',
      value: snapshot.serverConnection.serverName,
      tone: 'neutral',
    },
    {
      label: 'Rust time',
      value: formatDisplayValue(snapshot.serverConnection.currentRustTime),
      tone: 'neutral',
    },
  ] as const

  return (
    <>
      <header className="status-bar">
        <div className="status-bar-copy">
          <p className="kicker">Live board</p>
          <h2>Live status across all integrated services.</h2>
        </div>
        <div className="status-grid">
          {items.map((item) => (
            <article className={`status-chip status-chip-${item.tone}`} key={item.label}>
              <AssetImg path={statusIcon(item.tone)} className="status-icon" alt="" />
              <span className="status-chip-text">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </span>
            </article>
          ))}
        </div>
        <div className="status-bar-actions">
          <div className="sync-meta">
            <span>Last sync</span>
            <strong>{formatLongTime(snapshot.updatedAt)}</strong>
          </div>
          <button className="refresh-button" type="button" onClick={() => void onRefresh()} disabled={state === 'loading'}>
            {state === 'loading' ? (
              <span className="drust-loading-dots" />
            ) : (
              'Refresh state'
            )}
          </button>
        </div>
      </header>
      {(state === 'offline' || error) && (
        <div className="warning-banner">
          Worker unreachable. Dashboard showing cached fallback.
        </div>
      )}
    </>
  )
}

function heroSvgPath(target: OperationTarget | null): string {
  if (target === 'small-oil') return 'operation/hero-small-oil.svg'
  if (target === 'large-oil') return 'operation/hero-large-oil.svg'
  if (target === 'cargo') return 'operation/hero-cargo.svg'
  return ''
}

function OverviewPage({
  snapshot,
  onExtendTimer,
  onCancelOperation,
}: {
  snapshot: DashboardSnapshot
  onExtendTimer: (minutes: number) => Promise<void>
  onCancelOperation: () => Promise<void>
}) {
  const activeOps = snapshot.activeOperations.filter((op) => op.status === 'active')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const operation = activeOps.length > 0 ? activeOps[Math.min(selectedIndex, activeOps.length - 1)] : null
  const hasMultiple = activeOps.length > 1

  function goToPrev(): void {
    setSelectedIndex((i) => (i > 0 ? i - 1 : activeOps.length - 1))
  }

  function goToNext(): void {
    setSelectedIndex((i) => (i < activeOps.length - 1 ? i + 1 : 0))
  }

  return (
    <section className="content-grid">
      <div className="main-column">
        <section className="hero-panel">
          <div className="hero-copy">
            <div className="hero-topline">
              <p className="kicker">Active operation</p>
              <span className={`state-pill ${operation ? (operation.status === 'active' ? 'state-live' : 'state-muted') : 'state-muted'}`}>
                {operation
                  ? hasMultiple
                    ? `${activeOps.length} ops live`
                    : 'Operation live'
                  : 'No active operation'}
              </span>
            </div>

            {operation ? (
              <div className="hero-operation-art">
                {hasMultiple ? (
                  <button type="button" className="slider-arrow slider-prev" onClick={goToPrev} aria-label="Previous operation">
                    ‹
                  </button>
                ) : null}
                <AssetImg path={heroSvgPath(operation.target)} className="hero-illustration" alt="" />
                <div>
                  <h1>{formatTargetLabel(operation.target)}</h1>
                  {hasMultiple ? (
                    <p className="slider-counter">{selectedIndex + 1} / {activeOps.length}</p>
                  ) : null}
                </div>
                {hasMultiple ? (
                  <button type="button" className="slider-arrow slider-next" onClick={goToNext} aria-label="Next operation">
                    ›
                  </button>
                ) : null}
              </div>
            ) : (
              <h1>Standing by</h1>
            )}

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
            {operation ? (
              <div className="timer-ring-wrap">
                <p className="kicker">{hasMultiple ? `${selectedIndex + 1} of ${activeOps.length} Timers` : 'Countdown'}</p>
                <AnimatedTimerRing
                  remainingSeconds={operation.remainingSeconds}
                  totalSeconds={Math.max(1, Math.floor((new Date(operation.endsAt).getTime() - new Date(operation.startedAt).getTime()) / 1000))}
                />
                <div className="timer-value">
                  {formatRemaining(operation.remainingSeconds)}
                </div>
                {hasMultiple ? (
                  <div className="slider-dots">
                    {activeOps.map((op, i) => (
                      <button
                        type="button"
                        key={op.operationId}
                        className={`slider-dot ${i === selectedIndex ? 'slider-dot-active' : ''}`}
                        onClick={() => setSelectedIndex(i)}
                        aria-label={`${formatTargetLabel(op.target)} timer`}
                      >
                        {formatTargetLabel(op.target)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="idle-radar">
                <AssetImg path="operation/idle-radar.svg" alt="" />
                <p className="kicker">Awaiting signal</p>
              </div>
            )}
            <p className="timer-caption">Use quick corrections only when the live state needs help.</p>
            <div className="timer-actions">
              <button type="button" onClick={() => void onExtendTimer(2)} disabled={!operation}>
                Add 2 min
              </button>
              <button type="button" onClick={() => void onExtendTimer(5)} disabled={!operation}>
                Add 5 min
              </button>
              <button type="button" className="button-danger" onClick={() => void onCancelOperation()} disabled={!operation}>
                <AssetImg path="icons/cancel.svg" alt="" style={{ width: 16, height: 16 }} />
                Cancel
              </button>
            </div>
          </div>
        </section>

        <section className="panel">
          <SectionHeading
            title="Alarm watch"
            detail="Bound entities that can open an operation automatically."
          />
          <div className="alarm-grid">
            {snapshot.alarmBindings.map((binding) => (
              <AlarmCard binding={binding} key={binding.bindingId} />
            ))}
          </div>
        </section>

        <section className="panel split-panel">
          <div>
            <SectionHeading title="Roles" detail="Current squad assignments for this run." />
            <div className="list-stack">
              {snapshot.roles.length > 0 ? (
                snapshot.roles.map((entry) => (
                  <article className="list-row" key={entry.role}>
                    <div>
                      <h3>{entry.role}</h3>
                      <p>{entry.player}</p>
                    </div>
                    <strong>{entry.status}</strong>
                  </article>
                ))
              ) : (
                <EmptyState message="No role assignments yet." />
              )}
            </div>
          </div>

          <div>
            <SectionHeading title="Checklist" detail="Fast prep items before the launch leaves." />
            <div className="list-stack">
              {snapshot.checklist.length > 0 ? (
                snapshot.checklist.map((entry) => (
                  <article className="check-row" key={entry.item}>
                    <span className={`check-indicator ${entry.done ? 'check-done' : 'check-open'}`} />
                    <p>{entry.item}</p>
                  </article>
                ))
              ) : (
                <EmptyState message="No checklist items yet." />
              )}
            </div>
          </div>
        </section>
      </div>

      <aside className="side-column">
        <section className="panel">
          <SectionHeading
            title="Event feed"
            detail="Recent state changes from alarms, timers, and delivery."
          />
          <div className="timeline">
            {snapshot.activityLog.length > 0 ? (
              snapshot.activityLog.map((entry) => (
                <article className="timeline-row" key={entry.eventId}>
                  <div className="timeline-stamp">
                    <strong>{formatShortTime(entry.createdAt)}</strong>
                    <span>{entry.type.replaceAll('-', ' ')}</span>
                  </div>
                  <p>{entry.message}</p>
                </article>
              ))
            ) : (
              <EmptyState message="No activity yet." />
            )}
          </div>
        </section>

        <section className="panel">
          <SectionHeading
            title="Run notes"
            detail="Supporting context that should stay visible beside the clock."
          />
          <div className="notes-stack">
            {snapshot.notes.length > 0 ? (
              snapshot.notes.map((note) => (
                <article className="note-card" key={note}>
                  <p>{note}</p>
                </article>
              ))
            ) : (
              <EmptyState message="No notes yet." />
            )}
          </div>
        </section>

        <section className="panel map-preview">
          <SectionHeading
            title="Map preview"
            detail="Condensed awareness for the current board."
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isHot ? <AssetImg path="icons/alarm-trigger.svg" alt="" style={{ width: 16, height: 16 }} /> : null}
          <div>
            <h3>{formatTargetLabel(binding.target)}</h3>
            <p>Entity #{binding.entityId}</p>
          </div>
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
            {snapshot.map.markers.length > 0 ? (
              snapshot.map.markers.map((marker) => (
                <article className="list-row" key={marker.markerId}>
                  <div>
                    <h3>{marker.markerType}</h3>
                    <p>{marker.targetGuess ? formatTargetLabel(marker.targetGuess) : 'Unmapped target'}</p>
                  </div>
                  <strong>{marker.isActive ? 'Live' : 'Idle'}</strong>
                </article>
              ))
            ) : (
              <EmptyState message="No map markers yet." />
            )}
          </div>
        </section>

        <section className="panel">
          <SectionHeading
            title="Team presence"
            detail="The board view of who is visible and where."
            meta={`${snapshot.map.teamMembers.filter((member) => member.isOnline).length} online`}
          />
          <div className="list-stack">
            {snapshot.map.teamMembers.length > 0 ? (
              snapshot.map.teamMembers.map((member) => (
                <article className="list-row" key={member.steamId}>
                  <div>
                    <h3>{member.name}</h3>
                    <p>{member.isAlive ? 'Alive' : 'Down'} | {formatShortTime(member.lastSeenAt)}</p>
                  </div>
                  <strong>{member.isOnline ? 'Online' : 'Offline'}</strong>
                </article>
              ))
            ) : (
              <EmptyState message="No team presence yet." />
            )}
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
  onStartSmartAlarmBinding,
  onRemoveSmartAlarmBinding,
  helpOpen,
  onToggleHelp,
}: {
  snapshot: DashboardSnapshot
  onTriggerAlarm: (target: OperationTarget, entityId: string) => Promise<void>
  onStartRustplusPairing: () => Promise<void>
  onStartSmartAlarmBinding: (target: 'small-oil' | 'large-oil') => Promise<void>
  onRemoveSmartAlarmBinding: (target: 'small-oil' | 'large-oil') => Promise<void>
  helpOpen: boolean
  onToggleHelp: () => void
}) {
  return (
    <section className="config-page">
      <header className="config-page-header">
        <div>
          <p className="kicker">Configuration</p>
          <h2>Pair Rust+, bind alarms, and route Discord output.</h2>
          <p className="section-detail">
            Use the help panel for the exact desktop helper commands and the in-game pairing sequence.
          </p>
        </div>
        <button type="button" className="help-button" onClick={onToggleHelp} aria-expanded={helpOpen}>
          {helpOpen ? 'Hide help' : 'Help'}
        </button>
      </header>

      {helpOpen ? <ConfigHelpPanel /> : null}

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
          <ConfigItem label="Server Name" value={formatDisplayValue(snapshot.serverConnection.serverName)} />
          <ConfigItem label="Host" value={formatDisplayValue(snapshot.serverConnection.host)} />
          <ConfigItem
            label="App Port"
            value={snapshot.serverConnection.appPort > 0 ? String(snapshot.serverConnection.appPort) : 'N/A'}
          />
          <ConfigItem
            label="Map Size"
            value={snapshot.serverConnection.mapSize > 0 ? `${snapshot.serverConnection.mapSize}m` : 'N/A'}
          />
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
          {snapshot.alarmBindings.length > 0 ? (
            snapshot.alarmBindings.map((binding) => (
              <article className="config-card" key={binding.bindingId}>
                <div>
                  <h3>{formatTargetLabel(binding.target)}</h3>
                  <p>Entity #{binding.entityId}</p>
                </div>
                <div className="config-card-actions">
                  <button type="button" onClick={() => void onStartSmartAlarmBinding(binding.target as 'small-oil' | 'large-oil')}>
                    Rebind
                  </button>
                  <button type="button" onClick={() => void onTriggerAlarm(binding.target, binding.entityId)}>
                    Fire test
                  </button>
                  <button
                    type="button"
                    className="button-danger"
                    onClick={() => void onRemoveSmartAlarmBinding(binding.target as 'small-oil' | 'large-oil')}
                  >
                    Cancel alarm
                  </button>
                </div>
              </article>
            ))
          ) : (
            <EmptyState message="No Smart Alarm bindings yet." />
          )}
          <article className="config-card config-card-guide">
            <div>
              <h3>Bind next Smart Alarm</h3>
              <p>Choose which Oil Rig target the next paired Smart Alarm should belong to.</p>
            </div>
            <div className="config-card-actions">
              <button type="button" onClick={() => void onStartSmartAlarmBinding('small-oil')}>
                Bind Small Oil
              </button>
              <button type="button" onClick={() => void onStartSmartAlarmBinding('large-oil')}>
                Bind Large Oil
              </button>
            </div>
          </article>
        </div>
        </section>

        <section className="panel">
        <SectionHeading
          title="Discord routing"
          detail="Where operation alerts and system traffic should land."
          meta={snapshot.integrations.discord}
        />
        <div className="config-list">
          <ConfigItem label="Alerts Channel" value={formatDisplayValue(snapshot.discordConfig.alertsChannelId)} />
          <ConfigItem label="Operations Channel" value={formatDisplayValue(snapshot.discordConfig.operationsChannelId)} />
          <ConfigItem label="System Channel" value={formatDisplayValue(snapshot.discordConfig.systemChannelId)} />
          <ConfigItem label="Operations Role" value={formatDisplayValue(snapshot.discordConfig.operationsRoleId)} />
          <ConfigItem label="Integration Status" value={formatDiscordStatus(snapshot.integrations.discord)} />
        </div>
        </section>

        <section className="panel">
        <SectionHeading
          title="Feature flags"
          detail="Spec-driven switches for current behavior."
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
    </section>
  )
}

function ConfigHelpPanel() {
  return (
    <section className="panel config-help-panel" aria-label="Pairing help">
      <SectionHeading
        title="Setup help"
        detail="Use this flow when you need to reconnect Rust+ or pair Smart Alarms on a new wipe."
        meta="Trusted desktop helper"
      />

      <div className="help-grid">
        <article className="help-block">
          <h3>Rust+ pairing flow</h3>
          <ol className="help-steps">
            <li>Open Drust on your Railway web URL and click <strong>Connect Rust+</strong>.</li>
            <li>On a trusted Windows desktop, open PowerShell in the Drust repo folder.</li>
            <li>Set the worker import URL so the helper knows where to send the captured pairing.</li>
            <li>Run the register command once if this is a fresh machine.</li>
            <li>Run the listen command and keep it open while you pair in Rust.</li>
            <li>Open Rust in-game, connect to the server, then choose <strong>Pair with Server</strong>.</li>
            <li>Wait for the helper to capture the notification, then import the pairing into Drust if needed.</li>
          </ol>

          <pre className="help-code" aria-label="Rust+ pairing commands">
{`$env:DRUST_PAIRING_IMPORT_URL="https://drustworker-production.up.railway.app"
npm.cmd --workspace @drust/pairing-helper start -- register
npm.cmd --workspace @drust/pairing-helper start -- listen`}
          </pre>
        </article>

        <article className="help-block">
          <h3>Smart Alarm binding flow</h3>
          <ol className="help-steps">
            <li>Make sure the Rust+ listener is still running on the trusted desktop.</li>
            <li>In game, power the Smart Alarm and open the wiring / pairing interaction.</li>
            <li>Choose the target you want to bind in Drust before you trigger the device pairing.</li>
            <li>Use the helper binding command for the correct Oil Rig target.</li>
            <li>Repeat the flow once for Small Oil and once for Large Oil.</li>
            <li>Return to Drust to confirm both bindings are active and ready for the live trigger path.</li>
          </ol>

          <pre className="help-code" aria-label="Smart Alarm binding commands">
{`npm.cmd --workspace @drust/pairing-helper start -- bind-alarm small-oil
npm.cmd --workspace @drust/pairing-helper start -- bind-alarm large-oil`}
          </pre>
        </article>
      </div>

      <p className="help-footnote">
        Keep the helper window open while pairing. Once Drust receives the imported pairing or entity ID, the worker can
        persist it to Postgres and the dashboard will show the live state.
      </p>
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

function EmptyState({ message }: { message: string }) {
  return (
    <article className="empty-state">
      <AssetImg path="backgrounds/radar-noise.svg" className="empty-icon" alt="" />
      <span>{message}</span>
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

function monumentSvg(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('small oil') || lower.includes('small_oil')) return 'markers/small-oil.svg'
  if (lower.includes('large oil') || lower.includes('large_oil')) return 'markers/large-oil.svg'
  if (lower.includes('cargo')) return 'markers/cargo-ship.svg'
  return 'markers/generic-pin.svg'
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
      {monuments.map((monument) => (
        <div
          className="map-node"
          key={monument.id}
          style={{ left: `${monument.x * 100}%`, top: `${monument.y * 100}%` }}
        >
          <AssetImg path={monumentSvg(monument.name)} alt="" />
          <span className="map-node-label">{monument.name}</span>
        </div>
      ))}
      {teamMembers.map((member) => (
        <div
          className="map-node map-node-team"
          key={member.steamId}
          style={{ left: `${member.x * 100}%`, top: `${member.y * 100}%` }}
        >
          <AssetImg path={member.isAlive ? 'markers/team-alive.svg' : 'markers/team-dead.svg'} alt="" />
          <span className="map-node-label">{member.name}</span>
        </div>
      ))}
      {markers.map((marker) => {
        const isCargo = marker.markerType === 'CargoShip'
        const isCh47 = marker.markerType === 'CH47'
        const isHeli = marker.markerType === 'PatrolHelicopter'
        const markerPath = isCargo
          ? 'markers/cargo-ship.svg'
          : isCh47
            ? 'markers/ch47.svg'
            : isHeli
              ? 'markers/patrol-heli.svg'
              : 'markers/generic-pin.svg'
        return (
          <div
            className={`map-node ${isCargo ? 'map-node-cargo' : 'map-node-alert'}`}
            key={marker.markerId}
            style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }}
          >
            <AssetImg path={markerPath} alt="" />
            <span className="map-node-label">{marker.markerType}</span>
          </div>
        )
      })}
      {monuments.length === 0 && markers.length === 0 && teamMembers.length === 0 ? (
        <div className="map-empty">No live map data yet.</div>
      ) : null}
      <div className="map-legend">
        <span>Monuments</span>
        <span>Team</span>
        <span>Events</span>
      </div>
    </div>
  )
}

function App() {
  const {
    snapshot,
    state,
    error,
    refresh,
    triggerAlarm,
    extendTimer,
    closeOperation,
    startRustplusPairing,
    startSmartAlarmBinding,
    removeSmartAlarmBinding,
  } =
    useDashboardState()
  const [section, setSection] = useState<AppSection>('overview')
  const [configHelpOpen, setConfigHelpOpen] = useState(false)
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
        <div className="sidebar-tick" aria-hidden="true" />

        <div className="brand-block">
          <AssetImg path="brand/drust-wordmark.svg" alt="Drust" />
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          {navItems.map((item) => {
            const iconMap: Record<string, string> = {
              overview: 'icons/nav-overview.svg',
              map: 'icons/nav-map.svg',
              config: 'icons/nav-config.svg',
            }
            return (
              <button
                className={`nav-item ${section === item.id ? 'nav-item-active' : ''}`}
                key={item.id}
                type="button"
                onClick={() => handleSectionChange(item.id)}
              >
                <AssetImg path={iconMap[item.id]} className="nav-icon" alt="" />
                <span className="nav-text">
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </span>
              </button>
            )
          })}
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
            onCancelOperation={() =>
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
            onStartSmartAlarmBinding={startSmartAlarmBinding}
            onRemoveSmartAlarmBinding={removeSmartAlarmBinding}
            helpOpen={configHelpOpen}
            onToggleHelp={() => {
              startTransition(() => {
                setConfigHelpOpen((current) => !current)
              })
            }}
          />
        )}
      </section>
    </main>
  )
}

export default App
