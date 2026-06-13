# Selected Scope

Last updated: 2026-06-13

## Product Shape

Web dashboard plus Discord bot for Rust operation coordination.

## Target Platform Decision

- Main UI is a web app dashboard.
- Discord bot is a heavily supported companion surface, especially for command-heavy workflows.
- Important actions happen through the Discord bot and in-game chat.
- MVP does not target a native mobile app, Electron desktop app, or in-game overlay.

## Selected Feature Areas

### In-Game Time Tracking

- Show current Rust server time.
- Show day/night state.
- Show sunrise/sunset context.
- Use time context in operation planning, especially for boat, submarine, minicopter, and stealth timing.

### Web Map

- Display full Rust+ map image.
- Overlay monument positions.
- Overlay live markers where available.
- Overlay team positions where available.
- Support manual operation markers, such as cave base, operation base, submarine staging point, mini pad, fallback depot, and intercept lanes.

### Event Detection

- Poll Rust+ map markers for Cargo Ship, CH47, Crate, and Patrol Helicopter.
- Detect first seen / last seen / disappeared state.
- Route detected events into dashboard state and Discord notifications.
- Validate whether Oil Rig Chinook/CH47 marker detection can replace RF Receiver + Smart Alarm.

### Discord Integration

- Discord bot with slash commands.
- Discord pings for operation events.
- Command-driven operation control.
- Channel routing for oil operations, cargo operations, alerts, stock, and team chat if enabled.

### Smart Devices

- Pair and monitor Smart Alarms.
- Pair and control Smart Switches.
- Subscribe to entity changes after calling `getEntityInfo`.
- Support RF Receiver -> Smart Alarm as reliable Oil Rig trigger mode.
- Support optional in-game indicators through Smart Switch wiring.

### Operation Features

- Active operation dashboard.
- Operation timers.
- Role assignment.
- Kit readiness.
- Launch readiness.
- Countdown pings.
- Extraction method callouts.
- Abort/close flow.
- Post-operation summary.
- Alarm/event history.

## Explicitly Not Selected Yet

- Clan features.
- Camera/PTZ/drone/turret panel.
- Storage Monitor stock tracking.
- Vending machine search.
- Rival/player tracking outside the team's Rust+ visibility.

These can be reconsidered later, but they are not part of the current focused scope.

## Build Bias

Start with the smallest version that proves the selected loop:

Rust+ connection -> dashboard status -> map/time/event polling -> Discord bot -> operation timer -> smart device trigger -> operation close summary.
