"use strict";

require("../_load_env");

const path = require("path");
const fs = require("fs");
const { admin, getDb } = require("/Applications/MAMP/htdocs/sora-no-koe/src/integrations/firebase/firebase");
const dict = require("/Applications/MAMP/htdocs/sora-no-koe/src/content/dict");
const { createNatalService } = require("/Applications/MAMP/htdocs/sora-no-koe/src/usecases/story/story_natal");
const { norm360 } = require("/Applications/MAMP/htdocs/sora-no-koe/src/domain/astro_compute");
const {
  buildBlueprintLightRows,
  buildAiInput,
} = require("/Applications/MAMP/htdocs/sora-no-koe/src/usecases/pdf/blueprint/index");
const { generateBlueprintLightTextV2 } = require("/Applications/MAMP/htdocs/sora-no-koe/src/usecases/pdf/blueprint/generate_text");
const { renderPdfBuffer } = require("/Applications/MAMP/htdocs/sora-no-koe/src/engine/pdf/blueprint_light/render");
const { getBlueprintLightManifest } = require("/Applications/MAMP/htdocs/sora-no-koe/src/usecases/pdf/blueprint/manifest");
const { buildBlueprintV25WireframeHtml } = require("/Applications/MAMP/htdocs/sora-no-koe/src/engine/pdf/blueprint_v25/wireframe");
const {
  buildBlueprintV25BgImages,
  buildStoryStub,
} = require("/Applications/MAMP/htdocs/sora-no-koe/src/engine/pdf/blueprint_v25/backgrounds");
const { SIGN_KEYS } = require("/Applications/MAMP/htdocs/sora-no-koe/src/engine/pdf/blueprint_light/shared");

function getArg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

function calcAscLon(rowsAngles = []) {
  const ascRow = Array.isArray(rowsAngles) ? rowsAngles.find((row) => row?.key === "asc") : null;
  const meta = ascRow?.meta;
  const signKey = meta?.sign_key;
  const idx = SIGN_KEYS.indexOf(String(signKey || ""));
  if (idx < 0) return null;
  const deg = Number(meta?.deg);
  if (!Number.isFinite(deg)) return null;
  const min = Number(meta?.min);
  const minPart = Number.isFinite(min) ? min / 60 : 0;
  return idx * 30 + deg + minPart;
}

function calcMcLon(rowsAngles = []) {
  const mcRow = Array.isArray(rowsAngles) ? rowsAngles.find((row) => row?.key === "mc") : null;
  const meta = mcRow?.meta;
  const signKey = meta?.sign_key;
  const idx = SIGN_KEYS.indexOf(String(signKey || ""));
  if (idx < 0) return null;
  const deg = Number(meta?.deg);
  if (!Number.isFinite(deg)) return null;
  const min = Number(meta?.min);
  const minPart = Number.isFinite(min) ? min / 60 : 0;
  return idx * 30 + deg + minPart;
}

(async () => {
  const lineUserId = getArg("line_user_id") || process.env.LINE_USER_ID;
  if (!lineUserId) {
    console.error("Missing line_user_id. Use --line_user_id=... or LINE_USER_ID env.");
    process.exit(1);
  }

  const db = getDb();
  const lineSnap = await db.collection("line_users").doc(lineUserId).get();
  if (!lineSnap.exists) {
    console.error("line_user not found:", lineUserId);
    process.exit(1);
  }
  const lineUser = lineSnap.data() || {};
  const appUserId = lineUser.app_user_id || null;
  if (!appUserId) {
    console.error("app_user_id missing on line_user");
    process.exit(1);
  }
  const userSnap = await db.collection("users").doc(appUserId).get();
  const user = userSnap.exists ? userSnap.data() : {};

  const natalService = createNatalService({ db, norm360 });
  const natalCache = await natalService.loadNatalFromcache(appUserId);
  if (!natalCache) {
    console.error("natal_cache missing for app_user_id:", appUserId);
    process.exit(1);
  }

  const { ok, longitudes } = natalService.extractNatalLongitudes(natalCache);
  if (!ok) {
    console.error("natal_cache invalid");
    process.exit(1);
  }

  const { rowsMain, rowsAngles, rowsExtra, element, modality } = buildBlueprintLightRows({
    longitudes,
    dict,
  });

  const birth = natalCache?.birth || {};
  const displayName =
    lineUser?.line_profile?.display_name ||
    user?.display_name ||
    user?.profile?.display_name ||
    user?.channels?.line?.profile?.display_name ||
    "";
  const identity = {
    name: displayName || "",
    birth_date: birth?.date_local || "",
    birth_time: birth?.time_hm || "",
    birth_place: birth?.place_text || birth?.place_formatted || "",
  };
  const birthText = [identity.birth_date, identity.birth_time, identity.birth_place].filter(Boolean).join(" / ");
  const houseSystem = natalCache?.houses?.system || natalCache?.engine?.houses?.system || null;
  const houseCusps = natalCache?.houses?.cusps || natalCache?.engine?.houses?.cusps || null;

  const aiInput = buildAiInput({
    displayName,
    rowsMain,
    rowsAngles,
    rowsExtra,
    element,
    modality,
    dict,
    longitudes,
    identity,
    cusps: Array.isArray(houseCusps) ? houseCusps : null,
    houseSystem: houseSystem || null,
  });

  const res = await generateBlueprintLightTextV2({
    env: {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_MODEL_BLUEPRINT_LIGHT: process.env.OPENAI_MODEL_BLUEPRINT_LIGHT || "gpt-4o",
      BLUEPRINT_DEBUG_JSON: process.env.BLUEPRINT_DEBUG_JSON || "",
    },
    input: aiInput,
  });

  if (!res?.ok) {
    console.error("generate failed:", res);
    process.exit(1);
  }

  const outBase =
    getArg("out_base") ||
    process.env.BLUEPRINT_OUT_BASE ||
    path.join(process.cwd(), "tmp", "blueprint", "exports", `blueprint_v25_real_${lineUserId}`);
  const outJson = `${outBase}.json`;
  const outPdf = `${outBase}.pdf`;
  const outHtml = `${outBase}.html`;
  const withPdf = getArg("with_pdf") === "1" || String(process.env.BLUEPRINT_WITH_PDF || "") === "1";

  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(res.data, null, 2));

  if (withPdf) {
    const manifest = getBlueprintLightManifest({ variant: "mobile" });
    const pdfBuffer = await renderPdfBuffer({
      manifest,
      displayName,
      birthText,
      rowsMain,
      rowsAngles,
      rowsExtra,
      blueprintText: res.data,
      houseCusps: Array.isArray(houseCusps) ? houseCusps : null,
      houseSystem: houseSystem || null,
    });
    fs.writeFileSync(outPdf, pdfBuffer);
  }

  const html = buildBlueprintV25WireframeHtml({
    data: {
      blueprint: res.data,
      kernel: aiInput.kernel,
      displayName,
      ownerName: displayName,
      birthText,
      houseCusps: Array.isArray(houseCusps) ? houseCusps : null,
      houseSystem: houseSystem || null,
      wheelRotationDeg: Number.isFinite(Number(calcAscLon(rowsAngles)))
        ? 270 - Number(calcAscLon(rowsAngles))
        : 0,
      wheelAscLon: Number.isFinite(Number(calcAscLon(rowsAngles)))
        ? Number(calcAscLon(rowsAngles))
        : null,
      wheelMcLon: Number.isFinite(Number(calcMcLon(rowsAngles)))
        ? Number(calcMcLon(rowsAngles))
        : null,
      story: buildStoryStub({
        rowsMain,
        rowsExtra,
        elementCounts: res.data?.master_chart?.element_balance || element,
        dateLabel: birthText,
      }),
      elementCounts: res.data?.master_chart?.element_balance || element,
      modalityCounts: res.data?.master_chart?.modality_balance || modality,
      bg_images: await buildBlueprintV25BgImages({
        blueprint: res.data,
        rowsMain,
        rowsExtra,
        elementCounts: res.data?.master_chart?.element_balance || element,
        dateLabel: birthText,
        outDir: path.join(process.cwd(), "tmp", "blueprint_bg", String(lineUserId || "user")),
        inline: true,
      }),
    },
    useSpace: true,
  });
  fs.writeFileSync(outHtml, html, "utf8");

  console.log("ok: true");
  console.log("json:", outJson);
  if (withPdf) console.log("pdf:", outPdf);
  console.log("html:", outHtml);
})();
