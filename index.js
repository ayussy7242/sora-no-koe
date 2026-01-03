/**
 * 🌌 sora-no-koe — index.js (BOOTSTRAP ONLY)
 *
 * Role:
 * - Cloud Run / Functions Framework entrypoint
 * - Dependency Injection
 * - No Express logic here
 */
"use strict";

const functions = require("@google-cloud/functions-framework");
const { createApp } = require("./app");

// --------------------
// Config
// --------------------
const env = require("./config/env");
const { swisseph, swisseph_setup } = require("./config/swisseph");

// Firebase (single init point)
const fb = require("./config/firebase"); // { admin, getDb }
const db = fb.getDb();

// --------------------
// Geo (✅ ADD)
// --------------------
const { createGeocoder } = require("./engine/geocode");
const geocoder = createGeocoder({
  apiKey: env.GOOGLE_MAPS_API_KEY,
  db,
  project: env.PROJECT,
  cacheCollection: env.GEO_CACHE_COLLECTION || "geo_cache",
  cacheTtlDays: Number(env.GEO_CACHE_TTL_DAYS || 180),
  defaultLanguage: env.GEO_DEFAULT_LANGUAGE || "ja",
  defaultRegion: env.GEO_DEFAULT_REGION || "jp",
  strict: false,
});


// --------------------
// Engine
// --------------------
const { createStoryService } = require("./engine/story");
const { createRenderers } = require("./engine/render");
const { buildResonanceBullets } = require("./engine/resonance");

// --------------------
// Dict (single entry)
// --------------------
const {
  ASPECTS_V1,
  PLANETS_V1,
  POINTS_V1,
  SIGNS_V1,
  ORB_RULES_V1,

  // optional (future use)
  HOUSES_V1,
  ELEMENTS_V1,
  MODALITIES_V1,
  TONE_VARIANTS_V1,
  RESONANCE_V1,
} = require("./dict");

// --------------------
// Helpers (stable, minimal, compatibility only)
// --------------------

// aspects list (major)
const ASPECTS = ASPECTS_V1?.major_list || [
  { type: "conjunction", deg: 0 },
  { type: "sextile", deg: 60 },
  { type: "square", deg: 90 },
  { type: "trine", deg: 120 },
  { type: "opposition", deg: 180 },
];

// ✅ legacy label maps (renderer互換用 / 旧参照が残っても落ちないため)
// ※ 最新 render は dictの V1 を直接参照するので、ここは “保険”
const bodies = PLANETS_V1?.bodies || {};
const points = POINTS_V1?.points || {};
const major = ASPECTS_V1?.major || {};

// points優先衝突回避
const POINT_KEYS = new Set(Object.keys(points));

const BODY_JA = Object.fromEntries(
  Object.entries(bodies)
    .filter(([k]) => !POINT_KEYS.has(k))
    .map(([k, v]) => [k, v?.label_ja || k])
);

const POINT_JA = Object.fromEntries(
  Object.entries(points).map(([k, v]) => [k, v?.label_ja || k])
);

const ASPECT_JA = Object.fromEntries(
  Object.entries(major).map(([k, v]) => [k, v?.label_ja || k])
);

// --------------------
// storyService
// --------------------
const storyService = createStoryService({
  db,
  admin: fb.admin,
  swisseph,

  // ✅ story 側は SIGNS_V1 を使う（moon sign_key/sign_ja）
  SIGNS_V1,
  ASPECTS,

  DEFAULT_TZ: env.DEFAULT_TZ,
  PROJECT: env.PROJECT,
  SCHEMA_VERSION: env.SCHEMA_VERSION,

  buildResonanceBullets,
});

// --------------------
// renderers
// --------------------
const renderers = createRenderers({
  // 互換マップ（保険）
  BODY_JA,
  POINT_JA,
  ASPECT_JA,

  // ✅ render最新版は V1原本を直接参照する（最強に安定）
  dict: {
    ASPECTS_V1,
    PLANETS_V1,
    POINTS_V1,
    SIGNS_V1,

    // optional（今すぐ使わなくてもOK：将来拡張用）
    ORB_RULES_V1,
    HOUSES_V1,
    ELEMENTS_V1,
    MODALITIES_V1,
    TONE_VARIANTS_V1,
    RESONANCE_V1,
  },
});

// --------------------
// create app with deps
// --------------------
const deps = {
  env,
  db,
  admin: fb.admin,
  swisseph,
  swisseph_setup,
  storyService,
  renderers,
  geocoder,
};

const app = createApp(deps);
app.locals.deps = deps;

// --------------------
// Functions Framework
// --------------------
functions.http("app", app);
