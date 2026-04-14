"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { renderIGCaption } = require("../src/presenters/format/ig_caption");
const { renderIGCaptionNight } = require("../src/presenters/format/ig_caption");
const dict = require("../src/content/dict");

test("renderIGCaption includes key blocks", () => {
  const story = {
    meta: { date_local: "2026-03-31" },
    public: {
      date_local: "2026-03-31",
      transit_signs: {
        sun: { sign_ja: "牡羊座", sign_key: "aries" },
        moon: { sign_ja: "乙女座", sign_key: "virgo" },
      },
      sky_strata: {
        element_count: { fire: 3, earth: 3, air: 1, water: 3 },
        mode_count: { cardinal: 4, fixed: 3, mutable: 3 },
      },
    },
    outputs: {
      ig: {
        parts: {},
        source: {
          resonance_aspect: {
            a: "saturn",
            b: "pluto",
            type: "sextile",
            aspect_deg: 60,
            orb_deg: 0.19,
            a_sign_key: "aries",
            b_sign_key: "aquarius",
          },
        },
      },
    },
  };

  const caption = renderIGCaption(story, { dict });
  assert.ok(caption.includes("2026.03.31"));
  assert.ok(caption.includes("☉ 太陽｜牡羊座"));
  assert.ok(caption.includes("☽ 月｜乙女座"));
  assert.ok(caption.includes("✦ 今日のソラ属性"));
  assert.ok(caption.includes("🔥 火3"));
  assert.ok(caption.includes("🏃 活動4"));
});

test("renderIGCaptionNight removes duplicate title from AI moon_caption", () => {
  const story = {
    meta: { date_local: "2026-04-13" },
    public: { date_local: "2026-04-13" },
    outputs: {
      ig: {
        parts: {
          moon_caption: "🌌 2026.04.13 今日の夜の月\n静かに光が薄くなる。",
          hashtags_night: ["#月"],
        },
      },
    },
  };

  const caption = renderIGCaptionNight(story, { dict });
  const lines = caption.split("\n").map((l) => l.trim()).filter(Boolean);
  // first line is the fixed header
  const header = "🌌 2026.04.13 今日の夜の月";
  assert.equal(lines[0], header);
  // should not repeat the same header again
  assert.equal(lines.filter((l) => l === header).length, 1);
});
