#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { renderIGCaption } = require("../../src/presenters/format/ig_caption");

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const storyPath = args.story || "tmp/stories/story.json";
  const outPath = args.out || null;

  if (!fs.existsSync(storyPath)) {
    console.error(`[ig-caption] story not found: ${storyPath}`);
    process.exit(1);
  }

  const story = unwrapStory(readJson(storyPath));
  const caption = renderIGCaption(story);

  if (outPath) {
    const fullPath = path.resolve(outPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, caption, "utf8");
    console.log(`[ig-caption] saved: ${fullPath}`);
  } else {
    console.log(caption);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
