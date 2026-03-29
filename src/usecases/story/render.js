// routes/stories_render.js — render helpers for stories route
"use strict";

const { ensureIgObject } = require("./output_helpers");

const OUTPUT_KEYS = [
  "line",
  "sora",
  "distribution",
  "natal",
  "x",
  "x_morning",
  "x_morning_main",
  "x_morning_log",
  "x_night",
  "x_resonance",
  "x_moon_event",
  "x_monthly",
  "x_thread",
  "ig",
  "threads",
];

const FORMAT_TO_KEY = Object.freeze({
  line: "line",
  x: "x",
  x_morning: "x_morning",
  x_morning_main: "x_morning_main",
  x_morning_log: "x_morning_log",
  x_night: "x_night",
  x_resonance: "x_resonance",
  x_moon_event: "x_moon_event",
  x_monthly: "x_monthly",
  x_thread: "x_thread",
  x_thread_text: "x_thread",
  thread_text: "x_thread",
  ig: "ig",
  threads: "threads",
  threads_app: "threads",
});

const TEXT_CHANNEL_TO_KEY = Object.freeze({
  x: "x",
  x_morning: "x_morning",
  x_morning_main: "x_morning_main",
  x_morning_log: "x_morning_log",
  x_night: "x_night",
  x_resonance: "x_resonance",
  x_moon_event: "x_moon_event",
  x_monthly: "x_monthly",
  x_thread: "x_thread",
  ig: "ig",
  threads: "threads",
  line_sora: "sora",
  line_distribution: "distribution",
  natal: "natal",
  line_natal: "natal",
  line: "line",
});

function buildRenderMap({ renderers, story, natalCache }) {
  return {
    line: () => renderers.renderLine(story),
    sora: () => renderers.renderSoraLine(story),
    distribution: () => renderers.renderDistributionLine(story),
    natal: () => renderers.renderNatalListFromcache(natalCache || null),
    x: () => renderers.renderX(story),
    x_morning: () => renderers.renderXMorning(story),
    x_morning_main: () => renderers.renderXMorningMain(story),
    x_morning_log: () => renderers.renderXMorningLog(story),
    x_night: () => renderers.renderXNight(story),
    x_resonance: () => renderers.renderXResonance(story),
    x_moon_event: () => renderers.renderXMoonEvent(story),
    x_monthly: () => renderers.renderXMonthly(story),
    x_thread: () => renderers.renderXThread(story),
    ig: () => renderers.renderIG(story),
    threads: () => renderers.renderThreads(story),
  };
}

function resolvePrimaryKey({ format, channel }) {
  const f = String(format || "json").trim().toLowerCase();
  const ch = String(channel || "").trim().toLowerCase();

  const direct = FORMAT_TO_KEY[f];
  if (direct) return direct;

  if (f === "text") {
    const mapped = TEXT_CHANNEL_TO_KEY[ch];
    if (mapped) return mapped;
    if (!ch) return "line";
  }

  return "line";
}

async function attachOutputs({ story, renderMap, primaryKey, primaryText, includeOutputs }) {
  if (!includeOutputs) {
    if (story.outputs) delete story.outputs;
    return;
  }

  const outputs = (story.outputs && typeof story.outputs === "object") ? story.outputs : {};
  OUTPUT_KEYS.forEach((k) => {
    if (outputs[k] === undefined) outputs[k] = "";
  });

  const ensureIgOut = () => ensureIgObject(outputs);

  if (primaryKey === "ig") {
    const igOut = ensureIgOut();
    igOut.rendered.caption = {
      text: primaryText,
      template_version: "ig_caption_v2",
      generated_at: new Date().toISOString(),
    };
  } else {
    outputs[primaryKey] = primaryText;
  }

  const errors = {};
  for (const k of OUTPUT_KEYS) {
    if (k === primaryKey) continue;
    try {
      if (k === "ig") {
        const igOut = ensureIgOut();
        igOut.rendered.caption = {
          text: await renderMap[k](),
          template_version: "ig_caption_v2",
          generated_at: new Date().toISOString(),
        };
      } else {
        outputs[k] = await renderMap[k]();
      }
    } catch (e) {
      errors[k] = e?.message || String(e);
    }
  }

  story.outputs = outputs;
  if (Object.keys(errors).length) {
    story.meta.outputs_errors = errors;
  }
}

module.exports = {
  buildRenderMap,
  resolvePrimaryKey,
  attachOutputs,
  OUTPUT_KEYS,
};
