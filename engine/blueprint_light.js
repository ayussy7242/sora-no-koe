"use strict";

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
  const v = ((n % 360) + 360) % 360;
  return v;
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

function buildHtml({ title, subtitle, userLabel, birthText, rowsMain, rowsExtra, rowsAngles, element, modality, generatedAt }) {
  const rowToTr = (row) => (
    `<tr>
      <td class="glyph">${row.glyph || ""}</td>
      <td class="label">${row.label}</td>
      <td class="value">${row.value}</td>
    </tr>`
  );

  const blockTable = (rows) => (
    rows.length
      ? `<table class="tbl"><tbody>${rows.map(rowToTr).join("")}</tbody></table>`
      : `<div class="empty">-</div>`
  );

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8"/>
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 20mm 18mm; }
    body {
      font-family: "Noto Serif JP", "Noto Sans JP", "Noto Sans Symbols2", "Noto Sans Symbols", "Segoe UI Symbol", serif;
      color: #111;
      line-height: 1.6;
      font-size: 12.5px;
      letter-spacing: 0.02em;
    }
    h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: 0.08em; }
    h2 { font-size: 13px; margin: 18px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #ddd; }
    .subtitle { font-size: 11px; color: #666; margin-bottom: 10px; }
    .meta { font-size: 11px; color: #555; margin-bottom: 8px; }
    .divider { margin: 10px 0 12px; border-top: 1px solid #eee; }
    .tbl { width: 100%; border-collapse: collapse; }
    .tbl td { padding: 6px 4px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
    .glyph { width: 18px; text-align: center; }
    .label { width: 90px; }
    .value { width: auto; }
    .pill { display: inline-block; padding: 2px 8px; border: 1px solid #ddd; border-radius: 999px; font-size: 10px; margin-right: 6px; }
    .small { font-size: 11px; color: #666; }
    .footer { margin-top: 18px; font-size: 10px; color: #777; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="subtitle">${subtitle || ""}</div>
  <div class="meta">${userLabel || ""}</div>
  ${birthText ? `<div class="meta">${birthText}</div>` : ""}
  <div class="divider"></div>

  <h2>主要天体</h2>
  ${blockTable(rowsMain)}

  <h2>角度</h2>
  ${blockTable(rowsAngles)}

  <h2>補足天体</h2>
  ${blockTable(rowsExtra)}

  <h2>属性バランス</h2>
  <div class="small">
    <span class="pill">火 ${element.fire}</span>
    <span class="pill">地 ${element.earth}</span>
    <span class="pill">風 ${element.air}</span>
    <span class="pill">水 ${element.water}</span>
  </div>
  <div class="small" style="margin-top:6px;">
    <span class="pill">活動 ${modality.cardinal}</span>
    <span class="pill">不動 ${modality.fixed}</span>
    <span class="pill">柔軟 ${modality.mutable}</span>
  </div>

  <div class="footer">生成: ${generatedAt}</div>
</body>
</html>`;
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

async function renderPdfBuffer(html) {
  const puppeteer = require("puppeteer");
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", right: "18mm", bottom: "20mm", left: "18mm" },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

function createBlueprintLightService({ db, admin, storage, env, dict }) {
  if (!db) throw new Error("db is required");
  if (!admin) throw new Error("admin is required");
  if (!storage) throw new Error("storage is required");

  const bucketName = env?.GCS_BUCKET_BLUEPRINTS;
  if (!bucketName) throw new Error("GCS_BUCKET_BLUEPRINTS is not set");

  const urlExpireDays = Number(env?.BLUEPRINT_URL_EXPIRES_DAYS || 7);
  const bucket = storage.bucket(bucketName);
  const natalService = createNatalService({ db, norm360 });

  async function hasPurchase(lineUserId) {
    if (!lineUserId) return false;
    const snap = await db.collection("line_users").doc(lineUserId).get();
    if (!snap.exists) return false;
    const data = snap.data() || {};
    return data?.purchases?.blueprint_light?.purchased === true;
  }

  async function getLineUserProfile(lineUserId) {
    if (!lineUserId) return null;
    const snap = await db.collection("line_users").doc(lineUserId).get();
    if (!snap.exists) return null;
    return snap.data() || null;
  }

  async function getOrCreateSignedUrl({ lineUserId, appUserId }) {
    if (!lineUserId) return { ok: false, code: "missing_line_user" };

    const purchased = await hasPurchase(lineUserId);
    if (!purchased) return { ok: false, code: "not_purchased" };

    const lineProfile = await getLineUserProfile(lineUserId);
    const resolvedAppUserId = appUserId || lineProfile?.app_user_id || null;
    if (!resolvedAppUserId) return { ok: false, code: "missing_app_user" };

    const filePath = `blueprints/light/${lineUserId}/v1.pdf`;
    const file = bucket.file(filePath);
    const [exists] = await file.exists();

    if (!exists) {
      const cache = await natalService.loadNatalFromcache(resolvedAppUserId);
      if (!cache) return { ok: false, code: "natal_not_ready" };

      const { ok, longitudes } = natalService.extractNatalLongitudes(cache);
      if (!ok) return { ok: false, code: "natal_not_ready" };

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

      // angles (ASC / MC / IC / DC)
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

      const name = lineProfile?.line_profile?.display_name || "あなた";
      const birthText = buildBirthText(cache?.birth);
      const html = buildHtml({
        title: "魂の設計図（LIGHT）",
        subtitle: "出生図の主要構造をまとめたPDF",
        userLabel: `${name}さん`,
        birthText,
        rowsMain,
        rowsExtra,
        rowsAngles,
        element,
        modality,
        generatedAt: formatDateJst(new Date()),
      });

      const pdf = await renderPdfBuffer(html);
      await file.save(pdf, {
        contentType: "application/pdf",
        resumable: false,
        metadata: { cacheControl: "private, max-age=0, no-transform" },
      });
    }

    const expiresMs = urlExpireDays * 24 * 60 * 60 * 1000;
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + expiresMs,
      version: "v4",
    });

    return { ok: true, url };
  }

  return {
    hasPurchase,
    getOrCreateSignedUrl,
  };
}

module.exports = { createBlueprintLightService };
