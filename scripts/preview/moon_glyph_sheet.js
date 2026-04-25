#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { buildMoonPhaseGlyph } = require("../../src/engine/shared/moon_glyph");
const { buildMoonGeometry } = require("../../src/engine/shared/moon_glyph/geometry");
const { SYNODIC_MONTH } = require("../../src/engine/shared/moon_glyph/keyframes");

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

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function wrapSvg({ w, h, glyph }) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    glyph,
    `</svg>`,
  ].join("");
}

function illuminationFromMoonAge(day) {
  const phaseDeg = (Math.max(0, Number(day)) / SYNODIC_MONTH) * 360;
  return (1 - Math.cos((phaseDeg * Math.PI) / 180)) / 2;
}

async function renderGlyphPng({ day, size }) {
  const waxing = day < 15;
  const illumination = illuminationFromMoonAge(day);
  const glyph = buildMoonPhaseGlyph({
    id: `day-${day}`,
    x: 0,
    y: 0,
    size,
    moonAgeDays: day,
    waxing,
    illumination,
  });
  const svg = wrapSvg({ w: size, h: size, glyph });
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = String(args.outDir || path.join(process.cwd(), "tmp", "moon_glyph_sheet"));
  const outName = String(args.out || "moon_glyph_sheet_1_29.png");
  const cols = Math.max(1, Math.round(toNum(args.cols, 5)));
  const cellSize = Math.max(120, Math.round(toNum(args.cellSize, 280)));
  const moonSize = Math.max(48, Math.round(toNum(args.moonSize, 160)));
  const pad = Math.max(8, Math.round(toNum(args.pad, 24)));
  const labelH = Math.max(48, Math.round(toNum(args.labelH, 84)));
  const metaH = Math.max(28, Math.round(toNum(args.metaH, 44)));
  const rows = Math.ceil(29 / cols);
  const width = cols * cellSize + pad * 2;
  const height = rows * (cellSize + labelH + metaH) + pad * 2;

  ensureDir(outDir);
  const base = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 8, g: 12, b: 24, alpha: 1 },
    },
  });

  const composites = [];
  const svgTexts = [];

  for (let day = 1; day <= 29; day += 1) {
    const col = (day - 1) % cols;
    const row = Math.floor((day - 1) / cols);
    const x = pad + col * cellSize;
    const y = pad + row * (cellSize + labelH + metaH);
    const moonX = x + Math.round((cellSize - moonSize) / 2);
    const moonY = y + 8;
    const illumination = illuminationFromMoonAge(day);
    const geom = buildMoonGeometry({
      size: moonSize,
      moonAgeDays: day,
      waxing: day < 15,
      illumination,
    });
    const png = await renderGlyphPng({ day, size: moonSize });
    composites.push({ input: png, left: moonX, top: moonY });

    const labelY = y + moonSize + 18;
    const metaY = labelY + 30;
    svgTexts.push(
      `<text x="${x + cellSize / 2}" y="${labelY}" text-anchor="middle" fill="#f5f7ff" font-size="24" font-family="Helvetica, Arial, sans-serif">day ${day}</text>`,
      `<text x="${x + cellSize / 2}" y="${metaY}" text-anchor="middle" fill="#a8b4d8" font-size="15" font-family="Helvetica, Arial, sans-serif">${geom.meta.family} / s=${Number(geom.meta.strength).toFixed(2)} / i=${Number(geom.illum).toFixed(3)}</text>`
    );
  }

  const overlaySvg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    ...svgTexts,
    `</svg>`,
  ].join("");

  const outPath = path.join(outDir, outName);
  const out = await base
    .composite([
      ...composites,
      { input: Buffer.from(overlaySvg), left: 0, top: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();

  fs.writeFileSync(outPath, out);
  console.log("[moon_glyph_sheet] wrote", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
