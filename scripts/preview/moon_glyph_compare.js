#!/usr/bin/env node
"use strict";

// Compare moon glyph rendering under "IG-like" vs "X-like" conditions
// using identical inputs (illumination / moonAgeDays / waxing).

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { buildMoonPhaseGlyph } = require("../../src/engine/shared/moon_glyph");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
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

function toNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function boolish(v, fallback) {
  if (v === undefined || v === null || v === "") return fallback;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return fallback;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function wrapSvg({ w, h, glyph }) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    // Intentionally no background rect: keep transparent outside the moon disc.
    glyph,
    `</svg>`,
  ].join("");
}

async function renderSvgToPng(svg, outPath) {
  const buf = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(outPath, buf);
  return outPath;
}

async function renderXLike({ size, illumination, moonAgeDays, waxing, supersample, outPath }) {
  const sample = Math.max(1, Math.round(Number(supersample) || 1));
  const renderSize = size * sample;

  const glyph = buildMoonPhaseGlyph({
    id: "x",
    x: 0,
    y: 0,
    size: renderSize,
    illumination,
    moonAgeDays,
    waxing,
  });
  const svg = wrapSvg({ w: renderSize, h: renderSize, glyph });
  const base = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();

  const out =
    sample > 1
      ? await sharp(base)
          .resize(size, size, { kernel: sharp.kernel.lanczos3 })
          .png({ compressionLevel: 9 })
          .toBuffer()
      : base;

  fs.writeFileSync(outPath, out);
  return outPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const illumination = toNum(args.illumination, 0.110433);
  const moonAgeDays = args.moonAgeDays !== undefined ? toNum(args.moonAgeDays, null) : null;
  const waxing = boolish(args.waxing, false);

  const igSize = Math.max(32, Math.round(toNum(args.igSize, 160)));
  const xSize = Math.max(32, Math.round(toNum(args.xSize, 308)));

  const supersample =
    toNum(
      args.supersample,
      toNum(process.env.X_NIGHT_IMAGE_SUPERSAMPLE, toNum(process.env.X_POST_IMAGE_SUPERSAMPLE, 2))
    ) || 2;

  const outDir = args.outDir || path.join(process.cwd(), "tmp", "moon_glyph_compare");
  ensureDir(outDir);

  const igGlyph = buildMoonPhaseGlyph({
    id: "ig",
    x: 0,
    y: 0,
    size: igSize,
    illumination,
    moonAgeDays,
    waxing,
  });
  const igSvg = wrapSvg({ w: igSize, h: igSize, glyph: igGlyph });
  const igPath = path.join(outDir, `ig_${igSize}px.png`);
  await renderSvgToPng(igSvg, igPath);

  const xPath = path.join(outDir, `x_${xSize}px_ss${Math.round(Number(supersample) || 1)}.png`);
  await renderXLike({ size: xSize, illumination, moonAgeDays, waxing, supersample, outPath: xPath });

  // Side-by-side (transparent) for quick visual compare.
  const pad = 48;
  const outW = igSize + xSize + pad * 3;
  const outH = Math.max(igSize, xSize) + pad * 2;
  const canvas = sharp({
    create: {
      width: outW,
      height: outH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });
  const comboPath = path.join(outDir, `compare_ig${igSize}_x${xSize}_ss${Math.round(Number(supersample) || 1)}.png`);
  const igBuf = fs.readFileSync(igPath);
  const xBuf = fs.readFileSync(xPath);
  const combo = await canvas
    .composite([
      { input: igBuf, left: pad, top: Math.round((outH - igSize) / 2) },
      { input: xBuf, left: pad * 2 + igSize, top: Math.round((outH - xSize) / 2) },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
  fs.writeFileSync(comboPath, combo);

  const meta = {
    illumination,
    moonAgeDays,
    waxing,
    igSize,
    xSize,
    supersample,
    outputs: {
      ig: igPath,
      x: xPath,
      compare: comboPath,
    },
  };
  fs.writeFileSync(path.join(outDir, "meta.json"), JSON.stringify(meta, null, 2));

  console.log("[moon_glyph_compare] wrote", meta.outputs);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

