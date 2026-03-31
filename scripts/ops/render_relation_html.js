"use strict";

require("../_load_env");

const fs = require("fs");
const path = require("path");
const { admin, getDb } = require("../../src/integrations/firebase/firebase");
const env = require("../../src/config/env");
const dict = require("../../src/content/dict");
const { createRelationService } = require("../../src/usecases/pdf/relation");
const { buildRelationHtmlPaginated } = require("../../src/engine/pdf/relation/render");

function getArg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

function requireArg(name) {
  const v = getArg(name);
  if (!v) throw new Error(`Missing --${name}=...`);
  return v;
}

function sanitizeFilename(input) {
  return String(input || "").replace(/[^a-zA-Z0-9_\-]/g, "_");
}

(async () => {
  const pairKey = requireArg("pair_key");
  const viewerId = requireArg("viewer_app_user_id");
  const forceArg = String(getArg("force") || "").toLowerCase();
  const force = forceArg === "1" || forceArg === "true" || forceArg === "" || forceArg === "yes";

  const db = getDb();
  const relationService = createRelationService({ db, admin, dict, storage: null, env });

  const viewResult = await relationService.getRelationView({ pairKey, viewerId, forceRegen: force });
  if (!viewResult?.ok) {
    console.error("relation_view failed:", viewResult);
    process.exit(1);
  }

  const html = await buildRelationHtmlPaginated(viewResult.view);
  const safePair = sanitizeFilename(pairKey);
  const safeViewer = sanitizeFilename(viewerId);
  const outPath = getArg("out") || path.join(process.cwd(), "tmp", "relation_html", "latest.html");

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, "utf8");

  console.log("✅ relation html generated:", outPath);
})();
