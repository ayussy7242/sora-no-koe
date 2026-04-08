#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const dict = require("../../src/content/dict");
const { ensureIgOutputs } = require("../../src/usecases/story/output_helpers");
const { loadEnvChain } = require("../../src/utils/env_file");
const { generateIgDailyAiOutputs } = require("../../src/usecases/channels/instagram/ai/daily");
const { pickPreferredResonanceAspect } = require("../../src/domain/resonance");
const { formatDateLabel } = require("../../src/engine/renderers/instagram/carousel");
const {
  buildMorningCarouselSlides,
  buildResonanceCarouselSlides,
  buildNightCarouselSlides,
} = require("../../src/runners/cron/instagram/daily_slides");
const { renderIGCaptionVariant } = require("../../src/presenters/format/ig_caption");
const slide1 = require("../../src/engine/renderers/instagram/slides/daily/slide_1");
const slidePlacements = require("../../src/engine/renderers/instagram/slides/daily/slide_placements");
const slide2 = require("../../src/engine/renderers/instagram/slides/daily/slide_2");
const slide5 = require("../../src/engine/renderers/instagram/slides/daily/slide_5");
const slide3 = require("../../src/engine/renderers/instagram/slides/daily/slide_3");
const slideMoon = require("../../src/engine/renderers/instagram/slides/daily/slide_moon");
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

function findLatestStoryFile(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const candidates = files
    .map((file) => {
      const m = file.match(/(\d{4}-\d{2}-\d{2})/);
      return m ? { file, date: m[1] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  for (const c of candidates) {
    const full = path.join(dir, c.file);
    try {
      const raw = readJson(full);
      const story = unwrapStory(raw);
      if (story && story.public) return full;
    } catch (_) {
      // ignore
    }
  }
  return null;
}

function buildAspectKey(aspect, { includeOrb = false } = {}) {
  if (!aspect) return "";
  const a = String(aspect?.a || "").toLowerCase();
  const b = String(aspect?.b || "").toLowerCase();
  const deg = Number.isFinite(Number(aspect?.aspect_deg)) ? Number(aspect.aspect_deg) : "";
  const orb = includeOrb && Number.isFinite(Number(aspect?.orb_deg))
    ? Number(aspect.orb_deg).toFixed(2)
    : "";
  return [a, b, deg, orb].filter(Boolean).join("|");
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

async function renderSlidesSet({ name, slides, outDir, space }) {
  const paths = [];
  for (let i = 0; i < slides.slides.length; i += 1) {
    const slide = slides.slides[i];
    const buffer = await renderSlide(slide.kind, { ...slide.data, space });
    const filename = `${name}-slide-${i + 1}.png`;
    const full = path.join(outDir, filename);
    fs.writeFileSync(full, buffer);
    paths.push(full);
  }
  return paths;
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
  const envPath = args.env || "config/.env";
  loadEnvChain([envPath, "config/.env.local"]);

  const storyPath = args.story || findLatestStoryFile(path.join(process.cwd(), "tmp", "stories"));
  if (!storyPath) throw new Error("story json not found");
  const storyRaw = readJson(storyPath);
  const story = unwrapStory(storyRaw);
  if (!story || !story.public) throw new Error("story missing public data");

  const dateLocal = args.date || story?.meta?.date_local || story?.public?.date_local || "2026-03-04";
  const asOfISO = args.asOfISO || `${dateLocal}T12:00:00+09:00`;
  const outDir = args.outDir || path.join(process.cwd(), "tmp", "ig", "dryrun_ai", dateLocal);
  ensureDir(outDir);

  const igOut = ensureIgOutputs(story);
  const preferredAspect = pickPreferredResonanceAspect(story);
  if (preferredAspect) {
    igOut.source.resonance_aspect = preferredAspect;
    igOut.source.resonance_aspect_key = buildAspectKey(preferredAspect, { includeOrb: true });
  }

  const openai = {
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL,
    model: process.env.OPENAI_MODEL,
  };

  // resonance first (short style + moon short + hashtags_resonance)
  await generateIgDailyAiOutputs({
    story,
    dict,
    openai,
    asOfISO,
    useAi: true,
    forceAi: true,
    variant: "split",
    slot: "resonance",
  });

  // morning (caption + observation + hashtags_morning)
  await generateIgDailyAiOutputs({
    story,
    dict,
    openai,
    asOfISO,
    useAi: true,
    forceAi: false,
    slot: "morning",
  });

  // night (hashtags_night)
  await generateIgDailyAiOutputs({
    story,
    dict,
    openai,
    asOfISO,
    useAi: true,
    forceAi: false,
    variant: "night",
    slot: "night",
  });

  const morning = buildMorningCarouselSlides({ story, dateLocal, withCta: true, dict });
  const resonance = buildResonanceCarouselSlides({ story, dateLocal, dict });
  const night = buildNightCarouselSlides({ story, dateLocal, dict });

  const morningSpace = buildSpaceBackground({ width: CANVAS.width, height: CANVAS.height });
  const resonanceSpace = buildSpaceBackground({ width: CANVAS.width, height: CANVAS.height });
  const nightSpace = buildSpaceBackground({ width: CANVAS.width, height: CANVAS.height });

  const morningPaths = await renderSlidesSet({ name: "morning", slides: morning, outDir, space: morningSpace });
  const resonancePaths = await renderSlidesSet({ name: "resonance", slides: resonance, outDir, space: resonanceSpace });
  const nightPaths = await renderSlidesSet({ name: "night", slides: night, outDir, space: nightSpace });

  const summary = {
    dateLocal,
    dateLabel: formatDateLabel(dateLocal),
    storyPath,
    slots: {
      morning: {
        slides: morning.slides.map((s) => s.kind),
        cover: morningPaths[0] || null,
        caption: renderIGCaptionVariant(story, { dict, variant: "morning" }) || "",
        ai_types: listAiTypes("morning", story),
        slide_paths: morningPaths,
      },
      resonance: {
        slides: resonance.slides.map((s) => s.kind),
        cover: resonancePaths[0] || null,
        caption: renderIGCaptionVariant(story, { dict, variant: "resonance" }) || "",
        ai_types: listAiTypes("resonance", story),
        slide_paths: resonancePaths,
      },
      night: {
        slides: night.slides.map((s) => s.kind),
        cover: nightPaths[0] || null,
        caption: renderIGCaptionVariant(story, { dict, variant: "night" }) || "",
        ai_types: listAiTypes("night", story),
        slide_paths: nightPaths,
      },
    },
  };

  const jsonPath = path.join(outDir, "dryrun_ai_summary.json");
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
