"use strict";

const { CANVAS, escapeXml } = require("../common/shared");

const HEADER_LAYOUT = {
  marginX: 72,
  top: 96,
  brandSize: 22,
  primarySize: 60,
  secondarySize: 30,
  subSize: 18,
  gapBrand: 16,
  gapPrimary: 20,
  gapSecondary: 18,
  bottomGap: 60,
};

function buildHeaderBlock({ header, colors, align = "center" } = {}) {
  const h = header || {};
  const brand = h.brand || "";
  const primary = h.primary || "";
  const secondary = h.secondary || "";
  const sub = h.sub_en || "";
  const x = align === "left" ? HEADER_LAYOUT.marginX : CANVAS.width / 2;
  const anchor = align === "left" ? "start" : "middle";
  const parts = [];
  let cursorY = HEADER_LAYOUT.top;

  if (brand) {
    cursorY += HEADER_LAYOUT.brandSize;
    parts.push(
      `<text x="${x}" y="${cursorY}" text-anchor="${anchor}" fill="${colors.textDim}" font-size="${HEADER_LAYOUT.brandSize}" font-family="SoraTitle" letter-spacing="0.22em">${escapeXml(brand)}</text>`
    );
    cursorY += HEADER_LAYOUT.gapBrand;
  }

  if (primary) {
    cursorY += HEADER_LAYOUT.primarySize;
    parts.push(
      `<text x="${x}" y="${cursorY}" text-anchor="${anchor}" fill="${colors.textMain}" font-size="${HEADER_LAYOUT.primarySize}" font-family="SoraTitleBold" letter-spacing="0.06em">${escapeXml(primary)}</text>`
    );
    cursorY += HEADER_LAYOUT.gapPrimary;
  }

  if (secondary) {
    cursorY += HEADER_LAYOUT.secondarySize - 2 + 4;
    parts.push(
      `<text x="${x}" y="${cursorY}" text-anchor="${anchor}" fill="${colors.textSub}" font-size="${HEADER_LAYOUT.secondarySize - 2}" font-family="SoraBodyMedium" letter-spacing="0.08em">${escapeXml(secondary)}</text>`
    );
    cursorY += HEADER_LAYOUT.gapSecondary + 6;
  }

  if (sub) {
    cursorY += HEADER_LAYOUT.subSize;
    parts.push(
      `<text x="${x}" y="${cursorY}" text-anchor="${anchor}" fill="${colors.textDim}" font-size="${HEADER_LAYOUT.subSize}" font-family="SoraTitle" letter-spacing="0.18em">${escapeXml(sub)}</text>`
    );
  }

  const bottomY = cursorY + HEADER_LAYOUT.bottomGap;
  return { svg: parts.join(""), bottomY };
}

module.exports = { HEADER_LAYOUT, buildHeaderBlock };
