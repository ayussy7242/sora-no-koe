"use strict";

const PDFDocument = require("pdfkit");

const { registerFonts } = require("./assets");
const { initSymbolFonts } = require("./symbols");
const { renderCoverV2 } = require("./sections/cover");
const { renderPdfBufferMobile } = require("./render_mobile");
const { getLayoutConfig, applyLayoutConfig } = require("./core/layout");
const { renderTocPage } = require("./sections/toc");
const { renderQuickMapPage } = require("./sections/quick_map");
const { renderStructureSummaryPage } = require("./sections/structure");
const { renderPlanetsIntroPage, renderPlanetPage } = require("./sections/planets");
const { renderPointsPage } = require("./sections/points");
const { renderAnglesPage } = require("./sections/angles");
const { renderClosingPage } = require("./sections/closing");

const RENDER_REV = "2026-02-24-32";

async function renderPdfBuffer({
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
  angleTextByKey,
  chironText,
  lilithText,
  nodeText,
  closingText,
}) {
  const resolved = manifest || { variant: "print" };
  if (resolved.variant === "mobile") {
    return renderPdfBufferMobile({
      manifest: resolved,
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
    });
  }
  const doc = new PDFDocument({ size: "A4", margin: 56, autoFirstPage: false });
  const layoutConfig = getLayoutConfig(resolved.layout);
  applyLayoutConfig(doc, layoutConfig);
  doc.info.Producer = `sora-no-koe pdf ${RENDER_REV}`;
  registerFonts(doc);
  initSymbolFonts(doc);
  doc._darkMode = true;

  const chunks = [];
  doc.on("data", (d) => chunks.push(d));

  renderCoverV2({ doc, displayName, birthText, element, modality, summary, rowsMain });

  const tocItems = [
    { no: "01", title: "ネイタル構造原図｜Natal Structural Blueprint", dest: "sec:quick_map" },
    { no: "02", title: "構造｜Structure Summary", dest: "sec:structure" },
    { no: "03", title: "天体｜Planets（10天体）", dest: "sec:planets" },
    { no: "04", title: "影と軌道｜Shadow & Axis（Nodes｜Chiron｜Lilith）", dest: "sec:points" },
    { no: "05", title: "軸｜Angles（ASC｜MC｜IC｜DC）", dest: "sec:angles" },
    { no: "06", title: "全体統括｜Closing", dest: "sec:closing" },
  ];

  renderTocPage({ doc, items: tocItems });

  renderQuickMapPage({ doc, rowsMain, rowsExtra, rowsAngles, outlineDest: "sec:quick_map" });
  renderStructureSummaryPage({ doc, element, modality, summary, outlineDest: "sec:structure" });

  renderPlanetsIntroPage({ doc, outlineDest: "sec:planets" });
  rowsMain.forEach((row) => {
    const text = bodyTextByKey?.get(row.key) || "";
    renderPlanetPage({ doc, row, text });
  });

  renderPointsPage({ doc, rowsExtra, nodeText, chironText, lilithText, outlineDest: "sec:points" });
  renderAnglesPage({ doc, rowsAngles, angleTextByKey, outlineDest: "sec:angles" });
  renderClosingPage({ doc, closingText: closingText || summary?.closing?.text || "", outlineDest: "sec:closing" });

  doc.end();
  await new Promise((resolve, reject) => {
    doc.on("end", resolve);
    doc.on("error", reject);
  });
  return Buffer.concat(chunks);
}

module.exports = {
  renderPdfBuffer,
};
