"use strict";

const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const fontkit = require("fontkit");
const { createNatalService } = require("./story_natal");
const { generateBlueprintLightText } = require("./blueprint_light_generate_text");

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

const BODY_ORDER_EXTRA = ["chiron", "lilith", "north_node", "south_node"];

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

const ASTRO_GLYPHS = [
  "☉",
  "☽",
  "☿",
  "♀",
  "♂",
  "♃",
  "♄",
  "♅",
  "♆",
  "♇",
  "⚷",
  "⚸",
  "☊",
  "☋",
  "✶",
  "✷",
  "✹",
  "✦",
  "☍",
  "☌",
  "△",
];

const COLORS = Object.freeze({
  coverBg: "#14162B",
  subBg: "#1C1F3A",
  textMainDark: "#14162B",
  textMainLight: "#EDEEFF",
  textSub: "#B9BDD9",
  logoWhite: "#FFFFFF",
  border: "#EDEEFF",
});

const ASSET_ROOT = path.join(__dirname, "..", "assets");
const FONT_DIR = path.join(ASSET_ROOT, "fonts");
const LOGO_SHAPE_PATH = path.join(ASSET_ROOT, "img", "logo", "sora-no-koe-logo.jpg");
const SYMBOLS_FONT_PRIMARY_PATH = path.resolve(
  process.cwd(),
  "assets",
  "fonts",
  "NotoSansSymbols-Regular.ttf"
);
const SYMBOLS_FONT_SECONDARY_PATH = path.resolve(
  process.cwd(),
  "assets",
  "fonts",
  "NotoSansSymbols2-Regular.ttf"
);
const SYMBOLS_FONT_TERTIARY_PATH = path.resolve(
  process.cwd(),
  "assets",
  "fonts",
  "Symbola_hint.ttf"
);

const FONT_FILES = Object.freeze({
  title: path.join(FONT_DIR, "ZenKakuGothicNew-Medium.ttf"),
  body: path.join(FONT_DIR, "ShipporiMincho-Regular.ttf"),
  bold: path.join(FONT_DIR, "ShipporiMincho-Bold.ttf"),
  note: path.join(FONT_DIR, "KleeOne-Regular.ttf"),
  noteBold: path.join(FONT_DIR, "KleeOne-SemiBold.ttf"),
  symbolsPrimary: SYMBOLS_FONT_PRIMARY_PATH,
  symbolsSecondary: SYMBOLS_FONT_SECONDARY_PATH,
  symbolsTertiary: SYMBOLS_FONT_TERTIARY_PATH,
});

function norm360(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return null;
  return ((n % 360) + 360) % 360;
}

function safeExists(p) {
  try {
    return fs.existsSync(p);
  } catch (_) {
    return false;
  }
}

function registerFonts(doc) {
  for (const [key, fp] of Object.entries(FONT_FILES)) {
    if (safeExists(fp)) {
      try {
        doc.registerFont(key, fp);
      } catch (_) {
        // ignore
      }
    }
  }
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
    flavor: sign?.flavor || sign?.sora_short || "",
  };
}

function formatSignText(meta) {
  if (!meta) return "";
  const mm = String(meta.min).padStart(2, "0");
  return `${meta.sign_ja} ${meta.deg}°${mm}’`;
}

function formatSignPipe(meta) {
  if (!meta) return "";
  const mm = String(meta.min).padStart(2, "0");
  return `${meta.sign_ja}｜${meta.deg}°${mm}’`;
}

function formatNatalListLineText(row) {
  if (!row) return "";
  const prefix = row.glyph ? `${row.glyph}${row.label}` : `${row.label}`;
  return `${prefix}：${row.value}`;
}

function formatNatalListLineParts(row) {
  if (!row) return null;
  return {
    glyph: row.glyph || "",
    rest: `${row.label}：${row.value}`,
  };
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
  return `${y}.${m}.${d}`;
}

function trackedText(doc, text, x, y, tracking, options = {}) {
  let cursor = x;
  for (const ch of String(text)) {
    doc.text(ch, cursor, y, { lineBreak: false, ...options });
    const w = doc.widthOfString(ch);
    cursor += w + tracking;
  }
  return cursor;
}

function applyFont(doc, name, fallback) {
  try {
    doc.font(name);
    return name;
  } catch (_) {
    if (fallback) {
      try {
        doc.font(fallback);
        return fallback;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

function pickSymbolFontName(doc, glyph) {
  const picker = doc._symbolFontPicker;
  const picked = typeof picker === "function" ? picker(glyph) : doc._symbolFontName;
  if (!picked) {
    throw new Error(`symbol glyph missing: ${glyph}`);
  }
  return picked;
}

function loadFontKitFont(fontPath) {
  try {
    return fontkit.openSync(fontPath);
  } catch (_) {
    return null;
  }
}

function hasGlyph(font, glyph) {
  if (!font || !glyph) return false;
  const codePoint = glyph.codePointAt(0);
  if (!codePoint) return false;
  if (typeof font.hasGlyphForCodePoint !== "function") return false;
  return font.hasGlyphForCodePoint(codePoint);
}

function drawGlyphAndText(doc, { glyph, rest, gap = "", textFont = "body", options = {} }) {
  if (glyph) {
    const picked = pickSymbolFontName(doc, glyph);
    applyFont(doc, picked, textFont);
    doc.text(glyph, { continued: true, lineBreak: false });
    applyFont(doc, textFont);
    doc.text(`${gap}${rest}`, options);
    return;
  }
  applyFont(doc, textFont);
  doc.text(rest, options);
}

function drawInlineSymbolCounts(doc, items, { textFont = "body" } = {}) {
  if (!Array.isArray(items) || items.length === 0) return;
  items.forEach((item, idx) => {
    const symbolFont = pickSymbolFontName(doc, item.symbol);
    applyFont(doc, symbolFont, textFont);
    doc.text(item.symbol, { continued: true, lineBreak: false });
    applyFont(doc, textFont);
    doc.text(` ${item.label} ${item.value}`, { continued: idx < items.length - 1, lineBreak: false });
    if (idx < items.length - 1) {
      doc.text(" / ", { continued: true, lineBreak: false });
    }
  });
}

function ensureSpace(doc, neededHeight = 40) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + neededHeight > bottom) {
    doc.addPage();
    return true;
  }
  return false;
}

function drawSectionTitle(doc, title) {
  ensureSpace(doc, 40);
  const x = doc.page.margins.left;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const h = 22;
  const y = doc.y;

  doc.save();
  doc.rect(x, y, w, h).fill(COLORS.subBg);
  doc.fillColor(COLORS.textMainLight).font("title").fontSize(12).text(title, x + 8, y + 5, { lineBreak: false });
  doc.restore();

  doc.moveDown(1.4);
}

function drawDivider(doc) {
  const x = doc.page.margins.left;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.save();
  doc.strokeColor(COLORS.border).strokeOpacity(0.25).lineWidth(1);
  doc.moveTo(x, doc.y).lineTo(x + w, doc.y).stroke();
  doc.restore();
  doc.moveDown(0.6);
}

function renderCover({ doc, displayName }) {
  doc.addPage({ margins: { top: 60, bottom: 60, left: 60, right: 60 } });
  const { width, height } = doc.page;

  doc.save();
  doc.rect(0, 0, width, height).fill(COLORS.coverBg);
  doc.restore();

  if (safeExists(LOGO_SHAPE_PATH)) {
    const logoWidth = width * 0.22;
    const x = (width - logoWidth) / 2;
    const y = height * 0.16;
    try {
      doc.image(LOGO_SHAPE_PATH, x, y, { width: logoWidth });
    } catch (_) {
      // ignore
    }
  }

  const brand = "ソラのこえ";
  doc.fillColor(COLORS.textSub).font("title").fontSize(12);
  const brandTracking = 12 * 0.08;
  const brandWidth = doc.widthOfString(brand) + brandTracking * (brand.length - 1);
  const bx = (width - brandWidth) / 2;
  const by = height * 0.28;
  trackedText(doc, brand, bx, by, brandTracking);

  const title = "魂の設計図（LIGHT）";
  doc.fillColor(COLORS.textMainLight).font("title").fontSize(22);
  const tracking = 22 * 0.08;
  const titleWidth = doc.widthOfString(title) + tracking * (title.length - 1);
  const tx = (width - titleWidth) / 2;
  const ty = height * 0.38;
  trackedText(doc, title, tx, ty, tracking);

  doc.fontSize(12).fillColor(COLORS.textSub);
  doc.text(`${displayName || "あなた"}さん`, 0, ty + 40, { align: "center" });
}

function renderSummary({ doc, element, modality, summary }) {
  drawSectionTitle(doc, "② 全体構造サマリー");
  doc.fillColor(COLORS.textMainDark).font("body").fontSize(11);
  doc.text("属性 / 三区分の分布は以下の通りです。", { lineGap: 4 });
  doc.moveDown(0.4);

  doc.font("bold");
  drawInlineSymbolCounts(doc, [
    { symbol: "✶", label: "火", value: element.fire },
    { symbol: "✷", label: "地", value: element.earth },
    { symbol: "✹", label: "風", value: element.air },
    { symbol: "✦", label: "水", value: element.water },
  ], { textFont: "bold" });
  if (summary?.element?.text) {
    doc.font("body").fontSize(10).fillColor(COLORS.textMainDark).text(summary.element.text, { lineGap: 3 });
  }
  doc.moveDown(0.2);
  doc.font("bold");
  drawInlineSymbolCounts(doc, [
    { symbol: "☍", label: "活動", value: modality.cardinal },
    { symbol: "☌", label: "不動", value: modality.fixed },
    { symbol: "△", label: "柔軟", value: modality.mutable },
  ], { textFont: "bold" });
  if (summary?.modality?.text) {
    doc.font("body").fontSize(10).fillColor(COLORS.textMainDark).text(summary.modality.text, { lineGap: 3 });
  }
  doc.font("body");
  drawDivider(doc);
}

function renderBodyList({ doc, title, rows, lines }) {
  drawSectionTitle(doc, title);
  doc.font("body").fontSize(10).fillColor(COLORS.textMainDark);

  if (Array.isArray(lines) && lines.length) {
    lines.forEach((line) => {
      ensureSpace(doc, 18);
      if (line && typeof line === "object") {
        drawGlyphAndText(doc, { glyph: line.glyph, rest: line.rest, textFont: "body" });
      } else {
        doc.text(line);
      }
    });
    doc.moveDown(0.6);
    drawDivider(doc);
    return;
  }

  const xGlyph = doc.page.margins.left;
  const xLabel = xGlyph + 20;
  const xValue = xLabel + 84;

  rows.forEach((row) => {
    ensureSpace(doc, 20);
    const y = doc.y;
    doc.text(row.glyph || "", xGlyph, y, { lineBreak: false });
    doc.font("bold").text(row.label, xLabel, y, { lineBreak: false });
    doc.font("body").text(row.value, xValue, y);
  });
  doc.moveDown(0.6);
  drawDivider(doc);
}

function renderNarratives({ doc, rows, title }) {
  drawSectionTitle(doc, title);
  rows.forEach((row) => {
    ensureSpace(doc, 40);
    const headingParts = row.titleParts || null;
    const headingRest =
      headingParts?.rest ||
      row.title ||
      `${row.glyph || ""} ${row.label}  ${row.value}`.trim();
    doc.font("bold").fontSize(11).fillColor(COLORS.textMainDark);
    drawGlyphAndText(doc, {
      glyph: headingParts?.glyph,
      rest: headingRest,
      gap: headingParts?.glyph ? " " : "",
      textFont: "bold",
    });
    doc.font("body").fontSize(10).fillColor(COLORS.textMainDark)
      .text(row.text || "（本文は準備中）", { lineGap: 3 });
    doc.moveDown(0.4);
  });
  drawDivider(doc);
}

function renderFooterEcho(doc, text) {
  ensureSpace(doc, 40);
  doc.font("note").fontSize(11).fillColor(COLORS.textSub).text(text, { align: "right" });
}

function formatRowTitle(row) {
  const g = row.glyph ? `${row.glyph} ` : "";
  return `${g}${row.label}｜${row.value}`.trim();
}

function buildAiInput({ displayName, rowsMain, rowsAngles, rowsExtra, element, modality }) {
  const bodies = rowsMain.map((row) => ({
    key: row.key,
    glyph: row.glyph,
    label: row.label,
    sign: row.meta?.sign_ja || "",
    deg: row.meta?.deg ?? null,
    min: row.meta?.min ?? null,
    line: formatRowTitle(row),
  }));

  const angles = rowsAngles.map((row) => ({
    key: row.key,
    label: row.label,
    sign: row.meta?.sign_ja || "",
    deg: row.meta?.deg ?? null,
    min: row.meta?.min ?? null,
    line: formatRowTitle(row),
  }));

  const extras = rowsExtra.map((row) => ({
    key: row.key,
    glyph: row.glyph,
    label: row.label,
    sign: row.meta?.sign_ja || "",
    deg: row.meta?.deg ?? null,
    min: row.meta?.min ?? null,
    line: formatRowTitle(row),
  }));

  const listExtraOrder = ["lilith", "chiron", "north_node", "south_node"];
  const extraMap = rowsExtra.reduce((acc, row) => {
    acc[row.key] = row;
    return acc;
  }, {});
  const fixedTitles = {
    natal_list: [
      ...rowsMain.map(formatNatalListLineText),
      ...listExtraOrder.map((key) => extraMap[key]).filter(Boolean).map(formatNatalListLineText),
      ...rowsAngles.map(formatNatalListLineText),
    ],
    bodies: rowsMain.reduce((acc, row) => {
      acc[row.key] = { title: row.title };
      return acc;
    }, {}),
    chiron: {
      title: rowsExtra.find((r) => r.key === "chiron")?.title || "",
    },
    lilith: {
      title: rowsExtra.find((r) => r.key === "lilith")?.title || "",
    },
    nodes: {
      south: { title: rowsExtra.find((r) => r.key === "south_node")?.title || "" },
      north: { title: rowsExtra.find((r) => r.key === "north_node")?.title || "" },
    },
    angles: {
      asc: { title: rowsAngles.find((r) => r.key === "asc")?.title || "" },
      mc: { title: rowsAngles.find((r) => r.key === "mc")?.title || "" },
      ic: { title: rowsAngles.find((r) => r.key === "ic")?.title || "" },
      dc: { title: rowsAngles.find((r) => r.key === "dc")?.title || "" },
    },
  };

  return {
    product: "blueprint_light_v1",
    tone: "静か・誠実・やわらかいが曖昧すぎない",
    rules: {
      no_prediction: true,
      no_advice: true,
      no_commands: true,
      no_fear: true,
      no_fortune: true,
    },
    user: {
      display_name: displayName || "あなた",
    },
    natal: {
      bodies,
      angles,
      extras,
      element_balance: { ...element },
      modality_balance: { ...modality },
    },
    fixed_titles: fixedTitles,
  };
}

function mapAiContent(ai) {
  const sections = Array.isArray(ai?.sections) ? ai.sections : [];
  const pickSection = (id) => sections.find((s) => s?.id === id) || null;

  const summary = pickSection("summary");
  const summaryBlocks = Array.isArray(summary?.blocks) ? summary.blocks : [];
  const summaryOut = {
    element: summaryBlocks[0] ? { text: summaryBlocks[0].text || "" } : null,
    modality: summaryBlocks[1] ? { text: summaryBlocks[1].text || "" } : null,
  };

  const bodies = pickSection("bodies");
  const bodyItems = Array.isArray(bodies?.items) ? bodies.items : [];
  const bodyTextByKey = new Map(bodyItems.map((i) => [i?.key, i?.text]));

  const angles = pickSection("angles");
  const angleItems = Array.isArray(angles?.items) ? angles.items : [];
  const angleTextByKey = new Map(angleItems.map((i) => [i?.key, i?.text]));

  const chiron = pickSection("chiron");
  const lilith = pickSection("lilith");

  const nodes = pickSection("nodes") || {};
  const nodeBlocks = Array.isArray(nodes?.blocks) ? nodes.blocks : [];
  const nodeText = {
    south:
      nodes?.south?.text ||
      nodes?.south ||
      nodeBlocks.find((b) => b?.key === "south")?.text ||
      nodeBlocks.find((b) => String(b?.subheading || "").includes("☋"))?.text ||
      nodeBlocks[0]?.text ||
      "",
    north:
      nodes?.north?.text ||
      nodes?.north ||
      nodeBlocks.find((b) => b?.key === "north")?.text ||
      nodeBlocks.find((b) => String(b?.subheading || "").includes("☊"))?.text ||
      nodeBlocks[1]?.text ||
      "",
  };

  return {
    summary: summaryOut,
    bodyTextByKey,
    angleTextByKey,
    chironText: chiron?.text || "",
    lilithText: lilith?.text || "",
    nodeText,
    footerEcho: ai?.footer?.echo || "",
  };
}

  async function renderPdfBuffer({
    displayName,
    birthText,
    rowsMain,
    rowsAngles,
    rowsExtra,
    natalLines,
    narratives,
    summary,
    element,
    modality,
    footerEcho,
}) {
  const doc = new PDFDocument({ size: "A4", margin: 56, autoFirstPage: false });
  console.log("[pdf] symbols font primary path", SYMBOLS_FONT_PRIMARY_PATH);
  const symbolsPrimaryExists = safeExists(SYMBOLS_FONT_PRIMARY_PATH);
  console.log("[pdf] symbols font primary exists", symbolsPrimaryExists);
  console.log("[pdf] symbols font secondary path", SYMBOLS_FONT_SECONDARY_PATH);
  const symbolsSecondaryExists = safeExists(SYMBOLS_FONT_SECONDARY_PATH);
  console.log("[pdf] symbols font secondary exists", symbolsSecondaryExists);
  console.log("[pdf] symbols font tertiary path", SYMBOLS_FONT_TERTIARY_PATH);
  const symbolsTertiaryExists = safeExists(SYMBOLS_FONT_TERTIARY_PATH);
  console.log("[pdf] symbols font tertiary exists", symbolsTertiaryExists);
  if (!symbolsPrimaryExists && !symbolsSecondaryExists && !symbolsTertiaryExists) {
    throw new Error(`symbols font missing: ${SYMBOLS_FONT_PRIMARY_PATH}`);
  }
  const symbolFonts = [];
  if (symbolsPrimaryExists) {
    const font = loadFontKitFont(SYMBOLS_FONT_PRIMARY_PATH);
    symbolFonts.push({ name: "symbolsPrimary", font });
  }
  if (symbolsSecondaryExists) {
    const font = loadFontKitFont(SYMBOLS_FONT_SECONDARY_PATH);
    symbolFonts.push({ name: "symbolsSecondary", font });
  }
  if (symbolsTertiaryExists) {
    const font = loadFontKitFont(SYMBOLS_FONT_TERTIARY_PATH);
    symbolFonts.push({ name: "symbolsTertiary", font });
  }
  doc._symbolFontPicker = (glyph) => {
    for (const entry of symbolFonts) {
      if (hasGlyph(entry.font, glyph)) return entry.name;
    }
    return symbolFonts[0]?.name || null;
  };
  const missingSymbols = ASTRO_GLYPHS.filter((g) => !doc._symbolFontPicker(g));
  if (missingSymbols.length) {
    console.log("[pdf] symbols missing glyphs", missingSymbols.join(""));
    throw new Error(`symbols glyph missing: ${missingSymbols.join("")}`);
  }
  registerFonts(doc);

  const chunks = [];
  doc.on("data", (d) => chunks.push(d));

  renderCover({ doc, displayName });
  doc.addPage({ margins: { top: 56, bottom: 56, left: 56, right: 56 } });

  const debugSymbols = String(process.env.BLUEPRINT_DEBUG_SYMBOLS || "") === "1";
  if (debugSymbols) {
    doc.fillColor(COLORS.textMainDark);
    if (symbolsPrimaryExists) {
      applyFont(doc, "symbolsPrimary", "body");
      doc.fontSize(18).text("primary: ☉ ☽ ☿ ♀ ♂ ♃ ♄ ♅ ♆ ♇ ⚷ ⚸ ☊ ☋ ✶ ✷ ✹ ✦ ☍ ☌ △");
    }
    if (symbolsSecondaryExists) {
      applyFont(doc, "symbolsSecondary", "body");
      doc.fontSize(18).text("secondary: ☉ ☽ ☿ ♀ ♂ ♃ ♄ ♅ ♆ ♇ ⚷ ⚸ ☊ ☋ ✶ ✷ ✹ ✦ ☍ ☌ △");
    }
    if (symbolsTertiaryExists) {
      applyFont(doc, "symbolsTertiary", "body");
      doc.fontSize(18).text("tertiary: ☉ ☽ ☿ ♀ ♂ ♃ ♄ ♅ ♆ ♇ ⚷ ⚸ ☊ ☋ ✶ ✷ ✹ ✦ ☍ ☌ △");
    }
    doc.moveDown(0.6);
  }

  doc.fillColor(COLORS.textMainDark).font("title").fontSize(14).text("魂の設計図（LIGHT）");
  doc.font("note").fontSize(9).fillColor(COLORS.textSub)
    .text(`生成日 ${formatDateJst(new Date())}`);
  if (birthText) {
    doc.font("note").fontSize(9).fillColor(COLORS.textSub).text(birthText);
  }
  drawDivider(doc);

  renderBodyList({ doc, title: "① ネイタル一覧（構造データ）", lines: natalLines, rows: rowsMain });
  renderSummary({ doc, element, modality, summary });

  renderNarratives({ doc, title: "③ 各天体の構造記述", rows: narratives.main });
  renderNarratives({ doc, title: "④ キロン", rows: narratives.chiron });
  renderNarratives({ doc, title: "⑤ リリス", rows: narratives.lilith });
  renderNarratives({ doc, title: "⑥ ノード", rows: narratives.nodes });
  renderNarratives({ doc, title: "⑦ 軸", rows: narratives.axes });

  renderFooterEcho(doc, footerEcho || "解釈は、あなたのもの。");

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

    const filePath = `blueprints/light/${lineUserId}/v1.pdf`;
    const jsonPath = `blueprints/light/${lineUserId}/v1.json`;
    const file = bucket.file(filePath);
    const jsonFile = bucket.file(jsonPath);
    const [pdfExists] = await file.exists();
    const [jsonExists] = await jsonFile.exists();

    if (pdfExists && jsonExists) {
      console.log("[blueprint] generate skip (exists)", { file_path: filePath });
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

    const rowsMain = [];
    const rowsAngles = [];
    const rowsExtra = [];
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
        meta,
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
    const displayName = lineUser?.line_profile?.display_name || "あなた";

    let aiData = null;
    if (jsonExists) {
      try {
        const [buf] = await jsonFile.download();
        aiData = JSON.parse(String(buf || ""));
      } catch (e) {
        throw new Error(`json_parse_failed: ${e?.message || String(e)}`);
      }
    } else {
      const aiInput = buildAiInput({ displayName, rowsMain, rowsAngles, rowsExtra, element, modality });
      const aiRes = await generateBlueprintLightText({ env, input: aiInput });
      if (!aiRes?.ok) {
        throw new Error(`ai_failed:${aiRes?.reason || "unknown"}`);
      }
      aiData = aiRes.data;
      await jsonFile.save(JSON.stringify(aiData, null, 2), {
        contentType: "application/json",
        resumable: false,
      });
    }

    const mapped = aiData ? mapAiContent(aiData) : null;
    const summary = mapped?.summary || null;

    if (pdfExists) {
      console.log("[blueprint] generate skip (exists)", { file_path: filePath });
      return { ok: true, filePath, skipped: true };
    }

    const narratives = {
      main: rowsMain.map((row) => ({
        ...row,
        text:
          mapped?.bodyTextByKey?.get(row.key) ||
          row.meta?.flavor ||
          "構造の質感が静かに立ち上がる配置。",
      })),
      chiron: rowsExtra.filter((r) => r.key === "chiron").map((row) => ({
        ...row,
        text: mapped?.chironText || row.meta?.flavor || "傷と回復の入口に、構造的な輪郭が生まれやすい。",
      })),
      lilith: rowsExtra.filter((r) => r.key === "lilith").map((row) => ({
        ...row,
        text: mapped?.lilithText || row.meta?.flavor || "境界の深い層に、静かな緊張が触れやすい。",
      })),
      nodes: [
        rowsExtra.find((r) => r.key === "south_node"),
        rowsExtra.find((r) => r.key === "north_node"),
      ]
        .filter(Boolean)
        .map((row) => ({
          ...row,
          text:
            row.key === "south_node"
              ? mapped?.nodeText?.south || row.meta?.flavor || "方向性の軸が、配置として浮かびやすい。"
              : mapped?.nodeText?.north || row.meta?.flavor || "方向性の軸が、配置として浮かびやすい。",
        })),
      axes: rowsAngles.map((row) => ({
        ...row,
        text:
          mapped?.angleTextByKey?.get(row.key) ||
          row.meta?.flavor ||
          "視点の入口として、構造の基準になる。",
      })),
    };
    const listExtraOrder = ["lilith", "chiron", "north_node", "south_node"];
    const extraMap = rowsExtra.reduce((acc, row) => {
      acc[row.key] = row;
      return acc;
    }, {});
    const natalLines = [
      ...rowsMain.map(formatNatalListLineParts),
      ...listExtraOrder.map((key) => extraMap[key]).filter(Boolean).map(formatNatalListLineParts),
      ...rowsAngles.map(formatNatalListLineParts),
    ];

    const pdfBuffer = await renderPdfBuffer({
      displayName,
      birthText,
      rowsMain,
      rowsAngles,
      rowsExtra,
      natalLines,
      narratives,
      summary,
      element,
      modality,
      footerEcho: mapped?.footerEcho,
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
