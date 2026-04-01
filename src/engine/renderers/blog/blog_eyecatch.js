"use strict";

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { buildSpaceBackground, buildSpaceSeedLabel } = require("../../shared/space_background");
const dict = require("../../../content/dict");
const { buildNextMoonEvents, formatMoonEventDisplay } = require("../../../domain/moon");
const { toDateLocalJST } = require("../../../utils/time");
const { clamp } = require("../../../utils/data/math");
const { wrapByChars } = require("../../../utils/text/wrap");
const { FONT_FILES } = require("../../shared/typography");

const ROOT_DIR = path.resolve(__dirname, "..", "..", "..", "..");
const FONT_DIR = path.join(ROOT_DIR, "assets", "fonts");
const DEFAULT_BG_PATH = path.join(ROOT_DIR, "assets", "img", "blog", "eyecatch-bg.jpg");
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 630;
const SAFE_TOP = 140;
const SAFE_BOTTOM = 90;

const BLOG_FONT_FILES = {
  line1: FONT_FILES.main.medium,
  line2: FONT_FILES.body.blog.regular,
  line2Bold: FONT_FILES.body.blog.bold,
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
  line1: readFontBase64(BLOG_FONT_FILES.line1),
  line2: readFontBase64(BLOG_FONT_FILES.line2),
  line2Bold: readFontBase64(BLOG_FONT_FILES.line2Bold),
};

function fontFaceCss() {
  const parts = [];
  if (FONT_BASE64.line1) {
    parts.push(
      `@font-face{font-family:"SoraLine1";src:url(data:font/ttf;base64,${FONT_BASE64.line1}) format("truetype");font-weight:500;font-style:normal;}`
    );
  }
  if (FONT_BASE64.line2) {
    parts.push(
      `@font-face{font-family:"SoraLine2";src:url(data:font/ttf;base64,${FONT_BASE64.line2}) format("truetype");font-weight:400;font-style:normal;}`
    );
  }
  if (FONT_BASE64.line2Bold) {
    parts.push(
      `@font-face{font-family:"SoraLine2Bold";src:url(data:font/ttf;base64,${FONT_BASE64.line2Bold}) format("truetype");font-weight:600;font-style:normal;}`
    );
  }
  return parts.join("");
}

function resolveBgPath(customPath) {
  const raw = String(customPath || "").trim();
  const candidates = [];
  if (raw) {
    if (path.isAbsolute(raw)) {
      candidates.push(raw);
    } else {
      candidates.push(path.join(ROOT_DIR, raw));
      candidates.push(path.join(process.cwd(), raw));
    }
  }
  candidates.push(DEFAULT_BG_PATH);
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch (_) {
      // ignore
    }
  }
  return null;
}

function splitLinesByNewline(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitLine2(text, { maxChars = 16, maxLines = 2 } = {}) {
  const fromBreaks = splitLinesByNewline(text);
  if (fromBreaks.length > 1) {
    return fromBreaks.slice(0, maxLines);
  }
  const raw = String(text || "").trim();
  if (!raw) return [];
  if (Array.from(raw).length <= maxChars) return [raw];

  const crossIdx = raw.indexOf("×");
  if (crossIdx >= 0) {
    const left = raw.slice(0, crossIdx + 1).trim();
    const right = raw.slice(crossIdx + 1).trim();
    if (left && right) {
      const rightTokens = right.split(/\s+/).filter(Boolean);
      if (rightTokens.length >= 3) {
        const head = rightTokens.slice(0, 2).join(" ");
        const tail = rightTokens.slice(2).join(" ");
        const line1 = `${left} ${head}`.trim();
        const line2 = tail.trim();
        if (line2 && Array.from(line1).length <= maxChars && Array.from(line2).length <= maxChars) {
          return [line1, line2];
        }
      }
      if (Array.from(left).length <= maxChars && Array.from(right).length <= maxChars) {
        return [left, right];
      }
    }
  }

  const wrapped = wrapByChars(raw, maxChars, maxLines);
  if (maxLines === 2 && wrapped.length === 1) {
    const chars = Array.from(raw);
    const half = Math.ceil(chars.length / 2);
    return [chars.slice(0, half).join(""), chars.slice(half).join("")].filter(Boolean);
  }
  return wrapped;
}

function presetConfig(presetKey) {
  const key = String(presetKey || "C").trim().toUpperCase();
  if (key === "B") {
    return {
      line1Size: 30,
      line2Size: 48,
      centerY: 365,
      line2Weight: "regular",
      lineHeightRatio: 1.25,
      lineGap: 6,
      line1LetterSpacing: 0.08,
      line2LetterSpacing: 0.04,
      line3Size: 22,
      line3LetterSpacing: 0.1,
      line3Weight: "regular",
    };
  }
  if (key === "C") {
    return {
      line1Size: 32,
      line2Size: 60,
      line1Y: 200,
      line3Y: 520,
      line2Weight: "bold",
      lineHeightRatio: 1.35,
      lineGap: 10,
      line1LetterSpacing: 0.08,
      line2LetterSpacing: 0.04,
      line3Size: 22,
      line3LetterSpacing: 0.1,
      line3Weight: "regular",
    };
  }
  return {
    line1Size: 30,
    line2Size: 52,
    centerY: 390,
    line2Weight: "regular",
    lineHeightRatio: 1.25,
    lineGap: 6,
    line1LetterSpacing: 0.08,
    line2LetterSpacing: 0.04,
    line3Size: 22,
    line3LetterSpacing: 0.1,
    line3Weight: "regular",
  };
}

function clampCenterY(centerY, totalHeight, h) {
  const min = SAFE_TOP + totalHeight / 2;
  const max = h - SAFE_BOTTOM - totalHeight / 2;
  return clamp(centerY, min, max);
}

function computeEyecatchLayout({ width, height, line1, line2, line3, preset }) {
  const w = Number(width) || CANVAS_WIDTH;
  const h = Number(height) || CANVAS_HEIGHT;
  const centerX = w / 2;

  const config = presetConfig(preset);
  const lineHeightRatio = config.lineHeightRatio || 1.25;
  const line1Size = config.line1Size;
  const line2Size = config.line2Size;
  const line3Size = config.line3Size || 22;
  const lineHeight1 = line1Size * lineHeightRatio;
  const lineHeight2 = line2Size * lineHeightRatio;
  const line2Lines = splitLine2(line2, { maxChars: 16, maxLines: 2 });
  const line2Count = line2Lines.length || 1;
  const line2BlockHeight = lineHeight2 * line2Count;
  const hasLine3 = line3 != null && String(line3).trim() !== "";
  const lineHeight3 = hasLine3 ? line3Size * lineHeightRatio : 0;
  const totalHeight =
    lineHeight1 +
    line2BlockHeight +
    (config.lineGap || 0) +
    (hasLine3 ? (config.lineGap || 0) + lineHeight3 : 0);
  const centerY = clampCenterY(config.centerY, totalHeight, h);

  let line1Y = null;
  let line2Y = null;
  let line3Y = null;
  const top = centerY - totalHeight / 2;
  line1Y = Number.isFinite(config.line1Y)
    ? Math.round(config.line1Y)
    : Math.round(top + line1Size);
  line3Y = hasLine3 && Number.isFinite(config.line3Y)
    ? Math.round(config.line3Y)
    : (hasLine3 ? Math.round(
        top + lineHeight1 + (config.lineGap || 0) + line2BlockHeight + (config.lineGap || 0) + line3Size
      ) : null);
  if (Number.isFinite(config.line2Y)) {
    line2Y = Math.round(config.line2Y);
  } else if (hasLine3 && Number.isFinite(line3Y)) {
    const mid = (line1Y + line3Y) / 2;
    const blockTop = mid - line2BlockHeight / 2;
  line2Y = Math.round(blockTop + line2Size - 8);
  } else {
    line2Y = Math.round(top + lineHeight1 + (config.lineGap || 0) + line2Size);
  }

  const line2Font = config.line2Weight === "bold" ? "SoraLine2Bold" : "SoraLine2";
  const line1Spacing = Number.isFinite(config.line1LetterSpacing) ? config.line1LetterSpacing : 0.08;
  const line2Spacing = Number.isFinite(config.line2LetterSpacing) ? config.line2LetterSpacing : 0.04;
  const line3Spacing = Number.isFinite(config.line3LetterSpacing) ? config.line3LetterSpacing : 0.1;
  const line3Font = config.line3Weight === "bold" ? "SoraLine2Bold" : "SoraLine1";

  return {
    w,
    h,
    centerX,
    config,
    line1Size,
    line2Size,
    line3Size,
    line2Lines,
    line2Count,
    line2LineHeight: lineHeight2,
    hasLine3,
    line1Y,
    line2Y,
    line3Y,
    line2Font,
    line3Font,
    line1Spacing,
    line2Spacing,
    line3Spacing,
  };
}

function buildEyecatchAvoidRegions({ width, height, line1, line2, line3, preset }) {
  const layout = computeEyecatchLayout({ width, height, line1, line2, line3, preset });
  const {
    w,
    h,
    line1Y,
    line2Y,
    line3Y,
    line1Size,
    line2Size,
    line3Size,
    hasLine3,
    line2Count,
    line2LineHeight,
  } = layout;
  const tops = [line1Y - line1Size, line2Y - line2Size];
  const line2Bottom = line2Y + line2LineHeight * Math.max(0, line2Count - 1);
  const bottoms = [line1Y, line2Bottom];
  if (hasLine3) {
    tops.push(line3Y - line3Size);
    bottoms.push(line3Y);
  }
  const top = Math.min(...tops);
  const bottom = Math.max(...bottoms);
  const padX = Math.round(w * 0.12);
  const padY = Math.round(h * 0.08);
  const x = clamp(padX, 0, w);
  const y = clamp(Math.round(top - padY), 0, h);
  const regionW = clamp(w - padX * 2, 0, w);
  const bottomClamped = clamp(Math.round(bottom + padY), 0, h);
  const regionH = clamp(bottomClamped - y, 0, h);
  return [
    {
      x,
      y,
      w: regionW,
      h: regionH,
      weight: 1,
      feather: Math.round(Math.max(48, h * 0.08)),
    },
  ];
}

function buildEyecatchSvg({ width, height, line1, line2, line3, preset, space = null }) {
  const layout = computeEyecatchLayout({ width, height, line1, line2, line3, preset });
  const {
    w,
    h,
    centerX,
    line1Size,
    line2Size,
    line3Size,
    hasLine3,
    line2Lines,
    line2LineHeight,
    line1Y,
    line2Y,
    line3Y,
    line2Font,
    line3Font,
    line1Spacing,
    line2Spacing,
    line3Spacing,
  } = layout;

  const safeLine1 = String(line1 || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeLine2 = String(line2 || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeLine3 = String(line3 || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const line2Blocks = (line2Lines.length ? line2Lines : [String(line2 || "")])
    .map((line, i) => `<tspan x="${centerX}" dy="${i === 0 ? 0 : line2LineHeight}">${String(line || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</tspan>`)
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<defs>`,
    `<style>${fontFaceCss()}</style>`,
    space?.defs || "",
    `<filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">`,
    `<feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000000" flood-opacity="0.35"/>`,
    `</filter>`,
    `</defs>`,
    space?.body || "",
    `<g filter="url(#shadow)">`,
    `<text x="${centerX}" y="${line1Y}" text-anchor="middle" fill="#F6F7FB" font-size="${line1Size}" font-family="SoraLine1,sans-serif" letter-spacing="${line1Spacing}em">${safeLine1}</text>`,
    `<text x="${centerX}" y="${line2Y}" text-anchor="middle" fill="#FFFFFF" font-size="${line2Size}" font-family="${line2Font},serif" letter-spacing="${line2Spacing}em">${line2Blocks}</text>`,
    hasLine3
      ? `<text x="${centerX}" y="${line3Y}" text-anchor="middle" fill="#E5E7F4" font-size="${line3Size}" font-family="${line3Font},sans-serif" letter-spacing="${line3Spacing}em">${safeLine3}</text>`
      : "",
    `</g>`,
    `</svg>`,
  ].join("");
}

function detectMoonEventLocal({ dateLocal, asOfISO, dict }) {
  if (!dateLocal) return null;
  const events = buildNextMoonEvents(asOfISO, dict);
  const candidates = [events?.new, events?.full].filter((ev) => ev?.date instanceof Date);
  for (const ev of candidates) {
    const evDateLocal = toDateLocalJST(ev.date);
    if (evDateLocal === dateLocal) return formatMoonEventDisplay(ev);
  }
  return null;
}

function resolveMoonEventSpaceConfig(event) {
  if (!event || !event.kind) return null;
  if (event.kind === "full") {
    return {
      starDensityScale: 0.38,
      milkyIntensityScale: 0.6,
      milkyThicknessScale: 0.75,
      milkyDustScale: 0.6,
      whiteMix: 0.45,
      moonEventKind: "full",
      moonEventStyle: "halo",
      moonEventCenter: "center",
      moonEventIntensity: 1.35,
    };
  }
  if (event.kind === "new") {
    return {
      starDensityScale: 2.1,
      milkyIntensityScale: 1.55,
      milkyThicknessScale: 1.25,
      milkyDustScale: 1.6,
      whiteMix: 0.45,
      moonEventKind: "new",
      moonEventStyle: "eclipse",
      moonEventCenter: "center",
      moonEventIntensity: 1.15,
    };
  }
  return null;
}

async function renderBlogEyecatchImage({
  bgPath,
  bgMode = "image",
  bgVariant = "slide1",
  story,
  dateLabel,
  line1,
  line2,
  line3,
  format = "jpeg",
  quality = 92,
  preset = "C",
  spaceConfig = null,
} = {}) {
  const width = CANVAS_WIDTH;
  const height = CANVAS_HEIGHT;
  const fmt = String(format || "jpeg").toLowerCase();
  const mode = String(bgMode || "image").trim().toLowerCase();

  if (mode === "space") {
    const avoidRegions = buildEyecatchAvoidRegions({ width, height, line1, line2, line3, preset });
    const seedDate = story?.meta?.date_local || story?.public?.date_local || dateLabel || "";
    const seedLabel = buildSpaceSeedLabel({
      seedVersion: "v2",
      channel: "blog",
      date: seedDate,
      variant: `eyecatch-${bgVariant || "slide1"}`,
      prefixChannel: true,
    });
    const wantsMoonAuto = /moon/i.test(String(bgVariant || ""));
    const autoSpaceConfig = spaceConfig || (wantsMoonAuto
      ? resolveMoonEventSpaceConfig(
        detectMoonEventLocal({
          dateLocal: seedDate,
          asOfISO: story?.meta?.as_of || new Date().toISOString(),
          dict,
        })
      )
      : null);
    const space = buildSpaceBackground({
      story,
      dateLabel,
      seedLabel,
      width,
      height,
      variant: bgVariant || "slide1",
      avoidRegions,
      spaceConfig: autoSpaceConfig,
    });
    const svg = buildEyecatchSvg({ width, height, line1, line2, line3, preset, space });
    let pipeline = sharp(Buffer.from(svg));
    if (fmt === "png") {
      pipeline = pipeline.png({ compressionLevel: 9 });
    } else {
      pipeline = pipeline.jpeg({ quality, chromaSubsampling: "4:4:4" });
    }
    const buffer = await pipeline.toBuffer();
    return { ok: true, buffer, width, height, bgMode: "space", format: fmt, preset };
  }

  const resolvedBg = resolveBgPath(bgPath);
  if (!resolvedBg) {
    return { ok: false, error: "bg_missing" };
  }

  const base = sharp(resolvedBg).resize(CANVAS_WIDTH, CANVAS_HEIGHT, {
    fit: "cover",
    position: "top",
  });
  const svg = buildEyecatchSvg({ width, height, line1, line2, line3, preset });
  let pipeline = base.composite([{ input: Buffer.from(svg) }]);
  if (fmt === "png") {
    pipeline = pipeline.png({ compressionLevel: 9 });
  } else {
    pipeline = pipeline.jpeg({ quality, chromaSubsampling: "4:4:4" });
  }
  const buffer = await pipeline.toBuffer();

  return { ok: true, buffer, width, height, bgPath: resolvedBg, format: fmt, preset };
}

async function renderBlogEyecatchJpeg({
  bgPath,
  bgMode,
  bgVariant,
  story,
  dateLabel,
  line1,
  line2,
  line3,
  quality = 92,
  preset = "C",
} = {}) {
  return renderBlogEyecatchImage({
    bgPath,
    bgMode,
    bgVariant,
    story,
    dateLabel,
    line1,
    line2,
    line3,
    format: "jpeg",
    quality,
    preset,
  });
}

module.exports = {
  renderBlogEyecatchImage,
  renderBlogEyecatchJpeg,
  buildEyecatchSvg,
  resolveBgPath,
};

if (require.main === module) {
  const fs = require("fs");

  function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (!a.startsWith("--")) continue;
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i += 1;
      } else {
        out[key] = true;
      }
    }
    return out;
  }

  (async () => {
    const args = parseArgs(process.argv.slice(2));
    const date = String(args.date || "2026-03-03");
    const line1 = args.line1 || "2026年3月3日の星の配置";
    const line2 = args.line2 || "魚座太陽 × 乙女座満月";
    const line3 = args.line3 || "";
    const outPath = args.out || path.join(process.cwd(), "public", "blog-eyecatch", `${date}.jpg`);
    const bgPath = args.bg || null;
    const ext = path.extname(outPath).toLowerCase();
    const format = ext === ".png" ? "png" : "jpeg";

    fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const rendered = await renderBlogEyecatchImage({
    bgPath,
      line1,
      line2,
      line3,
      format,
      preset: args.preset || "A",
    });
    if (!rendered?.ok || !rendered.buffer) {
      console.error("[eyecatch] failed:", rendered?.error || "unknown");
      process.exit(1);
    }
    fs.writeFileSync(outPath, rendered.buffer);
    console.log(`[eyecatch] saved: ${outPath}`);
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
