"use strict";

/**
 * env.js
 * - 環境変数の一元管理
 * - process.env 直読みを禁止するための「関所」
 * - 本番 / 開発 / ローカル / cron / LINE すべてここで吸収
 */

// --------------------
// helpers
// --------------------
function getEnv(key, { required = false, defaultValue = undefined } = {}) {
  const v = process.env[key];

  if ((v === undefined || v === "") && required) {
    throw new Error(`[env] Missing required env: ${key}`);
  }
  return v !== undefined && v !== "" ? v : defaultValue;
}

function boolEnv(key, defaultValue = false) {
  const v = process.env[key];
  if (v === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}

function numEnv(key, defaultValue) {
  const v = process.env[key];
  if (v === undefined) return defaultValue;
  const n = Number(v);
  return Number.isFinite(n) ? n : defaultValue;
}

// --------------------
// core project
// --------------------
const PROJECT = getEnv("PROJECT", { defaultValue: "sora-no-koe" });
const SCHEMA_VERSION = getEnv("SCHEMA_VERSION", { defaultValue: "1.0.0" });

const DEFAULT_TZ = getEnv("DEFAULT_TZ", { defaultValue: "Asia/Tokyo" });
const NODE_ENV = getEnv("NODE_ENV", { defaultValue: "development" });

// --------------------
// runtime / server
// --------------------
const PORT = numEnv("PORT", 8080);

// Cloud Run 系（存在すれば拾う）
const K_SERVICE = process.env.K_SERVICE || null;
const K_REVISION = process.env.K_REVISION || null;
const K_REGION = process.env.K_REGION || null;

// --------------------
// Firestore / Firebase
// --------------------
/**
 * firebase-admin は Application Default Credentials 前提
 * databaseId だけ env で切り替える
 */
const FIRESTORE_DATABASE_ID = getEnv("FIRESTORE_DATABASE_ID", {
  defaultValue: "sora-no-koe-db",
});

// --------------------
// Swiss Ephemeris
// --------------------
/**
 * swisseph data path
 * Cloud Run では container に bake されてる想定
 */
const SWISSEPH_PATH = getEnv("SWISSEPH_PATH", {
  defaultValue: "/usr/share/swisseph",
});

// --------------------
// precision / astrology
// --------------------
const DEFAULT_PRECISION_DEG = numEnv("PRECISION_DEG", 0.01);
const DEFAULT_ORB_DEG = numEnv("ORB_DEG", 6);

// --------------------
// LINE Messaging API
// --------------------
const LINE_CHANNEL_SECRET = getEnv("LINE_CHANNEL_SECRET", {
  required: boolEnv("LINE_ENABLED", false),
});

const LINE_CHANNEL_ACCESS_TOKEN = getEnv("LINE_CHANNEL_ACCESS_TOKEN", {
  required: boolEnv("LINE_ENABLED", false),
});

const LINE_ENABLED = boolEnv("LINE_ENABLED", false);

// --------------------
// cron / batch
// --------------------
/**
 * Cloud Scheduler → HTTP cron
 * header: x-cron-token
 */
const CRON_TOKEN = getEnv("CRON_TOKEN", {
  defaultValue: "sora-no-koe-daily-2025",
});

// --------------------
// debug / ops
// --------------------
const DEBUG_TOKEN = getEnv("DEBUG_TOKEN", {
  defaultValue: null,
});

const HEALTH_DB_PING = boolEnv("HEALTH_DB_PING", false);

// --------------------
// feature flags（将来拡張用）
// --------------------
const FEATURES = {
  PAID_DEEP_ASPECTS: boolEnv("FEATURE_PAID_DEEP_ASPECTS", false),
  AI_EXPANSION: boolEnv("FEATURE_AI_EXPANSION", false),
};

// --------------------
// export
// --------------------
module.exports = {
  // core
  PROJECT,
  SCHEMA_VERSION,
  NODE_ENV,
  DEFAULT_TZ,
  PORT,

  // cloud run meta
  K_SERVICE,
  K_REVISION,
  K_REGION,

  // firestore
  FIRESTORE_DATABASE_ID,

  // swiss ephemeris
  SWISSEPH_PATH,

  // astrology defaults
  DEFAULT_PRECISION_DEG,
  DEFAULT_ORB_DEG,

  // LINE
  LINE_ENABLED,
  LINE_CHANNEL_SECRET,
  LINE_CHANNEL_ACCESS_TOKEN,

  // cron
  CRON_TOKEN,

  // debug / ops
  DEBUG_TOKEN,
  HEALTH_DB_PING,

  // feature flags
  FEATURES,
};
