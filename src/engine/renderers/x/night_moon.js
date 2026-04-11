"use strict";
const { buildMoonPhaseGlyph: buildMoonPhaseGlyphShared } = require("../../shared/moon_glyph");

const sharp = require("sharp");
const { buildSpaceBackground, buildSpaceSeedLabel } = require("../../shared/space_background");
const { signElement } = require("../../shared/space_background/theme");
const { fontFaceCss } = require("../instagram/assets/fonts");
const { formatDateLabel, toDateLocalJST } = require("../../../utils/time");
const { escapeXml } = require("../../../utils/data/xml");
const { clamp } = require("../../../utils/data/math");
const { resolveColors } = require("../instagram/theme");
const { buildMoonStatus } = require("../../../domain/moon/summary");
const { detectMoonEventLocal, fullMoonNameJaFromDate, isSecondMoonInMonth } = require("../../../domain/moon/events");

const DEFAULT_X_NIGHT_CANVAS = Object.freeze({
  width: 1200,
  height: 675,
});

function estimateTextWidth(line, size) {
  const text = String(line || "");
  if (!text) return size * 2;
  const len = Array.from(text).length;
  return Math.max(size * 2, len * size * 0.82);
}

function textBlock({ x, y, lines, size, lineHeight, color, fontFamily, letterSpacing, filterId, opacity }) {
  const spacing = Number.isFinite(letterSpacing) ? ` letter-spacing="${letterSpacing}em"` : "";
  const filter = filterId ? ` filter="url(#${filterId})"` : "";
  const alpha = Number.isFinite(opacity) ? ` opacity="${Number(opacity).toFixed(3)}"` : "";
  const safeLines = Array.isArray(lines) ? lines : [String(lines || "")];
  const tspans = safeLines
    .filter((line) => String(line || "").trim())
    .map((line, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");
  if (!tspans) return "";
  return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-family="${fontFamily}" text-rendering="geometricPrecision"${spacing}${filter}${alpha}>${tspans}</text>`;
}

function buildMoonPhaseGlyph(opts) {
  return buildMoonPhaseGlyphShared(opts);
}

function buildMoonText({ status, asOfISO, dateLocal, dict }) {
  const phaseName = String(status?.phaseName || "").trim() || "—";
  const waName = String(status?.waName || "").trim();
  const signJa = String(status?.signJa || "").trim();
  const moonAge = Number.isFinite(Number(status?.moonAge)) ? Number(status.moonAge) : null;
  const illumination = Number.isFinite(Number(status?.illumination)) ? Number(status.illumination) : null;

  const isFull = phaseName === "満月";
  const isNew = phaseName === "新月";
  const waxing = Number.isFinite(Number(moonAge)) ? Number(moonAge) < 14.765 : true;

  const event = (isFull || isNew)
    ? detectMoonEventLocal({
        dateLocal,
        asOfISO,
        dict,
        eventKind: isFull ? "full" : "new",
      })
    : null;
  const eventName = String(event?.specialName || event?.moonName || "").trim();
  const eventDate = (() => {
    if (dateLocal) return new Date(`${dateLocal}T12:00:00+09:00`);
    if (asOfISO) return new Date(asOfISO);
    return new Date();
  })();
  const isBlueMoon = isSecondMoonInMonth(eventDate, 180);
  const isBlackMoon = isSecondMoonInMonth(eventDate, 0);
  const fullMoonName = fullMoonNameJaFromDate(eventDate);

  let mainLabel = "";
  let smallLabel = "";
  if (isFull || isNew) {
    mainLabel = [phaseName, signJa].filter(Boolean).join(" ");
    if (isFull) {
      smallLabel = eventName || (isBlueMoon ? "ブルームーン" : fullMoonName) || "";
    } else {
      smallLabel = eventName || (isBlackMoon ? "ブラックムーン" : "");
    }
  } else {
    const phaseFallback = ["満ちゆく月", "欠けゆく月"].includes(phaseName) ? "" : phaseName;
    const core = waName || phaseFallback;
    mainLabel = [core, signJa].filter(Boolean).join(" ");
    smallLabel = waxing ? "満ちゆくサイクル" : "欠けゆくサイクル";
  }

  const moonAgeLabel = moonAge != null ? `月齢 ${moonAge.toFixed(1)}` : "";
  const illuminationLabel = illumination != null ? `照度 ${Math.round(illumination * 100)}%` : "";

  return {
    mainLabel,
    cycleLabel: smallLabel,
    moonAgeLabel,
    illuminationLabel,
    moonIllumination: illumination != null ? illumination : 0.5,
    moonWaxing: waxing,
    moonAgeDays: moonAge,
  };
}

function buildAvoidRegions({ moonBox, textBox }) {
  const regions = [];
  if (moonBox) {
    const moonCx = Number(moonBox.x || 0) + Number(moonBox.w || 0) / 2;
    const moonCy = Number(moonBox.y || 0) + Number(moonBox.h || 0) / 2;
    const moonR = Math.max(Number(moonBox.w || 0), Number(moonBox.h || 0)) / 2;
    regions.push({
      shape: "circle",
      cx: moonCx,
      cy: moonCy,
      r: moonR,
      x: moonCx - moonR,
      y: moonCy - moonR,
      w: moonR * 2,
      h: moonR * 2,
      weight: 0.75,
      feather: Math.round(Math.max(18, moonR * 0.9)),
      kind: "moon",
    });
  }
  if (textBox) {
    regions.push({
      ...textBox,
      weight: 0.65,
      feather: Math.round(textBox.h * 1.2),
      softOnly: true,
      kind: "text",
    });
  }
  return regions;
}

function buildBaseSvg({ story, dateLabel, seedLabel, width, height, variant, avoidRegions, inner, extraDefs, spaceConfig }) {
  const space = buildSpaceBackground({
    story,
    dateLabel,
    seedLabel,
    width,
    height,
    variant,
    avoidRegions,
    spaceConfig,
  });
  const defs = `<style>${fontFaceCss()}</style>${extraDefs || ""}${space.defs || ""}`;
  const body = `${space.body || ""}${inner || ""}`;
  return {
    svg: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `<defs>${defs}</defs>`,
      body,
      `</svg>`,
    ].join(""),
    space,
  };
}

async function renderXNightMoonPng({
  story,
  dict,
  asOfISO,
  dateLabel,
  width = DEFAULT_X_NIGHT_CANVAS.width,
  height = DEFAULT_X_NIGHT_CANVAS.height,
  variant = "night_moon",
  supersample = 1,
  spaceConfig = null,
} = {}) {
  if (!story) throw new Error("renderXNightMoonPng: story required");

  const w = Number.isFinite(Number(width)) ? Number(width) : DEFAULT_X_NIGHT_CANVAS.width;
  const h = Number.isFinite(Number(height)) ? Number(height) : DEFAULT_X_NIGHT_CANVAS.height;
  const sample = Number.isFinite(Number(supersample)) ? Math.max(1, Number(supersample)) : 1;
  const renderW = Math.round(w * sample);
  const renderH = Math.round(h * sample);
  const scale = Math.min(renderW / DEFAULT_X_NIGHT_CANVAS.width, renderH / DEFAULT_X_NIGHT_CANVAS.height);

  const asOf = String(asOfISO || story?.meta?.as_of || "").trim() || new Date().toISOString();
  const dateLocal = String(dateLabel || story?.meta?.date_local || story?.public?.date_local || toDateLocalJST(new Date(asOf)));
  const dateLabelSafe = formatDateLabel(dateLocal);
  const seedLabel = buildSpaceSeedLabel({
    seedVersion: "v2",
    channel: "x",
    date: dateLocal,
    variant: String(variant || "night_moon"),
    prefixChannel: true,
  });

  const status = buildMoonStatus({ asOfISO: asOf, story, dict });
  const moonText = buildMoonText({ status, asOfISO: asOf, dateLocal, dict });

  const sizeBoost = 1.4;
  const marginX = Math.round(96 * scale);
  const moonSize = Math.round(220 * scale * sizeBoost);
  const moonX = marginX;
  const moonY = Math.round((renderH - moonSize) / 2);
  const textX = moonX + moonSize + Math.round(80 * scale);
  const cycleSize = Math.round(22 * scale * sizeBoost);
  const baseLabelSize = Math.round(58 * scale * sizeBoost * 0.9);
  const infoSize = Math.round(24 * scale * sizeBoost);
  const infoLineHeight = Math.round(36 * scale * sizeBoost);

  const maxLabelWidth = Math.max(0, renderW - textX - Math.round(80 * scale));
  let labelSize = baseLabelSize;
  if (maxLabelWidth > 0) {
    const measured = estimateTextWidth(moonText.mainLabel, labelSize);
    if (measured > maxLabelWidth) {
      const ratio = maxLabelWidth / measured;
      labelSize = Math.max(Math.round(baseLabelSize * ratio), Math.round(baseLabelSize * 0.65));
    }
  }

  const infoLines = [moonText.moonAgeLabel, moonText.illuminationLabel].filter(Boolean);
  const cycleGap = moonText.cycleLabel ? Math.round(labelSize * 0.28) : 0;
  const textHeight = (moonText.cycleLabel ? Math.round(cycleSize * 1.4) + cycleGap : 0)
    + Math.round(labelSize * 1.2)
    + infoLines.length * infoLineHeight;
  const textTop = Math.round((renderH - textHeight) / 2);
  const cycleY = textTop + cycleSize;
  const labelY = moonText.cycleLabel
    ? cycleY + Math.round(labelSize * 1.15) + cycleGap
    : textTop + labelSize;
  const infoY = labelY + Math.round(labelSize * 0.9);

  const labelWidth = estimateTextWidth(moonText.mainLabel, labelSize);
  const cycleWidth = moonText.cycleLabel ? estimateTextWidth(moonText.cycleLabel, cycleSize) : 0;
  const infoWidth = infoLines.length
    ? Math.max(...infoLines.map((line) => estimateTextWidth(line, infoSize)))
    : 0;
  const textWidth = Math.max(labelWidth, cycleWidth, infoWidth);

  const avoidRegions = buildAvoidRegions({
    moonBox: {
      x: moonX - Math.round(20 * scale),
      y: moonY - Math.round(20 * scale),
      w: moonSize + Math.round(40 * scale),
      h: moonSize + Math.round(40 * scale),
    },
    textBox: {
      x: textX - Math.round(16 * scale),
      y: textTop - Math.round(16 * scale),
      w: textWidth + Math.round(32 * scale),
      h: textHeight + Math.round(32 * scale),
    },
  });

  const safeSeed = String(seedLabel || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const glowId = `nightTextGlow-${safeSeed || "base"}`;
  const glowBlur = Math.max(1.0, 1.6 * scale);
  const extraDefs = [
    `<filter id="${glowId}" x="-50%" y="-50%" width="200%" height="200%">`,
    `<feGaussianBlur stdDeviation="${glowBlur.toFixed(2)}"/>`,
    `</filter>`,
  ].join("");

  const moonSignKey =
    story?.public?.transit_signs?.moon?.sign_key ||
    story?.public?.moon?.sign_key ||
    story?.public?.moon?.sign ||
    story?.public?.moon?.key ||
    "";
  const moonElement = signElement(moonSignKey);
  const resolvedSpaceConfig = (() => {
    const base = (spaceConfig && typeof spaceConfig === "object") ? { ...spaceConfig } : {};
    if (moonElement && moonElement !== "mixed") {
      base.elementOverride = moonElement;
      base.secondaryElementOverride = moonElement;
      base.forceSecondaryMix = false;
    }
    return base;
  })();

  const { svg, space } = buildBaseSvg({
    story,
    dateLabel: dateLabelSafe,
    seedLabel,
    width: renderW,
    height: renderH,
    variant,
    avoidRegions,
    extraDefs,
    spaceConfig: resolvedSpaceConfig,
  });

  const colors = resolveColors(space);
  const glowOpacityMain = 0.18;
  const glowOpacitySub = 0.16;

  const inner = [
    buildMoonPhaseGlyph({
      id: "moon",
      x: moonX,
      y: moonY,
      size: moonSize,
      illumination: moonText.moonIllumination,
      waxing: moonText.moonWaxing,
      moonAgeDays: moonText.moonAgeDays,
    }),
    moonText.cycleLabel
      ? [
        `<text x="${textX}" y="${cycleY}" fill="${colors.textMain}" font-size="${cycleSize}" font-family="SoraTitle" letter-spacing="0.12em" text-rendering="geometricPrecision" filter="url(#${glowId})" opacity="${glowOpacitySub.toFixed(2)}">${escapeXml(moonText.cycleLabel)}</text>`,
        `<text x="${textX}" y="${cycleY}" fill="${colors.textSub}" font-size="${cycleSize}" font-family="SoraTitle" letter-spacing="0.12em" text-rendering="geometricPrecision">${escapeXml(moonText.cycleLabel)}</text>`,
      ].join("")
      : "",
    [
      `<text x="${textX}" y="${labelY}" fill="${colors.textMain}" font-size="${labelSize}" font-family="SoraTitle" letter-spacing="0.06em" text-rendering="geometricPrecision" filter="url(#${glowId})" opacity="${glowOpacityMain.toFixed(2)}">${escapeXml(moonText.mainLabel)}</text>`,
      `<text x="${textX}" y="${labelY}" fill="${colors.textMain}" font-size="${labelSize}" font-family="SoraTitle" letter-spacing="0.06em" text-rendering="geometricPrecision">${escapeXml(moonText.mainLabel)}</text>`,
    ].join(""),
    textBlock({
      x: textX,
      y: infoY,
      lines: infoLines,
      size: infoSize,
      lineHeight: infoLineHeight,
      color: colors.textMain,
      fontFamily: "SoraTitle",
      letterSpacing: 0.06,
      filterId: glowId,
      opacity: glowOpacitySub,
    }),
    textBlock({
      x: textX,
      y: infoY,
      lines: infoLines,
      size: infoSize,
      lineHeight: infoLineHeight,
      color: colors.textSub,
      fontFamily: "SoraTitle",
      letterSpacing: 0.06,
    }),
  ].join("");

  const finalSvg = svg.replace("</svg>", `${inner}</svg>`);
  const basePng = await sharp(Buffer.from(finalSvg)).png({ compressionLevel: 9 }).toBuffer();
  if (sample > 1 && (renderW !== w || renderH !== h)) {
    return sharp(basePng)
      .resize(w, h, { kernel: sharp.kernel.lanczos3 })
      .png({ compressionLevel: 9 })
      .toBuffer();
  }
  return basePng;
}

module.exports = {
  DEFAULT_X_NIGHT_CANVAS,
  renderXNightMoonPng,
};
