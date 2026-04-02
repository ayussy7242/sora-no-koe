"use strict";

const { buildSpaceBackground } = require("../../shared/space_background");
const { BACKGROUND_COLORS } = require("../../shared/space_background/constants");
const { PAGE_WIDTH, PAGE_HEIGHT } = require("./constants");

function buildSpaceSvg({ variant, enabled }) {
  if (!enabled) {
    return [
      `<svg class="bg-space__svg" xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}" preserveAspectRatio="xMidYMid slice">`,
      `<rect width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" fill="${BACKGROUND_COLORS.bgDeep}"/>`,
      `</svg>`,
    ].join("");
  }
  const bg = buildSpaceBackground({ width: PAGE_WIDTH, height: PAGE_HEIGHT, variant });
  return [
    `<svg class="bg-space__svg" xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}" preserveAspectRatio="xMidYMid slice">`,
    `<rect width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" fill="${BACKGROUND_COLORS.bgDeep}"/>`,
    `<defs>${bg.defs}</defs>`,
    bg.body,
    `</svg>`,
  ].join("");
}

function buildCosmicNav(activeIndex, totalSlides) {
  const total = Number.isFinite(totalSlides) ? totalSlides : 0;
  if (!total) return "";
  const dots = Array.from({ length: total }, (_, i) => {
    const isActive = i === activeIndex;
    return `<span class="nav-dot ${isActive ? "active" : ""}">${isActive ? "★" : "○"}</span>`;
  }).join("");
  return `<div class="star-nav">${dots}</div>`;
}

function buildPageNumber(index) {
  const num = String(index + 1).padStart(2, "0");
  return `<div class="page-number">${num}</div>`;
}

module.exports = {
  buildSpaceSvg,
  buildCosmicNav,
  buildPageNumber,
};
