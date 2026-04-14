"use strict";

const sharp = require("sharp");
const { buildSoraWheelSvg } = require("../../../../graphics/sora_wheel");
const { CANVAS, TOK, escapeXml, baseSvg, buildRightFooter } = require("../common/shared");
const { resolveColors } = require("../../theme");
const { signIndexFromKey } = require("../../../../domain/astro/signs");

function estimateTextWidth(line, size) {
  const text = String(line || "");
  if (!text) return size * 2;
  const len = Array.from(text).length;
  return Math.max(size * 2, len * size * 0.82);
}

function makeField({ x, y, w, h, pad = 12, weight = 1, feather = null, kind = "body" }) {
  const px = Number.isFinite(Number(pad)) ? Number(pad) : 0;
  return {
    x: x - px,
    y: y - px,
    w: w + px * 2,
    h: h + px * 2,
    weight,
    feather,
    kind,
  };
}

function getAvoidRegions({ dateLabel, footerLabel = "sky chart", subLabel = "today's chart", brand = "sora-no-koe", chartSize = TOK.chart.chartSize } = {}) {
  const fields = [];
  const left = Math.round((CANVAS.width - chartSize) / 2);
  const top = TOK.chart.chartTop;
  const cx = left + chartSize / 2;
  const cy = top + chartSize / 2;
  // hard wheel core avoidance
  fields.push({
    shape: "circle",
    cx,
    cy,
    r: chartSize * 0.42,
    weight: 1,
    feather: 24,
    kind: "wheelCore",
  });
  // soft outer ring avoidance
  fields.push({
    shape: "circle",
    cx,
    cy,
    r: chartSize * 0.54,
    weight: 0.45,
    feather: 90,
    kind: "wheelRing",
  });
  if (footerLabel) {
    const w = estimateTextWidth(footerLabel, TOK.chart.footerLabelSize);
    fields.push(makeField({
      x: TOK.marginX,
      y: TOK.chart.footerLabelY - TOK.chart.footerLabelSize,
      w,
      h: TOK.chart.footerLabelSize * 1.2,
      pad: 12,
      weight: 0.8,
      kind: "footer",
    }));
  }
  if (subLabel) {
    const w = estimateTextWidth(subLabel, TOK.chart.subLabelSize);
    fields.push(makeField({
      x: TOK.marginX,
      y: TOK.chart.subLabelY - TOK.chart.subLabelSize,
      w,
      h: TOK.chart.subLabelSize * 1.2,
      pad: 12,
      weight: 0.8,
      kind: "footer",
    }));
  }
  if (brand) {
    const w = estimateTextWidth(brand, 24);
    fields.push(makeField({
      x: CANVAS.width - TOK.rightFooter.xOffset - w,
      y: TOK.chart.footerBrandY - 24,
      w,
      h: 26,
      pad: 10,
      weight: 0.8,
      kind: "footer",
    }));
  }
  if (dateLabel) {
    const w = estimateTextWidth(dateLabel, TOK.chart.footerDateY >= TOK.chart.footerBrandY ? 26 : 24);
    fields.push(makeField({
      x: CANVAS.width - TOK.rightFooter.xOffset - w,
      y: TOK.chart.footerDateY - 26,
      w,
      h: 26,
      pad: 10,
      weight: 0.8,
      kind: "footer",
    }));
  }
  return fields;
}

function normalizeAspectType(raw) {
  const key = String(raw || "").toLowerCase().trim();
  if (!key) return "";
  return key.replace(/_\d+$/, "");
}

function resolveAscLonDeg(story) {
  const ascKey =
    story?.public?.house_focus?.asc_sign_key ||
    story?.public?.transit_signs?.asc?.sign_key ||
    "";
  const idx = signIndexFromKey(null, ascKey);
  if (!Number.isFinite(Number(idx)) || idx < 0) return null;
  return idx * 30;
}

function limitAspects(story, maxLines = 10) {
  if (!story || !story.public) return story;
  const next = JSON.parse(JSON.stringify(story));
  const pub = next.public || {};
  const skyTop = Array.isArray(pub.sky_top) ? pub.sky_top : [];
  const skyAll = Array.isArray(pub.sky_all) ? pub.sky_all : [];
  const base = skyAll.length > 0 ? skyAll : skyTop;
  const major = new Set(["conjunction", "sextile", "square", "trine", "opposition"]);
  let list = base.filter((row) => major.has(normalizeAspectType(row?.type || row?.aspect)));
  if (!list.length) list = base;
  list.sort((a, b) => Number(a?.orb_deg) - Number(b?.orb_deg));
  pub.sky_all = list.slice(0, Math.max(1, maxLines));
  next.public = pub;
  return next;
}

function buildSlide2BaseSvg({ dateLabel, footerLabel = "sky chart", subLabel = "today's chart", panel, space } = {}) {
  const colors = resolveColors(space);
  const inner = [
    panel
      ? `<rect x=\"${panel.x}\" y=\"${panel.y}\" width=\"${panel.width}\" height=\"${panel.height}\" rx=\"${panel.radius || 28}\" fill=\"${panel.fill || "#0B0E1A"}\" fill-opacity=\"${panel.opacity ?? 0.7}\" stroke=\"none\" stroke-opacity=\"0\"/>`
      : "",
    `<text x=\"${TOK.marginX}\" y=\"${TOK.chart.footerLabelY}\" fill=\"${colors.textSub}\" font-size=\"${TOK.chart.footerLabelSize}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.chart.footerLabelTracking}em\">${escapeXml(footerLabel)}</text>`,
    subLabel
      ? `<text x=\"${TOK.marginX}\" y=\"${TOK.chart.subLabelY}\" fill=\"${colors.textDim}\" font-size=\"${TOK.chart.subLabelSize}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.chart.subLabelTracking}em\">${escapeXml(subLabel)}</text>`
      : "",
    buildRightFooter({ dateLabel, brandY: TOK.chart.footerBrandY, dateY: TOK.chart.footerDateY, colors }),
  ].join("");

  return baseSvg(inner, space);
}

async function renderSlide2({ story, dateLabel, chartSize = TOK.chart.chartSize, space } = {}) {
  const left = Math.round((CANVAS.width - chartSize) / 2);
  const top = TOK.chart.chartTop;
  const backgroundSvg = buildSlide2BaseSvg({ dateLabel, panel: null, space });
  const base = sharp(Buffer.from(backgroundSvg));
  const chartStory = limitAspects(story, 20);
  const ascLonDeg = resolveAscLonDeg(chartStory);
  const chartSvg = buildSoraWheelSvg({
    story: chartStory,
    dateLabel,
    size: chartSize,
    ascLonDeg: Number.isFinite(Number(ascLonDeg)) ? ascLonDeg : null,
    houseSystem: Number.isFinite(Number(ascLonDeg)) ? "whole_sign" : null,
    showAngleLabels: false,
  });
  const chartBuffer = Buffer.from(chartSvg);
  const composed = base.composite([{ input: chartBuffer, top, left }]);
  return composed.png({ compressionLevel: 9 }).toBuffer();
}

module.exports = {
  buildSlide3Svg: buildSlide2BaseSvg,
  getAvoidRegions,
  getTextFields: getAvoidRegions,
  renderSlide3: renderSlide2,
};
