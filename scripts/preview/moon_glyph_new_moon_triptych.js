#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { buildMoonPhaseGlyph } = require("../../src/engine/shared/moon_glyph");
const { buildMoonGeometry } = require("../../src/engine/shared/moon_glyph/geometry");

const SAMPLES = Object.freeze([
  { key: "day29", label: "day29", subtitle: "waning before new moon", age: 29.0, illumination: 0.003, waxing: false },
  { key: "new", label: "exact new moon", subtitle: "conjunction / exact new moon", age: 0.0, illumination: 0.0, waxing: true },
  { key: "day1", label: "day1", subtitle: "waxing after new moon", age: 1.0, illumination: 0.011, waxing: true },
]);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function wrapSvg({ width, height, body }) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    body,
    `</svg>`,
  ].join("");
}

async function renderGlyph(sample, size) {
  const glyph = buildMoonPhaseGlyph({
    id: sample.key,
    x: 0,
    y: 0,
    size,
    moonAgeDays: sample.age,
    illumination: sample.illumination,
    waxing: sample.waxing,
  });
  const svg = wrapSvg({ width: size, height: size, body: glyph });
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

async function main() {
  const outDir = path.join(process.cwd(), "tmp", "moon_glyph_sheet");
  const outPath = path.join(outDir, "moon_glyph_new_moon_triptych.png");
  ensureDir(outDir);

  const cellW = 360;
  const cellH = 420;
  const moonSize = 180;
  const width = cellW * SAMPLES.length;
  const height = cellH;

  const base = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 8, g: 12, b: 24, alpha: 1 },
    },
  });

  const composites = [];
  const texts = [];

  for (let i = 0; i < SAMPLES.length; i += 1) {
    const sample = SAMPLES[i];
    const x = i * cellW;
    const moonX = x + Math.round((cellW - moonSize) / 2);
    const moonY = 32;
    const geometry = buildMoonGeometry({
      size: moonSize,
      moonAgeDays: sample.age,
      illumination: sample.illumination,
      waxing: sample.waxing,
    });
    const png = await renderGlyph(sample, moonSize);
    composites.push({ input: png, left: moonX, top: moonY });

    const actualPct = (Number(geometry.meta?.actualIllumination ?? sample.illumination) * 100).toFixed(1);
    const visualPct = (Number(geometry.meta?.visualIllumination ?? geometry.illum) * 100).toFixed(1);
    texts.push(
      `<text x="${x + cellW / 2}" y="250" text-anchor="middle" fill="#f5f7ff" font-size="26" font-family="Helvetica, Arial, sans-serif">${sample.label}</text>`,
      `<text x="${x + cellW / 2}" y="282" text-anchor="middle" fill="#cdd6f4" font-size="16" font-family="Helvetica, Arial, sans-serif">${sample.subtitle}</text>`,
      `<text x="${x + cellW / 2}" y="320" text-anchor="middle" fill="#cdd6f4" font-size="17" font-family="Helvetica, Arial, sans-serif">age ${sample.age.toFixed(1)} / ${geometry.meta.family}</text>`,
      `<text x="${x + cellW / 2}" y="350" text-anchor="middle" fill="#a8b4d8" font-size="16" font-family="Helvetica, Arial, sans-serif">actual ${actualPct}% / visual ${visualPct}%</text>`,
      `<text x="${x + cellW / 2}" y="378" text-anchor="middle" fill="#8fa1d1" font-size="15" font-family="Helvetica, Arial, sans-serif">${sample.waxing ? "right-lit" : "left-lit"}</text>`
    );
  }

  const overlay = wrapSvg({ width, height, body: texts.join("") });
  await base
    .composite([
      ...composites,
      { input: Buffer.from(overlay), left: 0, top: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  console.log("[moon_glyph_new_moon_triptych] wrote", outPath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
