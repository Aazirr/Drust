# Drust

Drust is a tactical Rust operations companion built around a fast loop:

`Rust+ -> worker -> shared state -> web dashboard + Discord alerts`

The MVP focuses on Oil Rig operations, Smart Alarm triggers, timer coordination, and giving the team a reliable command surface without heavy manual input.

## Repository Structure

- `apps/web` - React/Vite operations dashboard.
- `apps/worker` - Rust+, alarm, and Discord integration service.
- `packages/domain` - shared domain types, sample state, and cross-service contracts.
- `docs` - project truth-source, product spec, and development phases.

## Current Scope

- Shared operation snapshot used by both web and worker.
- Web dashboard with Overview, Map View, and Configuration pages.
- Worker endpoints for dashboard state, manual alarm triggers, timer control, and operation closing.
- Rust+ bridge bootstrap with Smart Alarm ingestion support.
- Discord webhook notification path for early operations alerts.

## Local Development

Install dependencies:

```bash
npm install
```

Run the web app:

```bash
npm --workspace @drust/web run dev
```

Run the worker:

```bash
npm --workspace @drust/worker run dev
```

Build everything:

```bash
npm run build
```

Lint the workspace:

```bash
npm run lint
```

## Environment Variables

### Worker

- `PORT` - HTTP port for the worker service.
- `DISCORD_WEBHOOK_URL` - webhook target for operations alerts.
- `RUSTPLUS_SERVER_IP` - Rust server IP.
- `RUSTPLUS_APP_PORT` - Rust+ companion app port.
- `RUSTPLUS_PLAYER_ID` - player Steam ID used for Rust+ auth.
- `RUSTPLUS_PLAYER_TOKEN` - Rust+ player token.
- `RUSTPLUS_SMALL_OIL_ENTITY_ID` - Smart Alarm entity for Small Oil.
- `RUSTPLUS_LARGE_OIL_ENTITY_ID` - Smart Alarm entity for Large Oil.

### Web

- `VITE_DRUST_API_URL` - base URL of the worker API.

## Railway Deployment

Deploy as separate Railway services from the same monorepo:

### Web Service

- Root directory: repository root
- Build command: `npm --workspace @drust/web run build`
- Start command: `npm --workspace @drust/web run start`

The web service serves the built `apps/web/dist` output through `apps/web/server.mjs`, which makes it suitable for Railway production startup.

### Worker Service

- Root directory: repository root
- Build command: `npm --workspace @drust/worker run build`
- Start command: `npm --workspace @drust/worker run start`

## Project Docs

These docs should stay aligned with implementation:

- `docs/PRODUCT.md`
- `docs/product-spec.md`
- `docs/development-phases.md`
- `docs/raw-data.md`
