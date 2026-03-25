"use strict";

require("../_load_env");

const { getDb } = require("../../src/integrations/firebase/firebase");
const dict = require("../../src/content/dict");
const { createNatalService } = require("../../src/usecases/story/story_natal");
const { createSignHelpers } = require("../../src/usecases/story/story_signs");
const { norm360 } = require("../../src/usecases/story/story_math");
const { signGlyph } = require("../../src/presenters/shared/text/tokens");
const { buildBlueprintLightRows } = require("../../src/usecases/blueprint_light");

function getArg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

function requireArg(name) {
  const v = getArg(name);
  if (!v) throw new Error(`Missing --${name}=...`);
  return v;
}

function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function pickAngle(candidates = []) {
  for (const c of candidates) {
    if (isFiniteNumber(c.value)) return c;
  }
  return { value: null, source: "" };
}

function formatAngleLine(label, lon, signFromLonFn) {
  if (!isFiniteNumber(lon)) return `${label}: (missing)`;
  const lonNorm = norm360(lon);
  const within = ((lonNorm % 30) + 30) % 30;
  const degText = `${within.toFixed(2)}°`;
  const sign = signFromLonFn(lonNorm);
  const glyph = signGlyph(sign?.sign_key);
  const signName = sign?.sign_ja || sign?.sign_key || "";
  return `${label} ${glyph ? `${glyph} ` : ""}${signName} ${degText} (lon ${lonNorm.toFixed(2)})`;
}

(async () => {
  const db = getDb();
  const lineUserId = getArg("line_user_id");
  let appUserId = getArg("app_user_id");

  if (!appUserId && lineUserId) {
    const lineSnap = await db.collection("line_users").doc(lineUserId).get();
    if (!lineSnap.exists) throw new Error("line_user not found");
    const lineUser = lineSnap.data() || {};
    appUserId = lineUser.app_user_id || null;
  }

  if (!appUserId) appUserId = requireArg("app_user_id");

  const natalService = createNatalService({ db, norm360 });
  const natalCache = await natalService.loadNatalFromcache(appUserId);
  if (!natalCache) throw new Error("natal_cache missing");

  const { signFromLon } = createSignHelpers({ SIGNS: dict?.SIGNS || dict?.SIGNS_V2, norm360 });

  const minAngles = natalCache?.min?.angles || {};
  const housesAngles = natalCache?.houses?.angles || {};
  const engineHouses = natalCache?.engine?.houses || {};
  const minDirect = natalCache?.min || {};

  const ascPick = pickAngle([
    { value: minAngles.asc_deg, source: "min.angles.asc_deg" },
    { value: minAngles.asc, source: "min.angles.asc" },
    { value: minDirect.asc_deg, source: "min.asc_deg" },
    { value: housesAngles.asc, source: "houses.angles.asc" },
    { value: engineHouses.asc_deg, source: "engine.houses.asc_deg" },
  ]);

  const mcPick = pickAngle([
    { value: minAngles.mc_deg, source: "min.angles.mc_deg" },
    { value: minAngles.mc, source: "min.angles.mc" },
    { value: minDirect.mc_deg, source: "min.mc_deg" },
    { value: housesAngles.mc, source: "houses.angles.mc" },
    { value: engineHouses.mc_deg, source: "engine.houses.mc_deg" },
  ]);

  const dcPick = pickAngle([
    { value: minAngles.dc_deg, source: "min.angles.dc_deg" },
    { value: minAngles.dc, source: "min.angles.dc" },
    { value: minDirect.dc_deg, source: "min.dc_deg" },
    { value: housesAngles.dc, source: "houses.angles.dc" },
  ]);

  const icPick = pickAngle([
    { value: minAngles.ic_deg, source: "min.angles.ic_deg" },
    { value: minAngles.ic, source: "min.angles.ic" },
    { value: minDirect.ic_deg, source: "min.ic_deg" },
    { value: housesAngles.ic, source: "houses.angles.ic" },
  ]);

  const ascLon = ascPick.value;
  const mcLon = mcPick.value;
  const dcLon = isFiniteNumber(dcPick.value) ? dcPick.value : (isFiniteNumber(ascLon) ? norm360(ascLon + 180) : null);
  const icLon = isFiniteNumber(icPick.value) ? icPick.value : (isFiniteNumber(mcLon) ? norm360(mcLon + 180) : null);

  console.log("app_user_id:", appUserId);
  console.log("");
  console.log("natal_cache.min.angles:");
  console.log(" asc_deg:", minAngles.asc_deg, "mc_deg:", minAngles.mc_deg, "ic_deg:", minAngles.ic_deg, "dc_deg:", minAngles.dc_deg);
  console.log("");
  console.log("picked angles (source):");
  console.log(" ASC:", isFiniteNumber(ascLon) ? ascLon.toFixed(2) : "(missing)", `(${ascPick.source || "n/a"})`);
  console.log(" MC:", isFiniteNumber(mcLon) ? mcLon.toFixed(2) : "(missing)", `(${mcPick.source || "n/a"})`);
  console.log(" IC:", isFiniteNumber(icLon) ? icLon.toFixed(2) : "(missing)", `( ${icPick.source || (isFiniteNumber(mcLon) ? "derived mc+180" : "n/a")} )`);
  console.log(" DC:", isFiniteNumber(dcLon) ? dcLon.toFixed(2) : "(missing)", `( ${dcPick.source || (isFiniteNumber(ascLon) ? "derived asc+180" : "n/a")} )`);
  console.log("");
  console.log("sign check:");
  console.log(" ", formatAngleLine("ASC", ascLon, signFromLon));
  console.log(" ", formatAngleLine("MC", mcLon, signFromLon));
  console.log(" ", formatAngleLine("IC", icLon, signFromLon));
  console.log(" ", formatAngleLine("DC", dcLon, signFromLon));

  const { ok, longitudes } = natalService.extractNatalLongitudes(natalCache);
  if (ok) {
    const rows = buildBlueprintLightRows({ longitudes, dict });
    const rowText = (row) => {
      if (!row?.meta) return "";
      const sign = row.meta.sign_ja || "";
      const glyph = signGlyph(row.meta.sign_key);
      const deg = Number(row.meta.deg);
      const min = Number(row.meta.min);
      const minText = Number.isFinite(min) ? String(min).padStart(2, "0") : "00";
      const degText = Number.isFinite(deg) ? `${deg}°${minText}’` : "";
      return `${row.key.toUpperCase()} ${glyph ? `${glyph} ` : ""}${sign} ${degText}`;
    };
    console.log("");
    console.log("AI input (rowsAngles from buildBlueprintLightRows):");
    (rows.rowsAngles || []).forEach((row) => {
      console.log(" ", rowText(row));
    });
  }
})().catch((e) => {
  console.error("inspect_axes error:", e?.message || e);
  process.exit(1);
});
