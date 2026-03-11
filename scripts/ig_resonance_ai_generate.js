#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { generateIgResonanceText } = require("../src/usecases/channels/ig/ig_resonance_ai");
const dict = require("../src/content/dict");

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

function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
}

function unwrapStory(payload) {
  if (payload && typeof payload === "object" && payload.story) return payload.story;
  return payload;
}

function mergeStoryPayload(payload, story) {
  if (payload && typeof payload === "object" && payload.story) {
    payload.story = story;
    return payload;
  }
  return story;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const storyPath = args.story || "tmp/story.json";
  const outPath = args.out || "tmp/story_ig.json";

  if (!fs.existsSync(storyPath)) {
    console.error(`[ig-ai] story not found: ${storyPath}`);
    process.exit(1);
  }

  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    console.error("[ig-ai] OPENAI_API_KEY is not set");
    process.exit(1);
  }

  const payload = readJson(storyPath);
  const story = unwrapStory(payload);

  const res = await generateIgResonanceText({
    story,
    dict,
    openai: {
      apiKey,
      baseUrl: process.env.OPENAI_BASE_URL,
      model: process.env.OPENAI_MODEL,
    },
  });

  if (!res.ok) {
    console.error("[ig-ai] error:", res.error);
    process.exit(1);
  }

  story.outputs = story.outputs && typeof story.outputs === "object" ? story.outputs : {};
  story.outputs.ig = story.outputs.ig && typeof story.outputs.ig === "object" ? story.outputs.ig : { caption: "" };
  story.outputs.ig.resonance_text = res.text;
  story.outputs.ig.carousel = story.outputs.ig.carousel || {};
  story.outputs.ig.carousel.slide3_text = res.text;

  const outPayload = mergeStoryPayload(payload, story);
  writeJson(outPath, outPayload);
  console.log(`[ig-ai] saved: ${outPath} (len=${res.text.length})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
