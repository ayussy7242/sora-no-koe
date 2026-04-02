#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { renderStoryBackground, renderStoryBackgroundSet } = require("../../src/engine/renderers/ig/story/render_backgrounds");
const { resolveColors } = require("../../src/engine/renderers/instagram/theme/theme");
const { DEFAULT_COLORS } = require("../../src/engine/renderers/ig/tokens/common/colors");

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function buildSimpleSpace() {
  const colors = resolveColors();
  const bg = colors?.bg || DEFAULT_COLORS.bg;
  const deep = colors?.bgDeep || DEFAULT_COLORS.bgDeep;
  const defs = [
    `<linearGradient id="bg-grad" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0%" stop-color="${deep}"/>`,
    `<stop offset="100%" stop-color="${bg}"/>`,
    `</linearGradient>`,
  ].join("");
  const body = `<rect width="100%" height="100%" fill="url(#bg-grad)"/>`;
  return { defs, body };
}

function toDateLabel(dateLocal) {
  if (!dateLocal) return "";
  return String(dateLocal).replace(/-/g, ".");
}

async function main() {
  const outDir = argValue("--outDir", "tmp/ig_story_preview");
  const dateLocal = argValue("--date", "");
  const useFull = hasFlag("--full");

  ensureDir(outDir);

  const titles = [
    { key: "today", title: { ja: "今日の空", en: "Today's Sky" } },
    { key: "resonance", title: { ja: "今日の共鳴", en: "Today's Resonance" } },
    { key: "tomorrow", title: { ja: "明日の空", en: "Tomorrow's Sky" } },
  ];

  if (useFull) {
    const buffers = await renderStoryBackgroundSet({
      story: { meta: { date_local: dateLocal || "2026-03-29" }, public: {} },
      dateLabel: toDateLabel(dateLocal || "2026-03-29"),
    });
    titles.forEach((item, idx) => {
      const file = path.join(outDir, `story_${item.key}.png`);
      fs.writeFileSync(file, buffers[idx]);
      console.log(file);
    });
    return;
  }

  const space = buildSimpleSpace();
  for (const item of titles) {
    const buffer = await renderStoryBackground({ title: item.title, space });
    const file = path.join(outDir, `story_${item.key}.png`);
    fs.writeFileSync(file, buffer);
    console.log(file);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
