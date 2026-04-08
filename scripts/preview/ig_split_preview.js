#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const dict = require("../../src/content/dict");
const { formatDateLabel } = require("../../src/engine/renderers/instagram/carousel");
const {
  buildMorningCarouselSlides,
  buildResonanceCarouselSlides,
  buildNightCarouselSlides,
} = require("../../src/runners/cron/instagram/daily_slides");
const slide1 = require("../../src/engine/renderers/instagram/slides/daily/slide_1");
const slidePlacements = require("../../src/engine/renderers/instagram/slides/daily/slide_placements");
const slide2 = require("../../src/engine/renderers/instagram/slides/daily/slide_2");
const slide5 = require("../../src/engine/renderers/instagram/slides/daily/slide_5");
const slide3 = require("../../src/engine/renderers/instagram/slides/daily/slide_3");
const slideMoon = require("../../src/engine/renderers/instagram/slides/daily/slide_moon");
const slideResonanceWheel = require("../../src/engine/renderers/instagram/slides/daily/slide_resonance_wheel");
const slideNightMoon = require("../../src/engine/renderers/instagram/slides/daily/slide_night_moon");
const { writeBufferFiles, writeJsonFile } = require("../../src/utils/infra/local_io");
const { buildSpaceBackground } = require("../../src/engine/shared/space_background");
const { CANVAS } = require("../../src/engine/renderers/instagram/slides/common/shared");

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

async function renderSlide(kind, data) {
  if (kind === "cover") return slide1.renderSlide1(data);
  if (kind === "placements") return slidePlacements.renderSlidePlacements(data);
  if (kind === "chart") return slide2.renderSlide2(data);
  if (kind === "cta") return slide5.renderSlide5(data);
  if (kind === "resonance") return slide3.renderSlide3(data);
  if (kind === "moon") return slideMoon.renderSlideMoon(data);
  if (kind === "resonance_wheel") return slideResonanceWheel.renderSlideResonanceWheel(data);
  if (kind === "night_moon") return slideNightMoon.renderSlideNightMoon(data);
  throw new Error(`unknown slide kind: ${kind}`);
}

async function renderSet({ name, slides, outDir, space }) {
  const items = [];
  for (let i = 0; i < slides.slides.length; i += 1) {
    const slide = slides.slides[i];
    const buffer = await renderSlide(slide.kind, { ...slide.data, space });
    items.push({
      filename: `${name}-slide-${i + 1}.png`,
      buffer,
    });
  }
  return writeBufferFiles({ outDir, items });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const storyPath = args.story || "tmp/stories/story_ig_2026-03-04.json";
  const storyRaw = readJson(storyPath);
  const story = unwrapStory(storyRaw);
  if (!story) throw new Error("story missing");

  const dateLocal = args.date || story?.meta?.date_local || story?.public?.date_local || "2026-03-04";
  const outDir = args.outDir || path.join(process.cwd(), "tmp", "ig", "split_preview", dateLocal);
  ensureDir(outDir);

  const morning = buildMorningCarouselSlides({ story, dateLocal, withCta: true, dict });
  const resonance = buildResonanceCarouselSlides({ story, dateLocal, dict });
  const night = buildNightCarouselSlides({ story, dateLocal, dict });

  const morningSpace = buildSpaceBackground({ width: CANVAS.width, height: CANVAS.height });
  const resonanceSpace = buildSpaceBackground({ width: CANVAS.width, height: CANVAS.height });
  const nightSpace = buildSpaceBackground({ width: CANVAS.width, height: CANVAS.height });

  const morningOut = await renderSet({ name: "morning", slides: morning, outDir, space: morningSpace });
  const resonanceOut = await renderSet({ name: "resonance", slides: resonance, outDir, space: resonanceSpace });
  const nightOut = await renderSet({ name: "night", slides: night, outDir, space: nightSpace });

  writeJsonFile({
    outDir,
    filename: "preview_meta.json",
    data: {
      dateLocal,
      dateLabel: formatDateLabel(dateLocal),
      storyPath,
      outputs: {
        morning: morningOut.paths,
        resonance: resonanceOut.paths,
        night: nightOut.paths,
      },
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
