"use strict";

require("../_load_env");

const fs = require("fs");
const path = require("path");
const { admin, getDb } = require("../../src/integrations/firebase/firebase");
const env = require("../../src/config/env");
const dict = require("../../src/content/dict");
const { createRelationService } = require("../../src/usecases/pdf/relation");
const { buildRelationAiDebugReport } = require("../../src/usecases/pdf/relation/debug_ai_report");

function getArg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

function requireArg(name) {
  const v = getArg(name);
  if (!v) throw new Error(`Missing --${name}=...`);
  return v;
}

(async () => {
  const pairKey = requireArg("pair_key");
  const viewerId = requireArg("viewer_app_user_id");
  const forceArg = String(getArg("force") || "").toLowerCase();
  const force = forceArg === "1" || forceArg === "true" || forceArg === "" || forceArg === "yes";
  const outPath = getArg("out") || path.join(process.cwd(), "tmp", "relation_ai", "debug.json");
  const mode = String(getArg("mode") || "report").toLowerCase();

  const db = getDb();
  const relationService = createRelationService({ db, admin, dict, storage: null, env });
  const viewResult = await relationService.getRelationView({ pairKey, viewerId, forceRegen: force });
  if (!viewResult?.ok) {
    console.error("relation_view failed:", viewResult);
    process.exit(1);
  }

  const report = buildRelationAiDebugReport({ view: viewResult.view });
  const output = mode === "view"
    ? { pair_key: viewResult.view?.pair_key || null, ai_texts: viewResult.view?.ai_texts || {}, ai_meta: viewResult.view?.ai_meta || {} }
    : report;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");

  console.log("✅ relation ai debug generated:", outPath);
})();
