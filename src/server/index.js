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
  path: path.join(__dirname, "..", "..", ".env"),
});

const functions = require("@google-cloud/functions-framework");
const { createApp } = require("./app");

// -------------------- Config --------------------
const env = require("../config/env");
const { swisseph, swisseph_setup } = require("../config/swisseph");

// Firebase (single init point)
const fb = require("../integrations/firebase/firebase"); // { admin, getDb }
const db = fb.getDb();

// -------------------- Dict (single entry / source-of-truth) --------------------
const dict = require("../content/dict");

// -------------------- Geo --------------------
const { createGeocoder } = require("../integrations/geocode");
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
const { createStoryService } = require("../usecases/story/story");
const { createRenderers } = require("../presenters/render");
const { buildResonanceBullets } = require("../presenters/render/resonance");
const { Storage } = require("@google-cloud/storage");

// -------------------- Helpers (minimal / for storyService) --------------------
// aspects list (major) — V2 primary, stable fallback for safety
const ASPECTS_SRC = dict?.ASPECTS || dict?.ASPECTS_V2 || dict?.ASPECTS_V1 || null;

const buildAspectListFromGroup = (group) => {
  const out = [];
  for (const [k, v] of Object.entries(group || {})) {
    const deg = Number(v?.deg);
    if (!Number.isFinite(deg)) continue;
    out.push({ type: v?.key || k, deg });
  }
  return out;
};

const ASPECTS = (() => {
  const fromMajorList =
    Array.isArray(ASPECTS_SRC?.major_list) ?
      ASPECTS_SRC.major_list.filter((a) => Number.isFinite(Number(a?.deg))) :
      [];
  if (fromMajorList.length) return fromMajorList;

  const fromMajor = buildAspectListFromGroup(ASPECTS_SRC?.major);
  if (fromMajor.length) return fromMajor;

  return [
    { type: "conjunction", deg: 0 },
    { type: "sextile", deg: 60 },
    { type: "square", deg: 90 },
    { type: "trine", deg: 120 },
    { type: "opposition", deg: 180 },
  ];
})();

// deep aspects（見つかった日だけ出る / deg があるものだけ採用）
const ASPECTS_DEEP = buildAspectListFromGroup(ASPECTS_SRC?.deep_space);

// -------------------- storyService --------------------
let storyService = null;
try {
  if (!swisseph) throw new Error("swisseph unavailable");
  storyService = createStoryService({
    db,
    admin: fb.admin,
    swisseph,

    // story側が必要とする dict pieces
    SIGNS: dict?.SIGNS,
    ASPECTS,
    ASPECTS_DEEP,

    DEFAULT_TZ: env.DEFAULT_TZ,
    PROJECT: env.PROJECT,
    SCHEMA_VERSION: env.SCHEMA_VERSION,

    buildResonanceBullets,
  });
} catch (e) {
  console.error("[BOOT] storyService disabled:", e?.message || String(e));
  storyService = {
    buildStoryForUser: async () => {
      throw new Error("storyService unavailable");
    },
  };
}

// -------------------- renderers (DICT FIRST / NO LEGACY FALLBACK) --------------------
const renderers = createRenderers({ dict });

// -------------------- Storage (GCS) --------------------
const storage = new Storage();

// ---- tiny boot log (helps confirm “dict is actually used”) ----
// ※うるさくしたくないので最小限。必要なら後で env でON/OFFできる。
if (process.env.DEBUG_BOOT === "1") {
  const keys = dict ? Object.keys(dict) : [];
  console.log("[BOOT] dict keys:", keys);
  console.log("[BOOT] has ASPECTS_V2:", !!dict?.ASPECTS_V2);
  console.log("[BOOT] has PLANETS_V2:", !!dict?.PLANETS_V2);
  console.log("[BOOT] has SIGNS_V2:", !!dict?.SIGNS_V2);
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
  storage,
  dict, // ←必要なら routes/debug で参照できる
};

const app = createApp(deps);
app.locals.deps = deps;

// -------------------- Functions Framework --------------------
functions.http("app", app);
