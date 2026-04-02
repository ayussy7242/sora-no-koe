"use strict";

function ensureXMeta(story) {
  story.meta = story.meta && typeof story.meta === "object" ? story.meta : {};
  story.meta.x_ai = story.meta.x_ai && typeof story.meta.x_ai === "object" ? story.meta.x_ai : {};
  story.meta.x_source = story.meta.x_source && typeof story.meta.x_source === "object" ? story.meta.x_source : {};
  return story.meta;
}

module.exports = {
  ensureXMeta,
};
