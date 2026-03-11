#!/usr/bin/env node
"use strict";

/**
 * Usage:
 *  node scripts/test-render.js --date 2026-01-17 --story ./tmp/story.json
 *  node scripts/test-render.js --date 2026-01-17 --story ./tmp/story.json --save ./tmp/out.txt
 */

const fs = require("fs");
const path = require("path");

function getArg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i < 0) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function main() {
  const date = getArg("--date", null);
  const storyPath = getArg("--story", null);
  const savePath = getArg("--save", null);

  if (!date) {
    console.error("Missing --date YYYY-MM-DD");
    process.exit(1);
  }
  if (!storyPath) {
    console.error("Missing --story path/to/story.json");
    process.exit(1);
  }

  const story = readJson(path.resolve(storyPath));

  // inject date
  story.meta = story.meta || {};
  story.meta.date_local = date;
  story.meta.rules = story.meta.rules || {};
  if (story.meta.rules.orb_max_deg == null) story.meta.rules.orb_max_deg = 6;

  // ✅ dict は常にプロジェクトから
  const dict = require("../src/content/dict");

  // ✅ renderer（←これが抜けてた/壊れてた）
  const { createRenderers } = require("../src/presenters/shared/text");

  const r = createRenderers({
    dict,
    BODY_JA: {},
    POINT_JA: {},
    ASPECT_JA: {},
  });

  const x = r.renderX(story);
  const line = await r.renderLine(story);

  const out = [
    "==================== X ====================",
    x,
    "",
    "=================== LINE ===================",
    line,
    "",
  ].join("\n");

  if (savePath) fs.writeFileSync(path.resolve(savePath), out, "utf8");
  console.log(out);
}

main();
