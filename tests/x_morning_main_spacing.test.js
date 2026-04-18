"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { renderXMorningMain } = require("../src/presenters/x/post");

test("X morning main collapses excessive blank lines around AI body", () => {
  const story = {
    meta: {
      date_local: "2026-04-18",
      as_of: "2026-04-18T08:00:00+09:00",
      x_ai: {
        morning: "空の輪郭が見えています。\n\n\n静かな圧が残っています。"
      },
    },
    public: {
      date_local: "2026-04-18",
    },
  };

  const text = renderXMorningMain(story, {});
  assert.ok(text.startsWith("🌌 今日の空｜2026.04.18 08:00"));
  assert.doesNotMatch(text, /\n{3,}/);
  assert.match(text, /静かな圧が残っています。/);
});
