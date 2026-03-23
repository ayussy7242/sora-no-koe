# Sora-no-koe Astronomical SSOT (Single Source of Truth)

This document defines the single-source-of-truth (SSOT) for astronomical
calculations and sign/house determination in sora-no-koe. The goal is to keep
all channels consistent by centralizing truth in shared computation layers and
limiting renderers to presentation only.

## Summary (Current Truth)
- Zodiac: Tropical (no sidereal flags or sidereal mode is used)
- Ephemeris: Swiss Ephemeris (swisseph)
- Coordinates: Geocentric (no heliocentric/barycentric flags)
- Natal houses: Placidus by default (configurable via env)
- Node: Mean node preferred (natal), with true/mean fallback in a renderer-only fill path
- Sign判定: `Math.floor(norm360(lonDeg) / 30)`
- Sign判定の入力: **rounded longitude** (current behavior)

## Truth Sources (Authoritative)
- **Transit truth = `story`**
  - Computed by story pipeline and shared across channels.
- **Natal truth = `natal_cache`**
  - Computed by worker job and shared across channels.

Renderers must not re-compute or alter astronomical truth. They should only
format/present already-computed values.

## Transit (Story) Pipeline
### Where
- `src/usecases/story/story_transits.js`
- `src/usecases/story/story_signs.js`

### How
1. Compute raw longitude via `swe_calc_ut(...)`.
2. Round longitude to `precisionDeg` (default `0.01`).
3. Determine sign by `Math.floor(norm360(lonDeg) / 30)` using the **rounded** longitude.

### Key Code References
- `src/usecases/story/story_transits.js`
  - `lonFixed = toFixedPrecision(lon, precisionDeg)`
  - `signFromLon(lonFixed)`
- `src/usecases/story/story_signs.js`
  - `Math.floor(norm360(lonDeg) / 30)`

## Natal Pipeline
### Where
- `src/runners/jobs/worker.js` (compute + store in `natal_cache`)
- `src/presenters/channels/line/natal_list.js` (display only)

### How
1. Compute raw longitude via `swe_calc_ut(...)`.
2. Round longitude to `precisionDeg` (default `0.01`).
3. Store rounded longitude in `natal_cache`.
4. Renderers derive sign from stored longitude using `Math.floor(lon/30)`.

### Key Code References
- `src/runners/jobs/worker.js`
  - `bodies[name] = toFixedPrecision(norm360(lon1), precisionDeg)`
  - `const HOUSE_SYSTEM = String(env2.NATAL_HOUSE_SYSTEM || "P")`
- `src/presenters/channels/line/natal_list.js`
  - `const signIndex = Math.floor(lon / 30)`

## Zodiac Mode (Tropical vs Sidereal)
### Current Behavior
- No `SEFLG_SIDEREAL` flag is set.
- No `swe_set_sid_mode(...)` is used.
Therefore zodiac is **tropical**.

## Ephemeris
### Current Behavior
Swiss Ephemeris via `swisseph` bindings.
- Default ephemeris path resolution:
  - `SWISSEPH_EPH_PATH` (env) if set
  - `node_modules/swisseph/ephe` if present
  - `./ephe` (project root)

## Coordinates (Geocentric/Heliocentric)
### Current Behavior
- No `SEFLG_HELIOCTR` / `SEFLG_BARYCTR` flags are used.
Therefore coordinates are **geocentric**.

## Node (True/Mean)
### Current Behavior
- Natal compute prefers **mean node**:
  - `north_node: sweConst("mean_node") ?? sweConst("true_node") ...`
- Renderer-only fill (if natal_cache missing nodes) prefers **true node** first.

## House System
### Current Behavior
- Natal house system defaults to **Placidus** (`"P"`), set by:
  - `NATAL_HOUSE_SYSTEM` env (default `"P"`)
- `swe_houses(...)` uses the above house system for natal.

### Additional Note
There is a separate Tokyo ASC calculation using Whole Sign (`"W"`) in
`src/domain/astro_compute.js`. This is **not** the natal house system.

## Time Handling
- All calculations use **UTC** with `swe_julday(...)`.
- Input local time is converted to UTC before calling Swiss Ephemeris.

## Known Risk: Boundary Rounding
Current sign determination is based on **rounded** longitude. Near sign
boundaries (e.g., 29.995°), rounding can change the sign.

### Recommended Future Policy (Design Note)
- Prefer **raw longitude** for sign判定.
- Keep rounded values for display only.
- Maintain SSOT: transit truth in `story`, natal truth in `natal_cache`.
- Renderers must never recompute or reclassify sign/house.
