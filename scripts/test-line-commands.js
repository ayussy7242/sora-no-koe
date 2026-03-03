#!/usr/bin/env node
"use strict";

/**
 * Usage:
 *  node scripts/test-line-commands.js --story ./tmp/story.json --date 2026-01-17
 */

const fs = require("fs");
const path = require("path");

function getArg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i < 0) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function ensureTestPersonal(story) {
  story.personal = story.personal || {};

  if (!Array.isArray(story.personal.touch_points_all) || story.personal.touch_points_all.length === 0) {
    story.personal.touch_points_all = [
      {
        natal_body_or_point: "moon",
        natal_sign_key: "leo",
        natal_sign_ja: "獅子座",
        natal_lon_deg: 145.2,
        transit_body: "pluto",
        transit_sign_key: "aquarius",
        transit_sign_ja: "水瓶座",
        aspect: "square",
        aspect_deg: 90,
        orb_deg: 1.2,
      },
      {
        natal_body_or_point: "sun",
        natal_sign_key: "leo",
        natal_sign_ja: "獅子座",
        natal_lon_deg: 120.5,
        transit_body: "saturn",
        transit_sign_key: "pisces",
        transit_sign_ja: "魚座",
        aspect: "conjunction",
        aspect_deg: 0,
        orb_deg: 0.5,
      },
      {
        natal_body_or_point: "venus",
        natal_sign_key: "cancer",
        natal_sign_ja: "蟹座",
        natal_lon_deg: 100.1,
        transit_body: "neptune",
        transit_sign_key: "pisces",
        transit_sign_ja: "魚座",
        aspect: "opposition",
        aspect_deg: 180,
        orb_deg: 0.8,
      },
      {
        natal_body_or_point: "mars",
        natal_sign_key: "taurus",
        natal_sign_ja: "牡牛座",
        natal_lon_deg: 47.4,
        transit_body: "uranus",
        transit_sign_key: "taurus",
        transit_sign_ja: "牡牛座",
        aspect: "conjunction",
        aspect_deg: 0,
        orb_deg: 0.9,
      },
      {
        natal_body_or_point: "mercury",
        natal_sign_key: "leo",
        natal_sign_ja: "獅子座",
        natal_lon_deg: 140.3,
        transit_body: "mars",
        transit_sign_key: "capricorn",
        transit_sign_ja: "山羊座",
        aspect: "sextile",
        aspect_deg: 60,
        orb_deg: 1.5,
      },
      {
        natal_body_or_point: "jupiter",
        natal_sign_key: "cancer",
        natal_sign_ja: "蟹座",
        natal_lon_deg: 110.0,
        transit_body: "jupiter",
        transit_sign_key: "cancer",
        transit_sign_ja: "蟹座",
        aspect: "conjunction",
        aspect_deg: 0,
        orb_deg: 2.2,
      },
    ];
  }

  if (!story.personal.natal_summary) {
    story.personal.natal_summary = {
      element_count: { fire: 3, earth: 2, air: 1, water: 4 },
      modality_count: { cardinal: 4, fixed: 3, mutable: 3 },
    };
  }

  return story;
}

function ensureSkyStrata(story) {
  story.public = story.public || {};
  if (!story.public.sky_strata) {
    story.public.sky_strata = {
      element_count: { fire: 2, earth: 4, air: 2, water: 2 },
      modality_count: { cardinal: 3, fixed: 4, mutable: 3 },
    };
  }
  return story;
}

async function main() {
  const date = getArg("--date", null);
  const storyPath = getArg("--story", null);
  if (!date || !storyPath) {
    console.error("Usage: node scripts/test-line-commands.js --date YYYY-MM-DD --story path/to/story.json");
    process.exit(1);
  }

  const story = readJson(path.resolve(storyPath));
  story.meta = story.meta || {};
  story.meta.date_local = date;
  story.meta.as_of = story.meta.as_of || `${date}T03:00:00.000Z`;

  ensureTestPersonal(ensureSkyStrata(story));

  const dict = require("../src/content/dict");

  const { renderSoraLine } = require("../src/presenters/channels/line/sora");
  const { renderLine } = require("../src/presenters/channels/line/today");
  const { buildBunpuTop5, buildHouseBlock, buildTsukijiBlock, buildKinjitsuBlock } = require("../src/usecases/paid/line_paid_500");
  const { buildSoraWheelSvg } = require("../src/integrations/media/sora_wheel");

  const dateLabel = date.replace(/-/g, ".");

  const sora = await renderSoraLine(story, { dict });
  const kyou = await renderLine(story, { dict });

  const bunpu = [...buildBunpuTop5(story, dict)].join("\n");
  const house = ["🏠 はうす（全ハウス）｜" + dateLabel, "", ...buildHouseBlock(story, dict, story.meta.as_of)].join("\n");
  const tsukiji = ["🌙 つきじ｜" + dateLabel, "", ...buildTsukijiBlock(story, dict, story.meta.as_of)].join("\n");
  const kinjitsu = buildKinjitsuBlock(story, dict, story.meta.as_of).join("\n");

  const svg = buildSoraWheelSvg({ story, dateLabel });
  const svgPath = path.resolve("tmp/sora_wheel_test.svg");
  fs.writeFileSync(svgPath, svg, "utf8");

  const out = [
    "==================== そら ====================",
    sora,
    "",
    "==================== きょう ====================",
    kyou,
    "",
    "==================== ぶんぷ ====================",
    bunpu,
    "",
    "==================== はうす ====================",
    house,
    "",
    "==================== つきじ ====================",
    tsukiji,
    "",
    "==================== 近日 ====================",
    kinjitsu,
    "",
    "==================== ソラ図 ====================",
    `SVG saved: ${svgPath}`,
  ].join("\n");

  console.log(out);
}

main().catch((e) => {
  console.error("FAILED:", e?.message || String(e));
  process.exit(1);
});
