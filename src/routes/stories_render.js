// routes/stories_render.js — render helpers for stories route
"use strict";

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

  return f === "line" ? "line" :
    f === "x" ? "x" :
      f === "x_morning" ? "x_morning" :
      f === "x_morning_main" ? "x_morning_main" :
      f === "x_morning_log" ? "x_morning_log" :
      f === "x_night" ? "x_night" :
      f === "x_resonance" ? "x_resonance" :
      f === "x_moon_event" ? "x_moon_event" :
      f === "x_monthly" ? "x_monthly" :
      f === "x_thread" ? "x_thread" :
      f === "x_thread_text" ? "x_thread" :
      f === "thread_text" ? "x_thread" :
      f === "ig" ? "ig" :
        f === "threads" ? "threads" :
        f === "threads_app" ? "threads" :
          (f === "text" && ch === "x") ? "x" :
            (f === "text" && ch === "x_morning") ? "x_morning" :
            (f === "text" && ch === "x_morning_main") ? "x_morning_main" :
            (f === "text" && ch === "x_morning_log") ? "x_morning_log" :
            (f === "text" && ch === "x_night") ? "x_night" :
            (f === "text" && ch === "x_resonance") ? "x_resonance" :
            (f === "text" && ch === "x_moon_event") ? "x_moon_event" :
            (f === "text" && ch === "x_monthly") ? "x_monthly" :
            (f === "text" && ch === "x_thread") ? "x_thread" :
            (f === "text" && ch === "ig") ? "ig" :
              (f === "text" && ch === "threads") ? "threads" :
          (f === "text" && ch === "line_sora") ? "sora" :
                  (f === "text" && ch === "line_distribution") ? "distribution" :
                    (f === "text" && (ch === "natal" || ch === "line_natal")) ? "natal" :
                      (f === "text" && (ch === "line" || !ch)) ? "line" :
                        "line";
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

  const ensureIgObject = () => {
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
  };

  if (primaryKey === "ig") {
    const igOut = ensureIgObject();
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
        const igOut = ensureIgObject();
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
