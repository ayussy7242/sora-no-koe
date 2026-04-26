"use strict";

const { aspectInfo } = require("../../format/format/common");
const { bodyGlyph, bodyLabelJa } = require("./tokens");
const { formatJstTimeLabel } = require("../../../utils/time");
const { buildSkyEventMeta } = require("../../../usecases/story/sky_event_meta");

const MAX_ITEMS = 2;

function formatEventLine(event, dict) {
  const time = formatJstTimeLabel(event?.atISO || event?.at, { fallback: "" });
  if (!time) return "";

  if (event.kind === "moon_sign_change") {
    return `${time}ごろ、月は${event.toSign}へ移ります🌙`;
  }
  if (event.kind === "moon_phase") {
    const signPrefix = String(event.sign || "").trim();
    const kindLabel = event.phaseKind === "full" ? "満月" : "新月";
    return `${time}ごろ、${signPrefix}${kindLabel}を迎えます🌙`;
  }
  if (event.kind === "planet_ingress") {
    const glyph = bodyGlyph(event.planet);
    return `${time}ごろ、${event.planetLabel || bodyLabelJa(dict, event.planet)}が${event.toSign}へ${glyph || ""}。`;
  }
  if (event.kind === "aspect_peak") {
    const label = aspectInfo(dict, event.type, event.aspectDeg)?.label_ja || "";
    return `${time}ごろ、${bodyLabelJa(dict, event.a)}と${bodyLabelJa(dict, event.b)}が${label}${label ? "" : "接続"}。`;
  }
  return "";
}

function buildMorningEventNotice(story, deps = {}) {
  const dict = deps?.dict || require("../../../content/dict");
  const meta = deps?.skyEventMeta || buildSkyEventMeta({ story, dict, asOfISO: deps?.asOfISO || deps?.as_of, deps });
  if (!meta) return [];

  const events = [
    meta.nextMoonSignChange
      ? { kind: "moon_sign_change", ...meta.nextMoonSignChange }
      : null,
    ...(Array.isArray(meta.moonPhaseEvents) ? meta.moonPhaseEvents.map((event) => ({ kind: "moon_phase", phaseKind: event.kind, ...event })) : []),
    ...(Array.isArray(meta.nextPlanetSignIngress) ? meta.nextPlanetSignIngress.map((event) => ({ kind: "planet_ingress", ...event })) : []),
  ].filter(Boolean).slice(0, MAX_ITEMS);

  return events
    .map((event, index) => {
      const line = formatEventLine(event, dict).trim();
      if (!line) return "";
      return index === 0 ? `このあと ${line}` : line;
    })
    .filter(Boolean);
}

module.exports = {
  buildMorningEventNotice,
};
