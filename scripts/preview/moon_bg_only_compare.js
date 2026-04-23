#!/usr/bin/env node
"use strict";

/**
 * Background-only comparison:
 * - Same moon glyph input + same placement + same size + no supersample + no text
 * - Only difference: background generation route (IG vs X)
 *
 * Outputs (3 files):
 *  1) ig_bg_same_moon.png
 *  2) x_bg_same_moon.png
 *  3) compare_bg_only.png
 *
 * Example:
 *   node scripts/preview/moon_bg_only_compare.js \
 *     --dateLocal 2026-04-16 \
 *     --asOfISO 2026-04-16T22:00:00+09:00 \
 *     --outDir tmp/moon_bg_only/2026-04-16_22-00 \
 *     --moonSize 520
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const dict = require("../../src/content/dict");
const { buildMoonStatus } = require("../../src/domain/moon/summary");
const { buildMoonPhaseGlyph } = require("../../src/engine/shared/moon_glyph");
const { buildSpaceBackground, buildSpaceSeedLabel } = require("../../src/engine/shared/space_background");

const IG_CANVAS = { width: 1080, height: 1920 };

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

function wrapSvg({ w, h, defs, body }) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<defs>${defs || ""}</defs>`,
    body || "",
    `</svg>`,
  ].join("");
}

async function svgToPng(svg) {
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const dateLocal = String(args.dateLocal || args.date || "").trim();
  const asOfISO = String(args.asOfISO || args.as_of || "").trim();
  if (!dateLocal) throw new Error("--dateLocal required (YYYY-MM-DD)");
  if (!asOfISO) throw new Error("--asOfISO required (ISO, e.g. 2026-04-16T22:00:00+09:00)");

  const outDir = String(args.outDir || path.join(process.cwd(), "tmp", "moon_bg_only", `${dateLocal}_${asOfISO.replace(/[:]/g, "-")}`));
  ensureDir(outDir);

  const width = Math.round(toNum(args.width, IG_CANVAS.width));
  const height = Math.round(toNum(args.height, IG_CANVAS.height));
  const moonSize = Math.round(toNum(args.moonSize, 520));

  // Compute "real" moon values at asOfISO, then feed identical inputs to both renders.
  const st = buildMoonStatus({ asOfISO, dict });
  const illumination = Number(st?.illumination ?? 0.5);
  const moonAgeDays = Number.isFinite(Number(st?.moonAge)) ? Number(st.moonAge) : null;
  const waxing = st?.waxing !== false;

  // Place moon centered like IG moon slide cover-ish (no text).
  const x = Math.round((width - moonSize) / 2);
  const y = Math.round((height - moonSize) / 2);

  // Same moon glyph group for both.
  const moonGlyph = buildMoonPhaseGlyph({
    id: "moon",
    x,
    y,
    size: moonSize,
    illumination,
    waxing,
    moonAgeDays,
  });

  // IG background route: seedLabel channel=ig, seedVariant=moon, variant=slide1.
  const igSeedLabel = buildSpaceSeedLabel({
    seedVersion: "v2",
    channel: "ig",
    date: dateLocal,
    variant: "moon",
    prefixChannel: true,
  });
  const igBg = buildSpaceBackground({
    story: null,
    dateLabel: dateLocal,
    seedLabel: igSeedLabel,
    width,
    height,
    variant: "slide1",
  });

  // X background route: seedLabel channel=x, seedVariant=night_moon, variant=story_tomorrow.
  const xSeedLabel = buildSpaceSeedLabel({
    seedVersion: "v2",
    channel: "x",
    date: dateLocal,
    variant: "night_moon",
    prefixChannel: true,
  });
  const xBg = buildSpaceBackground({
    story: null,
    dateLabel: dateLocal,
    seedLabel: xSeedLabel,
    width,
    height,
    variant: "story_tomorrow",
  });

  const igSvg = wrapSvg({ w: width, h: height, defs: `${igBg.defs || ""}`, body: `${igBg.body || ""}${moonGlyph}` });
  const xSvg = wrapSvg({ w: width, h: height, defs: `${xBg.defs || ""}`, body: `${xBg.body || ""}${moonGlyph}` });

  const igPng = await svgToPng(igSvg);
  const xPng = await svgToPng(xSvg);

  const igOut = path.join(outDir, "ig_bg_same_moon.png");
  const xOut = path.join(outDir, "x_bg_same_moon.png");
  fs.writeFileSync(igOut, igPng);
  fs.writeFileSync(xOut, xPng);

  const pad = 40;
  const compareW = width * 2 + pad * 3;
  const compareH = height + pad * 2;
  const compare = await sharp({
    create: {
      width: compareW,
      height: compareH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: igPng, left: pad, top: pad },
      { input: xPng, left: pad * 2 + width, top: pad },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
  const compareOut = path.join(outDir, "compare_bg_only.png");
  fs.writeFileSync(compareOut, compare);

  const report = {
    dateLocal,
    asOfISO,
    moon: {
      illumination,
      moonAgeDays,
      waxing,
      size: moonSize,
      x,
      y,
    },
    ig_bg: { seedLabel: igSeedLabel, variant: "slide1" },
    x_bg: { seedLabel: xSeedLabel, variant: "story_tomorrow" },
    outputs: { ig: igOut, x: xOut, compare: compareOut },
  };
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));

  console.log("[moon_bg_only_compare] wrote", report.outputs);
  console.log("[moon_bg_only_compare] moon", report.moon);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

