"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const dict = require("../src/content/dict");
const { buildMorningHighlightAspect } = require("../src/usecases/story/morning_highlight_aspect");

test("buildMorningHighlightAspect picks a sky-top conjunction as morning highlight", () => {
  const story = {
    public: {
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

  const picked = buildMorningHighlightAspect({ story, dict });
  assert.ok(picked);
  assert.match(picked.text, /金星（双子座） × 海王星（双子座） コンジャンクション 0°/);
});

test("buildMorningHighlightAspect skips weak non-representative aspects", () => {
  const story = {
    public: {
      sky_top: [],
      sky_all: [
        {
          a: "mercury",
          b: "mars",
          type: "semi_square_45",
          aspect_deg: 45,
          orb_deg: 0.55,
          a_sign_key: "aries",
          a_sign_ja: "牡羊座",
          b_sign_key: "leo",
          b_sign_ja: "獅子座",
        },
      ],
    },
  };

  const picked = buildMorningHighlightAspect({ story, dict });
  assert.equal(picked, null);
});
