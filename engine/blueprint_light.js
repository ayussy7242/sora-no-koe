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

const BODY_TEXT_MIN_CHARS = 200;
const BODY_TEXT_FILLERS = [
  "輪郭は静かに保たれ、質感が先に立つ。",
  "語られる前に、まとまりとして置かれる。",
];
const SUMMARY_TEXT_MIN_CHARS = 90;
const SUMMARY_TEXT_FILLERS = [
  "構造は先に置かれ、感触がゆっくりと形になる。",
];
const LINE_GAP_BODY = 8;
const LINE_GAP_SUMMARY = 8;
const SECTION_GAP = 12;
const PAGE_PAD_X = 40;
const PAGE_PAD_TOP = 36;
const PAGE_PAD_BOTTOM = 44;
const TITLE_PAD = 12;
const SAFE_FOOTER = 80;

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

function contentWidth(doc) {
  return doc.page.width - PAGE_PAD_X * 2;
}

function ensurePageSpace(doc, layout, minHeight = 0) {
  const bottom = doc.page.height - PAGE_PAD_BOTTOM - SAFE_FOOTER;
  if (layout.y + minHeight > bottom) {
    doc.addPage({
      margins: {
        top: PAGE_PAD_TOP,
        bottom: PAGE_PAD_BOTTOM,
        left: PAGE_PAD_X,
        right: PAGE_PAD_X,
      },
    });
    layout.x = PAGE_PAD_X;
    layout.y = PAGE_PAD_TOP;
  }
}

function drawTextBlock(doc, layout, text, { font, size, lineGap, marginAfter, color } = {}) {
  if (!text) return;
  ensurePageSpace(doc, layout, size ? size * 2 : 24);
  doc.fillColor(color || COLORS.textMainDark).font(font || "body").fontSize(size || 11);
  doc.text(text, layout.x, layout.y, {
    width: contentWidth(doc),
    align: "left",
    lineGap: lineGap ?? LINE_GAP_BODY,
  });
  layout.y = doc.y + (marginAfter ?? SECTION_GAP);
}

function drawSymbolHeading(doc, layout, { glyph, rest, fontSize = 16, gap = 6 }) {
  if (!glyph) {
    drawTextBlock(doc, layout, rest, { font: "bold", size: fontSize, marginAfter: 0 });
    return;
  }
  ensurePageSpace(doc, layout, fontSize * 2);
  const symbolFont = pickSymbolFontName(doc, glyph);
  doc.fillColor(COLORS.textMainDark);
  doc.font(symbolFont).fontSize(fontSize).text(glyph, layout.x, layout.y, {
    continued: true,
    lineBreak: false,
    baseline: "alphabetic",
  });
  doc.font("bold").fontSize(fontSize).text(rest, {
    baseline: "alphabetic",
    lineBreak: false,
  });
  layout.y = doc.y;
}

function drawSymbolTextLine(doc, layout, { glyph, rest, font = "body", fontSize = 14, gap = 6 }) {
  if (!glyph) {
    drawTextBlock(doc, layout, rest, { font, size: fontSize, marginAfter: 0 });
    return;
  }
  ensurePageSpace(doc, layout, fontSize * 2);
  const symbolFont = pickSymbolFontName(doc, glyph);
  doc.fillColor(COLORS.textMainDark);
  doc.font(symbolFont).fontSize(fontSize).text(glyph, layout.x, layout.y, { lineBreak: false });
  const symW = doc.widthOfString(glyph);
  doc.font(font).fontSize(fontSize).text(rest, layout.x + symW + gap, layout.y, {
    width: contentWidth(doc) - symW - gap,
    align: "left",
  });
  layout.y = doc.y + LINE_GAP_BODY;
}

function drawSymbolValueLine(doc, layout, segments, { fontSize = 15, lineGap = LINE_GAP_SUMMARY } = {}) {
  if (!Array.isArray(segments) || segments.length === 0) return;
  ensurePageSpace(doc, layout, fontSize * 2);
  let x = layout.x;
  const y = layout.y;
  doc.fillColor(COLORS.textMainDark);
  segments.forEach((seg, idx) => {
    const symbolFont = pickSymbolFontName(doc, seg.symbol);
    doc.font(symbolFont).fontSize(fontSize).text(seg.symbol, x, y, {
      lineBreak: false,
      baseline: "alphabetic",
    });
    x += doc.widthOfString(seg.symbol) + 4;
    doc.font("body").fontSize(fontSize).text(`${seg.label} ${seg.value}`, x, y, {
      lineBreak: false,
      baseline: "alphabetic",
    });
    x += doc.widthOfString(`${seg.label} ${seg.value}`);
    if (idx < segments.length - 1) {
      doc.font("body").fontSize(fontSize).text(" / ", x, y, { lineBreak: false });
      x += doc.widthOfString(" / ");
    }
  });
  layout.y = y + doc.currentLineHeight(true) + lineGap;
}

function ensureBodyText(text) {
  let out = String(text || "").trim();
  let i = 0;
  while (out.length < BODY_TEXT_MIN_CHARS && i < BODY_TEXT_FILLERS.length) {
    out = `${out}${out ? "\n" : ""}${BODY_TEXT_FILLERS[i]}`;
    i += 1;
  }
  return out;
}

function ensureSummaryText(text) {
  let out = String(text || "").trim();
  let i = 0;
  while (out.length < SUMMARY_TEXT_MIN_CHARS && i < SUMMARY_TEXT_FILLERS.length) {
    out = `${out}${out ? " " : ""}${SUMMARY_TEXT_FILLERS[i]}`;
    i += 1;
  }
  return out;
}

function ensureSpace(doc, neededHeight = 40) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + neededHeight > bottom) {
    doc.addPage();
    return true;
  }
  return false;
}

function drawSectionTitle(doc, layout, title) {
  ensurePageSpace(doc, layout, TITLE_PAD + 54 + TITLE_PAD);
  layout.y += TITLE_PAD;
  const x = layout.x;
  const w = contentWidth(doc);
  const h = 34;
  const y = layout.y;

  doc.save();
  doc.rect(x, y, w, h).fill(COLORS.subBg);
  doc.fillColor(COLORS.textMainLight).font("title").fontSize(20).text(title, x + 10, y + 7, { lineBreak: false });
  doc.restore();

  layout.y = y + h + TITLE_PAD;
}

function drawDivider(doc, layout) {
  ensurePageSpace(doc, layout, 20);
  const x = layout.x;
  const w = contentWidth(doc);
  doc.save();
  doc.strokeColor(COLORS.border).strokeOpacity(0.25).lineWidth(1);
  doc.moveTo(x, layout.y).lineTo(x + w, layout.y).stroke();
  doc.restore();
  layout.y += SECTION_GAP;
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

function renderSummary({ doc, layout, element, modality, summary }) {
  drawSectionTitle(doc, layout, "② 全体構造サマリー");
  drawTextBlock(doc, layout, "属性 / 三区分の分布は以下の通りです。", {
    font: "body",
    size: 15,
    lineGap: LINE_GAP_SUMMARY,
    marginAfter: 6,
  });

  drawSymbolValueLine(doc, layout, [
    { symbol: "✶", label: "火", value: element.fire },
    { symbol: "✷", label: "地", value: element.earth },
    { symbol: "✹", label: "風", value: element.air },
    { symbol: "✦", label: "水", value: element.water },
  ], { fontSize: 15, lineGap: LINE_GAP_SUMMARY });

  if (summary?.element?.text) {
    drawTextBlock(doc, layout, ensureSummaryText(summary.element.text), {
      font: "body",
      size: 15,
      lineGap: LINE_GAP_SUMMARY,
      marginAfter: 6,
    });
  }

  drawSymbolValueLine(doc, layout, [
    { symbol: "☍", label: "活動", value: modality.cardinal },
    { symbol: "☌", label: "不動", value: modality.fixed },
    { symbol: "△", label: "柔軟", value: modality.mutable },
  ], { fontSize: 15, lineGap: LINE_GAP_SUMMARY });

  if (summary?.modality?.text) {
    drawTextBlock(doc, layout, ensureSummaryText(summary.modality.text), {
      font: "body",
      size: 15,
      lineGap: LINE_GAP_SUMMARY,
      marginAfter: SECTION_GAP,
    });
  }

  drawDivider(doc, layout);
}

function renderBodyList({ doc, layout, title, rows, lines }) {
  drawSectionTitle(doc, layout, title);

  const listLines =
    Array.isArray(lines) && lines.length
      ? lines
      : Array.isArray(rows) && rows.length
        ? rows.map((row) => ({
            glyph: row.glyph || "",
            rest: `${row.label}：${row.value}`,
          }))
        : [];

  if (!listLines.length) {
    drawDivider(doc, layout);
    return;
  }

  const textLines = listLines.map((line) => (line && typeof line === "object" ? line.rest : String(line || "")));
  const glyphLines = listLines.map((line) => (line && typeof line === "object" ? line.glyph || "" : ""));

  const universalFont = doc._symbolUniversalFontName || null;
  if (universalFont) {
    const glyphText = glyphLines.join("\n");
    const restText = textLines.join("\n");
    const fontSize = 15;
    const gap = 8;
    const glyphWidth = doc.font(universalFont).fontSize(fontSize).widthOfString("☉");
    const colW = Math.max(glyphWidth, 12) + gap;

    ensurePageSpace(doc, layout, listLines.length * (fontSize + LINE_GAP_BODY) + 12);
    doc.fillColor(COLORS.textMainDark);
    doc.font(universalFont).fontSize(fontSize).text(glyphText, layout.x, layout.y, {
      width: colW,
      align: "left",
      lineGap: LINE_GAP_BODY,
    });
    doc.font("body").fontSize(fontSize).text(restText, layout.x + colW, layout.y, {
      width: contentWidth(doc) - colW,
      align: "left",
      lineGap: LINE_GAP_BODY,
    });
    layout.y = doc.y + SECTION_GAP;
  } else {
    listLines.forEach((line) => {
      if (line && typeof line === "object") {
        drawSymbolTextLine(doc, layout, { glyph: line.glyph, rest: line.rest, font: "body", fontSize: 11 });
      } else {
        drawTextBlock(doc, layout, String(line || ""), { font: "body", size: 11, marginAfter: 0 });
      }
    });
    layout.y += SECTION_GAP;
  }

  drawDivider(doc, layout);
}

function renderNarratives({ doc, layout, rows, title }) {
  drawSectionTitle(doc, layout, title);
  rows.forEach((row) => {
    const headingParts = row.titleParts || null;
    const headingRest =
      headingParts?.rest ||
      row.title ||
      `${row.glyph || ""} ${row.label}  ${row.value}`.trim();
    drawSymbolHeading(doc, layout, {
      glyph: headingParts?.glyph,
      rest: headingRest,
      fontSize: 16,
      gap: 6,
    });
    layout.y += 10;
    drawTextBlock(doc, layout, ensureBodyText(row.text) || "（本文は準備中）", {
      font: "body",
      size: 15,
      lineGap: LINE_GAP_BODY,
      marginAfter: SECTION_GAP,
    });
  });
  drawDivider(doc, layout);
}

function renderFooterEcho(doc, layout, text) {
  drawTextBlock(doc, layout, text, {
    font: "note",
    size: 11,
    lineGap: LINE_GAP_BODY,
    marginAfter: 0,
    color: COLORS.textSub,
  });
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
    degree_value: row.meta ? row.meta.deg + (row.meta.min || 0) / 60 : null,
    sign_flavor: row.meta?.flavor || "",
    line: formatRowTitle(row),
  }));

  const angles = rowsAngles.map((row) => ({
    key: row.key,
    label: row.label,
    sign: row.meta?.sign_ja || "",
    deg: row.meta?.deg ?? null,
    min: row.meta?.min ?? null,
    degree_value: row.meta ? row.meta.deg + (row.meta.min || 0) / 60 : null,
    line: formatRowTitle(row),
  }));

  const extras = rowsExtra.map((row) => ({
    key: row.key,
    glyph: row.glyph,
    label: row.label,
    sign: row.meta?.sign_ja || "",
    deg: row.meta?.deg ?? null,
    min: row.meta?.min ?? null,
    degree_value: row.meta ? row.meta.deg + (row.meta.min || 0) / 60 : null,
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
  doc._symbolUniversalFontName =
    symbolFonts.find((entry) => entry.name === "symbolsTertiary" && entry.font)?.name ||
    symbolFonts.find((entry) => entry.font && ASTRO_GLYPHS.every((g) => hasGlyph(entry.font, g)))?.name ||
    null;
  const missingSymbols = ASTRO_GLYPHS.filter((g) => !doc._symbolFontPicker(g));
  if (missingSymbols.length) {
    console.log("[pdf] symbols missing glyphs", missingSymbols.join(""));
    throw new Error(`symbols glyph missing: ${missingSymbols.join("")}`);
  }
  registerFonts(doc);

  const chunks = [];
  doc.on("data", (d) => chunks.push(d));

  renderCover({ doc, displayName });
  doc.addPage({ margins: { top: PAGE_PAD_TOP, bottom: PAGE_PAD_BOTTOM, left: PAGE_PAD_X, right: PAGE_PAD_X } });
  const layout = { x: PAGE_PAD_X, y: PAGE_PAD_TOP };

  const debugSymbols = String(process.env.BLUEPRINT_DEBUG_SYMBOLS || "") === "1";
  if (debugSymbols) {
    if (symbolsPrimaryExists) {
      drawTextBlock(doc, layout, "primary: ☉ ☽ ☿ ♀ ♂ ♃ ♄ ♅ ♆ ♇ ⚷ ⚸ ☊ ☋ ✶ ✷ ✹ ✦ ☍ ☌ △", {
        font: "symbolsPrimary",
        size: 18,
        lineGap: LINE_GAP_BODY,
        marginAfter: SECTION_GAP,
      });
    }
    if (symbolsSecondaryExists) {
      drawTextBlock(doc, layout, "secondary: ☉ ☽ ☿ ♀ ♂ ♃ ♄ ♅ ♆ ♇ ⚷ ⚸ ☊ ☋ ✶ ✷ ✹ ✦ ☍ ☌ △", {
        font: "symbolsSecondary",
        size: 18,
        lineGap: LINE_GAP_BODY,
        marginAfter: SECTION_GAP,
      });
    }
    if (symbolsTertiaryExists) {
      drawTextBlock(doc, layout, "tertiary: ☉ ☽ ☿ ♀ ♂ ♃ ♄ ♅ ♆ ♇ ⚷ ⚸ ☊ ☋ ✶ ✷ ✹ ✦ ☍ ☌ △", {
        font: "symbolsTertiary",
        size: 18,
        lineGap: LINE_GAP_BODY,
        marginAfter: SECTION_GAP,
      });
    }
  }

  drawTextBlock(doc, layout, "魂の設計図（LIGHT）", {
    font: "title",
    size: 28,
    lineGap: LINE_GAP_BODY,
    marginAfter: 6,
  });
  const noteLines = [`生成日 ${formatDateJst(new Date())}`];
  if (birthText) noteLines.push(birthText);
  drawTextBlock(doc, layout, noteLines.join("\n"), {
    font: "note",
    size: 9,
    lineGap: 3.6,
    marginAfter: SECTION_GAP,
    color: COLORS.textSub,
  });
  drawDivider(doc, layout);

  renderBodyList({ doc, layout, title: "① ネイタル一覧（構造データ）", lines: natalLines, rows: rowsMain });
  renderSummary({ doc, layout, element, modality, summary });

  renderNarratives({ doc, layout, title: "③ 各天体の構造記述", rows: narratives.main });
  renderNarratives({ doc, layout, title: "④ キロン", rows: narratives.chiron });
  renderNarratives({ doc, layout, title: "⑤ リリス", rows: narratives.lilith });
  renderNarratives({ doc, layout, title: "⑥ ノード", rows: narratives.nodes });
  renderNarratives({ doc, layout, title: "⑦ 軸", rows: narratives.axes });

  renderFooterEcho(doc, layout, footerEcho || "解釈は、あなたのもの。");

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
