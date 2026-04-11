#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { ensureDir } = require("../../utils/infra/fs");
const {
  buildMonthlyOverviewReference,
  buildMonthlyOverviewDeck,
} = require("../../usecases/reference/monthly_overview");
const { createSchemaValidator } = require("../../utils/schema/validator");
const { createStoryService } = require("../../usecases/story/story");
const { buildPublicStorySnapshot } = require("../../usecases/story/store");
const { swisseph } = require("../../config/swisseph");
const dict = require("../../content/dict");

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
  fs.writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`);
}

function formatErrors(errors = []) {
  return errors.map((err) => {
    const at = err.instancePath || "/";
    const msg = err.message || "invalid";
    return `${at} ${msg}`.trim();
  });
}

function validatePayloads({ reference, deck, exportPayload }) {
  const validator = createSchemaValidator();
  const checks = [
    { label: "reference", schemaId: "monthly_overview.v1.schema.json", data: reference },
    { label: "deck", schemaId: "monthly_overview.deck.v1.schema.json", data: deck },
    { label: "export", schemaId: "monthly_overview.export.v1.schema.json", data: exportPayload },
  ];

  const failures = [];
  for (const check of checks) {
    const result = validator.validate(check.schemaId, check.data);
    if (!result.ok) {
      failures.push({
        label: check.label,
        schemaId: check.schemaId,
        errors: formatErrors(result.errors),
      });
    }
  }

  if (failures.length) {
    const details = failures
      .map((fail) => `- ${fail.label} (${fail.schemaId})\n  ${fail.errors.join("\n  ")}`)
      .join("\n");
    throw new Error(`schema validation failed:\n${details}`);
  }
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

function buildAspectLists() {
  const ASPECTS_SRC = dict?.ASPECTS || dict?.ASPECTS_V2 || dict?.ASPECTS_V1 || null;
  const fromMajorList =
    Array.isArray(ASPECTS_SRC?.major_list)
      ? ASPECTS_SRC.major_list.filter((a) => Number.isFinite(Number(a?.deg)))
      : [];
  const ASPECTS = fromMajorList.length
    ? fromMajorList
    : (() => {
        const fromMajor = buildAspectListFromGroup(ASPECTS_SRC?.major);
        if (fromMajor.length) return fromMajor;
        return [
          { type: "conjunction", deg: 0 },
          { type: "sextile", deg: 60 },
          { type: "square", deg: 90 },
          { type: "trine", deg: 120 },
          { type: "opposition", deg: 180 },
        ];
      })();
  const ASPECTS_DEEP = buildAspectListFromGroup(ASPECTS_SRC?.deep_space);
  return { ASPECTS, ASPECTS_DEEP };
}

function buildStoryServiceSafe() {
  if (!swisseph) return null;
  const stubDb = {
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: false, data: () => null }),
      }),
    }),
  };
  const { ASPECTS, ASPECTS_DEEP } = buildAspectLists();
  try {
    return createStoryService({
      db: stubDb,
      admin: null,
      swisseph,
      SIGNS: dict?.SIGNS,
      ASPECTS,
      ASPECTS_DEEP,
      DEFAULT_TZ: "Asia/Tokyo",
      PROJECT: "sora-no-koe",
      SCHEMA_VERSION: "1.0.0",
    });
  } catch (e) {
    console.error("[monthly_overview] storyService disabled:", e?.message || String(e));
    return null;
  }
}

async function buildMonthStory({ month, day = 15 }) {
  const storyService = buildStoryServiceSafe();
  if (!storyService) return null;
  const dateLocal = `${month}-${String(day).padStart(2, "0")}`;
  const asOfISO = new Date(`${dateLocal}T12:00:00+09:00`).toISOString();
  try {
    const { story } = await buildPublicStorySnapshot({
      storyService,
      dateLocal,
      asOfISO,
      save: false,
    });
    return story || null;
  } catch (e) {
    console.error("[monthly_overview] story build failed:", e?.message || String(e));
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const month = String(args.month || args.m || "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("--month is required (e.g., --month 2026-04)");
  }

  const templatePath = args.template || path.resolve(process.cwd(), "src/content/templates/instagram/monthly_overview.v1.json");
  const outRoot = args.out || path.resolve(process.cwd(), "tmp/exports");
  const saveReference = Boolean(args.saveReference || args.save_reference);

  const reference = buildMonthlyOverviewReference({ month });
  const template = readJson(templatePath);
  const deck = buildMonthlyOverviewDeck({ reference, template });
  const storyDay = Number.isFinite(Number(args.storyDay)) ? Number(args.storyDay) : 15;
  const story = await buildMonthStory({ month, day: storyDay });
  if (story) {
    deck.story = story;
    deck.story_date_local = story?.meta?.date_local || `${month}-${String(storyDay).padStart(2, "0")}`;
  }

  const outDir = path.join(outRoot, month, "monthly_overview");
  ensureDir(outDir);

  const refPath = path.join(outDir, `${month}.monthly_overview.v1.json`);
  const deckPath = path.join(outDir, `${month}.monthly_overview.deck.v1.json`);
  const exportPath = path.join(outDir, `${month}.monthly_overview.export.v1.json`);

  const exportPayload = {
    type: "monthly_overview_export",
    version: "v1",
    month,
    time_zone: reference.time_zone,
    generated_at_utc: new Date().toISOString(),
    reference,
    deck,
  };

  const skipValidate = Boolean(args.skipValidate || args.skip_validate);
  if (!skipValidate) {
    validatePayloads({ reference, deck, exportPayload });
  }

  writeJson(refPath, reference);
  writeJson(deckPath, deck);
  writeJson(exportPath, exportPayload);

  if (saveReference) {
    const refDir = path.resolve(process.cwd(), "src/content/reference/calendars/month");
    ensureDir(refDir);
    const savedPath = path.join(refDir, `${month}.monthly_overview.v1.json`);
    writeJson(savedPath, reference);
  }

  console.log("[monthly_overview] generated", {
    month,
    outDir,
    reference: refPath,
    deck: deckPath,
    export: exportPath,
    saveReference,
    validated: !skipValidate,
    story_date_local: deck.story_date_local || null,
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
