"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { renderSoraLine } = require("../src/presenters/line/sora");

test("LINE Sora uses resonanceDaily when provided (free)", async () => {
  const story = {
    meta: { date_local: "2026-04-13", as_of: "2026-04-13T03:00:00.000Z" },
    public: {
      transit_signs: {
        sun: { sign_key: "aries", sign_ja: "牡羊座" },
      },
      sky_all: [
        { a: "venus", b: "mars", type: "square", aspect_deg: 90, orb_deg: 0.2, a_sign_key: "taurus", b_sign_key: "leo" },
      ],
      sky_top: [],
    },
  };

  const resonanceDaily = { a: "sun", b: "moon", type: "conjunction", aspect_deg: 0, orb_deg: 0.0, a_sign_key: "aries", b_sign_key: "aries" };
  const text = await renderSoraLine(story, { includeHeader: false, paid: false, resonanceMode: "core", resonanceDaily });

  assert.match(text, /太陽|sun/i);
  assert.match(text, /月|moon/i);
});

