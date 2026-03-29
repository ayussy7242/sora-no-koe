"use strict";

const sharp = require("sharp");
const { buildSoraWheelSvg } = require("../../graphics/sora_wheel");
const { buildSpaceBackground } = require("../../shared/space_background");
const { fontFaceCss } = require("../ig/assets/ig_fonts");

const DEFAULT_X_CANVAS = Object.freeze({
  width: 1200,
  height: 675,
});

function clamp(num, min, max) {
  if (!Number.isFinite(Number(num))) return min;
  return Math.max(min, Math.min(max, Number(num)));
}

function formatDateLabel(dateLocal) {
  return String(dateLocal || "").replace(/-/g, ".");
}

function escapeXml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildFooterSvg({ width, height, brand, dateLabel }) {
  if (!brand && !dateLabel) return "";
  const minSide = Math.min(width, height);
  const brandSize = Math.round(minSide * 0.04);
  const dateSize = Math.round(minSide * 0.032);
  const tracking = 0.08;
  const padding = Math.round(minSide * 0.06);
  const x = width - padding;
  const brandY = height - padding - dateSize - Math.round(minSide * 0.012);
  const dateY = height - padding;
  const color = "#C8CBF2";
  const opacity = 0.7;
  const brandLine = brand
    ? `<text x="${x}" y="${brandY}" text-anchor="end" fill="${color}" opacity="${opacity}" font-size="${brandSize}" font-family="SoraTitle" letter-spacing="${tracking}em">${escapeXml(brand)}</text>`
    : "";
  const dateLine = dateLabel
    ? `<text x="${x}" y="${dateY}" text-anchor="end" fill="${color}" opacity="${opacity}" font-size="${dateSize}" font-family="SoraTitle" letter-spacing="${tracking}em">${escapeXml(dateLabel)}</text>`
    : "";
  return `${brandLine}${dateLine}`;
}

function buildBaseSvg({ story, dateLabel, width, height, variant, avoidRegions, underlay, footer }) {
  const space = buildSpaceBackground({
    story,
    dateLabel,
    width,
    height,
    variant,
    avoidRegions,
  });
  const defs = `<style>${fontFaceCss()}</style>${space.defs || ""}${underlay?.defs || ""}`;
  const body = `${space.body || ""}${underlay?.body || ""}${footer || ""}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs>${defs}</defs>`,
    body,
    `</svg>`,
  ].join("");
}

function buildWheelUnderlay({ cx, cy, r }) {
  const id = `wheelHalo-${Math.round(cx)}-${Math.round(cy)}-${Math.round(r)}`;
  const defs = [
    `<radialGradient id="${id}" cx="50%" cy="50%" r="50%">`,
    `<stop offset="0%" stop-color="#0B0E1A" stop-opacity="0.72"/>`,
    `<stop offset="55%" stop-color="#0B0E1A" stop-opacity="0.48"/>`,
    `<stop offset="100%" stop-color="#0B0E1A" stop-opacity="0"/>`,
    `</radialGradient>`,
  ].join("");
  const body = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id})"/>`;
  return { defs, body };
}

async function renderXMorningWheelPng({
  story,
  dateLabel,
  width = DEFAULT_X_CANVAS.width,
  height = DEFAULT_X_CANVAS.height,
  variant = "story_today",
  wheelSize,
} = {}) {
  if (!story) throw new Error("renderXMorningWheelPng: story required");

  const w = Number.isFinite(Number(width)) ? Number(width) : DEFAULT_X_CANVAS.width;
  const h = Number.isFinite(Number(height)) ? Number(height) : DEFAULT_X_CANVAS.height;
  const minSide = Math.min(w, h);
  const rawWheel = Number.isFinite(Number(wheelSize)) ? Number(wheelSize) : minSide * 0.88;
  const wheel = clamp(Math.round(rawWheel), Math.round(minSide * 0.62), Math.round(minSide * 0.94));
  const left = Math.round((w - wheel) / 2);
  const top = Math.round((h - wheel) / 2);

  const dateLabelSafe = dateLabel || formatDateLabel(story?.meta?.date_local || story?.public?.date_local);
  const pad = Math.round(wheel * 0.08);
  const avoidRegions = [{
    x: left - pad,
    y: top - pad,
    w: wheel + pad * 2,
    h: wheel + pad * 2,
    weight: 1,
    feather: Math.round(wheel * 0.22),
  }];

  const underlay = buildWheelUnderlay({
    cx: left + wheel / 2,
    cy: top + wheel / 2,
    r: wheel * 0.6,
  });

  const baseSvg = buildBaseSvg({
    story,
    dateLabel: dateLabelSafe,
    width: w,
    height: h,
    variant,
    avoidRegions,
    underlay,
    footer: buildFooterSvg({
      width: w,
      height: h,
      brand: "sora-no-koe",
      dateLabel: formatDateLabel(dateLabelSafe),
    }),
  });

  const chartSvg = buildSoraWheelSvg({
    story,
    dateLabel: dateLabelSafe,
    size: wheel,
  });

  const base = sharp(Buffer.from(baseSvg));
  const composed = base.composite([{ input: Buffer.from(chartSvg), top, left }]);
  return composed.png({ compressionLevel: 9 }).toBuffer();
}

module.exports = {
  DEFAULT_X_CANVAS,
  renderXMorningWheelPng,
};
