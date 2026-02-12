// index.js — BOOTSTRAP ONLY (Unified STABLE v2026.01)
// ✅ Dict-First Renderer (no legacy label-map fallback)
// ✅ Single DI entrypoint for Cloud Run / Functions Framework
"use strict";

/**
 * Role:
 * - Cloud Run / Functions Framework entrypoint
 * - Dependency Injection
 * - No Express logic here
 */

const path = require("path");
require("dotenv").config({
  path: path.join(__dirname, ".env"),
});

const functions = require("@google-cloud/functions-framework");
const { createApp } = require("./app");

// -------------------- Config --------------------
const env = require("./config/env");
const { swisseph, swisseph_setup } = require("./config/swisseph");

// Firebase (single init point)
const fb = require("./config/firebase"); // { admin, getDb }
const db = fb.getDb();

// -------------------- Dict (single entry / source-of-truth) --------------------
const dict = require("./dict");

// -------------------- Geo --------------------
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

// -------------------- Engine --------------------
const { createStoryService } = require("./engine/story");
const { createRenderers } = require("./engine/render");
const { buildResonanceBullets } = require("./engine/resonance");

// -------------------- Helpers (minimal / for storyService) --------------------
// aspects list (major) — keep stable fallback for safety
const ASPECTS_V1 = dict?.ASPECTS_V1 || null;

const ASPECTS =
  ASPECTS_V1?.major_list || [
    { type: "conjunction", deg: 0 },
    { type: "sextile", deg: 60 },
    { type: "square", deg: 90 },
    { type: "trine", deg: 120 },
    { type: "opposition", deg: 180 },
  ];

// deep aspects（見つかった日だけ出る）
const deep = ASPECTS_V1?.deep_space || {};
const ASPECTS_DEEP = [
  deep?.quincunx_150,
  deep?.quintile_72,
  deep?.biquintile_144,
  deep?.semi_sextile_30,
  deep?.semi_square_45,
  deep?.sesqui_square_135,
]
  .filter(Boolean)
  .map((a) => ({ type: a.key, deg: a.deg }));

// -------------------- storyService --------------------
const storyService = createStoryService({
  db,
  admin: fb.admin,
  swisseph,

  // story側が必要とする dict pieces
  SIGNS_V1: dict?.SIGNS_V1,
  ASPECTS,
  ASPECTS_DEEP,

  DEFAULT_TZ: env.DEFAULT_TZ,
  PROJECT: env.PROJECT,
  SCHEMA_VERSION: env.SCHEMA_VERSION,

  buildResonanceBullets,
});

// -------------------- renderers (DICT FIRST / NO LEGACY FALLBACK) --------------------
const renderers = createRenderers({ dict });

// ---- tiny boot log (helps confirm “dict is actually used”) ----
// ※うるさくしたくないので最小限。必要なら後で env でON/OFFできる。
if (process.env.DEBUG_BOOT === "1") {
  const keys = dict ? Object.keys(dict) : [];
  console.log("[BOOT] dict keys:", keys);
  console.log("[BOOT] has ASPECTS_V1:", !!dict?.ASPECTS_V1);
  console.log("[BOOT] has PLANETS_V1:", !!dict?.PLANETS_V1);
  console.log("[BOOT] has SIGNS_V1:", !!dict?.SIGNS_V1);
}

// -------------------- create app with deps --------------------
const deps = {
  env,
  db,
  admin: fb.admin,
  swisseph,
  swisseph_setup,
  storyService,
  renderers,
  geocoder,
  dict, // ←必要なら routes/debug で参照できる
};

const app = createApp(deps);
app.locals.deps = deps;

// -------------------- Functions Framework --------------------
functions.http("app", app);
