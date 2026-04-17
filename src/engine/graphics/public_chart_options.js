"use strict";

const { signIndexFromKey } = require("../../domain/astro/signs");

function resolvePublicWholeSignAscLonDeg(story) {
  const ascKey = String(
    story?.public?.house_focus?.asc_sign_key ||
    story?.public?.transit_signs?.asc?.sign_key ||
    ""
  ).toLowerCase();
  const idx = signIndexFromKey(null, ascKey);
  if (!Number.isFinite(Number(idx)) || idx < 0) return null;
  return idx * 30;
}

function buildPublicWholeSignChartOptions(story, extra = {}) {
  const ascLonDeg = resolvePublicWholeSignAscLonDeg(story);
  return {
    ascLonDeg: Number.isFinite(Number(ascLonDeg)) ? ascLonDeg : null,
    houseSystem: Number.isFinite(Number(ascLonDeg)) ? "whole_sign" : null,
    showAngleLabels: false,
    ...extra,
  };
}

module.exports = {
  resolvePublicWholeSignAscLonDeg,
  buildPublicWholeSignChartOptions,
};
