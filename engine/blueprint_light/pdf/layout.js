"use strict";

const { COLORS } = require("./assets");

const PAGE_PAD_X = 56;
const PAGE_PAD_TOP = 72;
const PAGE_PAD_BOTTOM = 72;
const SAFE_FOOTER = 80;
const FOOTER_TEXT_LEFT = "ソラのこえ ｜ Star Blueprint";

function getPadX(doc) {
  return Number.isFinite(doc?._layoutPadX) ? doc._layoutPadX : PAGE_PAD_X;
}

function getPadTop(doc) {
  return Number.isFinite(doc?._layoutPadTop) ? doc._layoutPadTop : PAGE_PAD_TOP;
}

function getPadBottom(doc) {
  return Number.isFinite(doc?._layoutPadBottom) ? doc._layoutPadBottom : PAGE_PAD_BOTTOM;
}

function getSafeFooter(doc) {
  return Number.isFinite(doc?._layoutSafeFooter) ? doc._layoutSafeFooter : SAFE_FOOTER;
}

function contentWidth(doc) {
  const padX = getPadX(doc);
  return doc.page.width - padX * 2;
}

function drawFooter(doc) {
  if (!doc || doc._suppressFooter) return;
  const pageNumber = Number(doc._pageNumber || 1);
  const padBottom = getPadBottom(doc);
  const padX = getPadX(doc);
  const y = doc.page.height - padBottom + 24;
  const leftX = padX;
  const rightX = doc.page.width - padX;
  const fontSize = 9;
  doc.save();
  doc.font("note").fontSize(fontSize).fillColor(COLORS.textSub).fillOpacity(0.7);
  doc.text(FOOTER_TEXT_LEFT, leftX, y, { lineBreak: false });
  const pageLabel = String(pageNumber).padStart(2, "0");
  const pageW = doc.widthOfString(pageLabel);
  doc.text(pageLabel, rightX - pageW, y, { lineBreak: false });
  doc.restore();
}

function applyPage(doc, { dark = true } = {}) {
  const padX = getPadX(doc);
  const padTop = getPadTop(doc);
  const padBottom = getPadBottom(doc);
  const pageSize = doc?._layoutPageSize || "A4";
  doc.addPage({
    size: pageSize,
    margins: {
      top: padTop,
      bottom: padBottom,
      left: padX,
      right: padX,
    },
  });
  if (dark) {
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLORS.coverBg);
    doc.fillColor(COLORS.textMainLight);
  }
  doc._pageNumber = (doc._pageNumber || 0) + 1;
  drawFooter(doc);
  return { x: padX, y: padTop };
}

function ensurePageSpace(doc, layout, minHeight = 0) {
  const bottom = doc.page.height - getPadBottom(doc) - getSafeFooter(doc);
  if (layout.y + minHeight > bottom) {
    const next = applyPage(doc, { dark: doc._darkMode !== false });
    layout.x = next.x;
    layout.y = next.y;
  }
}

function keepTogether(doc, layout, requiredHeight = 0) {
  ensurePageSpace(doc, layout, requiredHeight);
}

function ensureSpace(doc, neededHeight = 40) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + neededHeight > bottom) {
    applyPage(doc, { dark: doc._darkMode !== false });
    return true;
  }
  return false;
}

function addPage(doc, { dark = true } = {}) {
  return applyPage(doc, { dark });
}

module.exports = {
  PAGE_PAD_X,
  PAGE_PAD_TOP,
  PAGE_PAD_BOTTOM,
  SAFE_FOOTER,
  contentWidth,
  ensurePageSpace,
  keepTogether,
  ensureSpace,
  addPage,
};
