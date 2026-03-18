#!/usr/bin/env node
"use strict";

require("../_load_env");

const fs = require("fs");
const path = require("path");
const swisseph = require("swisseph");
const dict = require("../../src/content/dict");
const { computeNatalCache } = require("../../src/runners/jobs/worker");
const { norm360 } = require("../../src/domain/astro_compute");
const { createNatalService } = require("../../src/usecases/story/story_natal");
const {
  buildBlueprintLightRows,
  buildAiInput,
} = require("../../src/usecases/blueprint_light/index");
const { generateBlueprintLightTextV2 } = require("../../src/usecases/blueprint_light/generate_text");
const { buildBlueprintV25WireframeHtml } = require("../../src/engine/pdf/blueprint_v25/wireframe");
const {
  buildBlueprintV25BgImages,
  buildStoryStub,
} = require("../../src/engine/pdf/blueprint_v25/backgrounds");
const { SIGN_KEYS } = require("../../src/engine/pdf/blueprint_light/shared");

function getArg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

function parseDateParts(dateStr) {
  const [y, m, d] = String(dateStr || "").split("-").map((v) => Number(v));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return { y, m, d };
}

function parseTimeParts(timeStr) {
  const [h, mi] = String(timeStr || "").split(":").map((v) => Number(v));
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
  return { h, mi };
}

function buildBirthUtcIso({ dateLocal, timeLocal, tzOffsetMin }) {
  const dp = parseDateParts(dateLocal);
  const tp = parseTimeParts(timeLocal);
  if (!dp || !tp) return null;
  const utcMs = Date.UTC(dp.y, dp.m - 1, dp.d, tp.h, tp.mi, 0, 0) - tzOffsetMin * 60 * 1000;
  return new Date(utcMs).toISOString();
}

function calcAscLon(rowsAngles = []) {
  const ascRow = Array.isArray(rowsAngles) ? rowsAngles.find((row) => row?.key === "asc") : null;
  const meta = ascRow?.meta;
  const signKey = meta?.sign_key;
  const idx = SIGN_KEYS.indexOf(String(signKey || ""));
  if (idx < 0) return null;
  const deg = Number(meta?.deg);
  if (!Number.isFinite(deg)) return null;
  const min = Number(meta?.min);
  const minPart = Number.isFinite(min) ? min / 60 : 0;
  return idx * 30 + deg + minPart;
}

function calcMcLon(rowsAngles = []) {
  const mcRow = Array.isArray(rowsAngles) ? rowsAngles.find((row) => row?.key === "mc") : null;
  const meta = mcRow?.meta;
  const signKey = meta?.sign_key;
  const idx = SIGN_KEYS.indexOf(String(signKey || ""));
  if (idx < 0) return null;
  const deg = Number(meta?.deg);
  if (!Number.isFinite(deg)) return null;
  const min = Number(meta?.min);
  const minPart = Number.isFinite(min) ? min / 60 : 0;
  return idx * 30 + deg + minPart;
}

async function main() {
  const dateLocal = getArg("date");
  const timeLocal = getArg("time");
  const place = getArg("place");
  const latArg = getArg("lat");
  const lonArg = getArg("lon");
  const name = getArg("name") || "テスト";
  const tzOffset = Number(getArg("tz_offset_min", "540"));
  const outBase = getArg("out_base");
  const outHtmlArg = getArg("out_html");
  const outJsonArg = getArg("out_json");

  if (!dateLocal || !timeLocal || !place) {
    console.error("Missing args. Example:");
    console.error("  --date=1994-02-18 --time=15:50 --place=札幌 --lat=43.0621 --lon=141.3544");
    process.exit(1);
  }

  const lat = Number(latArg);
  const lon = Number(lonArg);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    console.error("Missing or invalid lat/lon. Example: --lat=43.0621 --lon=141.3544");
    process.exit(1);
  }

  const birthUtcIso = buildBirthUtcIso({ dateLocal, timeLocal, tzOffsetMin: tzOffset });
  if (!birthUtcIso) {
    console.error("Failed to build UTC ISO from date/time.");
    process.exit(1);
  }

  const natal = computeNatalCache({
    swisseph,
    birthUtcIso,
    houseSystem: "P",
    lat,
    lon,
    precisionDeg: 0.01,
  });

  const natalCache = {
    bodies: natal.bodies,
    houses: natal.houses,
    engine: { houses: natal.engineHouses },
    birth: {
      date_local: dateLocal,
      time_hm: timeLocal,
      place_text: place,
    },
  };

  const natalService = createNatalService({ db: null, norm360 });
  const { ok, longitudes } = natalService.extractNatalLongitudes(natalCache);
  if (!ok) {
    console.error("Failed to extract longitudes from natal cache.");
    process.exit(1);
  }

  const { rowsMain, rowsAngles, rowsExtra, element, modality } = buildBlueprintLightRows({
    longitudes,
    dict,
  });

  const identity = {
    name,
    birth_date: dateLocal,
    birth_time: timeLocal,
    birth_place: place,
  };
  const birthText = [identity.birth_date, identity.birth_time, identity.birth_place].filter(Boolean).join(" / ");

  const aiInput = buildAiInput({
    displayName: name,
    rowsMain,
    rowsAngles,
    rowsExtra,
    element,
    modality,
    dict,
    longitudes,
    identity,
    cusps: natal.houses?.cusps || null,
    houseSystem: natal.houses?.system || "P",
  });

  const res = await generateBlueprintLightTextV2({
    env: {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_MODEL_BLUEPRINT_LIGHT: process.env.OPENAI_MODEL_BLUEPRINT_LIGHT || "gpt-4o",
      BLUEPRINT_DEBUG_JSON: process.env.BLUEPRINT_DEBUG_JSON || "",
    },
    input: aiInput,
  });

  if (!res?.ok) {
    console.error("generate failed:", res);
    process.exit(1);
  }

  const stamp = Date.now();
  const base = outBase || path.join(process.cwd(), "tmp", "blueprint", "local", `blueprint_v25_${stamp}`);
  const outJson = outJsonArg ? path.resolve(outJsonArg) : `${base}.json`;
  const outHtml = outHtmlArg ? path.resolve(outHtmlArg) : `${base}.html`;

  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(res.data, null, 2));

  const html = buildBlueprintV25WireframeHtml({
    data: {
      blueprint: res.data,
      kernel: aiInput.kernel,
      displayName: name,
      ownerName: name,
      birthText,
      wheelRotationDeg: Number.isFinite(Number(calcAscLon(rowsAngles)))
        ? 270 - Number(calcAscLon(rowsAngles))
        : 0,
      wheelAscLon: Number.isFinite(Number(calcAscLon(rowsAngles)))
        ? Number(calcAscLon(rowsAngles))
        : null,
      wheelMcLon: Number.isFinite(Number(calcMcLon(rowsAngles)))
        ? Number(calcMcLon(rowsAngles))
        : null,
      story: buildStoryStub({
        rowsMain,
        rowsExtra,
        elementCounts: res.data?.master_chart?.element_balance || element,
        dateLabel: birthText,
      }),
      elementCounts: res.data?.master_chart?.element_balance || element,
      modalityCounts: res.data?.master_chart?.modality_balance || modality,
      bg_images: await buildBlueprintV25BgImages({
        blueprint: res.data,
        rowsMain,
        rowsExtra,
        elementCounts: res.data?.master_chart?.element_balance || element,
        dateLabel: birthText,
        outDir: path.join(process.cwd(), "tmp", "blueprint_bg", "local"),
        inline: true,
      }),
    },
    useSpace: true,
  });

  fs.writeFileSync(outHtml, html, "utf8");

  console.log("ok: true");
  console.log("json:", outJson);
  console.log("html:", outHtml);
}

main().catch((err) => {
  console.error("local export failed", err);
  process.exit(1);
});
