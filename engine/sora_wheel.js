"use strict";

const fs = require("fs");
const path = require("path");
const opentype = require("opentype.js");
const { buildRetrogradeMap } = require("./astro/retrograde");

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

const ROOT_DIR = path.resolve(__dirname, "..");
const FONT_DIR = path.join(ROOT_DIR, "assets", "fonts");
const FONT_FILES = {
  uiTitle: "ZenKakuGothicNew-Medium.ttf",
  uiBody: "ShipporiMincho-Regular.ttf",
  astro: "NotoSansSymbols2-Regular.ttf",
  astroAlt: "Symbola_hint.ttf",
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
  uiTitle: readFontBase64(FONT_FILES.uiTitle),
  uiBody: readFontBase64(FONT_FILES.uiBody),
  astro: readFontBase64(FONT_FILES.astro),
  astroAlt: readFontBase64(FONT_FILES.astroAlt),
};

function loadAstroFonts() {
  const fonts = [];
  const alt = resolveFontPath(FONT_FILES.astroAlt);
  if (alt) {
    try {
      fonts.push(opentype.loadSync(alt));
    } catch (_) {
      // ignore
    }
  }
  const primary = resolveFontPath(FONT_FILES.astro);
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

function formatDateLabel(dateLocal) {
  return String(dateLocal || "").replace(/-/g, ".");
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

function buildSoraWheelSvg({ story, dateLabel, size = 1400 } = {}) {
  if (!story) throw new Error("buildSoraWheelSvg: story required");

  const w = Number(size) || 1400;
  const h = w;
  const cx = w / 2;
  const cy = h / 2;

  // Radius design
  const outerR = w * 0.40;
  const innerR = outerR * 0.75;
  const zodiacR = outerR + 28;
  const aspectDotR = innerR;
  const labelR = aspectDotR + 30;

  const planetSize = 28;
  const zodiacSize = 30;
  const retroSize = 20;
  const dotSize = 11;
  const dotStroke = 2.5;
  const dotGlyphSize = 18;
  const tangentStep = 18;

  const pub = story?.public || {};
  const transit = pub.transit_signs || {};

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

  const points = [];
  bodyOrder.forEach((key) => {
    const lon = transit?.[key]?.lon_deg;
    if (!Number.isFinite(Number(lon))) return;
    const dotPos = polarToCartesian(cx, cy, aspectDotR, lon);
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
      lonNorm: normalizeDeg(lon),
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
      const base = polarToCartesian(cx, cy, labelR, p.lon);
      const shifted = addTangentialOffset(base.x, base.y, p.lon, offset);
      labelPoseByKey.set(p.key, { lx: shifted.x, ly: shifted.y });
    });
  });

  points.forEach((p) => {
    const pose = labelPoseByKey.get(p.key);
    if (pose) {
      p.lx = pose.lx;
      p.ly = pose.ly;
    } else {
      const pos = polarToCartesian(cx, cy, labelR, p.lon);
      p.lx = pos.x;
      p.ly = pos.y;
    }
  });

  // aspect lines (all)
  const aspectLines = [];
  const skyAll = Array.isArray(pub.sky_all) ? pub.sky_all : [];
  skyAll.forEach((a) => {
    const aKey = String(a?.a || "").toLowerCase();
    const bKey = String(a?.b || "").toLowerCase();
    const p1 = points.find((p) => p.key === aKey);
    const p2 = points.find((p) => p.key === bKey);
    if (!p1 || !p2) return;
    const type = String(a?.type || a?.aspect || "").toLowerCase();
    const hard = ["square", "opposition"].includes(type);
    const soft = ["trine", "sextile"].includes(type);
    const color = hard ? "#7A3B3B" : soft ? "#385A8A" : "#3A3E5F";
    const width = hard ? 0.9 : soft ? 0.7 : 0.5;
    const opacity = hard ? 0.4 : soft ? 0.3 : 0.25;
    const aPos = polarToCartesian(cx, cy, aspectDotR, p1.lon);
    const bPos = polarToCartesian(cx, cy, aspectDotR, p2.lon);
    aspectLines.push({ x1: aPos.x, y1: aPos.y, x2: bPos.x, y2: bPos.y, color, width, opacity });
  });

  const ringLines = [];
  for (let i = 0; i < 12; i++) {
    const deg = i * 30;
    const p1 = polarToCartesian(cx, cy, innerR, deg);
    const p2 = polarToCartesian(cx, cy, outerR, deg);
    ringLines.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
  }

  const circleOuter = `<circle cx="${cx}" cy="${cy}" r="${outerR}" fill="none" stroke="#2A2D4A" stroke-width="2"/>`;
  const circleInner = `<circle cx="${cx}" cy="${cy}" r="${innerR}" fill="none" stroke="#2A2D4A" stroke-width="1"/>`;

  const ringLineEls = ringLines
    .map((l) => `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="#2A2D4A" stroke-width="1"/>`)
    .join("");

  const zodiacEls = Object.keys(SIGN_GLYPH)
    .map((key, i) => {
      const deg = i * 30;
      const pos = polarToCartesian(cx, cy, zodiacR, deg);
      const glyph = SIGN_GLYPH[key] || "";
      return glyphPathForChar(astroFonts, glyph, pos.x, pos.y, zodiacSize, "#B3B7E6");
    })
    .join("");

  const aspectEls = aspectLines
    .map(
      (l) =>
        `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="${l.color}" stroke-width="${l.width}" opacity="${l.opacity}"/>`
    )
    .join("");

  const pointEls = points
    .map((p) => {
      const dot = `<circle cx="${p.x}" cy="${p.y}" r="${dotSize}" fill="#E8E9F3" stroke="#14162B" stroke-width="${dotStroke}"/>`;
      const miniGlyph = glyphPathForChar(astroFonts, p.glyph, p.x, p.y, dotGlyphSize, "#14162B");
      return `${dot}${miniGlyph}`;
    })
    .join("");

  const leaderEls = points
    .map((p) => {
      const dx = p.lx - p.x;
      const dy = p.ly - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 12) return "";
      return `<line x1="${p.x}" y1="${p.y}" x2="${p.lx}" y2="${p.ly}" stroke="#2A2D4A" stroke-width="0.5" opacity="0.2"/>`;
    })
    .join("");

  const labelEls = points
    .map((p) => {
      const glyphPath = glyphPathForChar(astroFonts, p.glyph, p.lx, p.ly, planetSize, "#C8CBF2");
      const retroText = p.retro
        ? `<text x="${p.lx + planetSize * 0.9}" y="${p.ly}" text-anchor="start" dominant-baseline="middle" fill="#C8CBF2" font-size="${retroSize}" font-family="SoraBody,serif">${p.retro}</text>`
        : "";
      return `${glyphPath}${retroText}`;
    })
    .join("");

  const labelDate = formatDateLabel(dateLabel || story?.meta?.date_local);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<defs><style>${fontFaceCss()}</style></defs>`,
    `<!-- astroFonts:${astroFontCount} -->`,
    `<rect width="${w}" height="${h}" fill="#14162B"/>`,
    `<g>`,
    circleOuter,
    circleInner,
    ringLineEls,
    zodiacEls,
    aspectEls,
    pointEls,
    leaderEls,
    labelEls,
    `</g>`,
    `<text x="${w - 32}" y="${h - 58}" text-anchor="end" fill="#C8CBF2" opacity="0.65" font-size="28" font-family="SoraTitle,sans-serif" letter-spacing="1">sora-no-koe</text>`,
    `<text x="${w - 32}" y="${h - 28}" text-anchor="end" fill="#9AA0D9" opacity="0.65" font-size="22" font-family="SoraBody,serif">${labelDate}</text>`,
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

async function saveSoraWheelSvg({ storage, bucketName, lineUserId, dateLocal, svg }) {
  if (!storage) return { ok: false, error: "storage_missing" };
  if (!bucketName) return { ok: false, error: "bucket_missing" };
  const path = buildSoraWheelPath({ lineUserId, dateLocal });
  if (!path) return { ok: false, error: "path_missing" };

  const bucket = storage.bucket(bucketName);
  const file = bucket.file(path);
  await file.save(svg, {
    contentType: "image/svg+xml",
    resumable: false,
    metadata: { cacheControl: "private, max-age=0, no-transform" },
  });

  return { ok: true, path, file };
}

async function getSoraWheelSignedUrl({ storage, bucketName, lineUserId, dateLocal, expiresDays = 2 }) {
  if (!storage || !bucketName) return { ok: false, error: "storage_missing" };
  const path = buildSoraWheelPath({ lineUserId, dateLocal });
  if (!path) return { ok: false, error: "path_missing" };

  const bucket = storage.bucket(bucketName);
  const file = bucket.file(path);
  const [exists] = await file.exists();
  if (!exists) return { ok: false, error: "not_found" };

  const expiresMs = Math.max(1, Number(expiresDays) || 2) * 24 * 60 * 60 * 1000;
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + expiresMs,
    version: "v4",
  });
  return { ok: true, url, path };
}

async function buildAndStoreSoraWheel({
  storage,
  bucketName,
  lineUserId,
  dateLocal,
  story,
  dateLabel,
  expiresDays = 2,
} = {}) {
  if (!storage || !bucketName || !lineUserId || !dateLocal || !story) {
    return { ok: false, error: "missing_inputs" };
  }

  const svg = buildSoraWheelSvg({ story, dateLabel });
  const saved = await saveSoraWheelSvg({ storage, bucketName, lineUserId, dateLocal, svg });
  if (!saved?.ok) return saved;

  const signed = await getSoraWheelSignedUrl({ storage, bucketName, lineUserId, dateLocal, expiresDays });
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
