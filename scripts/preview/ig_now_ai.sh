#!/usr/bin/env bash
set -euo pipefail

if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "OPENAI_API_KEY is required." >&2
  exit 1
fi

mkdir -p tmp/ig

node - <<'NODE'
const fs = require("fs");
const path = require("path");
const { admin, getDb } = require("../../src/integrations/firebase/firebase");
const dict = require("../../src/content/dict");
const { swisseph } = require("../../src/config/swisseph");
const { createStoryService } = require("../../src/usecases/story/story");

function buildAspectListFromGroup(group) {
  const out = [];
  for (const [k, v] of Object.entries(group || {})) {
    const deg = Number(v?.deg);
    if (!Number.isFinite(deg)) continue;
    out.push({ type: v?.key || k, deg });
  }
  return out;
}

function buildAspectList(dictObj) {
  const ASPECTS_SRC = dictObj?.ASPECTS || dictObj?.ASPECTS_V2 || dictObj?.ASPECTS_V1 || null;
  const fromMajorList = Array.isArray(ASPECTS_SRC?.major_list)
    ? ASPECTS_SRC.major_list.filter((a) => Number.isFinite(Number(a?.deg)))
    : [];
  if (fromMajorList.length) {
    return { ASPECTS: fromMajorList, ASPECTS_DEEP: buildAspectListFromGroup(ASPECTS_SRC?.deep_space) };
  }

  const fromMajor = buildAspectListFromGroup(ASPECTS_SRC?.major);
  const base = fromMajor.length
    ? fromMajor
    : [
        { type: "conjunction", deg: 0 },
        { type: "sextile", deg: 60 },
        { type: "square", deg: 90 },
        { type: "trine", deg: 120 },
        { type: "opposition", deg: 180 },
      ];
  return { ASPECTS: base, ASPECTS_DEEP: buildAspectListFromGroup(ASPECTS_SRC?.deep_space) };
}

const parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
}).formatToParts(new Date());
const get = (t) => parts.find((p) => p.type === t)?.value;

const dateLocal = `${get("year")}-${get("month")}-${get("day")}`;
const asOfISO = `${dateLocal}T${get("hour")}:${get("minute")}:${get("second")}+09:00`;

if (!swisseph) {
  console.error("swisseph unavailable");
  process.exit(1);
}

const { ASPECTS, ASPECTS_DEEP } = buildAspectList(dict);
const storyService = createStoryService({
  db: getDb(),
  admin,
  swisseph,
  SIGNS: dict?.SIGNS,
  ASPECTS,
  ASPECTS_DEEP,
  DEFAULT_TZ: "Asia/Tokyo",
  PROJECT: process.env.PROJECT || "sora-no-koe",
  SCHEMA_VERSION: process.env.SCHEMA_VERSION || "1.0.0",
});

storyService.buildStoryForUser({
  appUserId: "public",
  dateLocal,
  asOfISO,
  mode: "public",
}).then((story) => {
  const outPath = path.resolve(`tmp/stories/${dateLocal}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(story, null, 2), "utf8");
  fs.writeFileSync(path.resolve("tmp/ig/now_date.txt"), dateLocal, "utf8");
  console.error(`[story_now] saved: ${outPath} asOf ${asOfISO}`);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
NODE

date_local="$(cat tmp/ig/now_date.txt)"

node scripts/preview/ig_batch_generate.js --date "${date_local}" --ai_local true --ig_ai false --overwrite false
node scripts/preview/ig_caption_preview.js --story "tmp/stories/${date_local}.json"
node scripts/preview/ig_carousel_preview.js --date "${date_local}" --story "tmp/stories/${date_local}.json"
