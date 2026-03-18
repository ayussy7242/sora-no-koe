#!/usr/bin/env node
"use strict";

require("../_load_env");

const fs = require("fs");
const path = require("path");
const { generateIgResonanceText } = require("../../src/usecases/channels/ig/ig_resonance_ai");
const dict = require("../../src/content/dict");
const { normalizeBodyKey } = require("../../src/domain/canonical");
const { signIndexFromKey, houseNumberForSignIndex } = require("../../src/domain/astro_compute");
const { signJa } = require("../../src/presenters/format/format/line_common");

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
  story.outputs.ig.rendered = story.outputs.ig.rendered && typeof story.outputs.ig.rendered === "object" ? story.outputs.ig.rendered : {};
  story.outputs.ig.rendered.carousel = story.outputs.ig.rendered.carousel && typeof story.outputs.ig.rendered.carousel === "object" ? story.outputs.ig.rendered.carousel : {};
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

function bodyLabelJa(dictRef, key) {
  if (!key) return "";
  const k = String(key).toLowerCase();
  return (
    dictRef?.PLANETS_V2?.bodies?.[k]?.label_ja ||
    dictRef?.POINTS_V1?.points?.[k]?.label_ja ||
    k
  );
}

function buildFallbackResonanceText({ story, dict: dictRef }) {
  const aspect = story?.public?.sky_top?.[0] || story?.public?.sky_all?.[0] || null;
  if (!aspect) return "";

  const aKey = normalizeBodyKey(aspect?.a || "");
  const bKey = normalizeBodyKey(aspect?.b || "");
  const aName = bodyLabelJa(dictRef, aKey);
  const bName = bodyLabelJa(dictRef, bKey);
  const aSign = aspect?.a_sign_ja || signJa(dictRef, aspect?.a_sign_key || "") || "";
  const bSign = aspect?.b_sign_ja || signJa(dictRef, aspect?.b_sign_key || "") || "";

  const focus = story?.public?.house_focus || {};
  const ascKey = focus?.asc_sign_key || null;
  let aHouse = "";
  let bHouse = "";
  if (ascKey && aspect?.a_sign_key && aspect?.b_sign_key) {
    const ascIndex = signIndexFromKey(dictRef, ascKey);
    const aIndex = signIndexFromKey(dictRef, aspect?.a_sign_key);
    const bIndex = signIndexFromKey(dictRef, aspect?.b_sign_key);
    const aNo = Number.isFinite(aIndex) ? houseNumberForSignIndex(aIndex, ascIndex) : null;
    const bNo = Number.isFinite(bIndex) ? houseNumberForSignIndex(bIndex, ascIndex) : null;
    aHouse = aNo ? `第${aNo}ハウス` : "";
    bHouse = bNo ? `第${bNo}ハウス` : "";
  }

  const line1 = `${aSign ? `${aSign}の` : ""}${aName}と${bSign ? `${bSign}の` : ""}${bName}が、性質の違う層をゆるやかにつなぐ角度を作っています。`;
  const line2 = aHouse && bHouse
    ? `${aHouse}と${bHouse}のあいだで、外に向かう動きと内側の変化が交差しやすい配置です。`
    : "この角度は、配置全体に穏やかな接続を作り、別の層同士が交差しやすい配置です。";
  return `${line1}${line2}`;
}

function logAiFailure(res) {
  const reason = res?.reason ? ` reason=${res.reason}` : "";
  console.warn(`[ig-ai] error: ${res?.error || "unknown"}${reason}`);
  if (res?.last_text) {
    const sample = String(res.last_text).slice(0, 200);
    console.warn(`[ig-ai] last_text: ${sample}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const storyPath = args.story || "tmp/stories/story.json";
  const outPath = args.out || "tmp/ig/story_ig.json";

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
    logAiFailure(res);
    const fallback = buildFallbackResonanceText({ story, dict });
    const igOut = ensureIgOutputs(story);
    if (fallback) {
      igOut.parts.resonance = fallback;
      igOut.rendered.carousel.slide3_text = fallback;
    }
    story.meta = story.meta || {};
    story.meta.ig_resonance_ai_error = res.error || "retry_exceeded";
    story.meta.ig_resonance_source = "fallback";
    if (shouldPruneToIg(outPath)) {
      pruneOutputsToIg(story);
    }
    const outPayload = mergeStoryPayload(payload, story);
    writeJson(outPath, outPayload);
    console.warn("[ig-ai] fallback used (resonance).");
    return;
  }

  const igOut = ensureIgOutputs(story);
  igOut.parts.resonance = res.text;
  igOut.rendered.carousel.slide3_text = res.text;

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
