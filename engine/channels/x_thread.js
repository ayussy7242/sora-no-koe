"use strict";

/**
 * channels/x_thread.js
 * - X用 2分割スレッド（配置一覧 / 共鳴）
 * - 返り値は 1つの文字列（区切りで分割）
 */

const { buildRetrogradeMap } = require("../astro/retrograde");
const { SPEC } = require("../config/sora_spec");
const { normalizeBodyKey } = require("../domain/canonical");
const {
  formatDateLabel,
  glyphForBody,
  signJa,
  aspectInfo,
  formatElementModalityLines,
} = require("../render_parts/format/line_common");
const { listWithOrb, filterWithinOrb, sortByOrb, minByOrb } = require("../domain/aspect_selection");

const THREAD_SEP = "\n\n---\n\n";

function renderXThread(story, deps = {}) {
  const dict = deps?.dict || require("../../dict");
  const dateLabel = formatDateLabel(story?.meta?.date_local);
  const asOfISO = story?.meta?.as_of || null;

  const pub = story?.public || {};
  const skyAll = Array.isArray(pub.sky_all) ? pub.sky_all : [];
  const transitSigns = pub.transit_signs || {};

  const bodyOrder = [
    "sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto","lilith","chiron",
  ];

  const retroMap = buildRetrogradeMap(asOfISO, bodyOrder);

  // ---------- Part 1: 配置一覧 ----------
  const bodyLines = bodyOrder.map((k) => {
    let signKey = transitSigns?.[k]?.sign_key || "";
    let signLabel = transitSigns?.[k]?.sign_ja || "";
    if (!signLabel && signKey) signLabel = signJa(dict, signKey || "");
    signLabel = String(signLabel || "").trim();
    if (!signLabel) return "";

    const glyph = glyphForBody(k);
    const bodyJa = (dict?.PLANETS_V2?.bodies?.[k]?.label_ja || dict?.POINTS_V1?.points?.[k]?.label_ja || k).toString();
    const retro = retroMap[k] ? SPEC.retro.suffix : "";
    const bodyText = `${bodyJa}${retro}`;
    const prefix = glyph ? `${glyph} ` : "";
    return `${prefix}${bodyText}｜${signLabel}`;
  }).filter(Boolean);

  const distLines = formatElementModalityLines(pub.sky_strata || story?.meta?.sky_strata || null);

  const part1Lines = [
    `🌌 きょうのそら｜${dateLabel}`,
    "",
    SPEC.labels.sora.listAll,
    "",
    ...bodyLines,
    "",
    ...distLines,
  ];

  // ---------- Part 2: 共鳴 ----------
  const orbLimit = SPEC.orb.free;
  const allWithOrb = listWithOrb(skyAll);
  const within = filterWithinOrb(allWithOrb, orbLimit);
  const minItem = minByOrb(allWithOrb);

  let picked = [];
  let listTitleAspect = "";
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

  const aspectLines = (() => {
    if (!picked.length) return ["該当なし"];
    const item = picked[0];
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

    return [line1, line2];
  })();

  const part2Lines = [
    listTitleAspect,
    "",
    ...aspectLines,
  ];

  return part1Lines.filter(Boolean).join("\n").trim() + THREAD_SEP + part2Lines.filter(Boolean).join("\n").trim();
}

module.exports = { renderXThread, THREAD_SEP };
