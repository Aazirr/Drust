# Rust+ Capability Matrix

Research date: 2026-06-08

## Sources

- Facepunch Rust+ official app page: https://rust.facepunch.com/companion
- Facepunch Rust+ server documentation: https://wiki.facepunch.com/rust/rust-companion-server
- `liamcottle/rustplus.js` README: https://github.com/liamcottle/rustplus.js/blob/master/README.md
- `liamcottle/rustplus.js` protobuf schema: https://github.com/liamcottle/rustplus.js/blob/master/rustplus.proto
- `liamcottle/rustplus.js` pairing flow: https://github.com/liamcottle/rustplus.js/blob/master/docs/PairingFlow.md

## Connection And Setup

### Pair With Server

Capability: connect to a Rust server's Rust+ Companion Server using server IP/host, `app.port`, Steam/player ID, and player token.

Use for helper:

- Add server profile during wipe setup.
- Store per-server pairing credentials securely.
- Show connection status in dashboard and Discord.

Notes:

- Server must have Rust+ enabled and reachable.
- Facepunch docs say the Companion Server needs an internet-accessible TCP port.
- `rustplus.js` can listen for pairing notifications through its CLI flow.

### Pair With Smart Devices

Capability: pair Smart Alarm and Smart Switch entities and receive their entity IDs.

Use for helper:

- Configure Oil Rig RF Smart Alarms.
- Configure base alarms.
- Configure optional Smart Switch indicators.

Notes:

- Pairing gives entity ID and entity type.
- `getEntityInfo(entityId)` must be called at least once before entity-change broadcasts are received.

## Server Data

### Server Info

API: `getInfo`

Fields exposed by proto:

- server name
- header image
- URL
- map name
- map size
- wipe time
- current players
- max players
- queued players
- optional seed
- optional salt
- optional logo/nexus fields

Use for helper:

- Wipe profile.
- Dashboard header.
- Server population context.
- Auto-label logs by server and wipe.

### In-Game Time

API: `getTime`

Fields exposed by proto:

- day length minutes
- time scale
- sunrise
- sunset
- current in-game time

Use for helper:

- Night/day readiness.
- Decide whether to launch mini/sub/boat.
- Dashboard context for stealth or visibility.

## Map And Events

### Full Map

API: `getMap`

Fields exposed by proto:

- width
- height
- JPEG map image
- ocean margin
- monuments with token and x/y position
- optional background

Use for helper:

- Render dashboard map.
- Locate Small Oil, Large Oil, Cargo path, operation base, bags, and fallback depots.
- Convert x/y positions to visual map coordinates.

Notes:

- `rustplus.js` documents `Map` request as more expensive than most requests, so cache it.

### Map Markers

API: `getMapMarkers`

Marker types exposed by proto:

- `Player`
- `Explosion`
- `VendingMachine`
- `CH47`
- `CargoShip`
- `Crate`
- `GenericRadius`
- `PatrolHelicopter`

Marker fields exposed by proto:

- marker ID
- marker type
- x/y position
- optional Steam ID
- optional rotation
- optional radius
- optional colors/alpha
- optional name
- optional vending-machine stock/sell orders

Use for helper:

- Detect Cargo Ship marker.
- Detect CH47 marker.
- Detect crate markers.
- Detect Patrol Helicopter.
- Track vending machine sell orders.
- Track team player map positions where exposed as markers.
- Trigger Discord pings for event starts.
- Build event history: first seen, last seen, movement, disappeared.

Needs validation:

- Whether Oil Rig reinforcement Chinook appears as `CH47`.
- Whether Oil Rig crate or CH47 marker timing is fast enough to replace RF alarms.
- Whether map marker polling interval can be low enough without rate-limit issues.

## Team And Chat

### Team Info

API: `getTeamInfo`

Fields exposed by proto:

- team leader Steam ID
- member Steam ID
- member name
- x/y position
- online state
- alive state
- spawn time
- death time
- team map notes
- leader map notes

Use for helper:

- Roster dashboard.
- Show who is online/alive.
- Show who died during operation.
- Detect team member death and ping Discord.
- Track assigned role health, e.g. "sub player dead".
- Show team positions on dashboard map.
- Use map notes as possible operation markers.

### Team Chat

APIs:

- `getTeamChat`
- `sendTeamMessage`
- broadcast `teamMessage`

Use for helper:

- Discord <-> Rust team chat bridge.
- In-game command interface through team chat, if desired.
- Send operation reminders into Rust team chat.
- Log callouts and decisions.

Examples:

- Discord `/op status` posts status in Discord.
- Team chat `!op status` returns active timer in game.
- Dashboard can send "Large Oil crate opens in 2 minutes" to team chat.

## Smart Devices

### Smart Alarm

APIs:

- `getEntityInfo`
- broadcast `entityChanged`

Use for helper:

- RF Receiver -> Smart Alarm -> Discord ping.
- Base raid alerts.
- Operation base tripwire alerts.
- False-positive log.

Notes:

- Smart Alarm can be paired with Rust+.
- Entity-change broadcasts require initial `getEntityInfo`.

### Smart Switch

APIs:

- `getEntityInfo`
- `setEntityValue`
- `turnSmartSwitchOn`
- `turnSmartSwitchOff`
- broadcast `entityChanged`

Use for helper:

- Discord commands to turn operation base indicators on/off.
- Toggle lights, signs, sirens, garage/door controllers if wired in game.
- Remote "ready signal" for people in base.
- In-game launch indicator: red light for active operation, green for stocked.

Safety note:

- Use sparingly and only for normal Rust+ device control. Do not build spammy strobe behavior because rate limits exist and it is not useful for the helper.

### Storage Monitor

APIs:

- `getEntityInfo`
- broadcast `entityChanged`

Fields exposed by entity payload:

- value
- items
- capacity
- protection state/expiry fields

Use for helper:

- Operation base inventory dashboard.
- Track whether missile/torpedo boxes are stocked.
- Track meds, kits, low grade, diving gear, spare launchers.
- Alert when critical stock drops below threshold.

Notes:

- `rustplus.js` README says Storage Monitor broadcasts when items are added/removed from the associated container.
- Item IDs need a local item-definition mapping to show readable names.

## Clan Data

APIs exposed by proto:

- `getClanInfo`
- `setClanMotd`
- `getClanChat`
- `sendClanMessage`
- broadcasts for clan changed and clan message

Use for helper:

- Optional clan chat bridge.
- Clan roster display if the team uses Rust clans.
- Clan MOTD could show active operation status, though this is probably not MVP.

MVP status:

- Defer unless your group actively uses Rust clan features.

## Cameras, Drones, PTZ, Turrets

APIs exposed by proto and `rustplus.js`:

- `cameraSubscribe`
- `cameraUnsubscribe`
- `cameraInput`
- camera rays broadcast
- `getCamera(identifier)`

Use for helper:

- Optional camera panel for operation base cameras.
- View Oil Rig cameras if camera IDs are known and accessible.
- PTZ camera control from dashboard.
- Drone/autoturret camera experiments.

MVP status:

- Defer. Useful, but more complex and not necessary for the core Oil Rig counter timer.

Safety note:

- Treat camera control as normal Rust+ camera behavior only. Do not build automated aiming, target tracking, or combat automation.

## Discord Bot Feature Inventory

### Notifications

- Smart Alarm triggered.
- Smart Switch changed state.
- Storage Monitor changed.
- Cargo marker appeared/disappeared.
- CH47 marker appeared/disappeared.
- Crate marker appeared/disappeared.
- Patrol Helicopter marker appeared.
- Team member died.
- Team member came online/offline.
- Operation timer reached 10/5/2/0 minutes.
- Stock threshold crossed, e.g. torpedoes below minimum.

### Slash Commands

- `/server status`
- `/op start`
- `/op status`
- `/op assign`
- `/op kit`
- `/op timer`
- `/op extract`
- `/op abort`
- `/op close`
- `/stock status`
- `/stock set-minimum`
- `/map events`
- `/chat send`
- `/switch on`
- `/switch off`

### Discord Channel Routing

- `#oil-ops`: Small/Large Oil operation pings.
- `#cargo-ops`: Cargo watch and Cargo operations.
- `#rust-alerts`: Smart alarms, base alarms, deaths.
- `#rust-team-chat`: team chat bridge.
- `#stock`: operation base storage and readiness.

## Dashboard Feature Inventory

### Live Operations

- Active operation cards.
- Countdown timer.
- Source of trigger: RF alarm, marker detection, manual, Discord command.
- Target: Small Oil, Large Oil, Cargo.
- Assigned roles.
- Kit readiness.
- Current phase: alert, prep, launch, intercept, recover, close.

### Map

- Cached full Rust+ map.
- Monuments.
- Team positions.
- Event markers.
- Vending machines.
- Manual operation base marker.
- Manual intercept lanes.
- Distance/heading estimates if we implement coordinate helpers.

### Team

- Online/alive roster.
- Role assignment.
- Voice readiness.
- Recent deaths.
- Respawn timer context from spawn/death fields.

### Stock

- Storage monitor cards.
- Item thresholds.
- Missing kit parts.
- Launch readiness score by role.

### Logs

- Alarm history.
- Event marker history.
- Operation history.
- Post-op notes.
- False positives.

## Best MVP Slice

1. Rust+ server pairing setup.
2. Discord bot install and channel configuration.
3. Smart Alarm monitoring.
4. Manual operation start.
5. Automatic 15-minute Oil Rig timer from Smart Alarm.
6. Discord countdown pings.
7. Dashboard operation cards and roster.
8. Basic `getMapMarkers()` polling to log Cargo/CH47/Crate sightings.
9. Post-op close summary.

## Best Phase 2 Slice

1. Validate marker-only Oil Rig detection.
2. Add map view.
3. Add Storage Monitor stock tracking.
4. Add team chat bridge.
5. Add Cargo operation model.
6. Add Smart Switch indicators.

## Hard Boundaries

- No protected memory reading.
- No Rust client automation.
- No hidden enemy detection.
- No automated camera aiming or combat.
- No promise that marker-only Oil Rig detection works until live validation.
