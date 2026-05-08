"use strict";

const { CANVAS, TOK, escapeXml, textBlock, baseSvg, renderSvgToPng } = require("../common/shared");
const { resolveColors } = require("../../theme");
const {
  measureTextWidth,
  normalizeSymbol,
  extractGlyph,
  buildGlyphLine,
} = require("../common/glyph_layout");
const { resolveCarouselTextLines } = require("../common/text_layout");

const SIGN_JA_TO_KEY = {
  "牡羊座": "aries",
  "牡牛座": "taurus",
  "双子座": "gemini",
  "蟹座": "cancer",
  "獅子座": "leo",
  "乙女座": "virgo",
  "天秤座": "libra",
  "蠍座": "scorpio",
  "射手座": "sagittarius",
  "山羊座": "capricorn",
  "水瓶座": "aquarius",
  "魚座": "pisces",
};

const CONSTELLATION_POINTS = {
  aries: [
    { x: -0.35, y: 0.15, w: 0.9 },
    { x: -0.1, y: -0.1, w: 1 },
    { x: 0.1, y: -0.25, w: 0.8 },
    { x: 0.3, y: -0.05, w: 1 },
    { x: 0.45, y: 0.2, w: 0.75 },
  ],
  taurus: [
    { x: -0.4, y: 0.05, w: 0.8 },
    { x: -0.15, y: -0.2, w: 1 },
    { x: 0.1, y: 0, w: 0.9 },
    { x: 0.28, y: -0.2, w: 0.8 },
    { x: 0.4, y: 0.15, w: 0.75 },
    { x: 0.18, y: 0.28, w: 0.7 },
  ],
  gemini: [
    { x: -0.35, y: -0.25, w: 1 },
    { x: -0.35, y: 0.15, w: 0.85 },
    { x: -0.05, y: -0.2, w: 0.8 },
    { x: -0.05, y: 0.2, w: 0.8 },
    { x: 0.25, y: -0.25, w: 1 },
    { x: 0.25, y: 0.15, w: 0.9 },
  ],
  cancer: [
    { x: -0.4, y: 0.1, w: 0.75 },
    { x: -0.18, y: -0.05, w: 0.9 },
    { x: 0.05, y: 0.05, w: 0.85 },
    { x: 0.25, y: -0.12, w: 0.9 },
    { x: 0.42, y: 0.12, w: 0.75 },
  ],
  leo: [
    { x: -0.4, y: 0.2, w: 0.8 },
    { x: -0.18, y: 0.05, w: 0.95 },
    { x: 0.02, y: -0.15, w: 1 },
    { x: 0.22, y: -0.05, w: 0.85 },
    { x: 0.35, y: 0.18, w: 0.8 },
    { x: 0.5, y: -0.1, w: 0.75 },
  ],
  virgo: [
    { x: -0.4, y: 0.2, w: 0.8 },
    { x: -0.2, y: -0.05, w: 0.9 },
    { x: 0, y: 0.12, w: 0.85 },
    { x: 0.22, y: -0.12, w: 0.9 },
    { x: 0.38, y: 0.05, w: 0.8 },
    { x: 0.5, y: -0.2, w: 0.75 },
  ],
  libra: [
    { x: -0.35, y: 0.1, w: 0.85 },
    { x: -0.1, y: -0.05, w: 0.9 },
    { x: 0.15, y: 0.1, w: 0.85 },
    { x: 0.35, y: -0.05, w: 0.8 },
    { x: 0.52, y: 0.15, w: 0.75 },
  ],
  scorpio: [
    { x: -0.4, y: 0.15, w: 0.8 },
    { x: -0.22, y: -0.05, w: 0.9 },
    { x: -0.02, y: 0.1, w: 0.85 },
    { x: 0.18, y: -0.05, w: 0.9 },
    { x: 0.35, y: 0.1, w: 0.8 },
    { x: 0.5, y: -0.15, w: 0.75 },
  ],
  sagittarius: [
    { x: -0.35, y: 0.2, w: 0.8 },
    { x: -0.1, y: -0.05, w: 0.9 },
    { x: 0.12, y: 0.12, w: 0.85 },
    { x: 0.32, y: -0.15, w: 0.9 },
    { x: 0.5, y: 0.12, w: 0.8 },
  ],
  capricorn: [
    { x: -0.4, y: 0.2, w: 0.8 },
    { x: -0.2, y: -0.1, w: 0.9 },
    { x: 0.05, y: 0.05, w: 0.85 },
    { x: 0.22, y: -0.2, w: 0.9 },
    { x: 0.4, y: 0.05, w: 0.8 },
    { x: 0.55, y: -0.12, w: 0.75 },
  ],
  aquarius: [
    { x: -0.45, y: 0.15, w: 0.8 },
    { x: -0.25, y: -0.05, w: 0.9 },
    { x: -0.05, y: 0.12, w: 0.85 },
    { x: 0.15, y: -0.08, w: 0.9 },
    { x: 0.35, y: 0.1, w: 0.85 },
    { x: 0.55, y: -0.05, w: 0.8 },
  ],
  pisces: [
    { x: -0.45, y: -0.05, w: 0.8 },
    { x: -0.25, y: 0.2, w: 0.85 },
    { x: -0.05, y: -0.1, w: 0.9 },
    { x: 0.2, y: 0.12, w: 0.85 },
    { x: 0.42, y: -0.05, w: 0.8 },
  ],
};

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function detectSignKey({ signKey, text }) {
  if (signKey) return String(signKey).toLowerCase();
  const raw = String(text || "");
  const hit = Object.keys(SIGN_JA_TO_KEY).find((ja) => raw.includes(ja));
  if (hit) return SIGN_JA_TO_KEY[hit];
  return null;
}

function buildConstellationStars({ signKey, anchorX, anchorY, width, height, seed, color }) {
  const points = CONSTELLATION_POINTS[signKey] || [];
  if (!points.length) return "";
  const rand = mulberry32(hashString(`${signKey}-${seed}`));
  const sizeW = width * 0.22;
  const sizeH = height * 0.18;
  const core = color || "#F5F7FF";
  const glow = "#C9D6FF";
  const stars = [];

  points.forEach((pt) => {
    const jitterX = (rand() - 0.5) * sizeW * 0.06;
    const jitterY = (rand() - 0.5) * sizeH * 0.06;
    const x = anchorX + pt.x * sizeW + jitterX;
    const y = anchorY + pt.y * sizeH + jitterY;
    const weight = pt.w || 1;
    const r = (1.25 + rand() * 0.45) * weight;
    const haloR = r * (2.2 + rand() * 0.6);
    const coreOpacity = 0.65 + rand() * 0.2;
    const haloOpacity = 0.08 + rand() * 0.05;
    stars.push(
      `<circle cx=\"${x.toFixed(2)}\" cy=\"${y.toFixed(2)}\" r=\"${haloR.toFixed(2)}\" fill=\"${glow}\" opacity=\"${(haloOpacity * weight).toFixed(3)}\"/>` +
        `<circle cx=\"${x.toFixed(2)}\" cy=\"${y.toFixed(2)}\" r=\"${r.toFixed(2)}\" fill=\"${core}\" opacity=\"${coreOpacity.toFixed(3)}\"/>`
    );
  });

  const helperCount = 5;
  for (let i = 0; i < helperCount; i++) {
    const x = anchorX + (rand() - 0.5) * sizeW * 1.2;
    const y = anchorY + (rand() - 0.5) * sizeH * 1.2;
    const r = 0.6 + rand() * 0.6;
    stars.push(
      `<circle cx=\"${x.toFixed(2)}\" cy=\"${y.toFixed(2)}\" r=\"${r.toFixed(2)}\" fill=\"${core}\" opacity=\"${(0.25 + rand() * 0.2).toFixed(3)}\"/>`
    );
  }

  return `<g opacity=\"0.85\">${stars.join("")}</g>`;
}

function estimateTextWidth(line, size, fontKey = "title") {
  const text = String(line || "");
  if (!text) return size * 2;
  return Math.max(size * 2, measureTextWidth(text, size, fontKey));
}

function makeField({ x, y, w, h, pad = 14, weight = 1, feather = null, kind = "body" }) {
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

function getAvoidRegions({
  dateLabel,
  brand = "ソラのこえ",
  tagline = "今日の星の配置",
  subLabel = "",
  sunLine,
  midLine,
  moonLine,
  observation,
  pressureLines = [],
  swipeLabel = "Swipe →",
} = {}) {
  const fields = [];
  const centerX = CANVAS.width / 2;
  const brandY = TOK.cover.brandY;
  const taglineY = TOK.cover.taglineY;
  const mainSize = TOK.cover.mainSize;
  const midSize = TOK.cover.midSize || Math.round(mainSize * 0.5);
  const moonSize = TOK.cover.moonSize || mainSize;
  const mainGap = TOK.cover.mainGap;
  const mainStartY = TOK.cover.mainStartY;

  if (brand) {
    const w = estimateTextWidth(brand, TOK.cover.brandSize, "title");
    fields.push(makeField({
      x: centerX - w / 2,
      y: brandY - TOK.cover.brandSize,
      w,
      h: TOK.cover.brandSize * 1.3,
      pad: 18,
      weight: 0.9,
      kind: "title",
    }));
  }
  if (tagline) {
    const w = estimateTextWidth(tagline, TOK.cover.taglineSize, "title");
    fields.push(makeField({
      x: centerX - w / 2,
      y: taglineY - TOK.cover.taglineSize,
      w,
      h: TOK.cover.taglineSize * 1.2,
      pad: 14,
      weight: 0.8,
      kind: "subtitle",
    }));
  }
  if (subLabel) {
    const subLabelY = taglineY + TOK.subLabel.offsetY;
    const subLabelSize = TOK.cover.subLabelSize || TOK.subLabel.size;
    const w = estimateTextWidth(subLabel, subLabelSize, "title");
    fields.push(makeField({
      x: centerX - w / 2,
      y: subLabelY - subLabelSize,
      w,
      h: subLabelSize * 1.3,
      pad: 12,
      weight: 0.7,
      kind: "subtitle",
    }));
  }

  const buildRowField = ({ text, y, size = mainSize }) => {
    if (!text) return;
    const raw = normalizeSymbol(text || "");
    const glyph = extractGlyph(raw);
    if (!glyph) {
      const rowWidth = estimateTextWidth(raw, size, "title");
      const rowX = centerX - rowWidth / 2;
      fields.push(makeField({
        x: rowX,
        y: y - size,
        w: rowWidth,
        h: size * 1.25,
        pad: 18,
        weight: 1,
        kind: "heroText",
      }));
      return;
    }
    const glyphBoxWidth = Math.round(size * TOK.cover.glyphBoxScale);
    const glyphGap = Math.round(size * TOK.cover.glyphGapScale);
    const rest = raw.replace(glyph || "", "").trimStart();
    const restWidth = estimateTextWidth(rest, size, "title");
    const rowWidth = glyphBoxWidth + glyphGap + restWidth;
    const rowX = centerX - rowWidth / 2;
    fields.push(makeField({
      x: rowX,
      y: y - size,
      w: rowWidth,
      h: size * 1.25,
      pad: 18,
      weight: 1,
      kind: "heroText",
    }));
  };
  const heroLines = [
    { text: sunLine, size: mainSize, offsetY: 0 },
    { text: midLine, size: midSize, offsetY: TOK.cover.midOffsetY || 0 },
    { text: moonLine, size: moonSize, offsetY: TOK.cover.moonOffsetY || 0 },
  ].filter((line) => String(line?.text || "").trim());
  const lineCount = heroLines.length;
  const effectiveGap = lineCount === 2 ? Math.round(mainGap * 1.15) : mainGap;
  const adjustedLines = heroLines.map((line) => {
    if (lineCount === 2 && line.text === moonLine) {
      return { ...line, offsetY: 0 };
    }
    return line;
  });
  const startY = lineCount >= 3 ? mainStartY - effectiveGap * 0.5 : mainStartY;
  adjustedLines.forEach((line, idx) => {
    buildRowField({
      text: line.text,
      y: startY + effectiveGap * idx + (line.offsetY || 0),
      size: line.size,
    });
  });

  const pressureList = Array.isArray(pressureLines) ? pressureLines.filter(Boolean) : [];
  if (pressureList.length) {
    const maxWidth = Math.max(...pressureList.map((l) => estimateTextWidth(l, TOK.cover.pressure.size, "body")));
    fields.push(makeField({
      x: centerX - maxWidth / 2,
      y: TOK.cover.pressure.y - TOK.cover.pressure.size,
      w: maxWidth,
      h: TOK.cover.pressure.lineHeight * pressureList.length,
      pad: 14,
      weight: 0.8,
      kind: "body",
    }));
  }

  const obsLines = pressureList.length ? [] : resolveCarouselTextLines({
    text: observation,
    size: obsSize,
    canvasWidth: CANVAS.width,
    marginX: TOK.marginX,
    maxChars: 20,
    minChars: 10,
    maxLines: 2,
    extraSafeWidth: 36,
  });
  if (obsLines.length) {
    const obsWidth = Math.max(...obsLines.map((l) => estimateTextWidth(l, TOK.cover.observation.size, "body")));
    const obsBlockY = obsLines.length > 1 ? TOK.cover.observation.yMulti : TOK.cover.observation.ySingle;
    fields.push(makeField({
      x: centerX - obsWidth / 2,
      y: obsBlockY - TOK.cover.observation.size,
      w: obsWidth,
      h: TOK.cover.observation.lineHeight * obsLines.length,
      pad: 16,
      weight: 0.9,
      kind: "body",
    }));
  }

  if (dateLabel) {
    const w = estimateTextWidth(dateLabel, TOK.footer.dateSize, "title");
    fields.push(makeField({
      x: TOK.marginX,
      y: TOK.footer.dateY - TOK.footer.dateSize,
      w,
      h: TOK.footer.dateSize * 1.2,
      pad: 12,
      weight: 0.85,
      kind: "footer",
    }));
  }
  if (swipeLabel) {
    const w = estimateTextWidth(swipeLabel, TOK.footer.swipeSize, "title");
    fields.push(makeField({
      x: CANVAS.width - TOK.marginX - w,
      y: TOK.footer.dateY - TOK.footer.swipeSize,
      w,
      h: TOK.footer.swipeSize * 1.2,
      pad: 12,
      weight: 0.85,
      kind: "footer",
    }));
  }
  return fields;
}

function buildSlide1Svg({
  dateLabel,
  brand = "ソラのこえ",
  tagline = "今日の星の配置",
  subLabel = "",
  sunLine,
  midLine,
  moonLine,
  sunSignKey,
  moonSignKey,
  observation,
  pressureLines = [],
  swipeLabel = "Swipe →",
  space,
} = {}) {
  const colors = resolveColors(space);
  const centerX = CANVAS.width / 2;
  const brandY = TOK.cover.brandY;
  const taglineY = TOK.cover.taglineY;
  const subLabelY = taglineY + TOK.subLabel.offsetY;
  const subLabelSize = TOK.cover.subLabelSize || TOK.subLabel.size;
  const mainSize = TOK.cover.mainSize;
  const midSize = TOK.cover.midSize || Math.round(mainSize * 0.5);
  const moonSize = TOK.cover.moonSize || mainSize;
  const mainGap = TOK.cover.mainGap;
  const mainStartY = TOK.cover.mainStartY;
  const midOpacity = 0.6;

  const buildCenteredRow = ({ text, y, size = mainSize, color = colors.textMain, tracking = 0.02, opacity = 1 }) => {
    const raw = normalizeSymbol(text || "");
    if (!raw) return "";
    const glyph = extractGlyph(raw);
    if (!glyph) {
      const opacityAttr = opacity < 1 ? ` opacity=\"${opacity}\"` : "";
      return `<text x=\"${centerX}\" y=\"${y}\" text-anchor=\"middle\" fill=\"${color}\" font-size=\"${size}\" font-family=\"SoraTitle\" letter-spacing=\"${tracking}em\"${opacityAttr}>${escapeXml(raw)}</text>`;
    }
    const rest = raw.replace(glyph || "", "").trimStart();
    const glyphBoxWidth = Math.round(size * TOK.cover.glyphBoxScale);
    const glyphGap = Math.round(size * TOK.cover.glyphGapScale);
    const restWidth = measureTextWidth(rest, size, "title");
    const rowWidth = glyphBoxWidth + glyphGap + restWidth;
    const rowX = centerX - rowWidth / 2;
    const glyphScale = glyph === "☉" ? 0.92 : glyph === "☽" ? 1.0 : 1.0;
    const lineSvg = buildGlyphLine({
      x: rowX,
      y,
      text: raw,
      size,
      color,
      fontFamily: "SoraTitle",
      letterSpacing: tracking,
      glyphBoxWidth,
      glyphGap,
      glyphScale,
    });
    if (opacity < 1) return `<g opacity=\"${opacity}\">${lineSvg}</g>`;
    return lineSvg;
  };

  const pressureList = Array.isArray(pressureLines) ? pressureLines.filter(Boolean) : [];
  const obsLines = pressureList.length ? [] : resolveCarouselTextLines({
    text: observation,
    size: obsSize,
    canvasWidth: CANVAS.width,
    marginX: TOK.marginX,
    maxChars: 20,
    minChars: 10,
    maxLines: 2,
    extraSafeWidth: 36,
  });
  const obsBlockY = obsLines.length > 1 ? TOK.cover.observation.yMulti : TOK.cover.observation.ySingle;

  const sunKey = detectSignKey({ signKey: sunSignKey, text: sunLine });
  const moonKey = detectSignKey({ signKey: moonSignKey, text: moonLine });
  const constellationSeed = `${dateLabel || ""}-${sunKey || "sun"}-${moonKey || "moon"}`;
  const sunConstellation = sunKey
    ? buildConstellationStars({
        signKey: sunKey,
        anchorX: CANVAS.width * 0.32,
        anchorY: CANVAS.height * 0.38,
        width: CANVAS.width,
        height: CANVAS.height,
        seed: constellationSeed,
      })
    : "";
  const moonConstellation = moonKey
    ? buildConstellationStars({
        signKey: moonKey,
        anchorX: CANVAS.width * 0.68,
        anchorY: CANVAS.height * 0.38,
        width: CANVAS.width,
        height: CANVAS.height,
        seed: `${constellationSeed}-moon`,
      })
    : "";

  const inner = [
    sunConstellation,
    moonConstellation,
    `<text x=\"${centerX}\" y=\"${brandY}\" text-anchor=\"middle\" fill=\"${colors.textMain}\" font-size=\"${TOK.cover.brandSize}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.cover.brandTracking}em\">${escapeXml(brand)}</text>`,
    `<text x=\"${centerX}\" y=\"${taglineY}\" text-anchor=\"middle\" fill=\"${colors.textSub}\" font-size=\"${TOK.cover.taglineSize}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.cover.taglineTracking}em\">${escapeXml(tagline)}</text>`,
    subLabel
      ? `<text x=\"${centerX}\" y=\"${subLabelY}\" text-anchor=\"middle\" fill=\"${colors.textDim}\" font-size=\"${subLabelSize}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.subLabel.tracking}em\">${escapeXml(subLabel)}</text>`
      : "",
    (() => {
      const heroLines = [
        { text: sunLine, size: mainSize, color: colors.textMain, tracking: 0.02, opacity: 1, offsetY: 0 },
        { text: midLine, size: midSize, color: colors.textDim, tracking: TOK.cover.midTracking, opacity: midOpacity, offsetY: TOK.cover.midOffsetY || 0 },
        { text: moonLine, size: moonSize, color: colors.textMain, tracking: 0.02, opacity: 1, offsetY: TOK.cover.moonOffsetY || 0 },
      ].filter((line) => String(line?.text || "").trim());
      const lineCount = heroLines.length;
      const effectiveGap = lineCount === 2 ? Math.round(mainGap * 1.15) : mainGap;
      const adjustedLines = heroLines.map((line) => {
        if (lineCount === 2 && line.text === moonLine) {
          return { ...line, offsetY: 0 };
        }
        return line;
      });
      const startY = lineCount >= 3 ? mainStartY - effectiveGap * 0.5 : mainStartY;
      return adjustedLines
        .map((line, idx) => buildCenteredRow({
          text: line.text || "",
          y: startY + effectiveGap * idx + (line.offsetY || 0),
          size: line.size,
          color: line.color,
          tracking: line.tracking,
          opacity: line.opacity,
        }))
        .join("");
    })(),
    pressureList.length
      ? (() => {
          const opacity = Number.isFinite(TOK.cover.pressure.opacity) ? TOK.cover.pressure.opacity : 0.62;
          const block = textBlock({
            x: centerX,
            y: TOK.cover.pressure.y,
            lines: pressureList,
            size: TOK.cover.pressure.size,
            lineHeight: TOK.cover.pressure.lineHeight,
            color: colors.textDim,
            fontFamily: "SoraBody",
            letterSpacing: TOK.cover.pressure.tracking,
            anchor: "middle",
          });
          return `<g opacity=\"${opacity}\">${block}</g>`;
        })()
      : "",
    textBlock({
      x: centerX,
      y: obsBlockY,
      lines: obsLines,
      size: TOK.cover.observation.size,
      lineHeight: TOK.cover.observation.lineHeight,
      color: colors.textSub,
      fontFamily: "SoraSoft",
      letterSpacing: TOK.cover.observation.tracking,
      anchor: "middle",
    }),
    `<text x=\"${TOK.marginX}\" y=\"${TOK.footer.dateY}\" fill=\"${colors.textDim}\" font-size=\"${TOK.footer.dateSize}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.footer.swipeTracking}em\">${escapeXml(dateLabel || "")}</text>`,
    `<text x=\"${CANVAS.width - TOK.marginX}\" y=\"${TOK.footer.dateY}\" text-anchor=\"end\" fill=\"${colors.textSub}\" font-size=\"${TOK.footer.swipeSize}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.footer.swipeTracking}em\">${escapeXml(swipeLabel)}</text>`,
  ].join("");

  return baseSvg(inner, space);
}

async function renderSlide1(data) {
  const svg = buildSlide1Svg(data);
  return renderSvgToPng(svg);
}

module.exports = {
  buildSlide1Svg,
  getAvoidRegions,
  getTextFields: getAvoidRegions,
  renderSlide1,
};
