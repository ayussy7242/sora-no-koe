"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { renderIGCaption, renderIGCaptionResonance, renderIGCaptionNight } = require("../src/presenters/format/ig_caption");
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
  assert.ok(caption.includes("星は答えを示さず、"));
  assert.ok(caption.includes("構造だけを置いています。"));
  assert.ok(!caption.includes("LINEでは毎朝、"));
  assert.ok(!caption.includes("Blueprint"));
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

test("renderIGCaptionNight keeps a single title when AI already includes it", () => {
  const story = {
    meta: { date_local: "2026-04-14" },
    public: { date_local: "2026-04-14" },
    outputs: {
      ig: {
        parts: {
          moon_caption: "🌌 2026.04.14 今日の夜の月\n🌙 ここから本文。",
          hashtags_night: [],
        },
      },
    },
  };

  const caption = renderIGCaptionNight(story, { dict });
  const header = "🌌 2026.04.14 今日の夜の月";
  assert.equal(caption.split("\n").filter((l) => l.trim() === header).length, 1);
});

test("renderIGCaptionNight strips hashtag lines from AI body before appending final tags", () => {
  const story = {
    meta: { date_local: "2026-04-18" },
    public: { date_local: "2026-04-18" },
    outputs: {
      ig: {
        parts: {
          moon_caption: "本文です🌙\n#今日の月 #夜の空 #月の配置",
          hashtags_night: ["#今日の月", "#夜の空", "#月の配置"],
        },
      },
    },
  };

  const caption = renderIGCaptionNight(story, { dict });
  assert.equal((caption.match(/#今日の月/g) || []).length, 1);
  assert.equal((caption.match(/#夜の空/g) || []).length, 1);
});

test("renderIGCaptionNight falls back to moon summary when AI caption is empty", () => {
  const story = {
    meta: {
      date_local: "2026-04-18",
      as_of: "2026-04-18T21:00:00+09:00",
    },
    public: {
      date_local: "2026-04-18",
      moon: { sign_ja: "牡牛座", sign_key: "taurus" },
    },
    outputs: {
      ig: {
        parts: {
          moon_caption: "",
          hashtags_night: [],
        },
      },
    },
  };

  const caption = renderIGCaptionNight(story, { dict });
  assert.match(caption, /牡牛座の/);
  assert.ok(caption.includes("輪郭"));
  assert.ok(caption.indexOf("牡牛座の") < caption.indexOf("LINEで毎朝星の配置配信中"));
});

test("renderIGCaptionResonance ends without CTA copy", () => {
  const story = {
    meta: {
      date_local: "2026-04-18",
      as_of: "2026-04-18T11:59:35+09:00",
    },
    public: {
      date_local: "2026-04-18",
      transit_signs: {},
    },
    outputs: {
      ig: {
        parts: {
          resonance_caption: "静かな共鳴が、輪郭を残しています。",
        },
        source: {
          resonance_aspect: {
            a: "mercury",
            b: "neptune",
            type: "conjunction",
            aspect_deg: 0,
            orb_deg: 0.17,
            a_sign_key: "aries",
            a_sign_ja: "牡羊座",
            b_sign_key: "aries",
            b_sign_ja: "牡羊座",
          },
        },
      },
    },
  };

  const caption = renderIGCaptionResonance(story, { dict });
  assert.ok(caption.includes("【今日の共鳴】"));
  assert.ok(caption.includes("静かな共鳴が、輪郭を残しています。"));
  assert.ok(!caption.includes("LINE登録であなたの星の設計図"));
});
