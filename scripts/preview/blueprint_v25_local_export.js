#!/usr/bin/env node
"use strict";

require("../_load_env");

const fs = require("fs");
const path = require("path");
const swisseph = require("swisseph");
const dict = require("../../src/content/dict");
const { computeNatalCache } = require("../../src/runners/jobs/worker");
const { norm360 } = require("../../src/domain/astro");
const { createNatalService } = require("../../src/usecases/story/natal");
const { geocodePlace } = require("../../src/integrations/geocode");
const {
  buildBlueprintLightRows,
  buildAiInput,
} = require("../../src/usecases/pdf/blueprint/index");
const { generateBlueprintLightTextV2 } = require("../../src/usecases/pdf/blueprint/generate_text");
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

function getTimeZoneOffsetMinutes(timeZone, date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  const out = {};
  for (const p of parts) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  const asUtc = Date.UTC(
    Number(out.year),
    Number(out.month) - 1,
    Number(out.day),
    Number(out.hour),
    Number(out.minute),
    Number(out.second)
  );
  return Math.round((asUtc - date.getTime()) / 60000);
}

function computeTzOffsetMin({ dateLocal, timeLocal, timeZone }) {
  const dp = parseDateParts(dateLocal);
  const tp = parseTimeParts(timeLocal);
  if (!dp || !tp || !timeZone) return null;
  const baseUtcMs = Date.UTC(dp.y, dp.m - 1, dp.d, tp.h, tp.mi, 0, 0);
  let offset = getTimeZoneOffsetMinutes(timeZone, new Date(baseUtcMs));
  const adjustedUtcMs = Date.UTC(dp.y, dp.m - 1, dp.d, tp.h, tp.mi, 0, 0) - offset * 60000;
  const offset2 = getTimeZoneOffsetMinutes(timeZone, new Date(adjustedUtcMs));
  if (offset2 !== offset) offset = offset2;
  return Number.isFinite(offset) ? offset : null;
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
  const tzOffsetArg = getArg("tz_offset_min");
  const timezone = getArg("timezone") || process.env.DEFAULT_TZ || "Asia/Tokyo";
  const outBase = getArg("out_base");
  const outHtmlArg = getArg("out_html");
  const outJsonArg = getArg("out_json");

  if (!dateLocal || !timeLocal || !place) {
    console.error("Missing args. Example:");
    console.error("  --date=1994-02-18 --time=15:50 --place=札幌 --name=テスト");
    process.exit(1);
  }

  let lat = Number(latArg);
  let lon = Number(lonArg);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    const geo = await geocodePlace(place, process.env.GOOGLE_MAPS_API_KEY, {
      language: "ja",
      region: "jp",
    });
    if (!geo?.ok) {
      console.error("Geocode failed:", geo?.status || "UNKNOWN", geo?.reason || "");
      if (Array.isArray(geo?.candidates) && geo.candidates.length) {
        console.error("Candidates:");
        for (const c of geo.candidates) {
          console.error("-", c?.formatted_address, `(${c?.lat}, ${c?.lon})`);
        }
      }
      console.error("Hint: set GOOGLE_MAPS_API_KEY or pass --lat/--lon directly.");
      process.exit(1);
    }
    lat = geo.lat;
    lon = geo.lon;
  }

  let tzOffset = Number(tzOffsetArg);
  if (!Number.isFinite(tzOffset)) {
    tzOffset = computeTzOffsetMin({ dateLocal, timeLocal, timeZone: timezone });
  }
  if (!Number.isFinite(tzOffset)) {
    console.error("Missing or invalid tz offset. Provide --tz_offset_min or --timezone.");
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
