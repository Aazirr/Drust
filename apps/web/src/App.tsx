const operation = {
  target: 'Large Oil',
  source: 'Smart Alarm',
  startedAt: '22:11',
  eta: '22:26',
  remaining: '14:32',
  status: 'Active',
}

const statusItems = [
  { label: 'Rust+', value: 'Connected', tone: 'good' },
  { label: 'Discord Bot', value: 'Connected', tone: 'good' },
  { label: 'Server', value: 'SEA Main 2x', tone: 'neutral' },
  { label: 'Rust Time', value: '14:48 Day', tone: 'accent' },
]

const alarmCards = [
  {
    target: 'Small Oil',
    state: 'Armed',
    lastTrigger: '21:54',
    detail: 'Entity #480132 subscribed',
  },
  {
    target: 'Large Oil',
    state: 'Triggered',
    lastTrigger: '22:11',
    detail: 'Timer auto-started from alarm',
  },
]

const eventFeed = [
  { time: '22:11', type: 'Alarm', message: 'Large Oil alarm fired and opened a live operation.' },
  { time: '22:12', type: 'Discord', message: '@operations ping posted to #oil-alerts.' },
  { time: '22:16', type: 'Timer', message: '10-minute call scheduled for 22:16 local operation time.' },
  { time: '22:18', type: 'Sync', message: 'Dashboard heartbeat stable. No duplicate trigger detected.' },
]

const roles = [
  { role: 'Mini Pilot', player: 'Aazirr', status: 'Ready' },
  { role: 'Crate Breach', player: 'Jace', status: 'Ready' },
  { role: 'Water Cutoff', player: 'Mako', status: 'Staging' },
  { role: 'Shore Cover', player: 'Nova', status: 'Missing kit' },
]

const checklist = [
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

const mapMarkers = [
  { label: 'Cargo', value: 'Off map' },
  { label: 'CH47', value: 'Validation off' },
  { label: 'Patrol Heli', value: 'No sighting' },
  { label: 'Team Online', value: '4 / 5' },
]

function App() {
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
          <button className="nav-item nav-item-active" type="button">
            Overview
          </button>
          <button className="nav-item" type="button">
            Map View
          </button>
          <button className="nav-item" type="button">
            Config
          </button>
        </nav>

        <section className="rail-card">
          <div className="section-heading">
            <p className="section-label">Marker Watch</p>
            <span className="pill pill-muted">Validation later</span>
          </div>
          <div className="mini-stat-grid">
            {mapMarkers.map((item) => (
              <div className="mini-stat" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </section>
      </aside>

      <section className="dashboard">
        <header className="status-bar">
          {statusItems.map((item) => (
            <article className={`status-chip status-chip-${item.tone}`} key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </header>

        <section className="hero-panel">
          <div className="hero-copy">
            <div className="section-heading">
              <p className="section-label">Active Operation</p>
              <span className="pill pill-live">{operation.status}</span>
            </div>
            <h2>{operation.target}</h2>
            <p className="hero-summary">
              Auto-created from a Smart Alarm trigger. Countdown and Discord callouts are live.
            </p>

            <dl className="hero-meta">
              <div>
                <dt>Source</dt>
                <dd>{operation.source}</dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>{operation.startedAt}</dd>
              </div>
              <div>
                <dt>Crate ETA</dt>
                <dd>{operation.eta}</dd>
              </div>
            </dl>
          </div>

          <div className="timer-panel">
            <p className="timer-label">Remaining</p>
            <div className="timer-value">{operation.remaining}</div>
            <div className="timer-actions">
              <button type="button">Stop</button>
              <button type="button">+2 min</button>
              <button type="button" className="button-danger">
                Close
              </button>
            </div>
          </div>
        </section>

        <section className="content-grid">
          <div className="main-column">
            <section className="panel">
              <div className="section-heading">
                <p className="section-label">Alarm State</p>
                <span className="pill pill-neutral">RF-backed</span>
              </div>
              <div className="alarm-grid">
                {alarmCards.map((alarm) => (
                  <article className="alarm-card" key={alarm.target}>
                    <div className="alarm-topline">
                      <h3>{alarm.target}</h3>
                      <span
                        className={`pill ${alarm.state === 'Triggered' ? 'pill-alert' : 'pill-good'}`}
                      >
                        {alarm.state}
                      </span>
                    </div>
                    <p>{alarm.detail}</p>
                    <div className="alarm-footer">
                      <span>Last trigger</span>
                      <strong>{alarm.lastTrigger}</strong>
                    </div>
                  </article>
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
                  {roles.map((entry) => (
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
                  {checklist.map((entry) => (
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
                {eventFeed.map((entry) => (
                  <article className="timeline-row" key={`${entry.time}-${entry.type}`}>
                    <span className="timeline-time">{entry.time}</span>
                    <div>
                      <h3>{entry.type}</h3>
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
                {notes.map((note) => (
                  <article className="note-card" key={note}>
                    <p>{note}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel map-preview">
              <div className="section-heading">
                <p className="section-label">Map Preview</p>
                <span className="pill pill-neutral">Full view next</span>
              </div>
              <div className="map-surface" aria-hidden="true">
                <div className="ring ring-large" />
                <div className="ring ring-small" />
                <div className="marker marker-team marker-a" />
                <div className="marker marker-team marker-b" />
                <div className="marker marker-alert marker-c" />
              </div>
            </section>
          </aside>
        </section>
      </section>
    </main>
  )
}

export default App
