"use strict";

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const configEnv = path.join(process.cwd(), "config", ".env");
const rootEnv = path.join(process.cwd(), ".env");
if (fs.existsSync(configEnv)) dotenv.config({ path: configEnv });
if (fs.existsSync(rootEnv)) dotenv.config({ path: rootEnv });

const { generateIgObservationText } = require("../../src/usecases/channels/ig/ig_observation_ai");
const dict = require("../../src/content/dict");

const SIGN_KEYS = [
  "aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces",
];
const BODY_KEYS = [
  "sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto",
];
const ELEMENT_KEYS = ["fire", "earth", "air", "water"];

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randInt(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildTransitSignsFocus(signKey) {
  const signs = {};
  const bodies = shuffle(BODY_KEYS);
  const focusCount = randInt(3, 5);
  const focusBodies = bodies.slice(0, focusCount);
  const restBodies = bodies.slice(focusCount);
  focusBodies.forEach((k) => {
    signs[k] = { sign_key: signKey };
  });
  const shuffledSigns = shuffle(SIGN_KEYS.filter((k) => k !== signKey));
  restBodies.forEach((k, idx) => {
    signs[k] = { sign_key: shuffledSigns[idx % shuffledSigns.length] };
  });
  return signs;
}

function buildTransitSignsUnique() {
  const signs = {};
  const shuffled = shuffle(SIGN_KEYS);
  BODY_KEYS.forEach((k, idx) => {
    signs[k] = { sign_key: shuffled[idx % shuffled.length] };
  });
  return signs;
}

function buildElementCountsFocus() {
  const top = pick(ELEMENT_KEYS);
  const counts = { fire: 0, earth: 0, air: 0, water: 0 };
  counts[top] = randInt(6, 8);
  const rest = ELEMENT_KEYS.filter((k) => k !== top);
  rest.forEach((k) => {
    counts[k] = randInt(0, 2);
  });
  return counts;
}

function buildElementCountsBalanced() {
  const counts = { fire: 2, earth: 2, air: 2, water: 2 };
  const bump = pick(ELEMENT_KEYS);
  counts[bump] += randInt(0, 1);
  return counts;
}

function buildHouseFocusStrong() {
  const house = randInt(1, 12);
  const total = 10;
  const count = randInt(4, 6);
  return { top: [{ house_no: house, count }], total };
}

function buildHouseFocusWeak() {
  return { top: [], total: 0 };
}

function todayJst() {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function buildStory({ transitSigns, elementCount, houseFocus }) {
  return {
    meta: { date_local: todayJst() },
    public: {
      transit_signs: transitSigns,
      sky_strata: { element_count: elementCount },
      house_focus: houseFocus,
    },
  };
}

async function runCategory(label, buildStoryFn, count, openai) {
  console.log(`\n=== ${label} ===`);
  for (let i = 0; i < count; i += 1) {
    const story = buildStoryFn();
    const res = await generateIgObservationText({
      story,
      dict,
      openai,
      maxRetries: 1,
    });
    const text = res?.text || `（生成失敗: ${res?.reason || res?.error || "unknown"}）`;
    console.log(`${i + 1}. ${text}`);
  }
}

async function main() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    console.error("OPENAI_API_KEY missing. Set it to run this tester.");
    process.exit(1);
  }

  const openai = {
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL,
    model: process.env.OPENAI_MODEL,
  };

  const count = Number(process.argv[2]) || 10;

  await runCategory("sign_focus", () => {
    const focusSign = pick(SIGN_KEYS);
    return buildStory({
      transitSigns: buildTransitSignsFocus(focusSign),
      elementCount: buildElementCountsBalanced(),
      houseFocus: buildHouseFocusWeak(),
    });
  }, count, openai);

  await runCategory("element_focus", () => {
    return buildStory({
      transitSigns: buildTransitSignsUnique(),
      elementCount: buildElementCountsFocus(),
      houseFocus: buildHouseFocusWeak(),
    });
  }, count, openai);

  await runCategory("house_focus", () => {
    return buildStory({
      transitSigns: buildTransitSignsUnique(),
      elementCount: buildElementCountsBalanced(),
      houseFocus: buildHouseFocusStrong(),
    });
  }, count, openai);

  await runCategory("distributed", () => {
    return buildStory({
      transitSigns: buildTransitSignsUnique(),
      elementCount: buildElementCountsBalanced(),
      houseFocus: buildHouseFocusWeak(),
    });
  }, count, openai);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
