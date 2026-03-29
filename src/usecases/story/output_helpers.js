"use strict";

function ensureIgObject(outputs) {
  if (!outputs.ig || typeof outputs.ig !== "object") {
    outputs.ig = {};
  }
  outputs.ig.source = outputs.ig.source && typeof outputs.ig.source === "object" ? outputs.ig.source : {};
  outputs.ig.parts = outputs.ig.parts && typeof outputs.ig.parts === "object" ? outputs.ig.parts : {};
  outputs.ig.rendered = outputs.ig.rendered && typeof outputs.ig.rendered === "object" ? outputs.ig.rendered : {};
  outputs.ig.rendered.caption = outputs.ig.rendered.caption && typeof outputs.ig.rendered.caption === "object"
    ? outputs.ig.rendered.caption
    : { text: "" };
  outputs.ig.rendered.carousel = outputs.ig.rendered.carousel && typeof outputs.ig.rendered.carousel === "object"
    ? outputs.ig.rendered.carousel
    : {};
  return outputs.ig;
}

function ensureIgOutputs(story) {
  story.outputs = story.outputs && typeof story.outputs === "object" ? story.outputs : {};
  return ensureIgObject(story.outputs);
}

module.exports = {
  ensureIgObject,
  ensureIgOutputs,
};
