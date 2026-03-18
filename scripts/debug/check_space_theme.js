"use strict";

const fs = require("fs");
const path = require("path");
const dict = require("../../src/content/dict");
const space = require("../../src/engine/shared/space_background");
const test = space.__test || {};
const {
  computeSpaceTheme,
  ELEMENT_PALETTES,
  ELEMENT_BASE_COLORS,
} = test;

if (!computeSpaceTheme || !ELEMENT_PALETTES || !ELEMENT_BASE_COLORS) {
  console.error("[check_space_theme] missing __test exports from space_background.js");
  process.exit(1);
}

const argv = process.argv.slice(2);
const idxStory = argv.indexOf("--story");
const storyPath = idxStory >= 0 ? argv[idxStory + 1] : null;
const idxExpect = argv.indexOf("--expect");
const expectElement = idxExpect >= 0 ? String(argv[idxExpect + 1] || "").toLowerCase() : null;
const useMock = argv.includes("--mock") || (!storyPath && argv.length === 0);

function pad(s, n = 10) {
  const str = String(s || "");
  return str + " ".repeat(Math.max(0, n - str.length));
}

function inList(list, value) {
  return Array.isArray(list) && list.includes(value);
}

function testTheme({ name, story }) {
  const theme = computeSpaceTheme({ story, dateLabel: story?.public?.date_local || "" });
  const primary = theme.palette?.primary?.nebula?.[0];
  const secondary = theme.palette?.secondary?.nebula?.[0];
  const top = theme.topElement;
  const sec = theme.secondaryElement;
  const okPrimary = inList(ELEMENT_PALETTES[top]?.nebula || [], primary);
  const okSecondary = inList(ELEMENT_PALETTES[sec]?.nebula || [], secondary);

  const strata = story?.public?.sky_strata || story?.meta?.sky_strata || {};
  const counts = strata?.element_count || {};
  const topStrata = strata?.top_element || null;
  const topSource = story?.public?.sky_strata ? "public" : story?.meta?.sky_strata ? "meta" : "none";
  const longRow = story?.public?.kinjitsu_long?.[0] || null;
  const longA = longRow?.a_sign_key || null;
  const longB = longRow?.b_sign_key || null;
  const signElem = (key) => {
    const k = String(key || "").toLowerCase();
    return dict?.SIGNS_V2?.signs?.[k]?.element || dict?.SIGNS_V1?.signs?.[k]?.element || null;
  };

  console.log(`\n[${name}] top=${top} secondary=${sec} (sky_strata.top=${topStrata || "—"} src=${topSource})`);
  console.log(`  element_count: fire=${counts.fire || 0} earth=${counts.earth || 0} air=${counts.air || 0} water=${counts.water || 0}`);
  if (longRow) {
    const longLabel = `${longRow?.a || "?"}/${longRow?.b || "?"} ${longRow?.aspect || ""}`.trim();
    console.log(`  kinjitsu_long[0]: ${longLabel}`);
    console.log(`  sign keys: a=${longA || "—"} (${signElem(longA) || "?"}), b=${longB || "—"} (${signElem(longB) || "?"})`);
  } else {
    console.log(`  kinjitsu_long[0]: —`);
  }
  console.log(`  primary nebula: ${primary} ${okPrimary ? "✅" : "❌"}`);
  console.log(`  secondary nebula: ${secondary} ${okSecondary ? "✅" : "❌"}`);
  console.log(`  base candidates: ${(ELEMENT_BASE_COLORS[top] || []).join(", ") || "(none)"}`);
  console.log(`  palette glow: ${theme.palette?.glow || "—"}`);
  if (expectElement) {
    const ok = expectElement === top;
    console.log(`  expect top=${expectElement}: ${ok ? "✅" : "❌"}`);
  }
  return { top, sec, okPrimary, okSecondary };
}

function makeMockStory({ dateLocal, counts }) {
  return {
    public: {
      date_local: dateLocal,
      sky_strata: {
        element_count: counts,
        top_modality: "fixed",
      },
      house_focus: { total: 10, top: [] },
      sky_top: [],
      sky_all: [],
    },
  };
}

function runMockSuite() {
  const cases = [
    {
      name: "air>water",
      counts: { fire: 1, earth: 0, air: 6, water: 3 },
    },
    {
      name: "water>air",
      counts: { fire: 0, earth: 1, air: 2, water: 7 },
    },
    {
      name: "earth>fire",
      counts: { fire: 2, earth: 6, air: 1, water: 1 },
    },
    {
      name: "fire>water",
      counts: { fire: 6, earth: 1, air: 1, water: 2 },
    },
  ];

  console.log("[check_space_theme] mock element distribution tests");
  for (const c of cases) {
    const story = makeMockStory({ dateLocal: "2025-01-01", counts: c.counts });
    testTheme({ name: c.name, story });
  }
}

function runStory(pathLike) {
  const abs = path.resolve(process.cwd(), pathLike);
  if (!fs.existsSync(abs)) {
    console.error(`[check_space_theme] story not found: ${abs}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(abs, "utf8");
  const story = JSON.parse(raw);
  testTheme({ name: `story:${path.basename(abs)}`, story });
}

if (storyPath) runStory(storyPath);
if (useMock) runMockSuite();
