#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { buildMoonPhaseGlyph } = require("../../src/engine/shared/moon_glyph");
const { buildMoonGeometry } = require("../../src/engine/shared/moon_glyph/geometry");
const { SYNODIC_MONTH } = require("../../src/engine/shared/moon_glyph/keyframes");

const SAMPLES = Object.freeze([
  { label: "三日月", age: 3.0, waxing: true },
  { label: "上弦", age: 7.4, waxing: true },
  { label: "8.8", age: 8.8, waxing: true },
  { label: "9.0", age: 9.0, waxing: true },
  { label: "9.1", age: 9.1, waxing: true },
  { label: "十三夜", age: 13.0, waxing: true },
  { label: "満月", age: 14.8, waxing: true },
  { label: "下弦", age: 22.1, waxing: false },
  { label: "残月", age: 27.0, waxing: false },
]);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function illuminationFromMoonAge(ageDays) {
  const phaseDeg = (Math.max(0, Number(ageDays)) / SYNODIC_MONTH) * 360;
  return (1 - Math.cos((phaseDeg * Math.PI) / 180)) / 2;
}

function wrapSvg({ width, height, body }) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    body,
    `</svg>`,
  ].join("");
}

async function renderGlyph({ sample, size }) {
  const illumination = illuminationFromMoonAge(sample.age);
  const glyph = buildMoonPhaseGlyph({
    id: `sample-${sample.label}`,
    x: 0,
    y: 0,
    size,
    moonAgeDays: sample.age,
    waxing: sample.waxing,
    illumination,
  });
  const svg = wrapSvg({ width: size, height: size, body: glyph });
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

async function main() {
  const outDir = path.join(process.cwd(), "tmp", "moon_glyph_sheet");
  const outPath = path.join(outDir, "moon_glyph_key_samples.png");
  const cols = 3;
  const cellW = 280;
  const cellH = 320;
  const moonSize = 160;
  const rows = Math.ceil(SAMPLES.length / cols);
  const width = cols * cellW;
  const height = rows * cellH;

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
  const labels = [];

  for (let index = 0; index < SAMPLES.length; index += 1) {
    const sample = SAMPLES[index];
    const row = Math.floor(index / cols);
    const col = index % cols;
    const x = col * cellW;
    const y = row * cellH;
    const moonX = x + Math.round((cellW - moonSize) / 2);
    const moonY = y + 20;
    const illumination = illuminationFromMoonAge(sample.age);
    const geom = buildMoonGeometry({
      size: moonSize,
      moonAgeDays: sample.age,
      waxing: sample.waxing,
      illumination,
    });
    const png = await renderGlyph({ sample, size: moonSize });
    composites.push({ input: png, left: moonX, top: moonY });

    labels.push(
      `<text x="${x + cellW / 2}" y="${y + 220}" text-anchor="middle" fill="#f5f7ff" font-size="24" font-family="Helvetica, Arial, sans-serif">${sample.label}</text>`,
      `<text x="${x + cellW / 2}" y="${y + 252}" text-anchor="middle" fill="#cdd6f4" font-size="16" font-family="Helvetica, Arial, sans-serif">age ${sample.age.toFixed(1)} / illum ${(illumination * 100).toFixed(1)}%</text>`,
      `<text x="${x + cellW / 2}" y="${y + 280}" text-anchor="middle" fill="#a8b4d8" font-size="15" font-family="Helvetica, Arial, sans-serif">${geom.meta.family} / s=${Number(geom.meta.strength).toFixed(3)}</text>`
    );
  }

  const overlay = wrapSvg({
    width,
    height,
    body: labels.join(""),
  });

  await base
    .composite([
      ...composites,
      { input: Buffer.from(overlay), left: 0, top: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  console.log("[moon_glyph_key_samples] wrote", outPath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
