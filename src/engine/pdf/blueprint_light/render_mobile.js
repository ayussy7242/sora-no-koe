"use strict";

const PDFDocument = require("pdfkit");

const { registerFonts } = require("./assets");
const { getLayoutConfig, applyLayoutConfig } = require("./core/layout");
const { initSymbolFonts } = require("./symbols");
const { contentWidth } = require("./layout");
const { drawTextBlock, sanitizeText } = require("./core/components");
const { BODY_GLYPH } = require("./shared");
const { COLORS } = require("./assets");
const { pickSymbolFontName } = require("./symbols");
const path = require("path");
const puppeteer = require("puppeteer");
const { buildBlueprintV25WireframeHtml, PAGE_WIDTH, PAGE_HEIGHT } = require("../blueprint_v25/wireframe");
const { buildBlueprintV25BgImages, buildStoryStub } = require("../blueprint_v25/backgrounds");
const {
  SPACE,
  TYPE,
  bumpFont,
  V25_SCALE,
  V25_TITLE_SCALE,
} = require("./mobile/constants");
const { calcAscLon, calcMcLon, collectElementCounts, collectModalityCounts } = require("./mobile/formatters");
const { renderMobileCover } = require("./mobile/sections/cover");
const { renderMobileQuickMap } = require("./mobile/sections/quick_map");
const { renderMobileStructure } = require("./mobile/sections/structure");
const { renderMobilePlanetsIntro, renderMobilePlanets } = require("./mobile/sections/planets");
const { renderMobileClosing } = require("./mobile/sections/closing");

function renderV25Heading(doc, layout, { code, titleJa, titleEn }) {
  const titleSize = Math.round(bumpFont(TYPE.title) * V25_TITLE_SCALE);
  const subSize = Math.round(bumpFont(TYPE.meta) * V25_TITLE_SCALE);
  drawTextBlock(doc, layout, String(code || ""), {
    font: "note",
    size: subSize - 2,
    color: COLORS.textSub,
    marginAfter: SPACE.xs,
  });
  drawTextBlock(doc, layout, String(titleJa || ""), {
    font: "title",
    size: titleSize,
    marginAfter: SPACE.xs,
  });
  drawTextBlock(doc, layout, String(titleEn || ""), {
    font: "note",
    size: subSize,
    color: COLORS.textSub,
    marginAfter: SPACE.lg,
  });
}

function v25BodySize(base) {
  return Math.round(bumpFont(base) * V25_SCALE);
}

function renderV25Section(doc, layout, label, text, { marginAfter = SPACE.md } = {}) {
  if (!label && !text) return;
  if (label) {
    drawTextBlock(doc, layout, label, {
      font: "bold",
      size: v25BodySize(TYPE.h2),
      marginAfter: SPACE.xs,
    });
  }
  if (text) {
    drawTextBlock(doc, layout, sanitizeText(text), {
      font: "body",
      size: v25BodySize(TYPE.body),
      lineGap: Math.round(v25BodySize(TYPE.body) * 0.6),
      marginAfter,
    });
  } else {
    layout.y += marginAfter;
  }
}

function renderV25List(doc, layout, items, { gap = SPACE.sm, font = "body", size = TYPE.body } = {}) {
  const safe = (items || []).filter(Boolean);
  if (!safe.length) return;
  const lineGap = Math.round(v25BodySize(size) * 0.4);
  safe.forEach((item, idx) => {
    doc.font(font).fontSize(v25BodySize(size)).fillColor(COLORS.textMainLight);
    doc.text(sanitizeText(String(item)), layout.x, layout.y, { lineGap });
    layout.y += doc.currentLineHeight(true) + (idx === safe.length - 1 ? SPACE.md : gap);
  });
}

function renderV25InlineSymbols(doc, layout, entries, { gap = 8, symbolSize = 16, textSize = TYPE.body } = {}) {
  const safe = (entries || []).filter(Boolean);
  if (!safe.length) return;
  const fontName = doc._symbolUniversalFontName || pickSymbolFontName(doc, "🜂");
  const lineGap = Math.round(v25BodySize(textSize) * 0.4);
  safe.forEach((entry) => {
    const sym = entry.symbol || "";
    doc.font(fontName).fontSize(v25BodySize(symbolSize)).fillColor(entry.color || COLORS.textMainLight);
    doc.text(sym, layout.x, layout.y - 1, { lineBreak: false });
    const textX = layout.x + symbolSize + gap;
    doc.font("body").fontSize(v25BodySize(textSize)).fillColor(COLORS.textMainLight);
    doc.text(sanitizeText(entry.text || ""), textX, layout.y, { lineGap });
    layout.y += doc.currentLineHeight(true) + SPACE.sm;
  });
  layout.y += SPACE.xs;
}

function renderV25TwoColumnBlocks(doc, layout, leftBlocks, rightBlocks, { colGap = 24 } = {}) {
  const colWidth = (contentWidth(doc) - colGap) / 2;
  const leftX = layout.x;
  const rightX = layout.x + colWidth + colGap;
  const startY = layout.y;
  let leftY = startY;
  let rightY = startY;
  leftBlocks.forEach((block) => {
    const local = { x: leftX, y: leftY };
    renderV25Section(doc, local, block.label, block.text, { marginAfter: SPACE.md });
    leftY = local.y;
  });
  rightBlocks.forEach((block) => {
    const local = { x: rightX, y: rightY };
    renderV25Section(doc, local, block.label, block.text, { marginAfter: SPACE.md });
    rightY = local.y;
  });
  layout.y = Math.max(leftY, rightY) + SPACE.sm;
}

function renderV25AspectNetwork(doc, layout, aspects, { size = 340 } = {}) {
  const safe = Array.isArray(aspects) ? aspects.slice(0, 6) : [];
  if (!safe.length) return;
  const centerX = layout.x + contentWidth(doc) / 2;
  const centerY = layout.y + size / 2;
  const radius = size * 0.38;
  const glyphFont = doc._symbolUniversalFontName || pickSymbolFontName(doc, "☉");
  const uniqueBodies = Array.from(
    new Set(
      safe
        .flatMap((a) => [a.p1_key || a.p1, a.p2_key || a.p2].filter(Boolean))
        .map((k) => String(k).toLowerCase())
    )
  );
  const angles = uniqueBodies.map((_, idx) => (Math.PI * 2 * idx) / uniqueBodies.length - Math.PI / 2);
  const pos = new Map();
  uniqueBodies.forEach((key, idx) => {
    pos.set(key, {
      x: centerX + Math.cos(angles[idx]) * radius,
      y: centerY + Math.sin(angles[idx]) * radius,
    });
  });
  const colorByType = (type) => {
    const t = String(type || "").toLowerCase();
    if (t.includes("conjunction")) return COLORS.textMainLight;
    if (t.includes("trine")) return "#66cdaa";
    if (t.includes("square")) return "#ff7b7b";
    if (t.includes("opposition")) return "#f0c36d";
    if (t.includes("sextile")) return "#7aa7ff";
    return COLORS.textSub;
  };
  doc.save();
  safe.forEach((a) => {
    const aKey = String(a.p1_key || a.p1 || "").toLowerCase();
    const bKey = String(a.p2_key || a.p2 || "").toLowerCase();
    const p1 = pos.get(aKey);
    const p2 = pos.get(bKey);
    if (!p1 || !p2) return;
    doc.strokeColor(colorByType(a.type)).lineWidth(1.2).moveTo(p1.x, p1.y).lineTo(p2.x, p2.y).stroke();
  });
  uniqueBodies.forEach((key) => {
    const p = pos.get(key);
    if (!p) return;
    const glyph = BODY_GLYPH[key] || key.slice(0, 1).toUpperCase();
    doc.font(glyphFont).fontSize(v25BodySize(18)).fillColor(COLORS.textMainLight);
    doc.text(glyph, p.x - 6, p.y - 8, { lineBreak: false });
  });
  doc.restore();
  layout.y = centerY + radius + SPACE.lg;
}

function buildBgCacheDir({ displayName = "", birthText = "" } = {}) {
  const raw = `${displayName}|${birthText}`;
  const safe = raw.replace(/[^a-z0-9]+/gi, "_").slice(0, 60) || "anon";
  return path.join(process.cwd(), "tmp", "blueprint_bg", safe);
}

async function renderPdfBufferMobileV25({
  manifest,
  displayName,
  birthText,
  rowsMain,
  rowsAngles,
  rowsExtra,
  blueprintText,
  bgImages: bgImagesInput,
  story: storyInput,
}) {
  const ascLon = calcAscLon(rowsAngles);
  const mcLon = calcMcLon(rowsAngles);
  const wheelRotationDeg = Number.isFinite(Number(ascLon)) ? 270 - Number(ascLon) : 0;
  const elementCounts = blueprintText?.master_chart?.element_balance || collectElementCounts(rowsMain || []);
  const dateLabel = birthText || "";
  const story = storyInput || buildStoryStub({
    rowsMain,
    rowsExtra,
    elementCounts,
    dateLabel,
  });
  const bgImages = bgImagesInput || await buildBlueprintV25BgImages({
    blueprint: blueprintText,
    rowsMain,
    rowsExtra,
    elementCounts,
    dateLabel,
    outDir: buildBgCacheDir({ displayName, birthText }),
    inline: true,
  });
  const html = buildBlueprintV25WireframeHtml({
    data: {
      blueprint: blueprintText || {},
      displayName,
      ownerName: displayName,
      birthText,
      story,
      bg_images: bgImages,
      elementCounts,
      modalityCounts: blueprintText?.master_chart?.modality_balance || collectModalityCounts(rowsMain || []),
      wheelRotationDeg,
      wheelAscLon: Number.isFinite(Number(ascLon)) ? Number(ascLon) : null,
      wheelMcLon: Number.isFinite(Number(mcLon)) ? Number(mcLon) : null,
    },
    useSpace: true,
  });

  const browser = await puppeteer.launch({
    headless: "new",
    protocolTimeout: 240000,
    args: ["--no-sandbox", "--font-render-hinting=medium"],
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(180000);
    page.setDefaultNavigationTimeout(180000);
    await page.setViewport({ width: PAGE_WIDTH, height: PAGE_HEIGHT, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.emulateMediaType("screen");
    await page.evaluate(async () => {
      const imgs = Array.from(document.images || []);
      const imgPromises = imgs.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      });
      const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
      await Promise.all([...imgPromises, fontsReady]);
    });
    if (typeof page.waitForTimeout === "function") {
      await page.waitForTimeout(300);
    } else {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    const pdfBuffer = await page.pdf({
      width: `${PAGE_WIDTH}px`,
      height: `${PAGE_HEIGHT}px`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      timeout: 240000,
    });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

async function renderPdfBufferMobile({
  manifest,
  displayName,
  birthText,
  rowsMain,
  rowsAngles,
  rowsExtra,
  summary,
  element,
  modality,
  bodyTextByKey,
  closingText,
  angleTextByKey,
  nodeText,
  chironText,
  lilithText,
}) {
  const layoutConfig = getLayoutConfig(manifest?.layout || "mobile_9x16");
  const doc = new PDFDocument({ size: layoutConfig.pageSize, margin: layoutConfig.padX, autoFirstPage: false });
  applyLayoutConfig(doc, layoutConfig);
  registerFonts(doc);
  initSymbolFonts(doc);
  doc._darkMode = true;

  const chunks = [];
  doc.on("data", (d) => chunks.push(d));

  renderMobileCover({ doc, displayName, birthText, rowsMain });
  renderMobileQuickMap({ doc, rowsMain, rowsExtra, rowsAngles });
  renderMobileStructure({ doc, element, modality, summary });
  renderMobilePlanetsIntro({ doc });
  renderMobilePlanets({
    doc,
    rowsMain,
    rowsExtra,
    rowsAngles,
    bodyTextByKey,
    nodeText,
    chironText,
    lilithText,
    angleTextByKey,
  });
  renderMobileClosing({ doc, closingText: closingText || "", rowsMain });

  doc.end();
  await new Promise((resolve, reject) => {
    doc.on("end", resolve);
    doc.on("error", reject);
  });
  return Buffer.concat(chunks);
}

module.exports = {
  renderPdfBufferMobile,
  renderPdfBufferMobileV25,
};
