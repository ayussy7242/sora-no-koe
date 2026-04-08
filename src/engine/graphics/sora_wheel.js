"use strict";

const fs = require("fs");
const path = require("path");
const opentype = require("opentype.js");
const { buildRetrogradeMap } = require("../../domain/astro/retrograde");
const { BACKGROUND_COLORS } = require("../shared/space_background/constants");
const { FONT_FILES } = require("../shared/typography");
const { formatDateLabel } = require("../../utils/time");
const { createStorageClient } = require("../../utils/infra/gcs_storage");
const { saveGcsFile, getGcsSignedUrl, fileExists } = require("../../utils/infra/gcs_upload");

const SIGN_GLYPH = {
  aries: "♈",
  taurus: "♉",
  gemini: "♊",
  cancer: "♋",
  leo: "♌",
  virgo: "♍",
  libra: "♎",
  scorpio: "♏",
  sagittarius: "♐",
  capricorn: "♑",
  aquarius: "♒",
  pisces: "♓",
};

const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const FONT_DIR = path.join(ROOT_DIR, "assets", "fonts");
const WHEEL_FONT_FILES = {
  uiTitle: FONT_FILES.main.medium,
  uiBody: FONT_FILES.body.pdf.regular,
  astro: FONT_FILES.symbols.secondary,
  astroAlt: FONT_FILES.symbols.tertiary,
};

function resolveFontPath(filename) {
  const candidates = [
    path.join(FONT_DIR, filename),
    path.join(process.cwd(), "assets", "fonts", filename),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) {
      // ignore
    }
  }
  return null;
}

function readFontBase64(filename) {
  try {
    const p = resolveFontPath(filename);
    if (!p) return null;
    const data = fs.readFileSync(p);
    return data.toString("base64");
  } catch (_) {
    return null;
  }
}

const FONT_BASE64 = {
  uiTitle: readFontBase64(WHEEL_FONT_FILES.uiTitle),
  uiBody: readFontBase64(WHEEL_FONT_FILES.uiBody),
  astro: readFontBase64(WHEEL_FONT_FILES.astro),
  astroAlt: readFontBase64(WHEEL_FONT_FILES.astroAlt),
};

function loadAstroFonts() {
  const fonts = [];
  const alt = resolveFontPath(WHEEL_FONT_FILES.astroAlt);
  if (alt) {
    try {
      fonts.push(opentype.loadSync(alt));
    } catch (_) {
      // ignore
    }
  }
  const primary = resolveFontPath(WHEEL_FONT_FILES.astro);
  if (primary) {
    try {
      fonts.push(opentype.loadSync(primary));
    } catch (_) {
      // ignore
    }
  }
  return fonts;
}

function fontFaceCss() {
  const parts = [];
  if (FONT_BASE64.uiTitle) {
    parts.push(
      `@font-face{font-family:"SoraTitle";src:url(data:font/ttf;base64,${FONT_BASE64.uiTitle}) format("truetype");font-weight:500;font-style:normal;}`
    );
  }
  if (FONT_BASE64.uiBody) {
    parts.push(
      `@font-face{font-family:"SoraBody";src:url(data:font/ttf;base64,${FONT_BASE64.uiBody}) format("truetype");font-weight:400;font-style:normal;}`
    );
  }
  if (FONT_BASE64.astro) {
    parts.push(
      `@font-face{font-family:"SoraAstro";src:url(data:font/ttf;base64,${FONT_BASE64.astro}) format("truetype");font-weight:400;font-style:normal;}`
    );
  }
  if (FONT_BASE64.astroAlt) {
    parts.push(
      `@font-face{font-family:"SoraAstroAlt";src:url(data:font/ttf;base64,${FONT_BASE64.astroAlt}) format("truetype");font-weight:400;font-style:normal;}`
    );
  }
  return parts.join("");
}

function degToRad(deg) {
  return (Number(deg) * Math.PI) / 180;
}

function polarToCartesian(cx, cy, r, deg) {
  const rad = degToRad(Number(deg) - 90);
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function addTangentialOffset(x, y, lonDeg, amount) {
  const rad = degToRad(Number(lonDeg) - 90);
  const tx = -Math.sin(rad);
  const ty = Math.cos(rad);
  return { x: x + tx * amount, y: y + ty * amount };
}

function normalizeDeg(deg) {
  const n = Number(deg) || 0;
  return ((n % 360) + 360) % 360;
}

function glyphPathForChar(fonts, ch, x, y, size, fill) {
  if (!ch) return "";
  for (const font of fonts || []) {
    if (!font) continue;
    const glyph = font.charToGlyph(ch);
    if (!glyph) continue;
    if (glyph.index === 0 && !glyph.unicode) continue;
    const path = glyph.getPath(0, 0, size);
    const box = path.getBoundingBox();
    const dx = x - (box.x1 + (box.x2 - box.x1) / 2);
    const dy = y - (box.y1 + (box.y2 - box.y1) / 2);
    return `<path d="${path.toPathData(2)}" transform="translate(${dx},${dy})" fill="${fill}"/>`;
  }
  return "";
}

function buildSoraWheelSvg({
  story,
  dateLabel,
  size = 1400,
  rotationDeg = 0,
  showAspects = true,
  showHouses = false,
  aspects = null,
  ascLonDeg = null,
  mcLonDeg = null,
  highlightBodies = null,
  highlightAspect = null,
  dimOpacity = null,
  zodiacOpacity = null,
} = {}) {
  if (!story) throw new Error("buildSoraWheelSvg: story required");

  const w = Number(size) || 1400;
  const h = w;
  const cx = w / 2;
  const cy = h / 2;
  const rotation = Number.isFinite(Number(rotationDeg)) ? Number(rotationDeg) : 0;
  const applyRotation = (deg) => normalizeDeg(Number(deg) + rotation);

  // Radius design
  const outerR = w * 0.40;
  const innerR = outerR * 0.75;
  const zodiacR = outerR + 28;
  const aspectDotR = innerR;
  const labelR = aspectDotR + 30;
  const houseOuterR = innerR - 6;
  const houseInnerR = innerR - 22;
  const houseLabelR = innerR - 34;

  const planetSize = 28;
  const zodiacSize = 30;
  const retroSize = 20;
  const dotSize = 11;
  const dotStroke = 2.5;
  const dotGlyphSize = 18;
  const tangentStep = 18;

  const pub = story?.public || {};
  const transit = pub.transit_signs || {};
  const ascLonFromStory = Number(transit?.asc?.lon_deg);
  const mcLonFromStory = Number(transit?.mc?.lon_deg);
  const ascLon = Number.isFinite(Number(ascLonDeg)) ? Number(ascLonDeg) : (Number.isFinite(ascLonFromStory) ? ascLonFromStory : null);
  const mcLon = Number.isFinite(Number(mcLonDeg)) ? Number(mcLonDeg) : (Number.isFinite(mcLonFromStory) ? mcLonFromStory : null);

  const bodyOrder = [
    "sun",
    "moon",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto",
    "lilith",
    "chiron",
  ];

  const retroMap = buildRetrogradeMap(story?.meta?.as_of || null, bodyOrder);
  const astroFonts = loadAstroFonts();
  const astroFontCount = astroFonts.length;
  const highlightSet = Array.isArray(highlightBodies)
    ? new Set(highlightBodies.map((k) => String(k || "").toLowerCase()))
    : null;
  const hasHighlight = !!(highlightSet && highlightSet.size);
  const dimOpacityValue = Number.isFinite(Number(dimOpacity))
    ? Number(dimOpacity)
    : (hasHighlight ? 0.25 : 1);
  const zodiacOpacityValue = 1;

  const points = [];
  bodyOrder.forEach((key) => {
    const lon = transit?.[key]?.lon_deg;
    if (!Number.isFinite(Number(lon))) return;
    const lonAdj = applyRotation(lon);
    const dotPos = polarToCartesian(cx, cy, aspectDotR, lonAdj);
    const glyph =
      {
        sun: "☉",
        moon: "☽",
        mercury: "☿",
        venus: "♀",
        mars: "♂",
        jupiter: "♃",
        saturn: "♄",
        uranus: "♅",
        neptune: "♆",
        pluto: "♇",
        lilith: "⚸",
        chiron: "⚷",
      }[key] || "";
    const retro = retroMap[key] ? "(R)" : "";

    points.push({
      key,
      lon,
      lonAdj,
      lonNorm: normalizeDeg(lonAdj),
      glyph,
      retro,
      x: dotPos.x,
      y: dotPos.y,
      lx: dotPos.x,
      ly: dotPos.y,
    });
  });

  // cluster by angle to avoid overlap (angle fixed, radius shifts inward)
  const sorted = [...points].sort((a, b) => a.lonNorm - b.lonNorm);
  const groups = [];
  const threshold = 4;
  sorted.forEach((p) => {
    const lastGroup = groups[groups.length - 1];
    if (!lastGroup) {
      groups.push([p]);
      return;
    }
    const last = lastGroup[lastGroup.length - 1];
    if (Math.abs(p.lonNorm - last.lonNorm) <= threshold) {
      lastGroup.push(p);
    } else {
      groups.push([p]);
    }
  });
  if (groups.length > 1) {
    const first = groups[0][0];
    const lastGroup = groups[groups.length - 1];
    const last = lastGroup[lastGroup.length - 1];
    if (Math.abs(first.lonNorm + 360 - last.lonNorm) <= threshold) {
      groups[0] = [...lastGroup, ...groups[0]];
      groups.pop();
    }
  }

  const labelPoseByKey = new Map();
  groups.forEach((group) => {
    const n = group.length;
    group.forEach((p, i) => {
      const centered = i - (n - 1) / 2;
      const offset = centered * tangentStep;
      const base = polarToCartesian(cx, cy, labelR, p.lonAdj);
      const shifted = addTangentialOffset(base.x, base.y, p.lonAdj, offset);
      labelPoseByKey.set(p.key, { lx: shifted.x, ly: shifted.y });
    });
  });

  points.forEach((p) => {
    const pose = labelPoseByKey.get(p.key);
    if (pose) {
      p.lx = pose.lx;
      p.ly = pose.ly;
    } else {
      const pos = polarToCartesian(cx, cy, labelR, p.lonAdj);
      p.lx = pos.x;
      p.ly = pos.y;
    }
  });

  // aspect lines (all)
  const aspectLines = [];
  const aspectSource = highlightAspect
    ? [highlightAspect]
    : (Array.isArray(aspects)
      ? aspects
      : (Array.isArray(pub.sky_all) ? pub.sky_all : []));
  if (showAspects) {
    aspectSource.forEach((a) => {
      const aKey = String(a?.a || a?.a_key || "").toLowerCase();
      const bKey = String(a?.b || a?.b_key || "").toLowerCase();
      const p1 = points.find((p) => p.key === aKey);
      const p2 = points.find((p) => p.key === bKey);
      if (!p1 || !p2) return;
      const type = String(a?.type || a?.aspect || "").toLowerCase();
      const hard = ["square", "opposition"].includes(type);
      const soft = ["trine", "sextile"].includes(type);
      const isConjunction = type === "conjunction";
      const isHighlight = !!highlightAspect;
      const color = isHighlight ? "#C6D6FF" : (isConjunction ? "#6B7FE0" : hard ? "#7A3B3B" : soft ? "#385A8A" : "#3A3E5F");
      const width = isHighlight ? 1.8 : (isConjunction ? 1.2 : hard ? 0.8 : soft ? 0.7 : 0.6);
      const opacity = isHighlight ? 0.98 : (isConjunction ? 0.68 : hard ? 0.42 : soft ? 0.36 : 0.3);
      const aPos = polarToCartesian(cx, cy, aspectDotR, p1.lonAdj);
      const bPos = polarToCartesian(cx, cy, aspectDotR, p2.lonAdj);
      aspectLines.push({ x1: aPos.x, y1: aPos.y, x2: bPos.x, y2: bPos.y, color, width, opacity });
    });
  }

  const ringLines = [];
  for (let i = 0; i < 12; i += 1) {
    const deg = i * 30;
    const p1 = polarToCartesian(cx, cy, innerR, applyRotation(deg));
    const p2 = polarToCartesian(cx, cy, outerR, applyRotation(deg));
    ringLines.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
  }

  const zodiacPoints = Object.keys(SIGN_GLYPH).map((_key, i) => {
    const deg = applyRotation(i * 30);
    const pos = polarToCartesian(cx, cy, zodiacR, deg);
    return { x: pos.x, y: pos.y };
  });

  const houseLines = [];
  const houseLabels = [];
  if (showHouses && Number.isFinite(Number(ascLon))) {
    for (let i = 0; i < 12; i += 1) {
      const deg = Number(ascLon) + i * 30;
      const p1 = polarToCartesian(cx, cy, houseInnerR, applyRotation(deg));
      const p2 = polarToCartesian(cx, cy, houseOuterR, applyRotation(deg));
      houseLines.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
      const labelDeg = Number(ascLon) + i * 30 + 15;
      const pos = polarToCartesian(cx, cy, houseLabelR, applyRotation(labelDeg));
      houseLabels.push({ x: pos.x, y: pos.y, text: String(i + 1) });
    }
  }

  const angleLabels = [];
  if (showHouses && Number.isFinite(Number(ascLon))) {
    const angles = [
      { key: "ASC", lon: Number(ascLon) },
      { key: "DC", lon: Number(ascLon) + 180 },
    ];
    if (Number.isFinite(Number(mcLon))) {
      angles.push({ key: "MC", lon: Number(mcLon) });
      angles.push({ key: "IC", lon: Number(mcLon) + 180 });
    }
    const avoidPoints = [
      ...points.map((p) => ({ x: p.lx, y: p.ly, r: 22 })),
      ...zodiacPoints.map((p) => ({ x: p.x, y: p.y, r: 28 })),
    ];
    const isClear = (x, y) => {
      const minBase = 28;
      for (const ap of avoidPoints) {
        const dx = x - ap.x;
        const dy = y - ap.y;
        const dist = Math.hypot(dx, dy);
        const limit = minBase + (ap.r || 0);
        if (dist < limit) return false;
      }
      return true;
    };
    angles.forEach((a) => {
      const baseR = zodiacR + 18;
      const candidates = [
        { r: baseR, t: 0 },
        { r: baseR + 12, t: 0 },
        { r: baseR + 24, t: 0 },
        { r: baseR + 12, t: 12 },
        { r: baseR + 12, t: -12 },
        { r: baseR + 24, t: 18 },
        { r: baseR + 24, t: -18 },
        { r: baseR + 34, t: 22 },
        { r: baseR + 34, t: -22 },
      ];
      let chosen = null;
      for (const c of candidates) {
        const pos = polarToCartesian(cx, cy, c.r, applyRotation(a.lon));
        const shifted = c.t ? addTangentialOffset(pos.x, pos.y, a.lon, c.t) : pos;
        if (isClear(shifted.x, shifted.y)) {
          chosen = shifted;
          break;
        }
      }
      let fallback = chosen || polarToCartesian(cx, cy, baseR, applyRotation(a.lon));
      if (a.key === "ASC") {
        fallback = { x: fallback.x - 2, y: fallback.y };
      } else if (a.key === "DC") {
        fallback = { x: fallback.x + 6, y: fallback.y };
      } else if (a.key === "MC") {
        fallback = { x: fallback.x, y: fallback.y - 8 };
      } else if (a.key === "IC") {
        fallback = { x: fallback.x, y: fallback.y + 8 };
      }
      const fontSize = 12;
      const labelWidth = String(a.key || "").length * fontSize * 0.6;
      const halfW = labelWidth / 2;
      const halfH = fontSize / 2;
      const pad = 8;
      const minX = pad + halfW;
      const maxX = w - pad - halfW;
      const minY = pad + halfH;
      const maxY = h - pad - halfH;
      fallback = {
        x: Math.min(maxX, Math.max(minX, fallback.x)),
        y: Math.min(maxY, Math.max(minY, fallback.y)),
      };
      angleLabels.push({ x: fallback.x, y: fallback.y, text: a.key });
    });
  }

  const glowStrong = "#C6D6FF";
  const glowMedium = "#9FB2E6";
  const glowWeak = "#7C89B8";

  const circleOuter = `<circle cx="${cx}" cy="${cy}" r="${outerR}" fill="none" stroke="#2A2D4A" stroke-width="0.9"/>`;
  const circleInner = `<circle cx="${cx}" cy="${cy}" r="${innerR}" fill="none" stroke="#2A2D4A" stroke-width="0.7"/>`;
  const circleOuterGlow = `<circle cx="${cx}" cy="${cy}" r="${outerR}" fill="none" stroke="${glowMedium}" stroke-width="1.6" opacity="0.28" filter="url(#wheelGlowMed)"/>`;
  const circleInnerGlow = `<circle cx="${cx}" cy="${cy}" r="${innerR}" fill="none" stroke="${glowMedium}" stroke-width="1.2" opacity="0.24" filter="url(#wheelGlowMed)"/>`;

  const ringLineEls = ringLines
    .map((l) => `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="#2A2D4A" stroke-width="0.7"/>`)
    .join("");
  const ringLineGlowEls = ringLines
    .map((l) => `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="${glowWeak}" stroke-width="1.2" opacity="0.18" filter="url(#wheelGlowWeak)"/>`)
    .join("");
  const houseLineEls = houseLines
    .map((l) => `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="#2A2D4A" stroke-width="0.7"/>`)
    .join("");
  const houseLabelEls = houseLabels
    .map((l) => `<text x="${l.x}" y="${l.y}" text-anchor="middle" dominant-baseline="middle" fill="#B3B7E6" font-size="12" font-family="SoraBody,serif">${l.text}</text>`)
    .join("");
  const angleLabelEls = angleLabels
    .map((l) => `<text x="${l.x}" y="${l.y}" text-anchor="middle" dominant-baseline="middle" fill="#C8CBF2" font-size="12" font-family="SoraBody,serif">${l.text}</text>`)
    .join("");

  const zodiacEls = Object.keys(SIGN_GLYPH)
    .map((key, i) => {
      const deg = applyRotation(i * 30);
      const pos = polarToCartesian(cx, cy, zodiacR, deg);
      const glyph = SIGN_GLYPH[key] || "";
      return glyphPathForChar(astroFonts, glyph, pos.x, pos.y, zodiacSize, "#B3B7E6");
    })
    .join("");
  const zodiacGlowEls = Object.keys(SIGN_GLYPH)
    .map((key, i) => {
      const deg = applyRotation(i * 30);
      const pos = polarToCartesian(cx, cy, zodiacR, deg);
      const glyph = SIGN_GLYPH[key] || "";
      const glow = glyphPathForChar(astroFonts, glyph, pos.x, pos.y, zodiacSize, glowStrong);
      return glow ? glow.replace("/>", ` opacity="0.55" filter="url(#wheelGlowStrong)"/>`) : "";
    })
    .join("");

  const aspectEls = aspectLines
    .map(
      (l) =>
        `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="${l.color}" stroke-width="${l.width}" opacity="${l.opacity}"/>`
    )
    .join("");
  const aspectGlowEls = aspectLines
    .map(
      (l) =>
        `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="${glowWeak}" stroke-width="${(l.width + 0.6).toFixed(2)}" opacity="${(l.opacity * 0.35).toFixed(2)}" filter="url(#wheelGlowWeak)"/>`
    )
    .join("");

  const pointEls = points
    .map((p) => {
      const isHighlight = hasHighlight ? highlightSet.has(p.key) : true;
      const opacity = isHighlight ? 1 : dimOpacityValue;
      const dotFill = isHighlight ? "#F2F4FF" : "#E8E9F3";
      const dotStrokeColor = isHighlight ? "#1A1D34" : "#14162B";
      const dotRadius = isHighlight ? dotSize * 1.12 : dotSize;
      const dotStrokeWidth = isHighlight ? dotStroke * 1.12 : dotStroke;
      const dot = `<circle cx="${p.x}" cy="${p.y}" r="${dotRadius}" fill="${dotFill}" stroke="${dotStrokeColor}" stroke-width="${dotStrokeWidth}" opacity="${opacity}"/>`;
      const miniGlyph = glyphPathForChar(astroFonts, p.glyph, p.x, p.y, dotGlyphSize, "#14162B");
      const glyph = opacity < 1 ? miniGlyph.replace("/>", ` opacity="${opacity}"/>`) : miniGlyph;
      return `${dot}${glyph}`;
    })
    .join("");

  const leaderEls = points
    .map((p) => {
      const dx = p.lx - p.x;
      const dy = p.ly - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 12) return "";
      const isHighlight = hasHighlight ? highlightSet.has(p.key) : true;
      const opacity = (isHighlight ? 0.2 : 0.2 * dimOpacityValue);
      return `<line x1="${p.x}" y1="${p.y}" x2="${p.lx}" y2="${p.ly}" stroke="#2A2D4A" stroke-width="0.5" opacity="${opacity}"/>`;
    })
    .join("");

  const labelEls = points
    .map((p) => {
      const isHighlight = hasHighlight ? highlightSet.has(p.key) : true;
      const opacity = isHighlight ? 1 : dimOpacityValue;
      const fill = isHighlight ? "#C8CBF2" : "#8C93C6";
      const glyphPath = glyphPathForChar(astroFonts, p.glyph, p.lx, p.ly, planetSize, fill);
      const retroText = p.retro
        ? `<text x="${p.lx + planetSize * 0.9}" y="${p.ly}" text-anchor="start" dominant-baseline="middle" fill="${fill}" font-size="${retroSize}" font-family="SoraBody,serif" opacity="${opacity}">${p.retro}</text>`
        : "";
      const glyph = opacity < 1 ? glyphPath.replace("/>", ` opacity="${opacity}"/>`) : glyphPath;
      return `${glyph}${retroText}`;
    })
    .join("");
  const labelGlowEls = points
    .map((p) => {
      if (hasHighlight && !highlightSet.has(p.key)) return "";
      const glyphPath = glyphPathForChar(astroFonts, p.glyph, p.lx, p.ly, planetSize, glowStrong);
      if (!glyphPath) return "";
      const glowPath = glyphPath.replace("/>", ` opacity="0.55" filter="url(#wheelGlowStrong)"/>`);
      return glowPath;
    })
    .join("");

  const labelDate = formatDateLabel(dateLabel || story?.meta?.date_local);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<defs><style>${fontFaceCss()}</style>` +
      `<filter id="wheelGlowStrong" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3.2"/></filter>` +
      `<filter id="wheelGlowMed" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>` +
      `<filter id="wheelGlowWeak" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.4"/></filter>` +
    `</defs>`,
    `<!-- astroFonts:${astroFontCount} -->`,
    `<g>`,
    circleOuterGlow,
    circleInnerGlow,
    ringLineGlowEls,
    zodiacGlowEls,
    aspectGlowEls,
    labelGlowEls,
    circleOuter,
    circleInner,
    ringLineEls,
    zodiacEls,
    aspectEls,
    houseLineEls,
    houseLabelEls,
    pointEls,
    leaderEls,
    labelEls,
    angleLabelEls,
    `</g>`,
    "",
    `</svg>`,
  ].join("");
}

function sanitizeId(x) {
  return String(x || "")
    .trim()
    .replace(/[^\w\-]/g, "");
}

function buildSoraWheelPath({ lineUserId, dateLocal } = {}) {
  const id = sanitizeId(lineUserId);
  const date = String(dateLocal || "").replace(/[^\d\-]/g, "");
  if (!id || !date) return null;
  return `sora_wheel/${id}/${date}.svg`;
}

async function saveSoraWheelSvg({ storage, bucketName, lineUserId, dateLocal, svg, env } = {}) {
  const storageClient = await createStorageClient({ storage, env });
  if (!storageClient) return { ok: false, error: "storage_missing" };
  if (!bucketName) return { ok: false, error: "bucket_missing" };
  const path = buildSoraWheelPath({ lineUserId, dateLocal });
  if (!path) return { ok: false, error: "path_missing" };
  const saved = await saveGcsFile({
    storage: storageClient,
    bucketName,
    path,
    buffer: svg,
    contentType: "image/svg+xml",
    cacheControl: "private, max-age=0, no-transform",
  });
  return { ok: true, path: saved.path };
}

async function getSoraWheelSignedUrl({ storage, bucketName, lineUserId, dateLocal, expiresDays = 2, env } = {}) {
  const storageClient = await createStorageClient({ storage, env });
  if (!storageClient || !bucketName) return { ok: false, error: "storage_missing" };
  const path = buildSoraWheelPath({ lineUserId, dateLocal });
  if (!path) return { ok: false, error: "path_missing" };
  const exists = await fileExists({ storage: storageClient, bucketName, path });
  if (!exists.exists) return { ok: false, error: "not_found" };
  const signed = await getGcsSignedUrl({ storage: storageClient, bucketName, path, expiresDays });
  return { ok: true, url: signed.url, path };
}

async function buildAndStoreSoraWheel({
  storage,
  bucketName,
  lineUserId,
  dateLocal,
  story,
  dateLabel,
  expiresDays = 2,
  env,
} = {}) {
  if (!storage || !bucketName || !lineUserId || !dateLocal || !story) {
    return { ok: false, error: "missing_inputs" };
  }

  const svg = buildSoraWheelSvg({ story, dateLabel });
  const saved = await saveSoraWheelSvg({ storage, bucketName, lineUserId, dateLocal, svg, env });
  if (!saved?.ok) return saved;

  const signed = await getSoraWheelSignedUrl({ storage, bucketName, lineUserId, dateLocal, expiresDays, env });
  if (!signed?.ok) return signed;

  return { ok: true, url: signed.url, path: signed.path };
}

module.exports = {
  buildSoraWheelSvg,
  buildAndStoreSoraWheel,
  buildSoraWheelPath,
  saveSoraWheelSvg,
  getSoraWheelSignedUrl,
};
