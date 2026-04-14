"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { renderXResonance } = require("../src/presenters/x/post");

test("X resonance header includes date + JST time", () => {
  const story = {
    meta: { date_local: "2026-04-13", as_of: "2026-04-13T21:40:00+09:00" },
    public: {
      date_local: "2026-04-13",
      transit_signs: {},
      sky_all: [],
      sky_top: [],
    },
    meta: {
      date_local: "2026-04-13",
      as_of: "2026-04-13T21:40:00+09:00",
      x_source: {
        resonance_aspect: { a: "sun", b: "moon", type: "conjunction", aspect_deg: 0, orb_deg: 0.1, a_sign_key: "aries", b_sign_key: "aries" },
      },
    },
  };

  const text = renderXResonance(story, {});
  assert.match(text.split("\n")[0], /^🌌 今の最大共鳴｜2026\.04\.13 21:40$/);
});
