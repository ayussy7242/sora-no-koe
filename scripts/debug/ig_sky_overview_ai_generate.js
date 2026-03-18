#!/usr/bin/env node
"use strict";

require("../_load_env");

const fs = require("fs");
const path = require("path");
const { generateIgSkyOverviewText } = require("../../src/usecases/channels/ig/ig_sky_overview_ai");
const dict = require("../../src/content/dict");
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

function buildFallbackSkyOverview({ story, dict: dictRef }) {
  const transit = story?.public?.transit_signs || {};
  const signCounts = {};
  Object.values(transit).forEach((item) => {
    const signKey = item?.sign_key;
    const label = item?.sign_ja || signJa(dictRef, signKey || "");
    if (!label) return;
    signCounts[label] = (signCounts[label] || 0) + 1;
  });
  const signList = Object.entries(signCounts)
    .map(([sign, count]) => ({ sign, count }))
    .sort((a, b) => (b.count - a.count) || a.sign.localeCompare(b.sign));
  const signFocus = signList.filter((row) => Number(row.count) >= 2);

  let line1 = "今日の空は、天体が広く散り、重心が一点に寄りにくい配置です。";
  if (signFocus.length >= 2) {
    line1 = `今日の空は、${signFocus[0].sign}と${signFocus[1].sign}付近に天体が集まり、配置の重心が近い位置に寄っています。`;
  } else if (signFocus.length === 1) {
    line1 = `今日の空は、${signFocus[0].sign}付近に天体が集まり、配置の重心がその周辺に寄っています。`;
  }

  const elementCount = story?.public?.sky_strata?.element_count || {};
  const elementLabels = { fire: "火", earth: "地", air: "風", water: "水", mixed: "混合" };
  const elementList = Object.entries(elementCount)
    .map(([key, count]) => ({ key, count: Number(count || 0) }))
    .sort((a, b) => (b.count - a.count));
  const topEl = elementList[0];
  const secondEl = elementList[1];

  let line2 = "元素は混ざり合い、層が行き来しやすい空気です。";
  if (topEl && topEl.count) {
    const topLabel = elementLabels[topEl.key] || topEl.key;
    const secondLabel = secondEl ? (elementLabels[secondEl.key] || secondEl.key) : "";
    if (secondEl && secondEl.count >= 3 && topEl.count >= 3 && secondLabel) {
      line2 = `${topLabel}と${secondLabel}の要素が重なり、配置の温度が二層に分かれて見えます。`;
    } else {
      line2 = `${topLabel}の要素が目立ち、配置の温度がその方向に寄っています。`;
    }
  }

  const topHouse = story?.public?.house_focus?.top?.[0];
  const line3 = topHouse?.house_no
    ? `第${topHouse.house_no}ハウスに重心があり、空の焦点がその領域に寄っています。`
    : "ハウスの集中は弱く、全体の広がりが保たれています。";

  return `${line1}${line2}${line3}`;
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

  const res = await generateIgSkyOverviewText({
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
    const fallback = buildFallbackSkyOverview({ story, dict });
    const igOut = ensureIgOutputs(story);
    if (fallback) igOut.parts.sky_overview = fallback;
    story.meta = story.meta || {};
    story.meta.ig_sky_overview_ai_error = res.error || "retry_exceeded";
    story.meta.ig_sky_overview_source = "fallback";
    if (shouldPruneToIg(outPath)) {
      pruneOutputsToIg(story);
    }
    const outPayload = mergeStoryPayload(payload, story);
    writeJson(outPath, outPayload);
    console.warn("[ig-ai] fallback used (sky_overview).");
    return;
  }

  const igOut = ensureIgOutputs(story);
  igOut.parts.sky_overview = res.text;

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
