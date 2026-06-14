# Product Spec

Last updated: 2026-06-13

## MVP Focus

The current MVP sequence is:

1. Rust+ API -> web app -> Discord bot connectivity.
2. Oil Rig trigger flow where Rust+ notifies Drust, the Discord bot pings, and a 15-minute timer starts.
3. Later validation of CH47 marker detection as an automatic Oil Rig trigger mode.

The system should minimize manual operator input. For the early MVP, the main job is to turn Rust+ events into clear dashboard state and fast Discord coordination.

## Discord Bot Command List

Start with a small command surface that matches the early MVP.

### Core Commands

- `/status`
  - Shows Rust+ connection status, Discord bot status, current active operation, and last event time.
- `/op-status`
  - Shows the current operation target, source, timer, and state.
- `/op-close result:<success|failed|aborted> note:<optional>`
  - Closes the active operation and stores a short result note.
- `/timer-start target:<small-oil|large-oil> minutes:<number> source:<manual|alarm|marker>`
  - Starts an operation timer manually when needed.
- `/timer-stop`
  - Stops the active timer.
- `/timer-extend minutes:<number>`
  - Adds time to the active timer.
- `/timer-reset minutes:<number>`
  - Resets the active timer to a specific value.

### Admin / Setup Commands

- `/pairing-status`
  - Shows whether Rust+ server connection details and Smart Alarm entities are configured.
- `/alarm-bind target:<small-oil|large-oil> entity-id:<id>`
  - Binds a Smart Alarm entity to an Oil Rig target.
- `/channel-bind type:<alerts|operations|system> channel:<channel>`
  - Assigns Discord channels for Drust output.
- `/role-bind type:<oil-counter|operations> role:<role>`
  - Assigns Discord roles for pings.

### Future Commands

Do not build these in the first pass, but they fit the direction:

- `/op-assign`
- `/op-kit`
- `/op-note`
- `/extract-call`
- `/cargo-watch`

## Discord Ping Rules

- When a bound Small Oil Smart Alarm triggers, the Discord bot pings the configured operations role in the configured alerts channel.
- When a bound Large Oil Smart Alarm triggers, the Discord bot pings the configured operations role in the configured alerts channel.
- Starting an operation automatically posts:
  - target
  - trigger source
  - start time
  - crate-open ETA
- Countdown pings for the active Oil Rig timer should fire at:
  - 10 minutes remaining
  - 5 minutes remaining
  - 2 minutes remaining
  - 0 minutes remaining
- Duplicate alarm events should be debounced so one trigger does not create multiple operations.
- Marker-based CH47 alerts must stay disabled until live validation proves they are reliable enough.

## Dashboard Data Model

The early dashboard should be built around a few stable entities.

### Server Connection

- `serverId`
- `serverName`
- `host`
- `appPort`
- `mapSize`
- `wipeTime`
- `connectionStatus`
- `lastHeartbeatAt`
- `lastError`

### Operation

- `operationId`
- `target`
  - `small-oil`
  - `large-oil`
  - `cargo`
- `source`
  - `manual`
  - `smart-alarm`
  - `marker`
- `status`
  - `idle`
  - `active`
  - `closed`
- `startedAt`
- `endsAt`
- `remainingSeconds`
- `triggerEntityId`
- `triggerMarkerId`
- `result`
  - `success`
  - `failed`
  - `aborted`
- `closeNote`

### Alarm Binding

- `bindingId`
- `target`
- `entityId`
- `enabled`
- `lastTriggeredAt`

### Marker Event

- `markerId`
- `markerType`
- `targetGuess`
- `firstSeenAt`
- `lastSeenAt`
- `isActive`
- `x`
- `y`

### Team Member

- `steamId`
- `name`
- `isOnline`
- `isAlive`
- `x`
- `y`
- `lastSeenAt`

### Discord Configuration

- `guildId`
- `alertsChannelId`
- `operationsChannelId`
- `systemChannelId`
- `operationsRoleId`
- `oilCounterRoleId`

### Activity Log

- `eventId`
- `type`
  - `alarm-triggered`
  - `operation-started`
  - `countdown-sent`
  - `operation-closed`
  - `marker-detected`
  - `connection-change`
- `target`
- `source`
- `message`
- `createdAt`

## Dashboard Page Layout

The early dashboard should feel like an operational control surface, not a generic admin panel.

### Page 1: Operations Overview

Primary purpose: show the current live state in one glance.

Sections:

- Top status bar
  - Rust+ connection
  - Discord bot connection
  - server name
  - current Rust time
- Active operation hero
  - target
  - source
  - large timer
  - start time
  - crate-open ETA
  - quick actions for stop, extend, and close
- Trigger status row
  - Small Oil alarm state
  - Large Oil alarm state
  - last trigger times
- Event feed
  - recent alarms
  - countdowns
  - closes
  - connection changes

### Page 2: Map View

Primary purpose: spatial awareness.

Sections:

- Full map canvas
  - cached Rust+ map image
  - monuments
  - team positions
  - live markers
- Map side panel
  - active marker list
  - selected marker details
  - target proximity notes for Oil Rig detection later

### Page 3: Configuration

Primary purpose: setup and maintenance.

Sections:

- Rust+ server connection settings
- Smart Alarm bindings
- Discord channel bindings
- Discord role bindings
- feature flags
  - enable Smart Alarm mode
  - enable marker validation mode
  - enable countdown pings

## Initial User Flow

For now, the Oil Rig MVP should not require routine user input during the happy path.

1. Rust+ connection is already configured.
2. Small Oil and Large Oil Smart Alarm bindings are already configured.
3. An Oil Rig is triggered in-game.
4. Rust+ sends the Smart Alarm change to Drust.
5. Drust creates an active operation automatically.
6. The dashboard shows the active target and starts the 15-minute timer.
7. The Discord bot posts the alert and later posts countdown pings.
8. A user only steps in if they need to close, extend, reset, or correct the operation.

## Allowed And Desired Integrations

### Allowed

- Rust+ Companion Server through Rust+ pairing credentials
- `@liamcottle/rustplus.js` for Rust+ connectivity
- Discord bot integration for slash commands, alerts, and role pings
- Railway deployment for the web app and worker services

### Desired For Early Build

- Rust+ server info and time
- Rust+ map image
- Rust+ map markers
- Rust+ team info
- Rust+ Smart Alarm monitoring
- Discord slash commands
- Discord role and channel routing

### Not In Early Build

- Native mobile app
- Electron desktop app
- In-game overlay
- camera/PTZ features
- clan features
- vending search
- storage monitor inventory workflows

## CH47 Marker Validation Note

Do not treat CH47 marker detection as production-reliable yet.

Validation should happen only after the app is in place and the team can test live behavior. Until then:

- marker-based Oil Rig auto-start remains off by default
- Smart Alarm remains the trusted trigger path
- CH47 logic should be built as a validation mode, not as the primary trigger mode
