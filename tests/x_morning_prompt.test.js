"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildXSoraPrompt } = require("../src/usecases/channels/x/ai/daily");
const dict = require("../src/content/dict");

test("X morning prompt focuses on configuration, concentration, and next event", () => {
  const story = {
    meta: {
      date_local: "2026-04-27",
      as_of: "2026-04-27T08:00:00+09:00",
    },
    public: {
      transit_signs: {
        sun: { sign_ja: "牡牛座", sign_key: "taurus" },
        moon: { sign_ja: "乙女座", sign_key: "virgo" },
      },
      house_focus: {
        top: { label_ja: "第3ハウス", score: 4 },
      },
      sky_strata: {
        element_count: { fire: 4, earth: 2, air: 3, water: 1 },
        modality_count: { cardinal: 5, fixed: 2, mutable: 3 },
      },
      sky_top: [
        {
          a: "venus",
          b: "neptune",
          type: "conjunction",
          aspect_deg: 0,
          orb_deg: 0.08,
          a_sign_key: "gemini",
          a_sign_ja: "双子座",
          b_sign_key: "gemini",
          b_sign_ja: "双子座",
        },
      ],
      sky_all: [
        {
          a: "venus",
          b: "neptune",
          type: "conjunction",
          aspect_deg: 0,
          orb_deg: 0.08,
          a_sign_key: "gemini",
          a_sign_ja: "双子座",
          b_sign_key: "gemini",
          b_sign_ja: "双子座",
        },
      ],
    },
  };

  const prompt = buildXSoraPrompt({ story, dict });
  assert.match(prompt, /HOUSE_FOCUS:/);
  assert.match(prompt, /MORNING_HIGHLIGHT_ASPECT:/);
  assert.match(prompt, /NEXT_EVENT:/);
  assert.match(prompt, /"sun":"牡牛座"/);
  assert.match(prompt, /金星（双子座） × 海王星（双子座） コンジャンクション 0°/);
  assert.doesNotMatch(prompt, /SUN_MOON_ASPECT:/);
  assert.doesNotMatch(prompt, /TOP_ASPECTS:/);
});
