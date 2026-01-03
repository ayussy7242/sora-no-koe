"use strict";

/**
 * env.js (OPTIMIZED / COMPAT)
 * - 環境変数の一元管理（関所）
 * - 本番/開発/ローカル/cron/LINE/Geo をここで吸収
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
  if (v === undefined || v === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}

function numEnv(key, defaultValue) {
  const v = process.env[key];
  if (v === undefined || v === "") return defaultValue;
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

// Cloud Run meta
const K_SERVICE = process.env.K_SERVICE || null;
const K_REVISION = process.env.K_REVISION || null;
const K_REGION = process.env.K_REGION || null;

// --------------------
// Firestore / Firebase
// --------------------
const FIRESTORE_DATABASE_ID = getEnv("FIRESTORE_DATABASE_ID", {
  defaultValue: "sora-no-koe-db",
});

// --------------------
// Swiss Ephemeris
// --------------------
const SWISSEPH_PATH = getEnv("SWISSEPH_PATH", {
  defaultValue: "/usr/share/swisseph",
});

// --------------------
// precision / astrology
// --------------------
// 互換：line.js は PRECISION_DEG / ORB_MAX_DEG を見てる
const DEFAULT_PRECISION_DEG = numEnv("PRECISION_DEG", 0.01);
const DEFAULT_ORB_DEG = numEnv("ORB_DEG", 6);

const PRECISION_DEG = numEnv("PRECISION_DEG", DEFAULT_PRECISION_DEG);
const ORB_MAX_DEG = numEnv("ORB_MAX_DEG", DEFAULT_ORB_DEG);

// --------------------
// LINE Messaging API
// --------------------
// ✅ 方針：
// - 明示的に LINE_ENABLED を env で指定したらそれを優先
// - 指定が無ければ「secret/token が両方ある時だけ true」
// → ローカルで未設定でも起動できる（LINE webhook だけ無効）

const _LINE_ENABLED_ENV = process.env.LINE_ENABLED;
const _LINE_ENABLED =
  _LINE_ENABLED_ENV === undefined || _LINE_ENABLED_ENV === ""
    ? null
    : ["1", "true", "yes", "on"].includes(String(_LINE_ENABLED_ENV).toLowerCase());

const LINE_CHANNEL_SECRET = getEnv("LINE_CHANNEL_SECRET", { defaultValue: null });
const LINE_CHANNEL_ACCESS_TOKEN = getEnv("LINE_CHANNEL_ACCESS_TOKEN", { defaultValue: null });

const LINE_ENABLED =
  _LINE_ENABLED !== null
    ? _LINE_ENABLED
    : !!(LINE_CHANNEL_SECRET && LINE_CHANNEL_ACCESS_TOKEN);

// strict は任意
const LINE_WEBHOOK_STRICT = boolEnv("LINE_WEBHOOK_STRICT", false);

const BOT_NAME = getEnv("BOT_NAME", { defaultValue: null });
const LINE_ACCOUNT_NAME = getEnv("LINE_ACCOUNT_NAME", { defaultValue: null });

const OWNER_LINE_USER_ID = getEnv("OWNER_LINE_USER_ID", { defaultValue: null });
const MAX_LINE_TEXT = numEnv("MAX_LINE_TEXT", 4800);


//Profile
const OWNER_APP_USER_ID = getEnv("OWNER_APP_USER_ID", { defaultValue: null });

// --------------------
// Google Maps / Geocoding
// --------------------
const GOOGLE_MAPS_API_KEY = getEnv("GOOGLE_MAPS_API_KEY", { defaultValue: null });

const GEO_CACHE_COLLECTION = getEnv("GEO_CACHE_COLLECTION", { defaultValue: "geo_cache" });
const GEO_CACHE_TTL_DAYS = numEnv("GEO_CACHE_TTL_DAYS", 180);
const GEO_DEFAULT_LANGUAGE = getEnv("GEO_DEFAULT_LANGUAGE", { defaultValue: "ja" });
const GEO_DEFAULT_REGION = getEnv("GEO_DEFAULT_REGION", { defaultValue: "jp" });

// --------------------
// cron / batch
// --------------------
const CRON_TOKEN = getEnv("CRON_TOKEN", {
  defaultValue: "sora-no-koe-daily-2025",
});

// --------------------
// debug / ops
// --------------------
const DEBUG_TOKEN = getEnv("DEBUG_TOKEN", { defaultValue: null });
const HEALTH_DB_PING = boolEnv("HEALTH_DB_PING", false);

// --------------------
// feature flags
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

  // astrology defaults & compat
  DEFAULT_PRECISION_DEG,
  DEFAULT_ORB_DEG,
  PRECISION_DEG,
  ORB_MAX_DEG,

  // LINE
  LINE_ENABLED,
  LINE_CHANNEL_SECRET,
  LINE_CHANNEL_ACCESS_TOKEN,
  LINE_WEBHOOK_STRICT,
  BOT_NAME,
  LINE_ACCOUNT_NAME,
  OWNER_LINE_USER_ID,
  MAX_LINE_TEXT,

  //Profile
  OWNER_APP_USER_ID,

  // Google Maps / Geo
  GOOGLE_MAPS_API_KEY,
  GEO_CACHE_COLLECTION,
  GEO_CACHE_TTL_DAYS,
  GEO_DEFAULT_LANGUAGE,
  GEO_DEFAULT_REGION,

  // cron
  CRON_TOKEN,

  // debug / ops
  DEBUG_TOKEN,
  HEALTH_DB_PING,

  // feature flags
  FEATURES,
};
