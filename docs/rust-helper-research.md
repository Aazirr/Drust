# Rust Helper Research Notes

Research date: 2026-06-08

## Product Direction

Build a legitimate Rust operations helper for coordinating Cargo Ship and Oil Rig counters. The helper should be a web dashboard plus Discord bot, supporting timing, role assignment, inventory readiness, alarm intake, pings, and post-operation notes. It should not automate game client input, read protected memory, bypass anti-cheat, or provide hidden information unavailable through normal play or Rust+.

## Current Playstyle Notes

- Primary monuments: Cargo Ship, Small Oil Rig, Large Oil Rig.
- Strategy: wait for another group to start the event, then counter at or near locked-crate completion.
- Typical base plan: secure wipe from a cave base, then build an operation base on the shore closest to Small or Large Oil Rig.
- Operation base stores kits, weapons, boats, submarine supplies, meds, electrical alarm setup, and launch inventory.
- Oil Rig alert path today: RF Receiver receives monument signal, powers Smart Alarm, Rust+ pushes phone notification, team manually starts a 15-minute timer.
- Counter extraction patterns:
  - Enemy leaves by minicopter: sea player/submarine plus minicopter team; homing missiles used to force or secure the kill.
  - Enemy leaves by boat: submarine intercept using torpedoes.

## Verified Game Facts

- RustClash research should prioritize `wiki.rustclash.com` for item, entity, loot, and mechanic data. The main `rustclash.com` domain can surface case-opening/gambling pages and may be less useful or more bot-hostile for factual game data.
  Source preference: https://wiki.rustclash.com
- Rust+ is the official companion app. Facepunch says it can track server map/events and pair Smart Switches/Smart Alarms with in-game electrical contraptions. Smart Alarms send customizable push notification alerts when an electrical signal is detected.
  Source: https://rust.facepunch.com/companion
- RustClash RF Receiver notes list Small Oil Rig frequency as `4765`, Large Oil Rig as `4768`, and Excavator as `4777`.
  Source: https://wiki.rustclash.com/item/rf-receiver
- RustClash RF Pager notes say both Small and Large Oil Rig have SOS frequencies that beep when someone hacks the locked crate.
  Source: https://wiki.rustclash.com/item/rf-pager
- RustClash Oil Rig Locked Crate notes state the crate has a 15-minute unlock wait and player input can no longer increase that timer.
  Source: https://wiki.rustclash.com/entity/oil-rig-locked-crate
- RustClash Locked Crate notes say locked crates need to be hacked for 15 minutes to unlock and are shown globally on the map.
  Source: https://wiki.rustclash.com/entity/locked-crate
- RustClash Homing Missile Launcher notes: active guidance, the target must be tracked until impact, and flares can distract it.
  Source: https://wiki.rustclash.com/item/homing-missile-launcher
- RustClash Homing Missile notes list damage as `530`, radius as `3.5 m`, stack size as `4`, and a community tip says minicopters take 2 missiles to destroy.
  Source: https://wiki.rustclash.com/item/homing-missile
- RustClash Torpedo notes: submarine ammunition, straight-line fire, damage `430`, explosion radius `5 m`, and sold at fishing village boat vendors.
  Source: https://wiki.rustclash.com/item/torpedo

## Helper Features To Consider

- Discord pings for operation starts, countdown thresholds, role calls, deaths, and aborts.
- Web dashboard for live operation state, timers, map context, roles, kit checklists, and operation logs.
- Operation dashboard for each target: Small Oil, Large Oil, Cargo.
- One-tap event timer presets: crate hacked, crate opens, launch now, enemy likely extracting.
- Role board: submarine intercept, minicopter driver, missile gunner, shore overwatch, depot runner.
- Kit checklist per role: weapon, ammo, meds, armor, diving gear, fuel, low grade, torpedoes, homing launcher, missiles, flares, bags.
- RF alarm log: manual entry first, possible Rust+ integration later if allowed and technically viable.
- Map-planning mode: choose operation base shore, monument, intercept lanes, fallback depot, and respawn beds.
- Callout templates: "Small Oil alarm fired", "crate opens in 15", "mini leaving north", "boat leaving west", "sub engage".
- Post-op notes: what worked, what failed, enemy group size, route used, loot recovered, items lost.
- Rust+ integration research lives in `docs/rustplus-discord-dashboard.md`.
- Detailed Rust+ capability matrix lives in `docs/rustplus-capability-matrix.md`.
- Current selected scope lives in `docs/selected-scope.md`.

## Open Questions

- Should Rust+ integration be included, or should alarms remain manual in the first version?
- Do you want this helper to store server-specific maps and wipe history, or only live operation timers?
- What group size should be optimized for first: 2, 3, 4, or flexible squads?
- Should Cargo Ship support be equal priority to Oil Rig, or should Oil Rig be the MVP?
- Which server type matters most: official vanilla, community vanilla, 2x/modded, or mixed?
