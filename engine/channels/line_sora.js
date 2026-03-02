"use strict";

const { buildRetrogradeMap } = require("../astro/retrograde");
const { SPEC } = require("../config/sora_spec");
const { scoreForAspect } = require("../domain/touch_point_scoring");
const { normalizeBodyKey } = require("../domain/canonical");
const {
  formatDateLabel,
  glyphForBody,
  signJa,
  aspectInfo,
  formatElementModalityLines,
} = require("../render_parts/format/line_common");
const {
  listWithOrb,
  filterWithinOrb,
  sortByOrb,
  minByOrb,
} = require("../domain/aspect_selection");

async function renderSoraLine(story, deps = {}) {
  const dict = deps?.dict || require("../../dict");
  const includeHeader = deps?.includeHeader !== false;
  const includeAspect = deps?.includeAspect !== false;
  const isPaid = deps?.paid === true;
  const dateLabel = formatDateLabel(story?.meta?.date_local);
  const asOfISO = story?.meta?.as_of || null;

  const headerLine = `🌌 きょうのそら｜${dateLabel}`;
  const listTitleAll = SPEC.labels.sora.listAll;

  const pub = story?.public || {};
  const skyAll = Array.isArray(pub.sky_all) ? pub.sky_all : [];
  const orbLimit = isPaid ? SPEC.orb.paid : SPEC.orb.free;

  const bodyOrder = [
    "sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto","lilith","chiron",
  ];

  const transitSigns = pub.transit_signs || {};
  const retroMap = buildRetrogradeMap(asOfISO, bodyOrder);

  const bodyLines = bodyOrder.map((k) => {
    let signKey = transitSigns?.[k]?.sign_key || "";
    let signLabel = transitSigns?.[k]?.sign_ja || "";
    if (!signLabel && signKey) signLabel = signJa(dict, signKey || "");
    signLabel = String(signLabel || "").trim();
    if (!signLabel) return "";
    const retro = retroMap[k] ? SPEC.retro.suffix : "";
    const glyph = glyphForBody(k);
    const bodyJa = (dict?.PLANETS_V2?.bodies?.[k]?.label_ja || dict?.POINTS_V1?.points?.[k]?.label_ja || k).toString();
    const bodyText = `${bodyJa}${retro}`;
    const prefix = glyph ? `${glyph} ` : "";
    return `${prefix}${bodyText}｜${signLabel}`;
  }).filter(Boolean);

  const allWithOrb = listWithOrb(skyAll);
  const within = filterWithinOrb(allWithOrb, orbLimit);
  const minItem = minByOrb(allWithOrb);

  let picked = [];
  let listTitleAspect = "";

  if (isPaid) {
    picked = within
      .map((r) => {
        const aKey = normalizeBodyKey(r?.a || "");
        const bKey = normalizeBodyKey(r?.b || "");
        return { item: r, score: scoreForAspect({ orb: r?.orb_deg, aKey, bKey }) };
      })
      .sort((a, b) => Number(b.score) - Number(a.score))
      .map((x) => x.item);
    listTitleAspect = SPEC.labels.sora.closestPaid(orbLimit);
  } else {
    if (within.length) {
      picked = sortByOrb(within).slice(0, 1);
      listTitleAspect = SPEC.labels.sora.closest;
    } else if (minItem) {
      picked = [minItem];
      const refOrb = Number(minItem?.orb_deg);
      const refText = Number.isFinite(refOrb) ? refOrb.toFixed(1) : "-";
      listTitleAspect = SPEC.labels.sora.closestRef(refText);
    } else {
      listTitleAspect = SPEC.labels.sora.closest;
    }
  }

  const aspectLines = (() => {
    if (!picked.length) return ["該当なし"];
    const lines = [];
    picked.forEach((item, idx) => {
      const aKey = normalizeBodyKey(item?.a || "");
      const bKey = normalizeBodyKey(item?.b || "");
      const aSign = item?.a_sign_ja || signJa(dict, item?.a_sign_key || "");
      const bSign = item?.b_sign_ja || signJa(dict, item?.b_sign_key || "");
      const aGlyph = glyphForBody(aKey);
      const bGlyph = glyphForBody(bKey);
      const aLabel = dict?.PLANETS_V2?.bodies?.[aKey]?.label_ja || dict?.POINTS_V1?.points?.[aKey]?.label_ja || aKey;
      const bLabel = dict?.PLANETS_V2?.bodies?.[bKey]?.label_ja || dict?.POINTS_V1?.points?.[bKey]?.label_ja || bKey;
      const aRetro = retroMap[aKey] ? SPEC.retro.suffix : "";
      const bRetro = retroMap[bKey] ? SPEC.retro.suffix : "";
      const aLabelR = `${aLabel}${aRetro}`;
      const bLabelR = `${bLabel}${bRetro}`;
      const aSignText = aSign ? `（${aSign}）` : "";
      const bSignText = bSign ? `（${bSign}）` : "";
      const line1 = `(T) ${aGlyph ? `${aGlyph} ` : ""}${aLabelR}${aSignText} × (T) ${bGlyph ? `${bGlyph} ` : ""}${bLabelR}${bSignText}`;

      const aspect = aspectInfo(dict, item?.type || item?.aspT || item?.aspect, item?.aspect_deg);
      const aspectLabel = aspect?.label_ja || String(item?.type || item?.aspT || item?.aspect || "");
      const aspectDeg = Number.isFinite(Number(item?.aspect_deg))
        ? Number(item.aspect_deg)
        : Number.isFinite(Number(aspect?.deg))
          ? Number(aspect.deg)
          : null;
      const degText = aspectDeg != null ? `${Math.round(aspectDeg)}°` : "";
      const orb = Number.isFinite(Number(item?.orb_deg)) ? Number(item.orb_deg) : null;
      const orbText = orb != null ? `${orb.toFixed(1)}` : "";
      const line2 = `${aspectLabel} ${degText}｜orb ${orbText}°`.trim();

      if (idx > 0) lines.push("");
      lines.push(line1, line2);
    });
    return lines;
  })();

  const aspectSummaryLines = (() => {
    if (!isPaid || !picked.length) return [];
    const counts = new Map();
    picked.forEach((item) => {
      const deg = Number.isFinite(Number(item?.aspect_deg)) ? Math.round(Number(item.aspect_deg)) : null;
      if (deg == null) return;
      counts.set(deg, (counts.get(deg) || 0) + 1);
    });
    if (!counts.size) return [];
    const parts = Array.from(counts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([deg, count]) => `${deg}°×${count}`);
    return [`${SPEC.labels.sora.aspectSummaryPrefix}${parts.join(" / ")}`];
  })();

  const distLines = formatElementModalityLines(pub.sky_strata || story?.meta?.sky_strata || null);
  const sep = SPEC.separators.section;

  const lines = [];
  if (includeHeader) lines.push(headerLine, "");
  lines.push(listTitleAll, "", ...bodyLines);

  if (includeAspect) {
    lines.push(
      "",
      sep,
      "",
      listTitleAspect,
      "",
      ...aspectSummaryLines,
      ...(aspectSummaryLines.length ? [""] : []),
      ...aspectLines
    );
  }

  if (distLines.length) {
    lines.push("", ...distLines);
  }

  return lines.filter((x) => x !== null && x !== undefined).join("\n").trim();
}

module.exports = { renderSoraLine };
