#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { admin, getDb } = require("../src/integrations/firebase/firebase");
const dict = require("../src/content/dict");
const { swisseph } = require("../src/config/swisseph");
const { createStoryService } = require("../src/usecases/story/story");

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

function toDateLocalJst(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value || "1970";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const d = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
}

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
  if (fromMajorList.length) return { ASPECTS: fromMajorList, ASPECTS_DEEP: buildAspectListFromGroup(ASPECTS_SRC?.deep_space) };

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

async function resolveAppUserId({ db, lineUserId, appUserId }) {
  if (appUserId) return appUserId;
  if (!lineUserId) return null;
  const direct = await db.collection("line_users").doc(lineUserId).get();
  if (direct.exists) {
    const d = direct.data() || {};
    return d.app_user_id || null;
  }
  // fallback: lookup by field
  const q = await db.collection("line_users").where("line_user_id", "==", lineUserId).limit(1).get();
  if (!q.empty) {
    const d = q.docs[0].data() || {};
    return d.app_user_id || null;
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const lineUserId = args.line_user_id || "";
  const appUserIdArg = args.app_user_id || "";
  const dateLocal = args.date || args.date_local || toDateLocalJst();
  const mode = args.mode || "auto";
  const outDir = path.join(process.cwd(), "tmp", "blueprint", "story");

  const db = getDb();
  const appUserId = await resolveAppUserId({ db, lineUserId, appUserId: appUserIdArg });
  if (!appUserId) {
    console.error("[export_story_json] app_user_id not found. Use --app_user_id or --line_user_id.");
    process.exit(1);
  }

  if (!swisseph) {
    console.error("[export_story_json] swisseph is not available");
    process.exit(1);
  }

  const { ASPECTS, ASPECTS_DEEP } = buildAspectList(dict);
  const storyService = createStoryService({
    db,
    admin,
    swisseph,
    SIGNS: dict?.SIGNS,
    ASPECTS,
    ASPECTS_DEEP,
    DEFAULT_TZ: process.env.DEFAULT_TZ || "Asia/Tokyo",
    PROJECT: process.env.PROJECT || "sora-no-koe",
    SCHEMA_VERSION: process.env.SCHEMA_VERSION || "1.0.0",
  });

  const asOfISO = new Date(`${dateLocal}T12:00:00+09:00`).toISOString();
  const story = await storyService.buildStoryForUser({
    appUserId,
    dateLocal,
    asOfISO,
    mode,
  });

  const slug = lineUserId || appUserId;
  const outPath = args.out
    ? path.resolve(args.out)
    : path.join(outDir, `${slug}_${dateLocal}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(story, null, 2), "utf8");
  console.log(`[export_story_json] saved: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
