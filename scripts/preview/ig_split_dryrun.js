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
const { renderIGCaptionVariant } = require("../../src/presenters/format/ig_caption");
const slide1 = require("../../src/engine/renderers/instagram/slides/daily/slide_1");
const slideResonanceWheel = require("../../src/engine/renderers/instagram/slides/daily/slide_resonance_wheel");
const slideNightMoon = require("../../src/engine/renderers/instagram/slides/daily/slide_night_moon");
const { buildSpaceBackground } = require("../../src/engine/shared/space_background");
const { CANVAS } = require("../../src/engine/renderers/instagram/slides/common/shared");

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

async function renderCover(slot, slide, outDir, space) {
  let buffer = null;
  if (slot === "morning") buffer = await slide1.renderSlide1({ ...slide.data, space });
  if (slot === "resonance") buffer = await slideResonanceWheel.renderSlideResonanceWheel({ ...slide.data, space });
  if (slot === "night") buffer = await slideNightMoon.renderSlideNightMoon({ ...slide.data, space });
  if (!buffer) return null;
  const filename = `${slot}-cover.png`;
  const full = path.join(outDir, filename);
  fs.writeFileSync(full, buffer);
  return full;
}

function listAiTypes(slot, story) {
  const parts = story?.outputs?.ig?.parts || {};
  if (slot === "morning") {
    return [
      { key: "carousel_caption", present: !!parts.caption_center },
      { key: "carousel_observation", present: !!parts.caption_observation },
      { key: "hashtags_morning", present: !!parts.hashtags_morning },
    ];
  }
  if (slot === "resonance") {
    return [
      { key: "resonance_split", present: !!parts.resonance },
      { key: "hashtags_resonance", present: !!parts.hashtags_resonance },
    ];
  }
  if (slot === "night") {
    return [
      { key: "moon_night", present: !!parts.moon },
      { key: "hashtags_night", present: !!parts.hashtags_night },
    ];
  }
  return [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const storyPath = args.story || "tmp/stories/story_ig_2026-03-04.json";
  const storyRaw = readJson(storyPath);
  const story = unwrapStory(storyRaw);
  if (!story) throw new Error("story missing");

  const dateLocal = args.date || story?.meta?.date_local || story?.public?.date_local || "2026-03-04";
  const outDir = args.outDir || path.join(process.cwd(), "tmp", "ig", "dryrun", dateLocal);
  ensureDir(outDir);

  const morning = buildMorningCarouselSlides({ story, dateLocal, withCta: true, dict });
  const resonance = buildResonanceCarouselSlides({ story, dateLocal, dict });
  const night = buildNightCarouselSlides({ story, dateLocal, dict });

  const slots = [
    { key: "morning", slides: morning },
    { key: "resonance", slides: resonance },
    { key: "night", slides: night },
  ];

  const spaces = {
    morning: buildSpaceBackground({ width: CANVAS.width, height: CANVAS.height }),
    resonance: buildSpaceBackground({ width: CANVAS.width, height: CANVAS.height }),
    night: buildSpaceBackground({ width: CANVAS.width, height: CANVAS.height }),
  };

  const result = {
    dateLocal,
    dateLabel: formatDateLabel(dateLocal),
    storyPath,
    slots: {},
  };

  for (const slot of slots) {
    const slideKinds = slot.slides.slides.map((s) => s.kind);
    const coverSlide = slot.slides.slides[0];
    const coverPath = await renderCover(slot.key, coverSlide, outDir, spaces[slot.key]);
    const caption = renderIGCaptionVariant(story, { dict, variant: slot.key }) || "";
    result.slots[slot.key] = {
      slides: slideKinds,
      cover: coverPath,
      caption,
      ai_types: listAiTypes(slot.key, story),
    };
  }

  const jsonPath = path.join(outDir, "dryrun_summary.json");
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
