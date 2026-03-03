"use strict";

/**
 * scripts/export_dictionaries_json.js
 *
 * Purpose:
 *  - Local: dictionaries.bundle.v1.json を吐き出す
 *  - Optional: Firestore に dictionaries/* として upsert 保存する
 *
 * Usage:
 *   node scripts/export_dictionaries_json.js
 *   node scripts/export_dictionaries_json.js --out dist/dictionaries.bundle.v1.json
 *   node scripts/export_dictionaries_json.js --firebase
 *   node scripts/export_dictionaries_json.js --firebase --db sora-no-koe-db
 *   node scripts/export_dictionaries_json.js --firebase --dry-run
 *
 * Notes:
 *  - story 本体には辞書を入れない（思想と容量のため）
 *  - Firestore には dictionaries/{docId} に保存（例: aspects_v1）
 */

const fs = require("fs");
const path = require("path");

// --------------------
// CLI args
// --------------------
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

const args = parseArgs(process.argv);

// defaults
const OUT_FILE = args.out || "dist/dictionaries.bundle.v1.json";
const USE_FIREBASE = !!args.firebase;
const DRY_RUN = !!args["dry-run"];
const DATABASE_ID = typeof args.db === "string" ? args.db : "sora-no-koe-db";
const COLLECTION = typeof args.collection === "string" ? args.collection : "dictionaries";

// --------------------
// Import dictionaries
// --------------------
const { ASPECTS_V1 } = require("../src/content/dict/aspects.v1");
const { PLANETS_V1 } = require("../src/content/dict/planets.v1");
const { POINTS_V1 } = require("../src/content/dict/points.v1");
const { RESONANCE_V1 } = require("../src/content/dict/resonance.v1");

const { SIGNS_V1 } = require("../src/content/dict/signs.v1");
const { HOUSES_V1 } = require("../src/content/dict/houses.v1");
const { ELEMENTS_V1 } = require("../src/content/dict/elements.v1");
const { MODALITIES_V1 } = require("../src/content/dict/modalities.v1");
const { ORB_RULES_V1 } = require("../src/content/dict/orb_rules.v1");
const { TONE_VARIANTS_V1 } = require("../src/content/dict/tone_variants.v1");

// --------------------
// Build payload
// --------------------
function buildBundle() {
  const generated_at_utc = new Date().toISOString();

  // bundle meta
  const meta = {
    project: "sora-no-koe",
    schema_version: "dictionaries.bundle.v1",
    generated_at_utc,
  };

  // dictionaries map
  const dictionaries = {
    aspects: ASPECTS_V1,
    planets: PLANETS_V1,
    points: POINTS_V1,
    resonance: RESONANCE_V1,
    signs: SIGNS_V1,
    houses: HOUSES_V1,
    elements: ELEMENTS_V1,
    modalities: MODALITIES_V1,
    orb_rules: ORB_RULES_V1,
    tone_variants: TONE_VARIANTS_V1,
  };

  // quick sanity info (optional)
  const stats = {
    aspects_major: ASPECTS_V1?.major ? Object.keys(ASPECTS_V1.major).length : null,
    planets_bodies: PLANETS_V1?.bodies ? Object.keys(PLANETS_V1.bodies).length : null,
    points: POINTS_V1?.points ? Object.keys(POINTS_V1.points).length : null,
    signs: SIGNS_V1?.order ? SIGNS_V1.order.length : null,
    houses: HOUSES_V1?.order ? HOUSES_V1.order.length : null,
    elements: ELEMENTS_V1?.order ? ELEMENTS_V1.order.length : null,
    modalities: MODALITIES_V1?.order ? MODALITIES_V1.order.length : null,
  };

  return { meta, stats, dictionaries };
}

// --------------------
// Write JSON file
// --------------------
function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, obj) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
}

// --------------------
// Firestore upload
// --------------------
async function upsertFirestore(bundle) {
  const admin = require("firebase-admin");

  if (!admin.apps.length) admin.initializeApp();

  // Multi DB (Admin SDK: getFirestore(app, databaseId))
  const { getFirestore } = require("firebase-admin/firestore");
  const db = getFirestore(admin.app(), DATABASE_ID);

  const batch = db.batch();

  // docId strategy: {key}_{versionSuffix}
  // Example:
  //  aspects -> aspects_v1
  //  planets -> planets_v1
  // You can also just use the inner version string, but this is stable/readable.
  const dictMap = bundle.dictionaries;

  for (const [key, value] of Object.entries(dictMap)) {
    const v = value?.version || "v1";
    const safeV = String(v).replace(/[^a-zA-Z0-9_.-]/g, "_");
    const docId = `${key}_${safeV}`.replace(/__/g, "_");

    const ref = db.collection(COLLECTION).doc(docId);

    const payload = {
      key,
      version: v,
      doc_id: docId,
      updated_at_utc: new Date().toISOString(),
      data: value,
      meta: {
        schema: bundle.meta.schema_version,
        generated_at_utc: bundle.meta.generated_at_utc,
      },
    };

    batch.set(ref, payload, { merge: true });
  }

  if (DRY_RUN) {
    console.log(`[DRY-RUN] Firestore upsert skipped. db=${DATABASE_ID}, collection=${COLLECTION}`);
    return { ok: true, dry_run: true };
  }

  await batch.commit();
  return { ok: true, db: DATABASE_ID, collection: COLLECTION };
}

// --------------------
// main
// --------------------
async function main() {
  const bundle = buildBundle();

  // 1) write local json
  writeJson(OUT_FILE, bundle);
  console.log(`✅ wrote: ${OUT_FILE}`);
  console.log(`   stats:`, bundle.stats);

  // 2) optional: firestore
  if (USE_FIREBASE) {
    console.log(`🚀 firestore upsert: db=${DATABASE_ID}, collection=${COLLECTION} ${DRY_RUN ? "(dry-run)" : ""}`);
    const res = await upsertFirestore(bundle);
    console.log(`✅ firestore:`, res);
  } else {
    console.log(`ℹ️ firestore: skipped (use --firebase to enable)`);
  }
}

main().catch((err) => {
  console.error("❌ export failed:", err);
  process.exit(1);
});
