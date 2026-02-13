// routes/stories_render.js — render helpers for stories route
"use strict";

const OUTPUT_KEYS = [
  "line",
  "sora",
  "sora_all",
  "sora_ura",
  "sora_ura_silent",
  "sora_ura_rare",
  "sora_ura_harmony",
  "anshin",
  "natal",
  "x",
  "ig",
  "threads",
];

function buildRenderMap({ renderers, story, anshinNatalCache, natalCache }) {
  return {
    line: () => renderers.renderLine(story),
    sora: () => renderers.renderSoraLine(story),
    sora_all: () => renderers.renderSoraAllLine(story),
    sora_ura: () => renderers.renderSoraUraLine(story),
    sora_ura_silent: () => renderers.renderSoraUraSilentLine(story),
    sora_ura_rare: () => renderers.renderSoraUraRareLine(story),
    sora_ura_harmony: () => renderers.renderSoraUraHarmonyLine(story),
    anshin: () => renderers.renderAnshinLine({ story, meta: story?.meta, natal_cache: anshinNatalCache || null }),
    natal: () => renderers.renderNatalListFromcache(natalCache || null),
    x: () => renderers.renderX(story),
    ig: () => renderers.renderIG(story),
    threads: () => renderers.renderThreads(story),
  };
}

function resolvePrimaryKey({ format, channel }) {
  const f = String(format || "json").trim().toLowerCase();
  const ch = String(channel || "").trim().toLowerCase();

  return f === "line" ? "line" :
    f === "x" ? "x" :
      f === "ig" ? "ig" :
        f === "threads" ? "threads" :
          (f === "text" && ch === "x") ? "x" :
            (f === "text" && ch === "ig") ? "ig" :
              (f === "text" && ch === "threads") ? "threads" :
                (f === "text" && ch === "line_sora") ? "sora" :
                  (f === "text" && ch === "line_sora_all") ? "sora_all" :
                    (f === "text" && ch === "line_sora_ura") ? "sora_ura" :
                      (f === "text" && ch === "line_sora_ura_silent") ? "sora_ura_silent" :
                        (f === "text" && ch === "line_sora_ura_rare") ? "sora_ura_rare" :
                          (f === "text" && ch === "line_sora_ura_harmony") ? "sora_ura_harmony" :
                            (f === "text" && ch === "line_anshin") ? "anshin" :
                              (f === "text" && (ch === "natal" || ch === "line_natal")) ? "natal" :
                                (f === "text" && (ch === "line" || !ch)) ? "line" :
                                  "line";
}

async function attachOutputs({ story, renderMap, primaryKey, primaryText, includeOutputs }) {
  if (!includeOutputs) {
    if (story.outputs) delete story.outputs;
    return;
  }

  const outputs = OUTPUT_KEYS.reduce((acc, k) => {
    acc[k] = "";
    return acc;
  }, {});
  outputs[primaryKey] = primaryText;

  const errors = {};
  for (const k of OUTPUT_KEYS) {
    if (k === primaryKey) continue;
    try {
      outputs[k] = await renderMap[k]();
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
