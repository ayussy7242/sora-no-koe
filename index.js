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
  RESONANCE_V1,
  SIGNS_V1,
  HOUSES_V1,
  ELEMENTS_V1,
  MODALITIES_V1,
  ORB_RULES_V1,
  TONE_VARIANTS_V1,
} = require("./dict");

// --------------------
// Engine DI helpers
// --------------------

// aspects (major only for now)
const ASPECTS = ASPECTS_V1?.major_list || [
  { type: "conjunction", deg: 0 },
  { type: "sextile", deg: 60 },
  { type: "square", deg: 90 },
  { type: "trine", deg: 120 },
  { type: "opposition", deg: 180 },
];

// body labels (ja)
const BODY_JA = Object.fromEntries(
  Object.entries(PLANETS_V1?.bodies || {}).map(([k, v]) => [k, v?.label_ja || k])
);

// point labels (ja)
// POINTS_V1.points: { ASC:{label_ja}, MC:{...}, ... } を想定
const POINT_JA = Object.fromEntries(
  Object.entries(POINTS_V1?.points || {}).map(([k, v]) => [k, v?.label_ja || k])
);

// aspect labels (ja short)
const ASPECT_JA = {
  conjunction: "合",
  sextile: "六",
  square: "四",
  trine: "三",
  opposition: "対",
};

// signs list (ja)
// SIGNS_V1.order を優先。なければ list / items / labels_ja から推測。
const SIGNS_JA = (() => {
  if (Array.isArray(SIGNS_V1?.order)) return SIGNS_V1.order;
  if (Array.isArray(SIGNS_V1?.list)) return SIGNS_V1.list;
  if (Array.isArray(SIGNS_V1?.labels_ja)) return SIGNS_V1.labels_ja;
  if (SIGNS_V1?.signs && typeof SIGNS_V1.signs === "object") {
    // { Aries:{label_ja:"牡羊座"} ... } みたいな形
    const maybe = Object.values(SIGNS_V1.signs)
      .map((x) => x?.label_ja)
      .filter(Boolean);
    if (maybe.length) return maybe;
  }
  // last resort: empty
  return [];
})();

// --------------------
// storyService
// --------------------
const storyService = createStoryService({
  db,
  admin: fb.admin,
  swisseph,
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
  BODY_JA,
  POINT_JA,
  ASPECT_JA,
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

  // optional: expose dictionaries to handlers if needed later
  // dict: { ASPECTS_V1, PLANETS_V1, POINTS_V1, RESONANCE_V1, SIGNS_V1, HOUSES_V1, ELEMENTS_V1, MODALITIES_V1, ORB_RULES_V1, TONE_VARIANTS_V1 }
};

const app = createApp(deps);

// --------------------
// Functions Framework
// --------------------
functions.http("app", app);
