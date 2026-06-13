# Development Phases

Last updated: 2026-06-13

## Phase 0 - Discovery

Status: In progress

- [x] Created initial project truth-source under `/docs`.
- [x] Captured the Rust helper product direction, current playstyle, verified game facts, candidate features, and open questions.
- [x] Verified that the workspace initially had no `/docs` folder and no existing `development-phases.md`.
- [x] Confirmed product shape as web dashboard plus Discord bot.
- [x] Researched Rust+ Companion Server behavior and `liamcottle/rustplus.js`.
- [x] Added Rust+ integration notes under `/docs`.
- [x] Added validation target for detecting Oil Rig Chinook/CH47 through Rust+ map markers as a possible Smart Alarm replacement.
- [x] Added detailed Rust+ capability matrix covering server info, map markers, team info, chat, smart devices, storage monitors, clans, cameras, Discord features, dashboard features, MVP scope, and hard boundaries.
- [x] Captured selected feature scope: in-game time, full map with markers/monuments, event detection, Discord commands/pings, smart devices, and operation features.
- [x] Moved and renamed the project to `Drust` at `C:\Users\Franz Jason Dolores\Documents\Work\Projects\Personal\Drust`.
- [x] Recorded RustClash source preference: use `wiki.rustclash.com` for factual Rust item/entity/mechanic data instead of the main `rustclash.com` case-opening pages.

## Phase 1 - Product Spec

Status: Pending

- [x] Decide target platform.
- [x] Target platform decision:
- [x] Main UI is a web app dashboard.
- [x] Discord bot is a heavily supported companion surface for command-heavy flows.
- [x] Important actions happen through the Discord bot and in-game chat.
- [x] Not target platforms for MVP: native mobile app, Electron desktop app, and in-game overlay.
- [x] Define Discord bot command list and ping rules.
- [x] Define dashboard data model and page layout.
- [x] Decide MVP scope.
- [x] Turn selected scope into a concrete MVP backlog.
- [x] MVP 1: connect Rust+ API -> web app -> Discord bot, with Railway as the deployment target.
- [x] MVP 2: operation feature where Oil Rig is triggered, Rust+ notifies, Discord bot pings, and a 15-minute timer starts.
- [x] MVP 3: auto-detect Oil Rig trigger by detecting a CH47/Chinook marker at either Oil Rig.
- [x] Define exact user flows for Oil Rig, Cargo Ship, timers, alarms, and role coordination.
- [x] Confirm what integrations are allowed and desired.
- [x] Captured the initial command list, dashboard data model, page layout, integration direction, and MVP Oil Rig flow in `/docs/product-spec.md`.
- [ ] Validate whether Rust+ `getMapMarkers()` reports Oil Rig Chinook/CH47 markers quickly and reliably enough to replace RF Receiver + Smart Alarm.

## Phase 2 - Prototype

Status: In progress

- [x] Scaffold the application.
- [x] Build the operation dashboard.
- [x] Add timers, roles, checklists, and operation notes.
- [x] Added a Railway-friendly workspace with `apps/web` and `apps/worker`.
- [x] Built the first Operations Command dashboard prototype based on the MVP product spec.
- [x] Wired shared domain types and snapshot logic between the web app, worker, and domain package.
- [x] Implemented the first Rust+/Discord integration path in the worker with Rust+ bridge startup, Smart Alarm ingestion, and Discord webhook delivery support.
- [x] Added the Map View and Configuration pages from the product spec.
- [x] Fixed Railway web startup by adding a production `start` path for the web service and documented the full monorepo setup.
- [x] Added a dedicated Discord bot service with initial slash commands for status, pairing checks, timer start, timer extension, and operation close.
- [x] Refined the web dashboard UI to better match the tactical, fast, and reliable product tone.
- [x] Added guided Rust+ pairing state in the dashboard and worker so Drust can show the pairing runbook instead of only static env status.
- [x] Built a local Drust Rust+ pairing helper that captures Pair with Server notifications and imports runtime Rust+ credentials into the worker.
- [x] Fixed Rust+ pairing payload handling so the helper can parse key/value push payloads and embedded server JSON from live Pair with Server notifications.
- [x] Added a Smart Alarm binding helper flow so Small Oil and Large Oil entity IDs can be captured from live Rust+ device pairing notifications and imported into the worker.
- [x] Expanded Discord integration status so the web app can distinguish webhook-only, bot-only, and bot-plus-webhook deployments.
- [x] Removed dummy fallback dashboard data so empty and unconfigured states now render as `N/A` or explicit empty states instead of believable placeholder activity.

## Phase 3 - Validation

Status: Pending

- [ ] Test workflows against real wipe scenarios.
- [ ] Tune timing presets and role checklists.
- [ ] Add persistence and export/import if needed.
