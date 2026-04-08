"use strict";

const sharp = require("sharp");
const { buildSoraWheelSvg } = require("../../../../graphics/sora_wheel");
const { CANVAS, TOK, escapeXml, baseSvg } = require("../common/shared");
const { resolveColors } = require("../../theme");

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function resolveAspect({ story, resonanceAspect }) {
  if (resonanceAspect) return resonanceAspect;
  return (
    story?.outputs?.ig?.source?.resonance_aspect ||
    story?.public?.sky_top?.[0] ||
    story?.public?.sky_all?.[0] ||
    null
  );
}

function resolveWheelMetrics({ wheelSize, headerBottomY = null, footerTopY = null } = {}) {
  const width = CANVAS.width;
  const height = CANVAS.height;
  const minSide = Math.min(width, height);
  const raw = Number.isFinite(Number(wheelSize)) ? Number(wheelSize) : minSide * 0.86;
  const wheel = clamp(Math.round(raw), Math.round(minSide * 0.72), Math.round(minSide * 0.92));
  const left = Math.round((width - wheel) / 2);
  let centerY = height / 2;
  if (Number.isFinite(Number(headerBottomY)) && Number.isFinite(Number(footerTopY))) {
    const hb = Number(headerBottomY);
    const ft = Number(footerTopY);
    if (ft > hb + wheel * 0.2) {
      centerY = (hb + ft) / 2;
    }
  }
  const top = Math.round(centerY - wheel / 2);
  const cx = left + wheel / 2;
  const cy = top + wheel / 2;
  return { wheel, left, top, cx, cy };
}

function getAvoidRegions({
  wheelSize,
  title = "今日の共鳴",
  subLabel = "today's resonance",
  brand = "ソラのこえ",
  dateLabel = "",
  swipeLabel = "Swipe →",
} = {}) {
  const centerX = CANVAS.width / 2;
  const brandY = TOK.cover.brandY;
  const taglineY = TOK.cover.taglineY;
  const subLabelY = taglineY + TOK.subLabel.offsetY;
  const subLabelSize = TOK.cover.subLabelSize || TOK.subLabel.size;
  const footerY = TOK.footer.dateY;
  const headerBottomY = subLabelY + subLabelSize * 0.8;
  const footerTopY = footerY - (TOK.footer.dateSize || 28);
  const { wheel, cx, cy } = resolveWheelMetrics({ wheelSize, headerBottomY, footerTopY });
  const rCore = wheel * 0.42;
  const rRing = wheel * 0.56;
  const regions = [
    {
      shape: "circle",
      cx,
      cy,
      r: rCore,
      weight: 1,
      feather: 24,
      kind: "wheelCore",
    },
    {
      shape: "circle",
      cx,
      cy,
      r: rRing,
      weight: 0.55,
      feather: 90,
      kind: "wheelRing",
    },
  ];
  const metaSize = TOK.footer.dateSize || 28;
  if (brand) {
    regions.push({
      x: centerX - 240,
      y: brandY - TOK.cover.brandSize,
      w: 480,
      h: 60,
      weight: 0.8,
      kind: "header",
    });
  }
  if (title) {
    regions.push({
      x: centerX - 240,
      y: taglineY - TOK.cover.taglineSize,
      w: 480,
      h: 60,
      weight: 0.8,
      kind: "header",
    });
  }
  if (subLabel) {
    regions.push({
      x: centerX - 240,
      y: subLabelY - subLabelSize,
      w: 480,
      h: 44,
      weight: 0.7,
      kind: "header",
    });
  }
  if (dateLabel) {
    regions.push({
      x: TOK.marginX - 8,
      y: footerY - metaSize,
      w: 260,
      h: metaSize * 1.2,
      weight: 0.7,
      kind: "footer",
    });
  }
  if (swipeLabel) {
    regions.push({
      x: CANVAS.width - TOK.marginX - 220,
      y: footerY - metaSize,
      w: 220,
      h: metaSize * 1.2,
      weight: 0.7,
      kind: "footer",
    });
  }
  return regions;
}

async function renderSlideResonanceWheel({
  story,
  dateLabel,
  resonanceAspect,
  wheelSize,
  brand = "ソラのこえ",
  title = "今日の共鳴",
  subLabel = "today's resonance",
  swipeLabel = "Swipe →",
  space,
} = {}) {
  if (!story) throw new Error("renderSlideResonanceWheel: story required");

  const colors = resolveColors(space);
  const centerX = CANVAS.width / 2;
  const brandY = TOK.cover.brandY;
  const taglineY = TOK.cover.taglineY;
  const subLabelY = taglineY + TOK.subLabel.offsetY;
  const subLabelSize = TOK.cover.subLabelSize || TOK.subLabel.size;
  const footerY = TOK.footer.dateY;
  const footerSize = TOK.footer.dateSize || 28;
  const swipeSize = TOK.footer.swipeSize || 28;
  const headerBottomY = subLabelY + subLabelSize * 0.8;
  const footerTopY = footerY - footerSize;
  const { wheel, left, top } = resolveWheelMetrics({ wheelSize, headerBottomY, footerTopY });
  const inner = [
    `<text x="${centerX}" y="${brandY}" text-anchor="middle" fill="${colors.textMain}" font-size="${TOK.cover.brandSize}" font-family="SoraTitle" letter-spacing="${TOK.cover.brandTracking}em">${escapeXml(brand)}</text>`,
    `<text x="${centerX}" y="${taglineY}" text-anchor="middle" fill="${colors.textSub}" font-size="${TOK.cover.taglineSize}" font-family="SoraTitle" letter-spacing="${TOK.cover.taglineTracking}em">${escapeXml(title)}</text>`,
    `<text x="${centerX}" y="${subLabelY}" text-anchor="middle" fill="${colors.textDim}" font-size="${subLabelSize}" font-family="SoraTitle" letter-spacing="${TOK.subLabel.tracking}em">${escapeXml(subLabel)}</text>`,
    `<text x="${TOK.marginX}" y="${footerY}" fill="${colors.textDim}" font-size="${footerSize}" font-family="SoraTitle" letter-spacing="${TOK.footer.swipeTracking}em">${escapeXml(dateLabel || "")}</text>`,
    `<text x="${CANVAS.width - TOK.marginX}" y="${footerY}" text-anchor="end" fill="${colors.textSub}" font-size="${swipeSize}" font-family="SoraTitle" letter-spacing="${TOK.footer.swipeTracking}em">${escapeXml(swipeLabel || "")}</text>`,
  ].join("");
  const backgroundSvg = baseSvg(inner, space);

  const aspect = resolveAspect({ story, resonanceAspect });
  const highlightBodies = aspect?.a && aspect?.b
    ? [String(aspect.a).toLowerCase(), String(aspect.b).toLowerCase()]
    : null;

  const chartSvg = buildSoraWheelSvg({
    story,
    dateLabel,
    size: wheel,
    showAspects: !!aspect,
    aspects: aspect ? [aspect] : [],
    highlightBodies,
    highlightAspect: aspect || null,
    dimOpacity: 0.08,
    zodiacOpacity: 0.55,
  });

  const base = sharp(Buffer.from(backgroundSvg));
  const composed = base.composite([{ input: Buffer.from(chartSvg), top, left }]);
  return composed.png({ compressionLevel: 9 }).toBuffer();
}

module.exports = {
  getAvoidRegions,
  getTextFields: getAvoidRegions,
  renderSlideResonanceWheel,
};
