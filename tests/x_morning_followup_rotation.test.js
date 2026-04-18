"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { renderXMorningMain } = require("../src/presenters/x/post");

test("X morning followup is replaced with a daily rotated configuration-list line", () => {
  const story = {
    meta: {
      date_local: "2026-04-18",
      as_of: "2026-04-18T11:59:35+09:00",
      x_ai: {
        morning: "空の配置は火の元素が強く見えます。\n\n太陽は牡羊座、月は牡牛座にあります。\n\nこの空の続きは↓✨",
      },
    },
    public: {
      date_local: "2026-04-18",
    },
  };

  const text = renderXMorningMain(story, {});
  assert.doesNotMatch(text, /この空の続きは/u);
  assert.match(text, /続けて、今日の配置一覧を置きます。|続けて、空の配置一覧を置きます。|このあとの投稿に、配置一覧を置きます。|続けて、配置の全体像を。/u);
});

test("X morning followup stays stable for the same date and changes across dates", () => {
  const baseStory = {
    meta: {
      as_of: "2026-04-18T11:59:35+09:00",
      x_ai: {
        morning: "空の配置は火の元素が強く見えます。\n\n太陽は牡羊座、月は牡牛座にあります。\n\nこの空の続きは↓🌙",
      },
    },
    public: {},
  };

  const a = renderXMorningMain({
    ...baseStory,
    meta: { ...baseStory.meta, date_local: "2026-04-18" },
    public: { date_local: "2026-04-18" },
  }, {});
  const b = renderXMorningMain({
    ...baseStory,
    meta: { ...baseStory.meta, date_local: "2026-04-18" },
    public: { date_local: "2026-04-18" },
  }, {});
  const c = renderXMorningMain({
    ...baseStory,
    meta: { ...baseStory.meta, date_local: "2026-04-19" },
    public: { date_local: "2026-04-19" },
  }, {});

  assert.equal(a, b);
  assert.notEqual(a, c);
});
