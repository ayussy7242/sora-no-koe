#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const dict = require("../../src/content/dict");
const {
  buildSpaceBackground,
  buildSpaceSeedLabel,
  COSMIC_PRESETS,
} = require("../../src/engine/shared/space_background");
const { renderInstagramCarousel } = require("../../src/engine/renderers/instagram/carousel");
const { renderStoryBackground } = require("../../src/engine/renderers/instagram/story/render_backgrounds");
const { buildMorningCarouselSlides } = require("../../src/runners/cron/instagram/slot_slides");
const { buildEyecatchSvg } = require("../../src/engine/renderers/blog/blog_eyecatch");
const { renderXMorningWheelPng, DEFAULT_X_CANVAS } = require("../../src/engine/renderers/x/morning_wheel");
const { buildSoraWheelSvg } = require("../../src/engine/graphics/sora_wheel");
const { fontFaceCss } = require("../../src/engine/renderers/instagram/assets/fonts");
const { formatDateLabel } = require("../../src/utils/time");
const { clamp } = require("../../src/utils/data/math");
const { PAGE_WIDTH, PAGE_HEIGHT } = require("../../src/engine/pdf/blueprint_v25/constants");

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

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function unwrapStory(payload) {
  if (payload && typeof payload === "object" && payload.story) return payload.story;
  return payload;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function pickStoryPath({ explicit, fallback }) {
  const candidate = explicit || fallback;
  if (candidate && fs.existsSync(candidate)) return candidate;
  return null;
}

function buildStoryAvoidRegion({ width, height }) {
  return [{
    x: width * 0.08,
    y: height * 0.28,
    w: width * 0.84,
    h: height * 0.56,
    weight: 1,
    feather: 70,
    slideIndex: 0,
  }];
}

function buildFooterSvg({ width, height, brand, dateLabel }) {
  if (!brand && !dateLabel) return "";
  const minSide = Math.min(width, height);
  const brandSize = Math.round(minSide * 0.04);
  const dateSize = Math.round(minSide * 0.032);
  const tracking = 0.08;
  const padding = Math.round(minSide * 0.06);
  const x = width - padding;
  const brandY = height - padding - dateSize - Math.round(minSide * 0.012);
  const dateY = height - padding;
  const color = "#C8CBF2";
  const opacity = 0.7;
  const brandLine = brand
    ? `<text x="${x}" y="${brandY}" text-anchor="end" fill="${color}" opacity="${opacity}" font-size="${brandSize}" font-family="SoraTitle" letter-spacing="${tracking}em">${brand}</text>`
    : "";
  const dateLine = dateLabel
    ? `<text x="${x}" y="${dateY}" text-anchor="end" fill="${color}" opacity="${opacity}" font-size="${dateSize}" font-family="SoraTitle" letter-spacing="${tracking}em">${dateLabel}</text>`
    : "";
  return `${brandLine}${dateLine}`;
}

function buildWheelUnderlay({ cx, cy, r }) {
  const id = `wheelHalo-${Math.round(cx)}-${Math.round(cy)}-${Math.round(r)}`;
  const defs = [
    `<radialGradient id="${id}" cx="50%" cy="50%" r="50%">`,
    `<stop offset="0%" stop-color="#0B0E1A" stop-opacity="0.72"/>`,
    `<stop offset="55%" stop-color="#0B0E1A" stop-opacity="0.48"/>`,
    `<stop offset="100%" stop-color="#0B0E1A" stop-opacity="0"/>`,
    `</radialGradient>`,
  ].join("");
  const body = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id})"/>`;
  return { defs, body };
}

function buildXBaseSvg({ story, dateLabel, seedLabel, width, height, variant, avoidRegions, underlay, footer, spaceConfig }) {
  const space = buildSpaceBackground({
    story,
    dateLabel,
    seedLabel,
    width,
    height,
    variant,
    avoidRegions,
    spaceConfig,
  });
  const defs = `<style>${fontFaceCss()}</style>${space.defs || ""}${underlay?.defs || ""}`;
  const body = `${space.body || ""}${underlay?.body || ""}${footer || ""}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs>${defs}</defs>`,
    body,
    `</svg>`,
  ].join("");
}

async function renderXMorningWheelWithPreset({
  story,
  dateLabel,
  width = DEFAULT_X_CANVAS.width,
  height = DEFAULT_X_CANVAS.height,
  variant = "story_today",
  spaceConfig,
} = {}) {
  if (!story) throw new Error("renderXMorningWheelWithPreset: story required");
  const w = Number.isFinite(Number(width)) ? Number(width) : DEFAULT_X_CANVAS.width;
  const h = Number.isFinite(Number(height)) ? Number(height) : DEFAULT_X_CANVAS.height;
  const minSide = Math.min(w, h);
  const rawWheel = minSide * 0.88;
  const wheel = clamp(Math.round(rawWheel), Math.round(minSide * 0.62), Math.round(minSide * 0.94));
  const left = Math.round((w - wheel) / 2);
  const top = Math.round((h - wheel) / 2);
  const seedDate = story?.meta?.date_local || story?.public?.date_local || dateLabel || "";
  const seedLabel = buildSpaceSeedLabel({
    seedVersion: "v2",
    channel: "x",
    date: seedDate,
    variant: String(variant || "story_today"),
    prefixChannel: true,
  });
  const cx = left + wheel / 2;
  const cy = top + wheel / 2;
  const zodiacR = wheel * 0.4 + 28;
  const margin = wheel * 0.08;
  const r = Math.min(wheel * 0.6, zodiacR + margin);
  const avoidRegions = [{
    shape: "circle",
    kind: "wheel",
    softOnly: true,
    cx,
    cy,
    r,
    x: cx - r,
    y: cy - r,
    w: r * 2,
    h: r * 2,
    weight: 0.55,
    feather: Math.round(wheel * 0.28),
  }];
  const useLegacyUnderlay = !(spaceConfig?.underlayPreset || spaceConfig?.underlay);
  const underlay = useLegacyUnderlay
    ? buildWheelUnderlay({
      cx: left + wheel / 2,
      cy: top + wheel / 2,
      r: wheel * 0.6,
    })
    : null;
  const baseSvg = buildXBaseSvg({
    story,
    dateLabel,
    seedLabel,
    width: w,
    height: h,
    variant,
    avoidRegions,
    underlay,
    footer: buildFooterSvg({
      width: w,
      height: h,
      brand: "sora-no-koe",
      dateLabel: formatDateLabel(dateLabel || seedDate),
    }),
    spaceConfig,
  });
  const chartSvg = buildSoraWheelSvg({
    story,
    dateLabel,
    size: wheel,
  });
  const base = sharp(Buffer.from(baseSvg));
  const composed = base.composite([{ input: Buffer.from(chartSvg), top, left }]);
  return composed.png({ compressionLevel: 9 }).toBuffer();
}

function hashToUnit(seed) {
  const crypto = require("crypto");
  const hash = crypto.createHash("sha1").update(String(seed || "")).digest("hex");
  const slice = hash.slice(0, 8);
  const num = parseInt(slice, 16);
  if (!Number.isFinite(num)) return 0;
  return (num % 10000) / 10000;
}

async function renderBlueprintBg({ story, dateLabel, seedLabel, spaceConfig, outPath }) {
  const worldWidth = Math.round(PAGE_WIDTH * 2.4);
  const unit = hashToUnit(`${seedLabel}-sys`);
  const offsetX = Math.round(unit * Math.max(0, worldWidth - PAGE_WIDTH));
  const bg = buildSpaceBackground({
    story,
    dateLabel,
    seedLabel,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    variant: "slide1",
    worldWidth,
    offsetX,
    spaceConfig,
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}"><defs>${bg.defs || ""}</defs>${bg.body || ""}</svg>`;
  ensureDir(path.dirname(outPath));
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(outPath);
}

async function renderRelationBg({ seedLabel, spaceConfig, outPath }) {
  const bg = buildSpaceBackground({
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    variant: "slide3",
    seedLabel,
    spaceConfig,
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}"><defs>${bg.defs || ""}</defs>${bg.body || ""}</svg>`;
  ensureDir(path.dirname(outPath));
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(outPath);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseOut = args.outDir || path.join(process.cwd(), "tmp", "preview", "cosmic_presets");
  const storyPath = pickStoryPath({ explicit: args.story, fallback: "tmp/stories/story_today.json" }) || "tmp/stories/story_ig_2026-03-04.json";
  const igStoryPath = pickStoryPath({ explicit: args.igStory, fallback: storyPath }) || storyPath;
  const story = unwrapStory(readJson(storyPath));
  const igStory = unwrapStory(readJson(igStoryPath));
  const dateLocal = igStory?.meta?.date_local || igStory?.public?.date_local || story?.meta?.date_local || "2026-03-03";
  const dateLabel = formatDateLabel(dateLocal);

  const presets = COSMIC_PRESETS;

  const onlyPreset = String(args.preset || args.only || "").trim();
  const presetEntries = Object.entries(presets).filter(([key]) => !onlyPreset || key === onlyPreset);

  for (const [presetKey, preset] of presetEntries) {
    const spaceConfig = {
      ...(preset?.space || {}),
      underlayPreset: preset?.underlay || null,
    };
    const outDir = path.join(baseOut, presetKey);
    ensureDir(outDir);

    // IG carousel (single cover slide)
    const morning = buildMorningCarouselSlides({ story: igStory, dateLocal, withCta: true, dict });
    const cover = Array.isArray(morning.slides) ? morning.slides.slice(0, 1) : [];
    const igBuffers = await renderInstagramCarousel({
      slides: cover,
      slideSet: morning.slideSet || "morning",
      seedVariant: presetKey,
      spaceConfig,
    });
    if (igBuffers?.[0]) {
      const igOut = path.join(outDir, "ig_carousel_cover.png");
      fs.writeFileSync(igOut, igBuffers[0]);
      console.log(igOut);
    }

    // IG story (story_today)
    const storyAvoid = buildStoryAvoidRegion({ width: 1080, height: 1920 });
    const storySpace = buildSpaceBackground({
      story,
      dateLabel,
      width: 1080,
      height: 1920,
      variant: "story_today",
      avoidRegions: storyAvoid,
      spaceConfig,
    });
    const storyBuf = await renderStoryBackground({
      title: { ja: "今日の空", en: "Today's Sky" },
      space: storySpace,
    });
    const storyOut = path.join(outDir, "ig_story_today.png");
    fs.writeFileSync(storyOut, storyBuf);
    console.log(storyOut);

    // Blog eyecatch (space)
    const blogOut = path.join(outDir, "blog_eyecatch_space.jpg");
    const blogSpace = buildSpaceBackground({
      story,
      dateLabel,
      width: 1200,
      height: 630,
      variant: "slide1",
      spaceConfig,
    });
    const blogSvg = buildEyecatchSvg({
      width: 1200,
      height: 630,
      line1: `${dateLabel.replace(/\\./g, "年")}日の星の配置`.replace("日", "日"),
      line2: "今日のソラ",
      line3: "",
      preset: "C",
      space: blogSpace,
    });
    const blogBuf = await sharp(Buffer.from(blogSvg))
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
      .toBuffer();
    fs.writeFileSync(blogOut, blogBuf);
    console.log(blogOut);

    // X morning wheel
    const xOut = path.join(outDir, "x_morning_wheel.png");
    const xBuf = await renderXMorningWheelWithPreset({
      story,
      dateLabel,
      width: DEFAULT_X_CANVAS.width,
      height: DEFAULT_X_CANVAS.height,
      variant: "story_today",
      spaceConfig,
    });
    fs.writeFileSync(xOut, xBuf);
    console.log(xOut);

    // PDF Blueprint (sys page)
    const blueprintSeed = buildSpaceSeedLabel({
      seedVersion: "v2",
      channel: "blueprint",
      userId: "preview",
      natalHash: "preview",
      prefixChannel: true,
    });
    const blueprintOut = path.join(outDir, "pdf_blueprint_sys.png");
    await renderBlueprintBg({
      story,
      dateLabel,
      seedLabel: blueprintSeed,
      spaceConfig,
      outPath: blueprintOut,
    });
    console.log(blueprintOut);

    // PDF Relation
    const relationSeed = buildSpaceSeedLabel({
      seedVersion: "v2",
      channel: "relation",
      pairId: "preview",
      prefixChannel: true,
    });
    const relationOut = path.join(outDir, "pdf_relation.png");
    await renderRelationBg({
      seedLabel: relationSeed,
      spaceConfig,
      outPath: relationOut,
    });
    console.log(relationOut);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
