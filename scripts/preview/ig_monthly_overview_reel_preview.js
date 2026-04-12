#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { buildMonthlyOverviewReelPlan } = require("../../src/usecases/channels/instagram/monthly_overview_reel");
const {
  renderMonthlyBackground,
  renderMonthlyOverviewFrame,
  renderMonthlyOverviewOutroFrame,
  exportMonthlyOverviewVideo,
} = require("../../src/renderers/instagram/reel/monthly_overview");
const { buildPublicStorySnapshot } = require("../../src/usecases/story/store");
const { createStoryService } = require("../../src/usecases/story/story");
const { swisseph } = require("../../src/config/swisseph");
const dictDefault = require("../../src/content/dict");

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

function ensureDir(dir) {
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
}

function parseNumber(input, fallback) {
  const n = Number(input);
  return Number.isFinite(n) ? n : fallback;
}

function parseBool(input, fallback = false) {
  if (input === undefined) return fallback;
  const v = String(input).toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}

function buildStoryServiceSafe(dict) {
  if (!swisseph) return null;
  const stubDb = {
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: false, data: () => null }),
      }),
    }),
  };
  try {
    return createStoryService({
      db: stubDb,
      admin: null,
      swisseph,
      SIGNS: dict?.SIGNS,
      ASPECTS: dict?.ASPECTS?.major_list || [],
      ASPECTS_DEEP: dict?.ASPECTS?.deep_space || [],
      DEFAULT_TZ: "Asia/Tokyo",
      PROJECT: "sora-no-koe",
      SCHEMA_VERSION: "1.0.0",
    });
  } catch (e) {
    console.error("[monthly_overview_reel] storyService disabled:", e?.message || String(e));
    return null;
  }
}

async function buildStory({ storyService, dateLocal, asOfISO }) {
  if (!storyService) throw new Error("storyService missing");
  const result = await buildPublicStorySnapshot({
    storyService,
    dateLocal,
    asOfISO,
    save: false,
  });
  return result.story;
}

async function renderOneDay({ plan, dayIndex, outDir, space, backgroundBuffer } = {}) {
  const day = plan.days[Math.max(0, dayIndex - 1)];
  if (!day) throw new Error("day not found");
  const storyService = buildStoryServiceSafe(dictDefault);
  const story = await buildStory({ storyService, dateLocal: day.dateLocal, asOfISO: day.asOfISO });
  const buffer = await renderMonthlyOverviewFrame({
    story,
    month: plan.month,
    dayLabel: day.dayLabel,
    totalDays: day.totalDays,
    activeDay: day.dayIndex,
    wheelInput: day.wheelInput,
    space,
    backgroundBuffer,
  });
  ensureDir(outDir);
  const file = path.join(outDir, `frame_${String(day.dayIndex).padStart(4, "0")}.png`);
  fs.writeFileSync(file, buffer);
  console.log("[monthly_overview_reel] saved", file);
}

async function renderRange({ plan, startDay, endDay, outDir, space, backgroundBuffer } = {}) {
  const storyService = buildStoryServiceSafe(dictDefault);
  if (!storyService) throw new Error("storyService missing");
  ensureDir(outDir);
  const start = Math.max(1, startDay);
  const end = Math.min(plan.days.length, endDay);
  for (let i = start; i <= end; i += 1) {
    const day = plan.days[i - 1];
    const story = await buildStory({ storyService, dateLocal: day.dateLocal, asOfISO: day.asOfISO });
    const buffer = await renderMonthlyOverviewFrame({
      story,
      month: plan.month,
      dayLabel: day.dayLabel,
      totalDays: day.totalDays,
      activeDay: day.dayIndex,
      wheelInput: day.wheelInput,
      space,
      backgroundBuffer,
    });
    const file = path.join(outDir, `frame_${String(day.dayIndex).padStart(4, "0")}.png`);
    fs.writeFileSync(file, buffer);
    console.log("[monthly_overview_reel] saved", file);
  }
}

async function renderOutro({
  plan,
  outDir,
  backgroundBuffer,
  startIndex,
  frameCount,
  subtitle = "Sky Structure",
} = {}) {
  if (!frameCount || frameCount <= 0) return;
  const buffer = await renderMonthlyOverviewOutroFrame({
    month: plan.month,
    subtitle,
    backgroundBuffer,
  });
  for (let i = 0; i < frameCount; i += 1) {
    const idx = startIndex + i;
    const file = path.join(outDir, `frame_${String(idx).padStart(4, "0")}.png`);
    fs.writeFileSync(file, buffer);
    console.log("[monthly_overview_reel] saved", file);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const month = String(args.month || "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("--month is required (e.g., --month 2026-04)");
  }

  const mode = String(args.mode || "one").trim().toLowerCase();
  const dayIndex = Number(args.day || args.dayIndex || 1);
  const rangeStart = Number(args.start || 1);
  const rangeEnd = Number(args.end || 3);
  const baseDir = String(
    args.baseDir ||
    path.resolve(process.cwd(), "dist", "instagram", "monthly_overview_reel", month)
  );
  const outDir = String(args.outDir || path.join(baseDir, "frames"));
  const inputFps = parseNumber(args.fps, 1);
  const outroSeconds = parseNumber(args.outroSeconds, 1.5);
  const outroEnabled = parseBool(args.outro, true);

  const plan = buildMonthlyOverviewReelPlan({ month });
  ensureDir(baseDir);
  const bgPath = path.join(baseDir, "bg.png");
  const bgRender = await renderMonthlyBackground({ month });
  const bgBuffer = bgRender.buffer;
  fs.writeFileSync(bgPath, bgBuffer);
  if (plan.caption) {
    const captionPath = path.join(baseDir, "caption.txt");
    fs.writeFileSync(captionPath, `${plan.caption}\n`);
  }

  if (mode === "outro") {
    const buffer = await renderMonthlyOverviewOutroFrame({
      month: plan.month,
      backgroundBuffer: bgBuffer,
    });
    const file = path.join(baseDir, "outro_preview.png");
    fs.writeFileSync(file, buffer);
    console.log("[monthly_overview_reel] saved", file);
    return;
  }

  if (mode === "one") {
    await renderOneDay({
      plan,
      dayIndex: Number.isFinite(dayIndex) ? dayIndex : 1,
      outDir,
      backgroundBuffer: bgBuffer,
    });
    return;
  }

  if (mode === "range") {
    await renderRange({
      plan,
      startDay: Number.isFinite(rangeStart) ? rangeStart : 1,
      endDay: Number.isFinite(rangeEnd) ? rangeEnd : Math.min(plan.days.length, 3),
      outDir,
      backgroundBuffer: bgBuffer,
    });
    return;
  }

  if (mode === "all") {
    await renderRange({
      plan,
      startDay: 1,
      endDay: plan.days.length,
      outDir,
      backgroundBuffer: bgBuffer,
    });
    if (outroEnabled && outroSeconds > 0) {
      const outroFrames = Math.max(1, Math.round(outroSeconds * inputFps));
      await renderOutro({
        plan,
        outDir,
        backgroundBuffer: bgBuffer,
        startIndex: plan.days.length + 1,
        frameCount: outroFrames,
      });
    }
    if (args.video) {
      const outVideo = path.resolve(path.dirname(outDir), `monthly_overview_reel_${month}.mp4`);
      await exportMonthlyOverviewVideo({ framesDir: outDir, outputPath: outVideo, inputFps });
      console.log("[monthly_overview_reel] video", outVideo);
    }
    return;
  }

  throw new Error(`unknown --mode ${mode}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
