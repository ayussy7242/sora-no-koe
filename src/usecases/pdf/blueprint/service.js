"use strict";

const crypto = require("crypto");
const { createNatalService } = require("../../story/natal");
const { generateBlueprintLightText, generateBlueprintLightTextV2 } = require("./generate_text");
const { renderBlueprintLightPdf } = require("./render/pdf_render");
const { createBlueprintLightStorage } = require("./storage");
const { getBlueprintLightPaths } = require("./paths");
const { getBlueprintLightManifest } = require("./manifest");
const { buildOrReuseV25BgImages } = require("./compute/bg_images");
const { norm360 } = require("./compute/calc");
const { buildBlueprintLightRows, buildBirthText, formatSignPipe } = require("./render/format");
const {
  resolveDisplayNameFromLineUserDoc,
  resolveDisplayNameFromUserDoc,
} = require("../../../utils/text/display_name");
const { toBool } = require("../../../utils/data/bool");
const {
  buildAiInput,
  mapAiContent,
  applyFactLinesToAiData,
  buildFactLine,
  prependFactLine,
  normalizeCuspsFromNatalCache,
} = require("./compute/ai_input");

function buildNatalHash({ natalCache, houseSystem }) {
  if (!natalCache || typeof natalCache !== "object") return "";
  const birth = natalCache?.birth || {};
  const birthHash = String(natalCache?.birth_hash || "").trim();
  const fallbackBirth = {
    date_local: birth?.date_local || "",
    time_hm: birth?.time_hm || "",
    timezone: birth?.timezone || "",
    lat: Number.isFinite(Number(birth?.lat)) ? Number(birth.lat) : "",
    lon: Number.isFinite(Number(birth?.lon)) ? Number(birth.lon) : "",
    place_id: birth?.place_id || "",
  };
  const baseBirth = birthHash || crypto.createHash("sha256").update(JSON.stringify(fallbackBirth)).digest("hex");
  const engine = natalCache?.engine || {};
  const payload = {
    birth_hash: baseBirth,
    house_system: houseSystem || natalCache?.houses?.system || engine?.houses?.system || "",
    houses_calc_version: engine?.houses_calc_version || natalCache?.houses_calc_version || "",
    precision_deg: engine?.precision_deg ?? natalCache?.precision_deg ?? "",
    engine_version: engine?.version || engine?.name || "",
    zodiac_mode: engine?.zodiac?.mode || natalCache?.zodiac?.mode || "",
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 12);
}

async function resolveDisplayName({ db, appUserId, lineUser }) {
  const fromLine = resolveDisplayNameFromLineUserDoc(lineUser);
  if (fromLine) return fromLine;
  if (!db || !appUserId) return "";
  try {
    const snap = await db.collection("users").doc(appUserId).get();
    if (!snap.exists) return "";
    const ud = snap.data() || {};
    return resolveDisplayNameFromUserDoc(ud) || "";
  } catch (_) {
    return "";
  }
}

function createBlueprintLightService({ db, admin, storage, env, dict }) {
  if (!db) throw new Error("db is required");
  if (!admin) throw new Error("admin is required");
  if (!storage) throw new Error("storage is required");

  const bucketName = env?.GCS_BUCKET_BLUEPRINTS || null;
  const urlExpireDays = Number(env?.BLUEPRINT_URL_EXPIRES_DAYS || 7);

  const blueprintStorage = bucketName
    ? createBlueprintLightStorage({ bucketName, storage, env, urlExpireDays })
    : null;
  const natalService = createNatalService({ db, norm360 });
  const allowRegenBg = env?.BLUEPRINT_BG_REGEN !== false;

  async function getLineUser(lineUserId) {
    if (!lineUserId) return null;
    const snap = await db.collection("line_users").doc(lineUserId).get();
    return snap.exists ? snap.data() || null : null;
  }

  async function getOrCreateSignedUrl({ lineUserId, variant = "print" }) {
    if (!lineUserId) return { ok: false, code: "missing_line_user" };
    if (!bucketName || !blueprintStorage) return { ok: false, code: "config_missing" };

    const manifest = getBlueprintLightManifest({ variant });
    const { pdfPath: filePath } = getBlueprintLightPaths(lineUserId, manifest.variant);
    const existsResult = await blueprintStorage.existsPdf(lineUserId, variant);
    const exists = !!existsResult?.exists;
    console.log("[blueprint] gcs", {
      bucket_set: !!bucketName,
      file_path: filePath,
      object_exists: !!exists,
    });

    if (!exists) return { ok: false, code: "not_ready" };

    const signed = await blueprintStorage.getSignedUrl(lineUserId, variant);
    if (!signed?.ok) {
      console.log("[blueprint] signed_url failed", { error: signed?.error || signed?.code });
      return signed;
    }
    console.log("[blueprint] signed_url", { ok: !!signed?.url });
    return signed;
  }

  async function hasPdf({ lineUserId, variant = "print" }) {
    if (!lineUserId) return { ok: false, code: "missing_line_user" };
    if (!bucketName || !blueprintStorage) return { ok: false, code: "config_missing" };
    const result = await blueprintStorage.existsPdf(lineUserId, variant);
    return { ok: true, exists: !!result?.exists, filePath: result?.filePath || null };
  }

  async function generateAndStore({
    lineUserId,
    forceRegen = false,
    variant = "print",
    skipPdf = false,
  } = {}) {
    if (!lineUserId) throw new Error("lineUserId is required");
    if (!bucketName || !blueprintStorage) throw new Error("bucket not configured");

    const manifest = getBlueprintLightManifest({ variant });
    const { pdfPath: filePath } = getBlueprintLightPaths(lineUserId, manifest.variant);
    const pdfExistsResult = await blueprintStorage.existsPdf(lineUserId, variant);
    const jsonExistsResult = await blueprintStorage.existsJson(lineUserId);
    const pdfExists = !!pdfExistsResult?.exists;
    const jsonExists = !!jsonExistsResult?.exists;
    const envForceRegen = String(env?.BLUEPRINT_REGEN || process.env.BLUEPRINT_REGEN || "") === "1";
    const shouldForceRegen = Boolean(forceRegen || envForceRegen);
    console.log("[blueprint] regen flags", {
      forceRegen: !!forceRegen,
      envForceRegen: !!envForceRegen,
      shouldForceRegen: !!shouldForceRegen,
    });

    if (pdfExists && !shouldForceRegen) {
      console.log("[blueprint] generate skip (pdf exists)", { file_path: filePath, json_exists: jsonExists });
      return { ok: true, filePath, skipped: true };
    }

    const lineUser = await getLineUser(lineUserId);
    if (!lineUser) throw new Error("line user not found");
    const appUserId = lineUser.app_user_id || null;
    if (!appUserId) throw new Error("app_user_id missing");

    const natalCache = await natalService.loadNatalFromcache(appUserId);
    if (!natalCache) throw new Error("natal_cache missing");

    const { ok, longitudes } = natalService.extractNatalLongitudes(natalCache);
    if (!ok) throw new Error("natal_cache invalid");
    const houseSystem = natalCache?.houses?.system || natalCache?.engine?.houses?.system || null;
    const cusps = normalizeCuspsFromNatalCache(natalCache);

    const {
      rowsMain,
      rowsAngles,
      rowsExtra,
      element,
      modality,
    } = buildBlueprintLightRows({ longitudes, dict });

    const titleForRow = (row) => {
      if (!row) return "";
      if (row.key === "south_node" || row.key === "north_node") {
        const signTitle = formatSignPipe(row.meta);
        const suffix = row.key === "south_node" ? "（慣れた反応）" : "（触れ続ける方向）";
        return `${row.glyph} ${signTitle}${suffix}`;
      }
      if (row.key === "asc" || row.key === "mc" || row.key === "ic" || row.key === "dc") {
        return `${row.label}｜${row.value}`;
      }
      const prefix = row.glyph ? `${row.glyph} ${row.label}` : `${row.label}`;
      return `${prefix}｜${row.value}`;
    };

    const titlePartsForRow = (row) => {
      if (!row) return { glyph: "", rest: "" };
      if (row.key === "south_node" || row.key === "north_node") {
        const signTitle = formatSignPipe(row.meta);
        const suffix = row.key === "south_node" ? "（慣れた反応）" : "（触れ続ける方向）";
        return { glyph: row.glyph || "", rest: `${signTitle}${suffix}` };
      }
      if (row.key === "asc" || row.key === "mc" || row.key === "ic" || row.key === "dc") {
        return { glyph: "", rest: `${row.label}｜${row.value}` };
      }
      return { glyph: row.glyph || "", rest: `${row.label}｜${row.value}` };
    };

    rowsMain.forEach((row) => {
      row.title = titleForRow(row);
      row.titleParts = titlePartsForRow(row);
    });
    rowsExtra.forEach((row) => {
      row.title = titleForRow(row);
      row.titleParts = titlePartsForRow(row);
    });
    rowsAngles.forEach((row) => {
      row.title = titleForRow(row);
      row.titleParts = titlePartsForRow(row);
    });

    const birthText = buildBirthText(natalCache?.birth || {});
    const natalHash = buildNatalHash({ natalCache, houseSystem });
    const displayName = await resolveDisplayName({ db, appUserId, lineUser });

    const skipAi = toBool(env?.BLUEPRINT_SKIP_AI || process.env.BLUEPRINT_SKIP_AI || "");
    let aiData = null;
    const useV25 = manifest?.version === "v25";
    if (skipAi) {
      if (jsonExists) {
        try {
          const download = await blueprintStorage.downloadJson(lineUserId);
          aiData = JSON.parse(String(download?.data || ""));
          if (!useV25) {
            aiData = applyFactLinesToAiData(aiData, rowsMain, rowsExtra, rowsAngles);
          }
          console.log("[blueprint] skip ai (cached json)", { file_path: filePath });
        } catch (e) {
          console.log("[blueprint] skip ai json parse failed", { error: e?.message || String(e) });
          aiData = { sections: [] };
        }
      } else {
        console.log("[blueprint] skip ai (no json)", { file_path: filePath });
        aiData = { sections: [] };
      }
    } else if (jsonExists && !shouldForceRegen) {
      try {
        const download = await blueprintStorage.downloadJson(lineUserId);
        aiData = JSON.parse(String(download?.data || ""));
        if (!useV25) {
          aiData = applyFactLinesToAiData(aiData, rowsMain, rowsExtra, rowsAngles);
        } else if (aiData?.version !== "blueprint_light_v2") {
          aiData = null;
        }
      } catch (e) {
        throw new Error(`json_parse_failed: ${e?.message || String(e)}`);
      }
    }
    if (!aiData) {
      const aiIdentity = {
        name: displayName || "",
        birth_date: natalCache?.birth?.date_local || "",
        birth_time: natalCache?.birth?.time_hm || "",
        birth_place: natalCache?.birth?.place_text || natalCache?.birth?.place_formatted || "",
      };
      const aiInput = buildAiInput({
        displayName,
        rowsMain,
        rowsAngles,
        rowsExtra,
        element,
        modality,
        dict,
        longitudes,
        cusps,
        houseSystem,
        identity: aiIdentity,
      });
      const aiRes = useV25
        ? await generateBlueprintLightTextV2({ env, input: aiInput })
        : await generateBlueprintLightText({ env, input: aiInput });
      if (!aiRes?.ok) {
        throw new Error(`ai_failed:${aiRes?.reason || "unknown"}`);
      }
      aiData = useV25 ? aiRes.data : applyFactLinesToAiData(aiRes.data, rowsMain, rowsExtra, rowsAngles);
      await blueprintStorage.saveJson(lineUserId, JSON.stringify(aiData, null, 2));
    }

    const mapped = !useV25 && aiData ? mapAiContent(aiData) : null;
    const summary = mapped?.summary || null;

    if (skipPdf) {
      console.log("[blueprint] skip pdf generation", { file_path: filePath });
      return { ok: true, filePath, skipped: false, skippedPdf: true };
    }

    if (pdfExists && !shouldForceRegen) {
      console.log("[blueprint] generate skip (exists)", { file_path: filePath });
      return { ok: true, filePath, skipped: true };
    }

    const narratives = {
      main: rowsMain.map((row) => ({
        ...row,
        text: prependFactLine(
          mapped?.bodyTextByKey?.get(row.key) ||
            row.meta?.flavor ||
            "構造の質感が静かに立ち上がる配置。",
          buildFactLine(row)
        ),
      })),
      chiron: rowsExtra.filter((r) => r.key === "chiron").map((row) => ({
        ...row,
        text: prependFactLine(
          mapped?.chironText || row.meta?.flavor || "傷と回復の入口に、構造的な輪郭が生まれやすい。",
          buildFactLine(row)
        ),
      })),
      lilith: rowsExtra.filter((r) => r.key === "lilith").map((row) => ({
        ...row,
        text: prependFactLine(
          mapped?.lilithText || row.meta?.flavor || "境界の深い層に、静かな緊張が触れやすい。",
          buildFactLine(row)
        ),
      })),
      nodes: [
        rowsExtra.find((r) => r.key === "south_node"),
        rowsExtra.find((r) => r.key === "north_node"),
      ]
        .filter(Boolean)
        .map((row) => ({
          ...row,
          text: prependFactLine(
            row.key === "south_node"
              ? mapped?.nodeText?.south || row.meta?.flavor || "方向性の軸が、配置として浮かびやすい。"
              : mapped?.nodeText?.north || row.meta?.flavor || "方向性の軸が、配置として浮かびやすい。",
            buildFactLine(row)
          ),
        })),
      axes: rowsAngles.map((row) => ({
        ...row,
        text: prependFactLine(
          mapped?.angleTextByKey?.get(row.key) ||
            row.meta?.flavor ||
            "視点の入口として、構造の基準になる。",
          buildFactLine(row)
        ),
      })),
    };
    rowsMain.forEach((row) => {
      row.fact_line = buildFactLine(row);
    });
    rowsAngles.forEach((row) => {
      row.fact_line = buildFactLine(row);
    });
    rowsExtra.forEach((row) => {
      row.fact_line = buildFactLine(row);
    });

    let bgImages = null;
    let story = null;
    if (useV25 && variant === "mobile") {
      const elementCounts = aiData?.master_chart?.element_balance || element;
      const dateLabel = birthText || "";
      const bgResult = await buildOrReuseV25BgImages({
        lineUserId,
        aiData,
        rowsMain,
        rowsExtra,
        elementCounts,
        dateLabel,
        natalHash,
        allowRegenBg,
        blueprintStorage,
      });
      story = bgResult.story;
      bgImages = bgResult.bgImages;
    }

    const pdfBuffer = await renderBlueprintLightPdf({
      manifest,
      displayName,
      birthText,
      rowsMain,
      rowsAngles,
      rowsExtra,
      summary,
      element,
      modality,
      blueprintText: useV25 ? aiData : null,
      bgImages,
      story,
      houseCusps: Array.isArray(cusps) ? cusps : null,
      houseSystem: houseSystem || null,
      bodyTextByKey: mapped?.bodyTextByKey,
      angleTextByKey: mapped?.angleTextByKey,
      chironText: mapped?.chironText,
      lilithText: mapped?.lilithText,
      nodeText: mapped?.nodeText,
      closingText: mapped?.closingText || summary?.closing?.text || "",
    });
    const pdfHash = crypto.createHash("sha256").update(pdfBuffer).digest("hex").slice(0, 12);
    console.log("[blueprint] pdf hash", { hash: pdfHash, bytes: pdfBuffer.length });

    await blueprintStorage.savePdf(lineUserId, pdfBuffer, manifest.variant);

    console.log("[blueprint] generate stored", { file_path: filePath });
    return { ok: true, filePath, skipped: false };
  }

  async function renderPdfFromStoredJson({ lineUserId, variant = "mobile", forceRegen = false } = {}) {
    if (!lineUserId) throw new Error("lineUserId is required");
    if (!bucketName || !blueprintStorage) throw new Error("bucket not configured");

    const manifest = getBlueprintLightManifest({ variant });
    const { pdfPath: filePath } = getBlueprintLightPaths(lineUserId, manifest.variant);
    const pdfExistsResult = await blueprintStorage.existsPdf(lineUserId, variant);
    const pdfExists = !!pdfExistsResult?.exists;
    if (pdfExists && !forceRegen) {
      return { ok: true, filePath, skipped: true };
    }

    const jsonExistsResult = await blueprintStorage.existsJson(lineUserId);
    if (!jsonExistsResult?.exists) throw new Error("json_missing");
    const download = await blueprintStorage.downloadJson(lineUserId);
    const aiData = JSON.parse(String(download?.data || ""));

    const lineUser = await getLineUser(lineUserId);
    if (!lineUser) throw new Error("line user not found");
    const appUserId = lineUser.app_user_id || null;
    if (!appUserId) throw new Error("app_user_id missing");

    const natalCache = await natalService.loadNatalFromcache(appUserId);
    if (!natalCache) throw new Error("natal_cache missing");

    const { ok, longitudes } = natalService.extractNatalLongitudes(natalCache);
    if (!ok) throw new Error("natal_cache invalid");

    const {
      rowsMain,
      rowsAngles,
      rowsExtra,
      element,
      modality,
    } = buildBlueprintLightRows({ longitudes, dict });

    const birthText = buildBirthText(natalCache?.birth || {});
    const natalHash = buildNatalHash({ natalCache, houseSystem });
    const displayName = await resolveDisplayName({ db, appUserId, lineUser });

    let bgImages = null;
    let story = null;
    const elementCounts = aiData?.master_chart?.element_balance || element;
    const dateLabel = birthText || "";
    const bgResult = await buildOrReuseV25BgImages({
      lineUserId,
      aiData,
      rowsMain,
      rowsExtra,
      elementCounts,
      dateLabel,
      natalHash,
      allowRegenBg,
      blueprintStorage,
    });
    story = bgResult.story;
    bgImages = bgResult.bgImages;

    const pdfBuffer = await renderBlueprintLightPdf({
      manifest,
      displayName,
      birthText,
      rowsMain,
      rowsAngles,
      rowsExtra,
      summary: null,
      element,
      modality,
      blueprintText: aiData,
      bgImages,
      story,
      houseCusps: Array.isArray(cusps) ? cusps : null,
      houseSystem: houseSystem || null,
    });

    await blueprintStorage.savePdf(lineUserId, pdfBuffer, manifest.variant);
    return { ok: true, filePath, skipped: false };
  }

  return {
    getOrCreateSignedUrl,
    hasPdf,
    generateAndStore,
    renderPdfFromStoredJson,
  };
}

module.exports = {
  createBlueprintLightService,
  buildAiInput,
};
