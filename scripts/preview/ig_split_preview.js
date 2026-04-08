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
} = require("../../src/runners/cron/instagram/slot_slides");
const { writeBufferFiles, writeJsonFile } = require("../../src/utils/infra/local_io");
const { renderInstagramCarousel } = require("../../src/engine/renderers/instagram/carousel");

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

async function renderSet({ name, carousel, outDir }) {
  const items = [];
  await renderInstagramCarousel({
    slides: carousel.slides,
    slideSet: "daily",
    seedVariant: carousel.seedVariant || name,
    spaceConfig: carousel.spaceConfig || null,
    onSlide: async ({ index, buffer }) => {
      items.push({
        filename: `${name}-slide-${index + 1}.png`,
        buffer,
      });
    },
  });
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

  const morningOut = await renderSet({ name: "morning", carousel: morning, outDir });
  const resonanceOut = await renderSet({ name: "resonance", carousel: resonance, outDir });
  const nightOut = await renderSet({ name: "night", carousel: night, outDir });

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
