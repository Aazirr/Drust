# Rust+ Discord Dashboard Integration Notes

Research date: 2026-06-08

## Chosen Product Shape

The helper should be a web dashboard plus Discord bot.

- Web dashboard: accurate live operation view, timers, map context, role state, kit state, and operation notes.
- Discord bot: pings, event notifications, quick commands, team reminders, and operation summaries.

## Rust+ API Findings

Rust+ communicates with Rust servers through the Companion Server websocket. Facepunch documents that the Companion Server is what Rust+ uses to communicate with Rust servers. The server needs an internet-accessible TCP app port. The default is game port + 67 or RCon port + 67, whichever is larger, and `app.info` can show the active port.

Source: https://wiki.facepunch.com/rust/rust-companion-server

The official Rust+ page confirms supported app-level behavior:

- server status and map/event tracking
- team chat
- smart device control
- Smart Alarm push notifications when an electrical signal is detected

Source: https://rust.facepunch.com/companion

Full capability matrix: `docs/rustplus-capability-matrix.md`

## rustplus.js Findings

Repository: https://github.com/liamcottle/rustplus.js

The project is an unofficial Node.js library for interacting with Rust+ capabilities. It communicates with the Rust game server over the websocket configured by `app.port`.

Useful implemented convenience methods:

- `turnSmartSwitchOn`
- `turnSmartSwitchOff`
- `sendTeamMessage`
- `getEntityInfo`
- `setEntityValue`
- `getInfo`
- `getMap`
- `getTime`
- `getMapMarkers`
- `getTeamInfo`

Source: https://github.com/liamcottle/rustplus.js/blob/master/README.md

The library uses protobuf messages from `rustplus.proto`. The proto exposes:

- `AppRequest`: info, time, map, team info, team chat, send team message, entity info, set entity value, subscription checks, map markers, clan info/chat, camera subscription/input.
- `AppMessage`: request responses and broadcasts.
- `AppBroadcast`: team changed, new team message, entity changed, clan changed, new clan message, camera rays.
- `AppMarkerType`: player, explosion, vending machine, CH47, CargoShip, Crate, GenericRadius, PatrolHelicopter.
- `AppTeamInfo`: team member Steam IDs, names, x/y positions, online state, alive state, spawn/death times, map notes.
- `AppEntityInfo` / `AppEntityChanged`: smart device type and payload.

Source: https://github.com/liamcottle/rustplus.js/blob/master/rustplus.proto

Important entity-change behavior:

- Call `getEntityInfo(entityId)` at least once for a Smart Alarm or Smart Switch.
- After that, the Rust server can broadcast `entityChanged` messages when the entity changes state.
- This is the likely bridge from in-game RF Receiver -> Smart Alarm -> dashboard/Discord alert.

Source: https://github.com/liamcottle/rustplus.js/blob/master/README.md

Pairing requirements:

- Need server IP or hostname.
- Need `app.port`.
- Need player Steam ID.
- Need player token from server pairing.
- Need Smart Alarm / Smart Switch entity IDs for device-specific monitoring.

Source: https://github.com/liamcottle/rustplus.js/blob/master/docs/PairingFlow.md

Operational constraints:

- Rust+ websocket connection limits exist. `rustplus.js` documents defaults of 500 max connections and 5 max connections per IP.
- Request rate limits exist. `rustplus.js` documents token bucket limits: 50 tokens per IP with 15/sec refill, 25 tokens per player ID with 3/sec refill.
- Map request costs more than most requests, so the dashboard should cache the map and poll lightweight marker/team data more often than full map data.

Source: https://github.com/liamcottle/rustplus.js/blob/master/README.md

## What We Can Reliably Build

- Discord ping when paired Smart Alarm entity changes state.
- Automatic Oil Rig operation timer when the Small Oil or Large Oil Smart Alarm fires, as long as each rig has a distinct Smart Alarm or configured identity.
- Dashboard timer card for active operations.
- Map-marker polling for Cargo Ship, CH47, locked crate, patrol helicopter, vending machines, and team positions.
- Team position overlay on the dashboard map.
- Discord commands to start, stop, extend, reset, or annotate operation timers.
- Discord callouts generated from timer state, e.g. crate opens in 10/5/2/0 minutes.
- Smart Switch controls for optional in-game indicators, if the team wants dashboard/Discord commands to turn on lights/signals in the operation base.
- Team chat bridge from Rust to Discord and Discord to Rust team chat, if desired.

## Oil Rig Chinook Detection Hypothesis

Rust+ map markers include a `CH47` marker type in `rustplus.proto`, and `rustplus.js` exposes `getMapMarkers()`. The README describes map markers as including events such as Cargo and Heli. This suggests the helper may be able to detect the Chinook/heavy-scientist helicopter that appears on the in-game map when Oil Rig is triggered.

This should be treated as a validation target, not a confirmed replacement for RF alarms yet:

- Confirm whether the Oil Rig reinforcement Chinook appears in `getMapMarkers()` as marker type `CH47`.
- Confirm whether Small Oil and Large Oil can be distinguished by marker position near the relevant monument.
- Confirm how quickly the marker appears after crate hack starts.
- Confirm whether marker disappearance or movement creates duplicate/false triggers.
- Compare marker detection timing against RF Receiver -> Smart Alarm timing.

If validated, the MVP can support a "marker-only alarm mode" where `getMapMarkers()` polling detects a CH47 marker near Small Oil or Large Oil and starts the 15-minute operation timer without requiring RF Receiver and Smart Alarm wiring.

## What We Should Not Claim

- We cannot know enemy inventory from Rust+.
- We cannot know enemy exact extraction plan unless observed by players or visible via normal map/event data.
- We cannot detect hidden enemy players through Rust+.
- We should not automate Rust client inputs or interact with anti-cheat-protected game memory.
- We should not depend on private server admin access for normal use.

## Feature Ideas

### Discord Bot

- `@oil-counter` role ping when Small Oil or Large Oil alarm fires.
- Per-monument channels: `#small-oil`, `#large-oil`, `#cargo`.
- Slash command `/op start target:small-oil source:alarm`.
- Slash command `/op timer target:large-oil minutes:15`.
- Slash command `/op status`.
- Slash command `/op assign role:sub player:name`.
- Slash command `/op kit role:mini-gunner`.
- Slash command `/op extract method:mini direction:north`.
- Slash command `/op abort reason:text`.
- Scheduled Discord pings at crate-open minus 10, 5, 2, and 0 minutes.
- Voice-channel nudges: post who should join operation voice.
- Post-op summary template.

### Dashboard

- Active operation timeline.
- Big synchronized crate timer.
- Target cards for Small Oil, Large Oil, Cargo.
- Current team roster with online/alive/dead state from Rust+ team info.
- Role assignment board.
- Kit readiness checklist by role.
- Map view with cached server map, monuments, team positions, Cargo/CH47/crate markers, and manually marked intercept lanes.
- Operation base inventory status, either manual or via Storage Monitors later.
- Alarm history and false-positive notes.
- Wipe profile: server, wipe date, map size, seed if available, operation base locations, paired device IDs.

### Automation Rules

- If Small Oil alarm fires, create Small Oil operation and start 15-minute locked-crate timer.
- If Large Oil alarm fires, create Large Oil operation and start 15-minute locked-crate timer.
- If CH47 marker appears near Small Oil or Large Oil, optionally create an Oil Rig operation after validation confirms this signal is reliable.
- If Cargo marker appears, create passive Cargo watch.
- If Cargo crate marker appears or timer is manually started, create Cargo operation.
- If timer reaches launch threshold, ping assigned roles.
- If team member dies during operation, post a Discord alert and mark role degraded.
- If Smart Alarm toggles rapidly, debounce to avoid duplicate operations.

## MVP Recommendation

First MVP should focus on Oil Rig:

1. Pair Rust+ server and Smart Alarm entities.
2. Configure Small Oil and Large Oil alarm entity IDs.
3. Discord bot posts alarm pings.
4. Dashboard starts a 15-minute operation timer.
5. Team assigns roles and checks kits.
6. Bot posts countdown pings.
7. Operation can be closed with a result summary.

Cargo should be Phase 2 because it needs more map-marker tracking and route interpretation.
