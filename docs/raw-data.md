# Drust Research Packet

## RustClash Source Note

Use `wiki.rustclash.com`, not main `rustclash.com`.

Main useful source:
- https://wiki.rustclash.com

Main `rustclash.com` tends to surface case-opening/gambling pages. The wiki subdomain has the item/entity/mechanic data.

## Oil Rig / Crate Data

Sources:
- https://wiki.rustclash.com/entity/oil-rig-locked-crate
- https://wiki.rustclash.com/entity/locked-crate
- https://wiki.rustclash.com/item/rf-receiver
- https://wiki.rustclash.com/item/rf-pager

Facts:
- Oil Rig locked crate unlock timer: 15 minutes.
- Locked crates need to be hacked before opening.
- Oil Rig crate timer can no longer be increased by player input, according to RustClash Oil Rig Locked Crate notes.
- Locked crate is visible globally on the map.
- Oil Rig RF/SOS frequencies:
  - Small Oil Rig: 4765
  - Large Oil Rig: 4768
  - Excavator: 4777
- RF Receiver:
  - Receives RF signals from RF Broadcaster or RF Transmitter when frequencies match.
  - If signal matches, Power Out receives power.
  - Consumption: 1 power
  - Inputs: Power In
  - Outputs: Power Out
  - Decay: 48 hours
- RF Pager:
  - Audible signal when listening frequency receives signal.
  - Used for Oil Rig SOS frequency detection.

## Smart Alarm / Rust+ Data

Sources:
- https://rust.facepunch.com/companion
- https://wiki.rustclash.com/item/smart-alarm

Facts:
- Rust+ is the official Rust companion app.
- Rust+ can track server map/events, team chat, and smart devices.
- Smart Alarms can pair with Rust+.
- Smart Alarms send customizable phone push notifications when electrical signal is detected.
- Smart Alarm:
  - Sends notification to phone when powered.
  - Consumption: 1 power
  - Inputs: Power In
  - Outputs: Power Out
  - Decay: 48 hours
  - Stack size: 5
- Smart Alarm pairing note from RustClash comments:
  - Must be powered before pairing.
  - Equip wire tool and hold use/interact to pair with phone.
  - There may be cooldown/delay behavior between repeated notifications.

## Homing Missile Data

Sources:
- https://wiki.rustclash.com/item/homing-missile-launcher
- https://wiki.rustclash.com/item/homing-missile

Homing Missile Launcher:
- Active-guidance launcher.
- User must track target until impact.
- Can be distracted by flares.
- Damage: 530
- Rate of fire: 10 RPM
- Capacity: 1
- Reload: 5.92 sec
- Draw: 1 sec
- Workbench: Level 2 craft path listed by RustClash.
- Research cost listed: 60 scrap.

Homing Missile:
- Damage: 530
- Explosion radius: 3.5 m
- Explosion delay: 12 sec
- Stack size: 4
- RustClash community tip says:
  - Minicopter: 2 missiles to destroy
  - Attack helicopter: 2
  - Scrap helicopter: 4

## Torpedo Data

Source:
- https://wiki.rustclash.com/item/torpedo

Facts:
- Ammunition for submarine types.
- Fires in a straight line.
- Damage: 430
- Explosion radius: 5 m
- Explosion delay: 15–20 sec
- Sold by boat vendors at fishing villages.
- RustClash notes Surface Torpedo was removed; current item is Torpedo / formerly Direct Torpedo.

## Rust+ Companion Server

Source:
- https://wiki.facepunch.com/rust/rust-companion-server

Facts:
- Rust+ communicates with Rust servers through the Companion Server.
- Server must expose the Companion Server TCP port to the internet.
- Default app port is game port + 67 or RCon port + 67, whichever is larger.
- `app.info` shows the active Rust+ companion port.
- `app.port` can configure the companion port.
- Rust+ companion port must be 10000 or higher for Facepunch backend reachability.
- If companion server cannot register/connect, Rust+ features can appear offline/disabled.
- `companion.id` is the server identity file and should not be shared, duplicated, deleted, or randomly changed.

## rustplus.js Repo

Source:
- https://github.com/liamcottle/rustplus.js
- https://github.com/liamcottle/rustplus.js/blob/master/README.md
- https://github.com/liamcottle/rustplus.js/blob/master/rustplus.proto
- https://github.com/liamcottle/rustplus.js/blob/master/docs/PairingFlow.md

Package:
- Name: `@liamcottle/rustplus.js`
- Version fetched: 2.5.0
- Language/runtime: Node.js
- License: MIT
- Purpose: unofficial NodeJS library for Rust+ interaction.
- Communicates with Rust game server websocket on `app.port`.

Connection requirements:
- Server IP / hostname
- App Port
- Player ID / Steam ID
- Player Token from server pairing

Convenience methods:
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

Events emitted by library:
- `connecting`
- `connected`
- `disconnected`
- `error`
- `message`
- `request`

Important entity behavior:
- Must call `getEntityInfo(entityId)` at least once.
- After that, server can send `entityChanged` broadcasts when Smart Alarm/Switch/Storage Monitor state changes.
- Storage Monitor broadcasts can include capacity and items.

Rust+ request rate limits documented by rustplus.js:
- Per IP: 50 token limit, 15 tokens replenished/sec
- Per Player ID: 25 token limit, 3 tokens replenished/sec
- Server pairing: 5 token limit, 0.1 replenished/sec

Request token costs documented:
- Default: 1
- CheckSubscription: 1
- EntityInfo: 1
- Info: 1
- Map: 5
- MapMarkers: 1
- PromoteToLeader: 1
- SendTeamChat: 2
- SetEntityValue: 1
- SetSubscription: 1
- TeamInfo: 1
- Time: 1
- Camera Subscription: 1
- Camera Movement: 0.01

Connection limits documented:
- Max connections default: 500
- Max connections per IP default: 5

## rustplus.proto Important Types

AppEntityType:
- Switch = 1
- Alarm = 2
- StorageMonitor = 3

AppMarkerType:
- Undefined = 0
- Player = 1
- Explosion = 2
- VendingMachine = 3
- CH47 = 4
- CargoShip = 5
- Crate = 6
- GenericRadius = 7
- PatrolHelicopter = 8

AppRequest supports:
- getInfo
- getTime
- getMap
- getTeamInfo
- getTeamChat
- sendTeamMessage
- getEntityInfo
- setEntityValue
- checkSubscription
- setSubscription
- getMapMarkers
- promoteToLeader
- getClanInfo
- setClanMotd
- getClanChat
- sendClanMessage
- getNexusAuth
- cameraSubscribe
- cameraUnsubscribe
- cameraInput

AppResponse can include:
- success
- error
- info
- time
- map
- teamInfo
- teamChat
- entityInfo
- flag
- mapMarkers
- clanInfo
- clanChat
- nexusAuth
- cameraSubscribeInfo

AppBroadcast can include:
- teamChanged
- teamMessage
- entityChanged
- clanChanged
- clanMessage
- cameraRays

AppInfo fields:
- name
- headerImage
- url
- map
- mapSize
- wipeTime
- players
- maxPlayers
- queuedPlayers
- optional seed
- optional salt
- optional logoImage
- optional nexus fields

AppTime fields:
- dayLengthMinutes
- timeScale
- sunrise
- sunset
- time

AppMap fields:
- width
- height
- jpgImage
- oceanMargin
- monuments
- optional background

AppMap.Monument fields:
- token
- x
- y

AppTeamInfo fields:
- leaderSteamId
- members
- mapNotes
- leaderMapNotes

AppTeamInfo.Member fields:
- steamId
- name
- x
- y
- isOnline
- spawnTime
- isAlive
- deathTime

AppTeamMessage fields:
- steamId
- name
- message
- color
- time

AppMarker fields:
- id
- type
- x
- y
- optional steamId
- optional rotation
- optional radius
- optional color1
- optional color2
- optional alpha
- optional name
- optional outOfStock
- sellOrders

Vending sell order fields:
- itemId
- quantity
- currencyId
- costPerItem
- amountInStock
- itemIsBlueprint
- currencyIsBlueprint
- optional itemCondition
- optional itemConditionMax

AppEntityPayload fields:
- value
- items
- capacity
- hasProtection
- protectionExpiry

AppEntityPayload.Item fields:
- itemId
- quantity
- itemIsBlueprint

## Product-Relevant Interpretations

Strongly feasible:
- Web dashboard with Rust+ connection status.
- In-game time tracking.
- Full Rust+ map image.
- Monument overlay.
- Team position overlay.
- Event marker polling.
- Discord bot commands.
- Discord pings.
- Smart Alarm monitoring.
- Smart Switch control.
- Operation timer flow.
- Role assignment.
- Kit checklist.
- Post-operation summary.

Needs validation:
- Whether Oil Rig reinforcement Chinook appears in `getMapMarkers()` as `CH47`.
- Whether the CH47 marker appears quickly enough to replace RF Receiver + Smart Alarm.
- Whether Small/Large Oil can be inferred by CH47 marker proximity to monument positions.
- Whether crate marker near Oil Rig reliably appears when crate starts/opens.

Probably later:
- Storage Monitor inventory readiness.
- Camera/PTZ/drone/turret panel.
- Clan chat/features.
- Vending search.

Hard boundaries:
- No Rust client memory reading.
- No anti-cheat bypass.
- No hidden enemy detection.
- No automated combat/camera aiming.
- No claim that marker-only Oil detection works until tested live.