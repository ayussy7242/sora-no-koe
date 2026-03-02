"use strict";

const { LAYOUT: A4_LAYOUT } = require("./a4");
const { LAYOUT: MOBILE_LAYOUT } = require("./mobile_9x16");

const LAYOUTS = Object.freeze({
  a4: A4_LAYOUT,
  mobile_9x16: MOBILE_LAYOUT,
});

function getLayoutConfig(name) {
  if (!name) return A4_LAYOUT;
  return LAYOUTS[name] || A4_LAYOUT;
}

function applyLayoutConfig(doc, layoutConfig) {
  const config = layoutConfig || A4_LAYOUT;
  doc._layoutPageSize = config.pageSize;
  doc._layoutPadX = config.padX;
  doc._layoutPadTop = config.padTop;
  doc._layoutPadBottom = config.padBottom;
  doc._layoutSafeFooter = config.safeFooter;
  doc._suppressFooter = !!config.suppressFooter;
  return config;
}

module.exports = {
  getLayoutConfig,
  applyLayoutConfig,
};
