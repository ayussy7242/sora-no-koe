#!/usr/bin/env node
"use strict";

/**
 * Re-generate "prod-path-like" moon images for IG night (slide1) and X night,
 * then print the actual values used (asOfISO / illumination / moonAgeDays / waxing / size / supersample).
 *
 * Usage:
 *   node scripts/preview/moon_prod_compare.js \
 *     --dateLocal 2026-04-16 \
 *     --xAsOfISO 2026-04-16T22:22:00+09:00 \
 *     --story tmp/stories/public_2026-04-16.json \
 *     --outDir tmp/moon_prod_compare/2026-04-16 \
 *     --xSupersample 2
 */

const fs = require("fs");
const path = require("path");

const dict = require("../../src/content/dict");

const { buildNightMoonSlide } = require("../../src/runners/cron/instagram/slot_slides");
const { renderSlide1: renderIgMoonSlide1 } = require("../../src/engine/renderers/instagram/slides/moon/slide_1");

const { renderXNightMoonPng, DEFAULT_X_NIGHT_CANVAS } = require("../../src/engine/renderers/x/night_moon");
const { buildMoonStatus } = require("../../src/domain/moon/summary");

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

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function unwrapStory(payload) {
  if (payload && typeof payload === "object" && payload.story) return payload.story;
  return payload;
}

function toNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pickMoonMeta(status) {
  return {
    illumination: status?.illumination ?? null,
    moonAgeDays: status?.moonAge ?? null,
    waxing: status?.waxing ?? null,
    phaseName: status?.phaseName ?? null,
    waName: status?.waName ?? null,
    signJa: status?.signJa ?? null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dateLocal = String(args.dateLocal || args.date || "").trim() || null;
  const xAsOfISO = String(args.xAsOfISO || args.x_as_of || args.asOfISO || "").trim() || null;
  const storyPath = String(args.story || "").trim() || null;
  const outDir = String(args.outDir || path.join(process.cwd(), "tmp", "moon_prod_compare", dateLocal || "unknown"));
  const xSupersample = Math.max(1, Math.round(toNum(args.xSupersample || args.supersample, 2)));

  if (!dateLocal) throw new Error("--dateLocal required");
  if (!xAsOfISO) throw new Error("--xAsOfISO required");
  if (!storyPath) throw new Error("--story required (story json path)");

  ensureDir(outDir);
  const story = unwrapStory(readJson(storyPath));

  // --- IG night (moon slide1): uses buildNightMoonSlide -> buildMoonStatus at JST noon internally.
  const igSlide = buildNightMoonSlide({ story, dateLocal, dict });
  const igPng = await renderIgMoonSlide1(igSlide?.data || {});
  const igPath = path.join(outDir, `ig_night_moon_slide1_${dateLocal}.png`);
  fs.writeFileSync(igPath, igPng);

  const igAsOfISO = `${dateLocal}T12:00:00+09:00`;
  const igStatus = buildMoonStatus({ asOfISO: igAsOfISO, story, dict });

  // --- X night: uses renderXNightMoonPng with asOfISO passed from cron.
  const width = toNum(args.xWidth, DEFAULT_X_NIGHT_CANVAS.width);
  const height = toNum(args.xHeight, DEFAULT_X_NIGHT_CANVAS.height);
  const xPng = await renderXNightMoonPng({
    story,
    dict,
    asOfISO: xAsOfISO,
    dateLabel: dateLocal,
    width,
    height,
    variant: String(args.xVariant || "story_tomorrow"),
    supersample: xSupersample,
    spaceConfig: null,
  });
  const xPath = path.join(outDir, `x_night_moon_${dateLocal}.png`);
  fs.writeFileSync(xPath, xPng);

  const xStatus = buildMoonStatus({ asOfISO: xAsOfISO, story, dict });

  const report = {
    dateLocal,
    outputs: { ig: igPath, x: xPath },
    ig: {
      route: "IG night moon slide1 (buildNightMoonSlide -> slide_1 renderer)",
      asOfISO: igAsOfISO,
      moon: pickMoonMeta(igStatus),
      glyph: {
        size: igSlide?.data?.moonSize ?? null,
        model: null,
        geometryOptions: null,
        lightColor: null,
        darkColor: null,
        strokeColor: null,
        rim: true,
        supersample: 1,
      },
      background: {
        route: "IG space background (slide_1 baseSvg)",
        spaceConfig: igSlide?.data?.spaceConfig ?? null,
      },
    },
    x: {
      route: "X night image (renderXNightMoonPng)",
      asOfISO: xAsOfISO,
      moon: pickMoonMeta(xStatus),
      glyph: {
        size_hint: "computed inside renderer",
        supersample: xSupersample,
        resize_kernel: xSupersample > 1 ? "lanczos3" : null,
        width,
        height,
        variant: String(args.xVariant || "story_tomorrow"),
      },
      background: {
        route: "X space background (buildSpaceBackground)",
        spaceConfig: null,
      },
    },
  };

  const reportPath = path.join(outDir, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log("[moon_prod_compare] wrote", { ig: igPath, x: xPath, report: reportPath });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

