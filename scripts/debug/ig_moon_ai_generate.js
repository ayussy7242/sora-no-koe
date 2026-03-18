#!/usr/bin/env node
"use strict";

require("../_load_env");

const fs = require("fs");
const path = require("path");
const { generateIgMoonText } = require("../../src/usecases/channels/ig/ig_moon_ai");
const dict = require("../../src/content/dict");

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

function ensureIgOutputs(story) {
  story.outputs = story.outputs && typeof story.outputs === "object" ? story.outputs : {};
  story.outputs.ig = story.outputs.ig && typeof story.outputs.ig === "object" ? story.outputs.ig : {};
  story.outputs.ig.parts = story.outputs.ig.parts && typeof story.outputs.ig.parts === "object" ? story.outputs.ig.parts : {};
  return story.outputs.ig;
}

function mergeStoryPayload(payload, story) {
  if (payload && typeof payload === "object" && payload.story) {
    payload.story = story;
    return payload;
  }
  return story;
}

function pruneOutputsToIg(story) {
  if (!story || typeof story !== "object") return;
  const outputs = story.outputs && typeof story.outputs === "object" ? story.outputs : null;
  if (!outputs) return;
  const ig = outputs.ig && typeof outputs.ig === "object" ? outputs.ig : null;
  if (ig) {
    story.outputs = { ig };
  } else {
    delete story.outputs;
  }
}

function shouldPruneToIg(outPath) {
  return /(^|\/)story_ig\.json$/i.test(String(outPath || ""));
}

function logAiFailure(res) {
  const reason = res?.reason ? ` reason=${res.reason}` : "";
  console.warn(`[ig-ai] error: ${res?.error || "unknown"}${reason}`);
  if (res?.last_text) {
    const sample = String(res.last_text).slice(0, 200);
    console.warn(`[ig-ai] last_text: ${sample}`);
  }
}

function resolveAsOfISO({ story, dateLocal }) {
  const fromStory = story?.meta?.as_of || story?.meta?.as_of_iso;
  if (fromStory) return fromStory;
  const d = dateLocal || story?.meta?.date_local || story?.public?.date_local || null;
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return new Date().toISOString();
  return `${d}T12:00:00+09:00`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const storyPath = args.story || "tmp/stories/story.json";
  const outPath = args.out || "tmp/ig/story_ig.json";
  const dateLocal = args.date || args.date_local || null;

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
  const asOfISO = resolveAsOfISO({ story, dateLocal });

  const res = await generateIgMoonText({
    story,
    dict,
    asOfISO,
    openai: {
      apiKey,
      baseUrl: process.env.OPENAI_BASE_URL,
      model: process.env.OPENAI_MODEL,
    },
  });

  if (!res.ok) {
    logAiFailure(res);
    const moonSign =
      story?.public?.transit_signs?.moon?.sign_ja ||
      story?.public?.moon?.sign_ja ||
      "";
    const fallback = moonSign
      ? `${moonSign}の月は、視線を少し遠くへ開きやすい配置です。ひとつの答えに閉じるより、余白を残したまま流れを見る質感が広がります。`
      : "今日の月は、視線を少し遠くへ開きやすい配置です。ひとつの答えに閉じるより、余白を残したまま流れを見る質感が広がります。";
    const igOut = ensureIgOutputs(story);
    igOut.parts.moon = fallback;
    story.meta = story.meta || {};
    story.meta.ig_moon_ai_error = res.error || "retry_exceeded";
    story.meta.ig_moon_source = "fallback";
    if (shouldPruneToIg(outPath)) {
      pruneOutputsToIg(story);
    }
    const outPayload = mergeStoryPayload(payload, story);
    writeJson(outPath, outPayload);
    console.warn("[ig-ai] fallback used (moon).");
    return;
  }

  const igOut = ensureIgOutputs(story);
  igOut.parts.moon = res.text;

  if (shouldPruneToIg(outPath)) {
    pruneOutputsToIg(story);
  }

  const outPayload = mergeStoryPayload(payload, story);
  writeJson(outPath, outPayload);
  console.log(`[ig-ai] saved: ${outPath} (len=${res.text.length})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
