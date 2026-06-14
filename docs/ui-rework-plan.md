# UI Rework Plan — Art Assets

> Generated: 2026-06-14
> Design direction derived from `PRODUCT.md` and visual critique of the current web dashboard.

---

## Design Direction

Per `PRODUCT.md`, Drust should feel **tactical, fast, reliable** — not flashy, not playful.

### Color Strategy: Committed

Amber accent (`#d9a35f`) carries 30–50% of the visual authority; deep teal-black (`#081015` → `#15242d`) carries the rest.

### Scene Sentence

> A squad lead at 2 AM, headset on, alt-tabbed to a glowing dashboard while the oil rig countdown ticks. The room is dark. Every pixel earns its place.

Forces: dark theme, high contrast, information density, zero decoration that doesn't carry signal.

### Anchor References

| Reference | Why |
|-----------|-----|
| **Frostpunk UI** | Industrial amber-on-black, information-dense panels, utilitarian typography |
| **Rainbow Six Siege (operator selection)** | Clean dark cards with characterful inset elements, tight data presentation |
| **NASA mission control displays** | Monospaced data readouts, grid-aligned telemetry, status-as-color |

---

## Complete Asset Inventory

All assets grouped by role. Each entry describes purpose, visual style, format, and dimensions.

---

### 1. Brand Assets

| Asset | Description | Format | Size | Notes |
|-------|-------------|--------|------|-------|
| **Drust wordmark** | Bold, condensed, all-caps "DRUST" in amber (`#d9a35f`) with a subtle tactical edge — stenciled military crate lettering. Horizontal lockup for the sidebar brand block. | SVG | ~200×48px | Replace current "Drust command" kicker + h1 text block |
| **Favicon** | Simplified Drust "D" — angular monogram that reads at 16×16. Shield/glyph shape with a diagonal slash. | SVG | 32×32, 16×16 | Already an SVG favicon exists; replace with branded mark |
| **Loading splash** | Full-screen dark canvas with the Drust wordmark centered and a thin amber loading bar sweeping left-to-right. Appears while the dashboard fetches its first snapshot. | CSS + SVG | Full viewport | Replace current instant blank flash |

**Visual style:** Stencil/military lettering. Think Metro Exodus title cards. Single amber on matte black.

---

### 2. Map & Terrain Assets

| Asset | Description | Format | Size | Notes |
|-------|-------------|--------|------|-------|
| **Map tile background** | Procedurally-styled SVG of Procgen island — not a real Rust map, but a stylized "tactical grid" overlay with landmass silhouettes in muted teal (`#1d313c`) against the dark panel bg. Low-detail, atmospheric. Rendered once, cached. | SVG (generated) | 100% of map panel | Replace current empty grid+water gradient |
| **Grid overlay** | A subtle hexagonal grid (not square) that says "tactical map" at a glance. Opacity 0.04, white. | CSS `background` | Repeating | Replace current square grid |

**Visual style:** Minimal tactical map — land as flat silhouette, water as negative space, no contour detail.

---

### 3. Map Marker Assets

| Asset | Description | Format | Size | Notes |
|-------|-------------|--------|------|-------|
| **Monument icon — Small Oil** | Small oil-rig silhouette: square platform with 4 thin legs, isometric/side view. Amber outline, 20% fill. | SVG | 32×32 | Replace current text-labeled dot |
| **Monument icon — Large Oil** | Same visual language, taller — two platforms connected by a walkway. Amber outline. | SVG | 32×32 | Replace current text-labeled dot |
| **Monument icon — Cargo Ship** | Ship silhouette: hull, bridge, smokestack. Distinct from rigs. Amber outline. | SVG | 32×32 | Replace current text-labeled dot |
| **Team member marker** | Filled circle with a thin ring. Green (`#6dc6a2`) when alive, gray (`#728793`) when dead. Pulsing ring when moving. | SVG + CSS animation | 16×16 | Replace current pill-shaped label |
| **Generic marker pin** | Diamond or chevron (military map marker) for CH47, Patrol Heli, locked crate. Color-coded by type. | SVG | 20×20 | Replace current text-labeled dot |
| **CH47 marker** | Helicopter silhouette, forward-facing, distinct rotors. Amber outline with alert-tint fill. | SVG | 24×24 | New — currently just text |
| **Patrol Heli marker** | Helicopter silhouette, side profile with gun mounts. Red-outlined (`#ef8d74`). | SVG | 24×24 | New — currently just text |

**Visual style:** 1.5px monochrome outlines, filled at low opacity. Military map symbology (NATO APP-6A simplified).

---

### 4. Operation & Timer Assets

| Asset | Description | Format | Size | Notes |
|-------|-------------|--------|------|-------|
| **Timer ring (radial countdown)** | Circular SVG ring that depletes clockwise as countdown runs. Amber 4px stroke on dark track. Transitions to red at ≤2 min. Central numeric readout in IBM Plex Mono. | SVG + React | 180×180 | Replace current flat text timer |
| **Operation hero — Small Oil** | Isometric/top-down SVG illustration of a small oil rig platform. Muted dark teal fill, amber accent lines. Used in hero panel when operation is active. | SVG | ~120×120 inline | Replace current text-only hero |
| **Operation hero — Large Oil** | Large oil rig illustration in same style — two platforms with connecting walkway. | SVG | ~120×120 inline | New asset |
| **Operation hero — Cargo** | Cargo ship side-profile illustration. | SVG | ~120×120 inline | New asset |
| **Idle state — radar sweep** | Subtle CSS/SVG animated radar arc sweeping across a dark circle when idle. Low opacity (0.06). Reads as "listening." | CSS + SVG | 180×180 | Visual "watching" state instead of text |

**Visual style:** Industrial, schematic. Think *Alien* motion tracker or submarine sonar. Amber on black.

---

### 5. UI Ornament Assets

| Asset | Description | Format | Size | Notes |
|-------|-------------|--------|------|-------|
| **Scan-line overlay** | Very subtle horizontal scan lines, 2px spacing, opacity 0.03, over the main dashboard area. CRT/display texture without distraction. | CSS `repeating-linear-gradient` | Full panel | Replace current grid background on sidebar |
| **Corner bracket decoration** | Thin L-shaped brackets at corners of hero panel and status bar. Amber at 0.12 opacity. Reads as "tactical display frame." | CSS `::before` / `::after` | ~20×20 per corner | New restrained decorative element |
| **Status glow** | Soft radial glow behind status indicators. Connected → subtle green glow. Disconnected → no glow. Applied to Rust+/Discord status chips. | CSS `box-shadow` | Matches chip | Replace current flat status chips |
| **Loading spinner** | Three thin amber dots that animate in sequence (staggered opacity). Minimal. | CSS | 48×12 | Replace "Syncing..." text |
| **Empty state — radar noise** | Small static-noise visual (SVG filter or canvas) with a single line of microcopy. Says "awaiting signal" rather than "nothing here." | CSS + SVG | ~80×60 inline | Replace current text-only `EmptyState` |

**Visual style:** CRT terminal / military display. The interface should feel like a piece of equipment, not a website.

---

### 6. Icon Set

| Asset | Description | Format | Size | Notes |
|-------|-------------|--------|------|-------|
| **Connection status icons** | Three states: connected (filled green circle), degraded (amber triangle), disconnected (red x in circle). 1.5px stroke. | SVG | 12×12 | Replace text "connected"/"disconnected" |
| **Alarm trigger icon** | Lightning bolt or signal-wave icon. Amber. Used on alarm cards that have been triggered. | SVG | 16×16 | Replace current `isHot` boolean logic |
| **Role/checklist icons** | Person silhouette for roles, checkmark for done items. 1.5px stroke. | SVG | 16×16 | Add to current text-only rows |
| **Nav icons** | One per nav section: Overview (eye/target crosshair), Map (map pin/grid), Config (gear/settings). Amber active, muted inactive. | SVG | 18×18 | Add to nav items alongside text |
| **Close/Cancel icon** | X-in-circle for cancel operation. Red (`#ef8d74`). | SVG | 20×20 | Use inside cancel button |

**Visual style:** 1.5px consistent stroke weight, rounded caps, monochrome per state. Recognizable at 16px.

---

### 7. Background & Atmosphere Assets

| Asset | Description | Format | Size | Notes |
|-------|-------------|--------|------|-------|
| **Ambient grain texture** | Very subtle film-grain noise over the entire app shell. Opacity 0.015. Matte texture for dark surfaces. | CSS `@keyframes` + SVG filter | Full screen | Replace current gradient-only bg |
| **Radial accent glow** | Hero panel amber glow refined to feel more purposeful — tie glow direction to active operation target. | CSS | 220×220 | Refine existing element |
| **Sidebar terminal tick** | Subtle amber vertical line that "breathes" (opacity 0.3→0.1→0.3 over 4s) on the left edge of the sidebar. "System active" heartbeat. | CSS animation | 2px wide, full height | New atmosphere element |

---

## Implementation Phasing

### Phase 1 — Icon Set + Map Markers
**Effort: ~half a day** | All 16–32px SVG icons and map markers. Highest-leverage assets — they replace text labels and reduce cognitive load at a glance.

### Phase 2 — Timer Ring + Operation Heroes
**Effort: ~half a day** | Radial countdown ring and three operation hero illustrations. Centerpiece of the Overview page — makes the timer feel urgent and the operation feel real.

### Phase 3 — Brand + UI Ornaments
**Effort: ~half a day** | Wordmark, favicon, loading splash, scan lines, corner brackets, status glow, ambient grain. Refines atmosphere without changing layout.

### Phase 4 — Map Tile + Empty States
**Effort: ~half a day** | Stylized island map background and empty-state radar-noise treatments. Fixes the two weakest visual states of the current UI.

### Phase 5 — Polish Pass
**Effort: varies** | Loading spinners, hover states on map markers, tooltips on icons, reduced-motion alternatives, focus indicators.

---

## Open Questions

1. **SVG vs. raster?** Plan assumes all assets are pure SVG (scalable, themable, inline-able, zero external requests). Are there any existing assets (logo, concept art, screenshots) to incorporate?

2. **Map tile accuracy?** Plan proposes a *stylized* procedural island, not the actual Rust seed map. Real seed maps can be fetched via `getMap()` but are large images. Preference: real seed-map integration (needs caching) or stylized stand-in?

3. **Custom vs. library icons?** Hand-crafted custom SVGs (distinctive, on-brand) vs. a library like Phosphor/Lucide (faster, proven quality). Plan assumes custom — confirm or override?

4. **Priority?** Implement all assets end-to-end, or start with a subset (e.g., map markers + timer ring) and iterate?
