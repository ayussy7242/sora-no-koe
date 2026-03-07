"use strict";

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const FONT_DIR = path.join(ROOT_DIR, "assets", "fonts");
const DEFAULT_BG_PATH = path.join(ROOT_DIR, "assets", "img", "blog", "eyecatch-bg.jpg");
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 630;
const SAFE_TOP = 140;
const SAFE_BOTTOM = 90;

const FONT_FILES = {
  line1: "ZenKakuGothicNew-Medium.ttf",
  line2: "ShipporiMincho-Regular.ttf",
  line2Bold: "ShipporiMincho-Bold.ttf",
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
  line1: readFontBase64(FONT_FILES.line1),
  line2: readFontBase64(FONT_FILES.line2),
  line2Bold: readFontBase64(FONT_FILES.line2Bold),
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

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
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
      centerY: 350,
      line1Y: 300,
      line2Y: 400,
      line3Y: 470,
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

function buildEyecatchSvg({ width, height, line1, line2, line3, preset }) {
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
  const hasLine3 = line3 != null && String(line3).trim() !== "";
  const lineHeight3 = hasLine3 ? line3Size * lineHeightRatio : 0;
  const totalHeight =
    lineHeight1 +
    lineHeight2 +
    (config.lineGap || 0) +
    (hasLine3 ? (config.lineGap || 0) + lineHeight3 : 0);
  const centerY = clampCenterY(config.centerY, totalHeight, h);

  let line1Y = null;
  let line2Y = null;
  let line3Y = null;
  if (Number.isFinite(config.line1Y) && Number.isFinite(config.line2Y)) {
    line1Y = Math.round(config.line1Y);
    line2Y = Math.round(config.line2Y);
    if (hasLine3) {
      line3Y = Number.isFinite(config.line3Y)
        ? Math.round(config.line3Y)
        : Math.round(line2Y + line2Size + (config.lineGap || 0) + line3Size);
    }
  } else {
    const top = centerY - totalHeight / 2;
    line1Y = Math.round(top + line1Size);
    line2Y = Math.round(top + lineHeight1 + (config.lineGap || 0) + line2Size);
    if (hasLine3) {
      line3Y = Math.round(
        top + lineHeight1 + (config.lineGap || 0) + lineHeight2 + (config.lineGap || 0) + line3Size
      );
    }
  }

  const line2Font = config.line2Weight === "bold" ? "SoraLine2Bold" : "SoraLine2";
  const line1Spacing = Number.isFinite(config.line1LetterSpacing) ? config.line1LetterSpacing : 0.08;
  const line2Spacing = Number.isFinite(config.line2LetterSpacing) ? config.line2LetterSpacing : 0.04;
  const line3Spacing = Number.isFinite(config.line3LetterSpacing) ? config.line3LetterSpacing : 0.1;
  const safeLine1 = String(line1 || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeLine2 = String(line2 || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeLine3 = String(line3 || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const line3Font = config.line3Weight === "bold" ? "SoraLine2Bold" : "SoraLine1";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<defs>`,
    `<style>${fontFaceCss()}</style>`,
    `<filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">`,
    `<feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000000" flood-opacity="0.35"/>`,
    `</filter>`,
    `</defs>`,
    `<g filter="url(#shadow)">`,
    `<text x="${centerX}" y="${line1Y}" text-anchor="middle" fill="#F6F7FB" font-size="${line1Size}" font-family="SoraLine1,sans-serif" letter-spacing="${line1Spacing}em">${safeLine1}</text>`,
    `<text x="${centerX}" y="${line2Y}" text-anchor="middle" fill="#FFFFFF" font-size="${line2Size}" font-family="${line2Font},serif" letter-spacing="${line2Spacing}em">${safeLine2}</text>`,
    hasLine3
      ? `<text x="${centerX}" y="${line3Y}" text-anchor="middle" fill="#E5E7F4" font-size="${line3Size}" font-family="${line3Font},sans-serif" letter-spacing="${line3Spacing}em">${safeLine3}</text>`
      : "",
    `</g>`,
    `</svg>`,
  ].join("");
}

async function renderBlogEyecatchImage({
  bgPath,
  line1,
  line2,
  line3,
  format = "jpeg",
  quality = 92,
  preset = "C",
} = {}) {
  const resolvedBg = resolveBgPath(bgPath);
  if (!resolvedBg) {
    return { ok: false, error: "bg_missing" };
  }

  const base = sharp(resolvedBg).resize(CANVAS_WIDTH, CANVAS_HEIGHT, {
    fit: "cover",
    position: "top",
  });
  const width = CANVAS_WIDTH;
  const height = CANVAS_HEIGHT;

  const svg = buildEyecatchSvg({ width, height, line1, line2, line3, preset });
  let pipeline = base.composite([{ input: Buffer.from(svg) }]);
  const fmt = String(format || "jpeg").toLowerCase();
  if (fmt === "png") {
    pipeline = pipeline.png({ compressionLevel: 9 });
  } else {
    pipeline = pipeline.jpeg({ quality, chromaSubsampling: "4:4:4" });
  }
  const buffer = await pipeline.toBuffer();

  return { ok: true, buffer, width, height, bgPath: resolvedBg, format: fmt, preset };
}

async function renderBlogEyecatchJpeg({ bgPath, line1, line2, line3, quality = 92, preset = "C" } = {}) {
  return renderBlogEyecatchImage({ bgPath, line1, line2, line3, format: "jpeg", quality, preset });
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
