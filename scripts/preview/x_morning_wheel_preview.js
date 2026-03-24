#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { renderXMorningWheelPng, DEFAULT_X_CANVAS } = require("../../src/engine/channels/x/renderers/morning_wheel");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const eqIdx = key.indexOf("=");
    if (eqIdx !== -1) {
      const realKey = key.slice(0, eqIdx);
      const value = key.slice(eqIdx + 1);
      out[realKey] = value;
      continue;
    }
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

function toNumber(val, fallback) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const storyPath = args.story || "tmp/stories/story_today.json";
  const storyRaw = fs.existsSync(storyPath) ? readJson(storyPath) : null;
  if (!storyRaw) {
    console.error(`[x_morning_wheel_preview] story not found: ${storyPath}`);
    process.exit(1);
  }
  const story = unwrapStory(storyRaw);
  const dateLabel = String(args.date || story?.meta?.date_local || story?.public?.date_local || "");
  const width = toNumber(args.width, DEFAULT_X_CANVAS.width);
  const height = toNumber(args.height, DEFAULT_X_CANVAS.height);
  const variant = String(args.variant || "story_today");

  const outDir = args.out_dir || args.outDir || path.join(process.cwd(), "tmp", "x", "morning_wheel", dateLabel || "preview");
  ensureDir(outDir);
  const outPath = args.out || path.join(outDir, `x_morning_wheel_${width}x${height}.png`);

  const png = await renderXMorningWheelPng({
    story,
    dateLabel,
    width,
    height,
    variant,
  });

  fs.writeFileSync(outPath, png);
  console.log(`[x_morning_wheel_preview] saved: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
