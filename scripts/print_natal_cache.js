// scripts/print_natal_cache.js
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

function getArg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : null;
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  return out;
}

(async () => {
  const projectId =
    process.env.GCP_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    getArg("project_id");

  const appUserId = getArg("app_user_id");
  if (!projectId) throw new Error("Missing project id. Set GCP_PROJECT_ID or use --project_id=xxx");
  if (!appUserId) throw new Error("Missing --app_user_id=...");

  if (!admin.apps.length) admin.initializeApp({ projectId });
  const db = getFirestore(admin.app(), "sora-no-koe-db");

  const snap = await db.collection("natal_cache").doc(appUserId).get();
  if (!snap.exists) {
    console.log("❌ natal_cache not found:", appUserId);
    process.exit(1);
  }

  const d = snap.data();

  console.log("✅ natal_cache:", appUserId);
  console.log("schema_version:", d.schema_version || null);
  console.log("engine:", d.engine || null);
  console.log("needs_compute:", d.needs_compute);
  console.log("computed_at:", d.computed_at || null);
  console.log("updated_at:", d.updated_at || null);

  console.log("\n[birth]");
  console.log(JSON.stringify(d.birth || null, null, 2));

  console.log("\n[min.bodies]  (最優先：ここがあれば惑星経度は入ってる)");
  console.log(JSON.stringify(d.min?.bodies || null, null, 2));

  console.log("\n[natal_positions summary] (lon_degだけ抜粋)");
  const np = d.natal_positions || {};
  const summary = {
    sun: np.sun?.lon_deg,
    moon: np.moon?.lon_deg,
    mercury: np.bodies?.mercury?.lon_deg,
    venus: np.bodies?.venus?.lon_deg,
    mars: np.bodies?.mars?.lon_deg,
    jupiter: np.bodies?.jupiter?.lon_deg,
    saturn: np.bodies?.saturn?.lon_deg,
    uranus: np.bodies?.uranus?.lon_deg,
    neptune: np.bodies?.neptune?.lon_deg,
    pluto: np.bodies?.pluto?.lon_deg,
    asc: np.asc?.lon_deg,
    mc: np.mc?.lon_deg,
  };
  console.log(JSON.stringify(summary, null, 2));

  console.log("\n[houses]");
  console.log(JSON.stringify(d.houses || null, null, 2).slice(0, 8000));

  console.log("\n[top-level keys]");
  console.log(Object.keys(d));
})();
