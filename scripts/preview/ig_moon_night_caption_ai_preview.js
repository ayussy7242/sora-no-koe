#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
require("../_load_env");

const dict = require("../../src/content/dict");
const { swisseph } = require("../../src/config/swisseph");
const { createStoryService } = require("../../src/usecases/story/story");
const { buildIgMoonPrompt, generateIgMoonText } = require("../../src/usecases/channels/instagram/ai/moon");

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

function buildAspectListFromGroup(group) {
  const entries = group && typeof group === "object" ? Object.entries(group) : [];
  return entries
    .map(([type, deg]) => ({ type, deg: Number(deg) }))
    .filter((a) => a.type && Number.isFinite(Number(a.deg)));
}

function resolveAspects(dictObj) {
  const ASPECTS_SRC = dictObj?.ASPECTS || dictObj?.ASPECTS_V2 || dictObj?.ASPECTS_V1 || null;
  const fromMajorList =
    Array.isArray(ASPECTS_SRC?.major_list) ?
      ASPECTS_SRC.major_list.filter((a) => Number.isFinite(Number(a?.deg))) :
      [];
  const major = fromMajorList.length ? fromMajorList : buildAspectListFromGroup(ASPECTS_SRC?.major);
  const deep = buildAspectListFromGroup(ASPECTS_SRC?.deep_space);
  const fallback = [
    { type: "conjunction", deg: 0 },
    { type: "sextile", deg: 60 },
    { type: "square", deg: 90 },
    { type: "trine", deg: 120 },
    { type: "opposition", deg: 180 },
  ];
  return {
    ASPECTS: (major && major.length) ? major : fallback,
    ASPECTS_DEEP: deep,
  };
}

function makeDbStub() {
  return {
    collection() {
      return {
        doc() {
          return {
            async get() {
              return { exists: false, data() { return {}; } };
            },
          };
        },
      };
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dateLocal = String(args.date || args.date_local || "2026-04-13");
  const asOfISO = String(args.as_of || args.asOfISO || `${dateLocal}T21:40:00+09:00`);

  const { ASPECTS, ASPECTS_DEEP } = resolveAspects(dict);
  const storyService = createStoryService({
    db: makeDbStub(),
    swisseph,
    SIGNS: dict?.SIGNS,
    ASPECTS,
    ASPECTS_DEEP,
  });

  const story = await storyService.buildStoryForUser({
    appUserId: "public",
    dateLocal,
    asOfISO,
    mode: "public",
    orbMaxDeg: Number.isFinite(Number(args.orb)) ? Number(args.orb) : 6,
    precisionDeg: Number.isFinite(Number(args.precision)) ? Number(args.precision) : 0.01,
  });

  const variant = "night_caption";
  const prompt = buildIgMoonPrompt({ story, dict, asOfISO, variant });

  const promptOnly = !!(args.prompt_only || args.promptOnly || args["prompt-only"]);
  if (promptOnly) {
    console.log(prompt);
    return;
  }

  const openai = {
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL,
    model: process.env.OPENAI_MODEL,
    maxRetries: process.env.OPENAI_MAX_RETRIES ? Number(process.env.OPENAI_MAX_RETRIES) : undefined,
  };
  if (!openai.apiKey) {
    console.error("[ig_moon_night_caption_ai_preview] OPENAI_API_KEY missing (use --prompt-only to just print the prompt)");
    process.exit(1);
  }

  const res = await generateIgMoonText({
    story,
    dict,
    openai,
    maxRetries: Number.isFinite(Number(args.retries)) ? Number(args.retries) : 2,
    asOfISO,
    variant,
  });

  if (!res?.ok) {
    console.error(res);
    process.exit(2);
  }

  const outDir = path.join(process.cwd(), "tmp", "ig", "moon_night_caption_ai", dateLocal);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `ig_moon_night_caption_${dateLocal}_${String(asOfISO).replace(/[:+]/g, "_")}.txt`);
  fs.writeFileSync(outPath, String(res.text || ""), "utf8");

  console.log("=== PROMPT (truncated) ===");
  console.log(prompt.split("\n").slice(0, 30).join("\n"));
  console.log("...");
  console.log("");
  console.log("=== OUTPUT ===");
  console.log(res.text);
  console.log("");
  console.log(`[ig_moon_night_caption_ai_preview] saved: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
