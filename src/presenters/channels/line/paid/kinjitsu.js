"use strict";

const { glyphForBody, signJa, aspectInfo } = require("../../../format/format/line_common");
const { SPEC } = require("../../../../config/sora_spec");

function formatKinjitsu({ items = [], moonEvents = [], dict, formatDateYmdHm }) {
  const lines = ["📅 近日", ""];

  items.forEach((it, idx) => {
    if (idx > 0) lines.push("");
    const aKey = it.aKey;
    const bKey = it.bKey;
    const aLabel = dict?.PLANETS_V2?.bodies?.[aKey]?.label_ja || dict?.POINTS_V1?.points?.[aKey]?.label_ja || aKey;
    const bLabel = dict?.PLANETS_V2?.bodies?.[bKey]?.label_ja || dict?.POINTS_V1?.points?.[bKey]?.label_ja || bKey;
    const aSign = it.aSign || signJa(dict, it.aSignKey || "");
    const bSign = it.bSign || signJa(dict, it.bSignKey || "");
    const aGlyph = glyphForBody(aKey);
    const bGlyph = glyphForBody(bKey);
    const aRetro = it.aRetro ? SPEC.retro.suffix : "";
    const bRetro = it.bRetro ? SPEC.retro.suffix : "";
    const aSignText = aSign ? `（${aSign}）${aRetro}` : aRetro;
    const bSignText = bSign ? `（${bSign}）${bRetro}` : bRetro;
    const aspectMeta = aspectInfo(dict, it.aspectType, it.aspectDeg);
    const aspectLabel = aspectMeta?.label_ja || String(it.aspectType || "");
    const degText = Number.isFinite(Number(it.aspectDeg)) ? `${Math.round(it.aspectDeg)}°` : "";

    lines.push(
      `(T) ${aGlyph ? `${aGlyph} ` : ""}${aLabel}${aSignText}`,
      `× (T) ${bGlyph ? `${bGlyph} ` : ""}${bLabel}${bSignText}`,
      `${aspectLabel} ${degText}`.trim(),
      `${SPEC.labels.kinjitsu.nowOrb} ${Number(it.nowOrb).toFixed(1)}°`,
      `${SPEC.labels.kinjitsu.peak} ${formatDateYmdHm(it.peak)}`
    );
  });

  moonEvents.forEach((ev) => {
    const moonName = ev?.moonName || "";
    const labelCore = ev.kind === "new" ? "新月" : "満月";
    const label = moonName ? `${labelCore}（${moonName}）` : labelCore;
    const signText = ev.signJa ? `${ev.signJa}${label}` : label;
    if (ev.kind === "new") {
      lines.push("", `🌑 ${signText}`, `${formatDateYmdHm(ev.date)}`);
    } else {
      lines.push("", `🌕 ${signText}`, `${formatDateYmdHm(ev.date)}`);
    }
  });

  return lines.filter((x) => x !== null && x !== undefined);
}

module.exports = { formatKinjitsu };
