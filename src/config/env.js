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

function listEnv(key, defaultValue = []) {
  const v = process.env[key];
  if (v === undefined || v === "") return defaultValue;
  return String(v)
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
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

const OWNER_LINE_USER_ID = getEnv("OWNER_LINE_USER_ID", { defaultValue: "Ue98386b8d7a0b3378317446114c18f16" });
const MAX_LINE_TEXT = numEnv("MAX_LINE_TEXT", 4800);
const IG_STORY_DELIVERY_LINE_USER_ID = getEnv("IG_STORY_DELIVERY_LINE_USER_ID", { defaultValue: null });
const LINE_ADD_FRIEND_URL = getEnv("LINE_ADD_FRIEND_URL", { defaultValue: "https://lin.ee/ZDjvxg8E" });


//Profile
const OWNER_APP_USER_ID = getEnv("OWNER_APP_USER_ID", { defaultValue: "null" });

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
// paid mode (LINE)
// --------------------
const PAID_MODE_ENABLED = boolEnv("PAID_MODE_ENABLED", false);
const PAID_INTENTS = listEnv("PAID_INTENTS", ["today_distribution"]);
const PAID_ALLOW_APP_USER_IDS = listEnv("PAID_ALLOW_APP_USER_IDS", []);
const PAID_ALLOW_LINE_USER_IDS = listEnv("PAID_ALLOW_LINE_USER_IDS", []);
const PAID_ALLOW_OWNER = boolEnv("PAID_ALLOW_OWNER", true);
const PLUS_ENABLED = boolEnv("PLUS_ENABLED", false);

//WORKER
const WORKER_PUSH_NATAL_RESULT = getEnv("WORKER_PUSH_NATAL_RESULT", { defaultValue: "0" });

// テスト用（任意）：特定のLINEだけに送る
const WORKER_PUSH_ONLY_LINE_USER_ID = getEnv("WORKER_PUSH_ONLY_LINE_USER_ID", { defaultValue: null });

// --------------------
// WordPress (BLOG)
// --------------------
const WP_BASE_URL = getEnv("WP_BASE_URL", { defaultValue: "https://sora-no-koe.jp" }); // e.g. https://sora-no-koe.jp
const WP_USER = getEnv("WP_USER", { defaultValue: "ayussy@tunagu-network.com" }); // wp user or email
const WP_APP_PASSWORD = getEnv("WP_APP_PASSWORD", { defaultValue: "hD1h hGAd d1gb EzQb YzTs BBz4" });
const WP_CATEGORY_DAILY = numEnv("WP_CATEGORY_DAILY", 10);
const WP_CATEGORY_SIGN = numEnv("WP_CATEGORY_SIGN", 7);
const WP_CATEGORY_PLANET = numEnv("WP_CATEGORY_PLANET", 5);
const WP_CATEGORY_ASPECT = numEnv("WP_CATEGORY_ASPECT", 9);

const BLOG_RECO_ENABLED = boolEnv("BLOG_RECO_ENABLED", true);
const BLOG_RECO_COUNT = numEnv("BLOG_RECO_COUNT", 3);
const BLOG_WHEEL_ENABLED = boolEnv("BLOG_WHEEL_ENABLED", true);
const BLOG_AIOSEO_ENABLED = boolEnv("BLOG_AIOSEO_ENABLED", false);
const BLOG_EYECATCH_ENABLED = boolEnv("BLOG_EYECATCH_ENABLED", false);
const BLOG_EYECATCH_BG_MODE = getEnv("BLOG_EYECATCH_BG_MODE", { defaultValue: "image" });
const BLOG_EYECATCH_FORCE = boolEnv("BLOG_EYECATCH_FORCE", false);
const BLOG_EYECATCH_BG_PATH = getEnv("BLOG_EYECATCH_BG_PATH", { defaultValue: null });
const BLOG_EYECATCH_PRESET = getEnv("BLOG_EYECATCH_PRESET", { defaultValue: "C" });
const BLOG_AUTO_PUBLISH = boolEnv("BLOG_AUTO_PUBLISH", false);
const BLOG_HIDE_AFTER_RESONANCE = boolEnv("BLOG_HIDE_AFTER_RESONANCE", false);

// --------------------
// OpenAI (BLOG generation)
// --------------------
const OPENAI_API_KEY = getEnv("OPENAI_API_KEY", { defaultValue: null });
const OPENAI_BASE_URL = getEnv("OPENAI_BASE_URL", { defaultValue: "https://api.openai.com/v1" });
const OPENAI_MODEL = getEnv("OPENAI_MODEL", { defaultValue: "gpt-4o" });
const OPENAI_MODEL_BLOG = getEnv("OPENAI_MODEL_BLOG", { defaultValue: "gpt-4o-mini" });
const OPENAI_MODEL_BLOG_PARTS = getEnv("OPENAI_MODEL_BLOG_PARTS", { defaultValue: "gpt-4o-mini" });
const BLOG_GEN_MODE = getEnv("BLOG_GEN_MODE", { defaultValue: "single" });
const OPENAI_MODEL_BLUEPRINT_LIGHT = getEnv("OPENAI_MODEL_BLUEPRINT_LIGHT", { defaultValue: null });

// --------------------
// Stripe / Payments
// --------------------
const STRIPE_SECRET_KEY = getEnv("STRIPE_SECRET_KEY", { defaultValue: null });
const STRIPE_WEBHOOK_SECRET = getEnv("STRIPE_WEBHOOK_SECRET", { defaultValue: null });
const STRIPE_PRICE_ID_LIGHT = getEnv("STRIPE_PRICE_ID_LIGHT", { defaultValue: "price_1T0Z9H8cjUNd2BbAACfXmsgg" });
const STRIPE_PRICE_ID_LINE_500 = getEnv("STRIPE_PRICE_ID_LINE_500", { defaultValue: null });
const STRIPE_PAYMENT_LINK_LIGHT = getEnv("STRIPE_PAYMENT_LINK_LIGHT", { defaultValue: null });
const STRIPE_SUCCESS_URL = getEnv("STRIPE_SUCCESS_URL", { defaultValue: "https://sora-no-koe.jp/thanks-light" });
const STRIPE_CANCEL_URL = getEnv("STRIPE_CANCEL_URL", { defaultValue: "https://sora-no-koe.jp/cancel" });
const SORA_PLUS_URL = getEnv("SORA_PLUS_URL", { defaultValue: null });

// --------------------
// Public URL / GCS
// --------------------
const PUBLIC_BASE_URL = getEnv("PUBLIC_BASE_URL", { defaultValue: null });
const GCS_BUCKET_BLUEPRINTS = getEnv("GCS_BUCKET_BLUEPRINTS", { defaultValue: "sora-no-koe-blueprints" });
const GCS_BUCKET_SORA = getEnv("GCS_BUCKET_SORA", { defaultValue: GCS_BUCKET_BLUEPRINTS });
const BLUEPRINT_URL_EXPIRES_DAYS = numEnv("BLUEPRINT_URL_EXPIRES_DAYS", 7);
const BLUEPRINT_BG_REGEN = boolEnv("BLUEPRINT_BG_REGEN", true);
const SORA_WHEEL_URL_EXPIRES_DAYS = numEnv("SORA_WHEEL_URL_EXPIRES_DAYS", 2);
const RELATION_PDF_BUCKET = getEnv("RELATION_PDF_BUCKET", { defaultValue: null });
const RELATION_PDF_URL_EXPIRES_DAYS = numEnv("RELATION_PDF_URL_EXPIRES_DAYS", 7);

// --------------------
// Instagram (Graph API)
// --------------------
const IG_ACCESS_TOKEN = getEnv("IG_ACCESS_TOKEN", { defaultValue: null });
const IG_APP_SECRET = getEnv("IG_APP_SECRET", { defaultValue: null });
const IG_USER_ID = getEnv("IG_USER_ID", { defaultValue: null });
const IG_PAGE_ID = getEnv("IG_PAGE_ID", { defaultValue: null });
const IG_GRAPH_VERSION = getEnv("IG_GRAPH_VERSION", { defaultValue: "v19.0" });
const IG_GCS_BUCKET = getEnv("IG_GCS_BUCKET", { defaultValue: null });
const IG_IMAGE_URL_EXPIRES_DAYS = numEnv("IG_IMAGE_URL_EXPIRES_DAYS", 7);
const IG_POST_DRY_RUN = boolEnv("IG_POST_DRY_RUN", false);

// --------------------
// Cloud Tasks (Blueprint)
// --------------------
const CLOUD_TASKS_PROJECT = getEnv("CLOUD_TASKS_PROJECT", { defaultValue: "sora-no-koe" });
const CLOUD_TASKS_LOCATION = getEnv("CLOUD_TASKS_LOCATION", { defaultValue: "asia-northeast1" });
const CLOUD_TASKS_QUEUE = getEnv("CLOUD_TASKS_QUEUE", { defaultValue: "blueprint-generate" });
const BLUEPRINT_GENERATE_URL = getEnv("BLUEPRINT_GENERATE_URL", { defaultValue: "https://sora-no-koe-v2-v5gbhrug3q-an.a.run.app/internal/blueprints/light/generate" });
const BLUEPRINT_WORKER_URL = getEnv("BLUEPRINT_WORKER_URL", { defaultValue: "https://sora-no-koe-v2-v5gbhrug3q-an.a.run.app/internal/tasks/blueprints/light/run" });
const TASKS_CALLER_SA_EMAIL = getEnv("TASKS_CALLER_SA_EMAIL", { defaultValue: null });
const INTERNAL_TASKS_TOKEN = getEnv("INTERNAL_TASKS_TOKEN", { defaultValue: "sora_blueprint_internal_9f3cA7xQk2LmP8vZr4tYw1Bn6HcU5dJe0KaTqR8mXy3VzLp2NsW7u" });


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
  IG_STORY_DELIVERY_LINE_USER_ID,
  LINE_ADD_FRIEND_URL,
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

  // paid mode (LINE)
  PAID_MODE_ENABLED,
  PAID_INTENTS,
  PAID_ALLOW_APP_USER_IDS,
  PAID_ALLOW_LINE_USER_IDS,
  PAID_ALLOW_OWNER,
  PLUS_ENABLED,

  //worker
  WORKER_PUSH_NATAL_RESULT,
  WORKER_PUSH_ONLY_LINE_USER_ID,

  // WordPress (BLOG)
  WP_BASE_URL,
  WP_USER,
  WP_APP_PASSWORD,
  WP_CATEGORY_DAILY,
  WP_CATEGORY_SIGN,
  WP_CATEGORY_PLANET,
  WP_CATEGORY_ASPECT,
  BLOG_RECO_ENABLED,
  BLOG_RECO_COUNT,
  BLOG_WHEEL_ENABLED,
  BLOG_EYECATCH_ENABLED,
  BLOG_EYECATCH_BG_MODE,
  BLOG_EYECATCH_FORCE,
  BLOG_EYECATCH_BG_PATH,
  BLOG_EYECATCH_PRESET,
  BLOG_AUTO_PUBLISH,
  BLOG_HIDE_AFTER_RESONANCE,

  // OpenAI
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
  OPENAI_MODEL,
  OPENAI_MODEL_BLOG,
  OPENAI_MODEL_BLOG_PARTS,
  BLOG_GEN_MODE,
  OPENAI_MODEL_BLUEPRINT_LIGHT,

  // Stripe / Payments
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_ID_LIGHT,
  STRIPE_PRICE_ID_LINE_500,
  STRIPE_PAYMENT_LINK_LIGHT,
  STRIPE_SUCCESS_URL,
  STRIPE_CANCEL_URL,
  SORA_PLUS_URL,

  // Public URL / GCS
  PUBLIC_BASE_URL,
  GCS_BUCKET_BLUEPRINTS,
  GCS_BUCKET_SORA,
  RELATION_PDF_BUCKET,
  BLUEPRINT_URL_EXPIRES_DAYS,
  BLUEPRINT_BG_REGEN,
  SORA_WHEEL_URL_EXPIRES_DAYS,
  RELATION_PDF_URL_EXPIRES_DAYS,
  IG_ACCESS_TOKEN,
  IG_APP_SECRET,
  IG_USER_ID,
  IG_PAGE_ID,
  IG_GRAPH_VERSION,
  IG_GCS_BUCKET,
  IG_IMAGE_URL_EXPIRES_DAYS,
  IG_POST_DRY_RUN,

  // Cloud Tasks (Blueprint)
  CLOUD_TASKS_PROJECT,
  CLOUD_TASKS_LOCATION,
  CLOUD_TASKS_QUEUE,
  BLUEPRINT_GENERATE_URL,
  BLUEPRINT_WORKER_URL,
  TASKS_CALLER_SA_EMAIL,
  INTERNAL_TASKS_TOKEN
};
