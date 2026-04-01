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
- `src/usecases/story/transits.js`
- `src/usecases/story/signs.js`

### How
1. Compute raw longitude via `swe_calc_ut(...)`.
2. Round longitude to `precisionDeg` (default `0.01`).
3. Determine sign by `Math.floor(norm360(lonDeg) / 30)` using the **rounded** longitude.

### Key Code References
- `src/usecases/story/transits.js`
  - `lonFixed = toFixedPrecision(lon, precisionDeg)`
  - `signFromLon(lonFixed)`
- `src/usecases/story/signs.js`
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
`src/domain/astro/compute.js`. This is **not** the natal house system.

## Time Handling
- All calculations use **UTC** with `swe_julday(...)`.
- Input local time is converted to UTC before calling Swiss Ephemeris.

## Aspect Proximity SSOT (Applying/Separating/Windows)
### Purpose
Keep all channels consistent by centralizing aspect proximity logic in domain
code and limiting channels to condition-only configuration.

### Roles
- Logic SSOT: `src/domain/aspect/proximity.js`
  - orb calculation
  - applying/separating判定
  - peak補正
  - window探索（短期/長期/時間窓）
- Condition SSOT: `src/config/aspect_channel_config.js`
  - orbLimit
  - maxItems
  - preferApplying
  - fallbackOutsideOrb
  - requireSign / signOrder
  - horizonHours / windowDays / peakWindowMs / peakStepMs
  - deep含有や無料/有料差分などのproduct rule

### Prohibited (Do Not Reintroduce)
- チャンネル側で orb計算を実装しない
- チャンネル側で applying/separating 判定を実装しない
- product rule をロジック分岐で持たない

### Extension Rules
- 新チャンネル追加時は **まず config を作る**
- 条件追加は **config 優先**。必要なら最後に `aspect/proximity.js` を拡張

### Current Adoption (as of this doc)
- `src/presenters/line/sora.js`
- `src/presenters/line/today.js`
- `src/usecases/channels/line/paid_blocks.js`
- `src/presenters/x/thread.js`
- `src/usecases/channels/blog/blog_daily.js`
- `src/domain/tsukiji/public.js`

## Known Risk: Boundary Rounding
Current sign determination is based on **rounded** longitude. Near sign
boundaries (e.g., 29.995°), rounding can change the sign.

### Recommended Future Policy (Design Note)
- Prefer **raw longitude** for sign判定.
- Keep rounded values for display only.
- Maintain SSOT: transit truth in `story`, natal truth in `natal_cache`.
- Renderers must never recompute or reclassify sign/house.
