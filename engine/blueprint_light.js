"use strict";

const fs = require("fs");
const PDFDocument = require("pdfkit");
const { createNatalService } = require("./story_natal");

const SIGN_KEYS = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
];

const BODY_ORDER_MAIN = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
];

const BODY_ORDER_EXTRA = ["lilith", "chiron", "north_node", "south_node", "vertex"];

const BODY_LABEL = {
  sun: "太陽",
  moon: "月",
  mercury: "水星",
  venus: "金星",
  mars: "火星",
  jupiter: "木星",
  saturn: "土星",
  uranus: "天王星",
  neptune: "海王星",
  pluto: "冥王星",
  lilith: "リリス",
  chiron: "キロン",
  north_node: "北ノード",
  south_node: "南ノード",
  vertex: "バーテックス",
  asc: "ASC",
  mc: "MC",
  ic: "IC",
  dc: "DC",
};

const BODY_GLYPH = {
  sun: "☉",
  moon: "☽",
  mercury: "☿",
  venus: "♀",
  mars: "♂",
  jupiter: "♃",
  saturn: "♄",
  uranus: "♅",
  neptune: "♆",
  pluto: "♇",
  lilith: "⚸",
  chiron: "⚷",
  north_node: "☊",
  south_node: "☋",
};

function norm360(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return null;
  return ((n % 360) + 360) % 360;
}

function pickFontPath() {
  const candidates = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansJP-Regular.otf",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansJP-Regular.otf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) {
      // ignore
    }
  }
  return null;
}

function toSignMeta(dict, lon) {
  const v = norm360(lon);
  if (!Number.isFinite(v)) return null;
  const idx = Math.floor(v / 30);
  const within = v - idx * 30;
  const deg = Math.floor(within);
  const min = Math.floor((within - deg) * 60 + 1e-9);
  const key = SIGN_KEYS[idx] || null;
  const sign = dict?.SIGNS_V2?.signs?.[key] || {};
  return {
    sign_key: key,
    sign_ja: sign?.label_ja || key || "（不明）",
    element: sign?.element || null,
    modality: sign?.modality || null,
    deg,
    min,
  };
}

function formatSignText(meta) {
  if (!meta) return "";
  const mm = String(meta.min).padStart(2, "0");
  return `${meta.sign_ja} ${meta.deg}°${mm}’`;
}

function buildBirthText(birth) {
  if (!birth) return "";
  const date = birth.date_local ? String(birth.date_local) : "";
  const time = birth.time_hm ? String(birth.time_hm) : "";
  const place = birth.place_text || birth.place_formatted || "";
  const parts = [];
  if (date) parts.push(date);
  if (time) parts.push(time);
  if (place) parts.push(place);
  return parts.length ? `出生: ${parts.join(" / ")}` : "";
}

function formatDateJst(date = new Date()) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jst.getUTCDate()).padStart(2, "0");
  const hh = String(jst.getUTCHours()).padStart(2, "0");
  const mm = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${y}.${m}.${d} ${hh}:${mm} JST`;
}

async function renderPdfBuffer({ displayName, birthText, rowsMain, rowsAngles, rowsExtra, element, modality }) {
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const fontPath = pickFontPath();
  if (fontPath) {
    try {
      doc.font(fontPath);
    } catch (_) {
      // fallback to default
    }
  }

  const chunks = [];
  doc.on("data", (d) => chunks.push(d));

  doc.fontSize(20).text("魂の設計図（LIGHT）");
  doc.fontSize(10).fillColor("#666").text("出生図の主要構造をまとめたPDF");
  doc.moveDown(0.6);

  doc.fillColor("#111").fontSize(12).text(`${displayName || "あなた"}さん`);
  if (birthText) doc.fontSize(10).text(birthText);
  doc.fontSize(9).fillColor("#777").text(`生成: ${formatDateJst(new Date())}`);
  doc.moveDown(0.8);

  const drawSection = (title, rows) => {
    doc.fillColor("#111").fontSize(12).text(title);
    doc.moveDown(0.2);

    const xGlyph = doc.page.margins.left;
    const xLabel = xGlyph + 20;
    const xValue = xLabel + 80;

    doc.fontSize(10);
    rows.forEach((row) => {
      const y = doc.y;
      const glyph = row.glyph || "";
      doc.text(glyph, xGlyph, y, { lineBreak: false });
      doc.text(row.label, xLabel, y, { lineBreak: false });
      doc.text(row.value, xValue, y);
    });
    doc.moveDown(0.4);
  };

  drawSection("主要天体", rowsMain);
  drawSection("角度", rowsAngles);
  drawSection("補足天体", rowsExtra);

  doc.fillColor("#111").fontSize(12).text("属性バランス");
  doc.moveDown(0.2);
  doc.fontSize(10);
  doc.text(`火 ${element.fire}  地 ${element.earth}  風 ${element.air}  水 ${element.water}`);
  doc.text(`活動 ${modality.cardinal}  不動 ${modality.fixed}  柔軟 ${modality.mutable}`);

  doc.end();
  await new Promise((resolve, reject) => {
    doc.on("end", resolve);
    doc.on("error", reject);
  });
  return Buffer.concat(chunks);
}

function createBlueprintLightService({ db, admin, storage, env, dict }) {
  if (!db) throw new Error("db is required");
  if (!admin) throw new Error("admin is required");
  if (!storage) throw new Error("storage is required");

  const bucketName = env?.GCS_BUCKET_BLUEPRINTS || null;
  const urlExpireDays = Number(env?.BLUEPRINT_URL_EXPIRES_DAYS || 7);

  const bucket = bucketName ? storage.bucket(bucketName) : null;
  const natalService = createNatalService({ db, norm360 });

  async function hasPurchase(lineUserId) {
    if (!lineUserId) return false;
    const snap = await db.collection("line_users").doc(lineUserId).get();
    if (!snap.exists) return false;
    const data = snap.data() || {};
    const purchased = data?.purchases?.blueprint_light?.purchased === true;
    console.log("[blueprint] purchase_lookup", { line_user_id: lineUserId, purchased });
    return purchased;
  }

  async function getLineUser(lineUserId) {
    if (!lineUserId) return null;
    const snap = await db.collection("line_users").doc(lineUserId).get();
    return snap.exists ? snap.data() || null : null;
  }

  async function getOrCreateSignedUrl({ lineUserId }) {
    if (!lineUserId) return { ok: false, code: "missing_line_user" };
    if (!bucketName || !bucket) return { ok: false, code: "config_missing" };

    const purchased = await hasPurchase(lineUserId);
    if (!purchased) return { ok: false, code: "not_purchased" };

    const filePath = `blueprints/light/${lineUserId}/v1.pdf`;
    const file = bucket.file(filePath);
    const [exists] = await file.exists();
    console.log("[blueprint] gcs", {
      bucket_set: !!bucketName,
      file_path: filePath,
      object_exists: !!exists,
    });

    if (!exists) return { ok: false, code: "not_ready" };

    const expiresMs = urlExpireDays * 24 * 60 * 60 * 1000;
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + expiresMs,
      version: "v4",
    });

    console.log("[blueprint] signed_url", { ok: !!url });
    return { ok: true, url };
  }

  async function generateAndStore({ lineUserId }) {
    if (!lineUserId) throw new Error("lineUserId is required");
    if (!bucketName || !bucket) throw new Error("bucket not configured");

    const lineUser = await getLineUser(lineUserId);
    if (!lineUser) throw new Error("line user not found");
    const appUserId = lineUser.app_user_id || null;
    if (!appUserId) throw new Error("app_user_id missing");

    const filePath = `blueprints/light/${lineUserId}/v1.pdf`;
    const file = bucket.file(filePath);
    const [exists] = await file.exists();
    if (exists) {
      console.log("[blueprint] generate skip (exists)", { file_path: filePath });
      return { ok: true, filePath, skipped: true };
    }

    const natalCache = await natalService.loadNatalFromcache(appUserId);
    if (!natalCache) throw new Error("natal_cache missing");

    const { ok, longitudes } = natalService.extractNatalLongitudes(natalCache);
    if (!ok) throw new Error("natal_cache invalid");

    const rowsMain = [];
    const rowsExtra = [];
    const rowsAngles = [];
    const element = { fire: 0, earth: 0, air: 0, water: 0 };
    const modality = { cardinal: 0, fixed: 0, mutable: 0 };

    const pushRow = (rows, key, lon, { count = false } = {}) => {
      const meta = toSignMeta(dict, lon);
      if (!meta) return;
      rows.push({
        key,
        glyph: BODY_GLYPH[key] || "",
        label: BODY_LABEL[key] || key,
        value: formatSignText(meta),
      });
      if (count) {
        if (meta.element && element[meta.element] !== undefined) element[meta.element] += 1;
        if (meta.modality && modality[meta.modality] !== undefined) modality[meta.modality] += 1;
      }
    };

    BODY_ORDER_MAIN.forEach((k) => {
      const lon = longitudes[k];
      if (Number.isFinite(Number(lon))) pushRow(rowsMain, k, lon, { count: true });
    });

    const asc = longitudes.asc;
    const mc = longitudes.mc;
    const ic = Number.isFinite(Number(mc)) ? norm360(Number(mc) + 180) : null;
    const dc = Number.isFinite(Number(asc)) ? norm360(Number(asc) + 180) : null;
    if (Number.isFinite(Number(asc))) pushRow(rowsAngles, "asc", asc);
    if (Number.isFinite(Number(mc))) pushRow(rowsAngles, "mc", mc);
    if (Number.isFinite(Number(ic))) pushRow(rowsAngles, "ic", ic);
    if (Number.isFinite(Number(dc))) pushRow(rowsAngles, "dc", dc);

    BODY_ORDER_EXTRA.forEach((k) => {
      const lon = longitudes[k];
      if (Number.isFinite(Number(lon))) pushRow(rowsExtra, k, lon);
    });

    const birthText = buildBirthText(natalCache?.birth || {});
    const displayName = lineUser?.line_profile?.display_name || "あなた";
    const pdfBuffer = await renderPdfBuffer({
      displayName,
      birthText,
      rowsMain,
      rowsAngles,
      rowsExtra,
      element,
      modality,
    });

    await file.save(pdfBuffer, {
      contentType: "application/pdf",
      resumable: false,
      metadata: { cacheControl: "private, max-age=0, no-transform" },
    });

    console.log("[blueprint] generate stored", { file_path: filePath });
    return { ok: true, filePath, skipped: false };
  }

  return {
    hasPurchase,
    getOrCreateSignedUrl,
    generateAndStore,
  };
}

module.exports = { createBlueprintLightService };
