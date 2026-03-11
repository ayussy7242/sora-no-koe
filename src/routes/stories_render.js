// routes/stories_render.js — render helpers for stories route
"use strict";

const OUTPUT_KEYS = [
  "line",
  "sora",
  "distribution",
  "natal",
  "x",
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
      f === "x_thread" ? "x_thread" :
      f === "ig" ? "ig" :
        f === "threads" ? "threads" :
          (f === "text" && ch === "x") ? "x" :
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
      outputs.ig = outputs.ig ? { caption: String(outputs.ig) } : { caption: "" };
    }
    if (!outputs.ig.carousel) outputs.ig.carousel = {};
    return outputs.ig;
  };

  if (primaryKey === "ig") {
    ensureIgObject().caption = primaryText;
  } else {
    outputs[primaryKey] = primaryText;
  }

  const errors = {};
  for (const k of OUTPUT_KEYS) {
    if (k === primaryKey) continue;
    try {
      if (k === "ig") {
        ensureIgObject().caption = await renderMap[k]();
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
