"use strict";

const { buildRetrogradeMap } = require("../../domain/astro/retrograde");
const { SPEC } = require("../../config/sora_spec");
const { resolveChannelConfig } = require("../../config/aspect_channel_config");
const { normalizeBodyKey } = require("../../domain/canonical");
const { CORE_PLANETS, EXTENDED_PLANETS, MINOR_BODIES } = require("../../domain/astro/constants");
const { listImportantResonances, applyLineBias } = require("../../domain/resonance");
const {
  formatDateLabel,
  glyphForBody,
  signJa,
  formatAspectDisplay,
  formatElementModalityLines,
} = require("../format/format/common");
const { resolveHouseNumber, HOUSE_BASIS } = require("../../domain/astro/compute");
const {
  listWithOrb,
  filterWithinOrb,
  minByOrb,
} = require("../../domain/aspect/selection");
const { formatTodayMoonLines } = require("../../domain/moon");

function normalizeResonanceDebugItem(item) {
  if (!item) return null;
  return {
    key: item?.key || "",
    types: item?.types || [],
    score: item?.score ?? null,
    reasons: item?.reasons || [],
    channel_bias: item?.channel_bias || null,
    orb: item?.flags?.orb ?? null,
    a: item?.candidate?.a || null,
    b: item?.candidate?.b || null,
    aspect_deg: item?.candidate?.aspect_deg ?? null,
    a_sign_key: item?.candidate?.a_sign_key || null,
    b_sign_key: item?.candidate?.b_sign_key || null,
  };
}

function isMajorAspectDeg(deg) {
  if (!Number.isFinite(Number(deg))) return false;
  const d = Math.round(Number(deg));
  return d === 0 || d === 60 || d === 90 || d === 120 || d === 180;
}

function isCorePairCandidate(candidate) {
  const aKey = normalizeBodyKey(candidate?.a || "");
  const bKey = normalizeBodyKey(candidate?.b || "");
  if (!aKey || !bKey) return false;
  return CORE_PLANETS.includes(aKey) && CORE_PLANETS.includes(bKey);
}

function buildLineResonanceDebug(story, deps = {}) {
  const dict = deps?.dict || require("../../content/dict");
  const isPaid = deps?.paid === true;
  const LINE_SORA_CFG = resolveChannelConfig("line_sora");
  const fallbackMode = deps?.deepMode ? "deep" : "core";
  const cfgMode = isPaid ? (LINE_SORA_CFG.useDeepPaid ? "deep" : "core") : (LINE_SORA_CFG.useDeepFree ? "deep" : "core");
  const resonanceMode = deps?.resonanceMode || cfgMode || fallbackMode;

  const pub = story?.public || {};
  const skyAll = Array.isArray(pub.sky_all) ? pub.sky_all : [];
  const coreBodies = new Set(CORE_PLANETS);
  const deepBodies = new Set(MINOR_BODIES);
  const allWithOrb = listWithOrb(skyAll);
  const coreList = allWithOrb.filter((r) => {
    const aKey = normalizeBodyKey(r?.a || "");
    const bKey = normalizeBodyKey(r?.b || "");
    return coreBodies.has(aKey) && coreBodies.has(bKey);
  });
  const deepList = allWithOrb.filter((r) => {
    const aKey = normalizeBodyKey(r?.a || "");
    const bKey = normalizeBodyKey(r?.b || "");
    return deepBodies.has(aKey) || deepBodies.has(bKey);
  });
  const useDeep = resonanceMode === "deep";
  const resonancePool = useDeep
    ? (deepList.length ? deepList : coreList)
    : (coreList.length ? coreList : deepList);

  const orbLimit = isPaid
    ? (LINE_SORA_CFG.orbLimitPaid ?? SPEC.orb.paid)
    : (LINE_SORA_CFG.orbLimitFree ?? SPEC.orb.free);
  const within = filterWithinOrb(resonancePool, orbLimit);
  const minItem = minByOrb(resonancePool);
  const skyTop = Array.isArray(pub.sky_top) ? pub.sky_top : [];

  const importantWithin = applyLineBias(listImportantResonances({
    story,
    candidates: within,
    skyTop,
    resonanceMode,
  }));

  const picked = importantWithin.length ? importantWithin[0] : null;
  const topItems = importantWithin.slice(0, 5);
  const top = topItems.map(normalizeResonanceDebugItem);
  const countMajorAspect = within.filter((row) => isMajorAspectDeg(row?.aspect_deg)).length;
  const countCorePair = within.filter((row) => isCorePairCandidate(row)).length;
  const countMajorAspectInTop = topItems.filter((item) => isMajorAspectDeg(item?.candidate?.aspect_deg)).length;
  const countCorePairInTop = topItems.filter((item) => isCorePairCandidate(item?.candidate)).length;
  const stats = {
    resonance_mode: resonanceMode,
    count_candidates: within.length,
    count_major_aspect: countMajorAspect,
    count_core_pair: countCorePair,
    count_major_aspect_in_top: countMajorAspectInTop,
    count_core_pair_in_top: countCorePairInTop,
  };
  if (picked) {
    return { picked: normalizeResonanceDebugItem(picked), top, stats };
  }

  if (minItem) {
    return {
      picked: {
        key: "",
        types: ["fallback"],
        score: null,
        reasons: ["fallback_min_orb"],
        orb: Number.isFinite(Number(minItem?.orb_deg)) ? Number(minItem.orb_deg) : null,
        a: minItem?.a || null,
        b: minItem?.b || null,
        aspect_deg: minItem?.aspect_deg ?? null,
        a_sign_key: minItem?.a_sign_key || null,
        b_sign_key: minItem?.b_sign_key || null,
      },
      top,
      stats,
    };
  }

  return { picked: null, top, stats };
}

async function renderSoraLine(story, deps = {}) {
  const dict = deps?.dict || require("../../content/dict");
  const includeHeader = deps?.includeHeader !== false;
  const includeAspect = deps?.includeAspect !== false;
  const includeHouse = deps?.includeHouse === true;
  const isPaid = deps?.paid === true;
  const resonanceDaily = deps?.resonanceDaily || null;
  const LINE_SORA_CFG = resolveChannelConfig("line_sora");
  const fallbackMode = deps?.deepMode ? "deep" : "core";
  const cfgMode = isPaid ? (LINE_SORA_CFG.useDeepPaid ? "deep" : "core") : (LINE_SORA_CFG.useDeepFree ? "deep" : "core");
  const resonanceMode = deps?.resonanceMode || cfgMode || fallbackMode;
  const dateLabel = formatDateLabel(story?.meta?.date_local);
  const asOfISO = story?.meta?.as_of || null;

  const headerLine = `🌌 きょうのそら｜${dateLabel}`;
  const listTitleAll = SPEC.labels.sora.listAll;

  const pub = story?.public || {};
  const skyAll = Array.isArray(pub.sky_all) ? pub.sky_all : [];
  const orbLimit = isPaid
    ? (LINE_SORA_CFG.orbLimitPaid ?? SPEC.orb.paid)
    : (LINE_SORA_CFG.orbLimitFree ?? SPEC.orb.free);

  const bodyOrder = EXTENDED_PLANETS;

  const transitSigns = pub.transit_signs || {};
  const retroMap = buildRetrogradeMap(asOfISO, bodyOrder);

  const houseLabelFor = (signKey) => {
    if (!includeHouse || !asOfISO) return "";
    const houseNo = resolveHouseNumber({
      basis: HOUSE_BASIS.TRANSIT_PUBLIC,
      signKey,
      asOfISO,
      dict,
    });
    return houseNo ? `｜第${houseNo}ハウス` : "";
  };

  const bodyLines = [];
  const breakBefore = new Set(["lilith"]);
  bodyOrder.forEach((k) => {
    let signKey = transitSigns?.[k]?.sign_key || "";
    let signLabel = transitSigns?.[k]?.sign_ja || "";
    if (!signLabel && signKey) signLabel = signJa(dict, signKey || "");
    signLabel = String(signLabel || "").trim();
    if (!signLabel) return;
    const retro = retroMap[k] ? SPEC.retro.suffix : "";
    const glyph = glyphForBody(k);
    const bodyJa = (dict?.PLANETS_V2?.bodies?.[k]?.label_ja || dict?.POINTS_V1?.points?.[k]?.label_ja || k).toString();
    const bodyText = `${bodyJa}${retro}`;
    const prefix = glyph ? `${glyph} ` : "";
    const houseText = includeHouse ? houseLabelFor(signKey) : "";
    const line = `${prefix}${bodyText}｜${signLabel}${houseText}`;
    if (breakBefore.has(k) && bodyLines.length && bodyLines[bodyLines.length - 1] !== "") {
      bodyLines.push("");
    }
    bodyLines.push(line);
  });

  const coreBodies = new Set(CORE_PLANETS);
  const deepBodies = new Set(MINOR_BODIES);
  const allWithOrb = listWithOrb(skyAll);
  const coreList = allWithOrb.filter((r) => {
    const aKey = normalizeBodyKey(r?.a || "");
    const bKey = normalizeBodyKey(r?.b || "");
    return coreBodies.has(aKey) && coreBodies.has(bKey);
  });
  const deepList = allWithOrb.filter((r) => {
    const aKey = normalizeBodyKey(r?.a || "");
    const bKey = normalizeBodyKey(r?.b || "");
    return deepBodies.has(aKey) || deepBodies.has(bKey);
  });
  const useDeep = resonanceMode === "deep";
  const resonancePool = useDeep
    ? (deepList.length ? deepList : coreList)
    : (coreList.length ? coreList : deepList);
  const within = filterWithinOrb(resonancePool, orbLimit);
  const minItem = minByOrb(resonancePool);
  const skyTop = Array.isArray(pub.sky_top) ? pub.sky_top : [];
  const importantWithin = listImportantResonances({
    story,
    candidates: within,
    skyTop,
    resonanceMode,
  });

  let picked = [];
  let listTitleAspect = "";

  if (isPaid) {
    const maxItems = Number.isFinite(Number(LINE_SORA_CFG.maxItemsPaid))
      ? Number(LINE_SORA_CFG.maxItemsPaid)
      : null;
    picked = importantWithin.map((x) => x.candidate);
    if (Number.isFinite(maxItems)) {
      picked = picked.slice(0, maxItems);
    }
    listTitleAspect = SPEC.labels.sora.closestPaid(orbLimit);
  } else {
    if (resonanceDaily) {
      picked = [resonanceDaily];
      listTitleAspect = SPEC.labels.sora.closest;
    } else if (importantWithin.length) {
      const maxItems = Number.isFinite(Number(LINE_SORA_CFG.maxItemsFree))
        ? Number(LINE_SORA_CFG.maxItemsFree)
        : 1;
      picked = importantWithin.slice(0, maxItems).map((x) => x.candidate);
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
      const line1 = `(T) ${aGlyph ? `${aGlyph} ` : ""}${aLabelR}${aSignText}`;
      const line2 = `× (T) ${bGlyph ? `${bGlyph} ` : ""}${bLabelR}${bSignText}`;

      const aspect = formatAspectDisplay({
        dict,
        rawType: item?.type || item?.aspT || item?.aspect,
        aspectDeg: item?.aspect_deg,
        orbDeg: item?.orb_deg,
        orbPrecision: 1,
      });
      const line3 = aspect.line;
      const line3b = aspect.orbText ? `orb ${aspect.orbText}` : "";

      if (idx > 0) lines.push("");
      lines.push(line1, line2, line3);
      if (line3b) lines.push(line3b);
    });
    return lines;
  })();

  const aspectSummaryLines = (() => {
    if (!isPaid || !picked.length) return [];
    const counts = new Map();
    picked.forEach((item) => {
      const aspect = formatAspectDisplay({
        dict,
        rawType: item?.type || item?.aspT || item?.aspect,
        aspectDeg: item?.aspect_deg,
      });
      const deg = aspect?.deg != null ? Math.round(Number(aspect.deg)) : null;
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
  if (distLines.length) {
    lines.push("", ...distLines);
  }

  const moonInfo = formatTodayMoonLines({ asOfISO, story, dict });
  if (moonInfo.lines.length) {
    lines.push("", ...moonInfo.lines);
  }

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

  return lines.filter((x) => x !== null && x !== undefined).join("\n").trim();
}

module.exports = {
  renderSoraLine,
  buildLineResonanceDebug,
};
