"use strict";

const { normalizeBodyKey } = require("../../domain/canonical");
const { formatDateLabel, glyphForBody, signJa, aspectInfo } = require("./format/line_common");

function safeNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function formatIsoDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10).replace(/-/g, ".");
}

function bodyLabelJa(dict, key) {
  if (!key) return "";
  const k = String(key).toLowerCase();
  return (
    dict?.PLANETS_V2?.bodies?.[k]?.label_ja ||
    dict?.POINTS_V1?.points?.[k]?.label_ja ||
    k
  );
}

function bodyWithSignLine(dict, key, signLabel) {
  if (!key) return "";
  const k = String(key).toLowerCase();
  const glyph = glyphForBody(k);
  const name = bodyLabelJa(dict, k);
  const sign = String(signLabel || "").trim();
  const signPart = sign ? `（${sign}）` : "";
  const prefix = glyph ? `${glyph} ` : "";
  return `${prefix}${name}${signPart}`.trim();
}

function pickObservationLine({ dict, transitSigns, skyStrata, houseFocus }) {
  const signCounts = {};
  Object.values(transitSigns || {}).forEach((item) => {
    const signKey = item?.sign_key;
    const signLabel = item?.sign_ja || signJa(dict, signKey || "");
    if (!signLabel) return;
    signCounts[signLabel] = (signCounts[signLabel] || 0) + 1;
  });

  const sortedSigns = Object.entries(signCounts)
    .map(([sign, count]) => ({ sign, count }))
    .sort((a, b) => (b.count - a.count) || a.sign.localeCompare(b.sign));

  const signFocus = sortedSigns.filter((row) => Number(row.count) >= 2);
  if (signFocus.length >= 2) {
    return `${signFocus[0].sign}・${signFocus[1].sign}付近に天体が多い配置`;
  }
  if (signFocus.length === 1) {
    return `${signFocus[0].sign}付近に天体が多い配置`;
  }

  const elementCount = skyStrata?.element_count || {};
  const elementJa = { fire: "火", earth: "地", air: "風", water: "水", mixed: "混合" };
  const sortedElements = Object.entries(elementCount)
    .map(([key, count]) => ({ key, count: Number(count || 0) }))
    .sort((a, b) => (b.count - a.count));

  if (sortedElements.length) {
    const top = sortedElements[0];
    const second = sortedElements[1];
    const topLabel = elementJa[top.key] || "";
    const secondLabel = elementJa[second?.key] || "";
    if (topLabel && secondLabel && top.count >= 3 && Number(second?.count || 0) >= 3) {
      return `${topLabel}と${secondLabel}のあいだに重なりが見える配置`;
    }
    if (topLabel) {
      return `${topLabel}の元素が強い配置`;
    }
  }

  const topHouse = houseFocus?.top?.[0];
  if (topHouse && Number(topHouse.house_no)) {
    return `第${topHouse.house_no}ハウス付近に天体が多い配置`;
  }

  return "天体が全体に散る配置";
}

function pickElementLine({ skyStrata }) {
  const topElement = skyStrata?.top_element || "mixed";
  const elementCount = skyStrata?.element_count || {};
  const total = Object.values(elementCount).reduce((sum, v) => sum + Number(v || 0), 0);
  const topCount = Number(elementCount[topElement] || 0);
  const ratio = total > 0 ? topCount / total : 0;

  const lines = {
    fire: "火の元素が多く、熱が立ち上がりやすい空になっています。",
    earth: "地の元素が多く、現実に落とし込みやすい空になっています。",
    air: "風の元素が多く、情報や言葉が動きやすい空になっています。",
    water: "水の元素が多く、直感や感情の層が厚い空になっています。",
    mixed: "元素が混ざり、層が行き来しやすい空になっています。",
  };

  if (!topElement || topElement === "mixed" || ratio < 0.35) {
    return lines.mixed;
  }
  return lines[topElement] || lines.mixed;
}

function formatAspectLines({ dict, aspect, transitSigns }) {
  if (!aspect) {
    return ["該当なし"];
  }

  const aKey = normalizeBodyKey(aspect?.a || "");
  const bKey = normalizeBodyKey(aspect?.b || "");

  const aSign =
    aspect?.a_sign_ja ||
    signJa(dict, aspect?.a_sign_key || "") ||
    transitSigns?.[aKey]?.sign_ja ||
    "";
  const bSign =
    aspect?.b_sign_ja ||
    signJa(dict, aspect?.b_sign_key || "") ||
    transitSigns?.[bKey]?.sign_ja ||
    "";

  const lineA = bodyWithSignLine(dict, aKey, aSign);
  const lineB = bodyWithSignLine(dict, bKey, bSign);

  const info = aspectInfo(dict, aspect?.type || aspect?.aspect, aspect?.aspect_deg);
  const aspectLabel = info?.label_ja || String(aspect?.type || "").toUpperCase();
  const deg = Number.isFinite(Number(info?.deg)) ? Number(info.deg) : safeNumber(aspect?.aspect_deg);
  const degLabel = Number.isFinite(Number(deg)) ? `${deg}°` : "";
  const orb = safeNumber(aspect?.orb_deg);
  const orbLabel = Number.isFinite(Number(orb)) ? `orb ${orb.toFixed(2)}°` : "orb -";

  return [
    lineA || "",
    `× ${lineB || ""}`.trim(),
    "",
    `${aspectLabel} ${degLabel}`.trim(),
    orbLabel,
  ].filter((line) => line !== "");
}

function formatAspectBlockForCaption({ dict, aspect, transitSigns }) {
  if (!aspect) return [];
  const aKey = normalizeBodyKey(aspect?.a || "");
  const bKey = normalizeBodyKey(aspect?.b || "");

  const aSign =
    aspect?.a_sign_ja ||
    signJa(dict, aspect?.a_sign_key || "") ||
    transitSigns?.[aKey]?.sign_ja ||
    "";
  const bSign =
    aspect?.b_sign_ja ||
    signJa(dict, aspect?.b_sign_key || "") ||
    transitSigns?.[bKey]?.sign_ja ||
    "";

  const lineA = bodyWithSignLine(dict, aKey, aSign);
  const lineB = bodyWithSignLine(dict, bKey, bSign);

  const info = aspectInfo(dict, aspect?.type || aspect?.aspect, aspect?.aspect_deg);
  const aspectLabel = info?.label_ja || String(aspect?.type || "").toUpperCase();
  const deg = Number.isFinite(Number(info?.deg)) ? Number(info.deg) : safeNumber(aspect?.aspect_deg);
  const degLabel = Number.isFinite(Number(deg)) ? `${deg}°` : "";
  const orb = safeNumber(aspect?.orb_deg);
  const orbLabel = Number.isFinite(Number(orb)) ? `orb ${orb.toFixed(2)}` : "orb -";

  return [
    lineA || "",
    "×",
    lineB || "",
    `${aspectLabel} ${degLabel}`.trim(),
    orbLabel,
  ].filter((line) => line !== "");
}

function formatLongThemeLines({ dict, longRow, fallbackLabel = "長期の構造は更新中です。" }) {
  if (!longRow) {
    return [fallbackLabel];
  }

  const aKey = normalizeBodyKey(longRow?.a || "");
  const bKey = normalizeBodyKey(longRow?.b || "");
  const aSign = longRow?.a_sign_ja || signJa(dict, longRow?.a_sign_key || "") || "";
  const bSign = longRow?.b_sign_ja || signJa(dict, longRow?.b_sign_key || "") || "";

  const lineA = bodyWithSignLine(dict, aKey, aSign);
  const lineB = bodyWithSignLine(dict, bKey, bSign);

  const start = formatIsoDate(longRow?.start_at);
  const end = formatIsoDate(longRow?.end_at);
  const range = start && end ? `${start} → ${end}` : start || end || "";

  return [lineA || "", `× ${lineB || ""}`.trim(), "", range].filter((line) => line !== "");
}

function renderIGCaption(story, deps = {}) {
  const dict = deps?.dict || require("../../content/dict");

  const dateLabel = formatDateLabel(story?.meta?.date_local || story?.public?.date_local || "");
  const transit = story?.public?.transit_signs || {};

  const sunSign = transit?.sun?.sign_ja || signJa(dict, transit?.sun?.sign_key || "");
  const moonSign = transit?.moon?.sign_ja || signJa(dict, transit?.moon?.sign_key || "");

  const igOut = story?.outputs?.ig || {};
  const parts = igOut?.parts || {};
  const captionCenterRaw = parts.caption_center || "";
  const captionCenter = String(captionCenterRaw || "").trim();

  const observationRaw = parts.caption_observation || "";
  const observation = String(observationRaw || "").trim();

  const resonance = story?.outputs?.ig?.source?.resonance_aspect || null;

  const buildCaptionFallback = () => {
    const aKey = normalizeBodyKey(resonance?.a || "");
    const bKey = normalizeBodyKey(resonance?.b || "");
    const aName = bodyLabelJa(dict, aKey);
    const bName = bodyLabelJa(dict, bKey);
    const info = aspectInfo(dict, resonance?.type || resonance?.aspect, resonance?.aspect_deg);
    const label = info?.label_ja || "";
    const deg = Number.isFinite(Number(info?.deg)) ? `${Number(info.deg)}°` : "";
    const aspectLabel = [label, deg].filter(Boolean).join(" ").trim();
    const line1 = `${sunSign || "—"}の太陽と、${moonSign || "—"}の月。`;
    const line2 = "静かな基調が空に残ります。";
    const line3 = (aName && bName && aspectLabel)
      ? `${aName}と${bName}の角度が${aspectLabel}として残ります。`
      : "空の接続は、内側に細い流れを置きます。";
    return [line1, line2, line3].join("\n");
  };

  const buildObservationFallback = () => {
    const aKey = normalizeBodyKey(resonance?.a || "");
    const bKey = normalizeBodyKey(resonance?.b || "");
    const aName = bodyLabelJa(dict, aKey);
    const bName = bodyLabelJa(dict, bKey);
    if (aName && bName) return `${aName}と${bName}の接続が、内側に静かな流れを残す配置。`;
    return "内側の変化が、外側の流れに静かに重なる配置。";
  };

  const lines = [];
  lines.push("🌌 今日の星の配置");
  if (dateLabel) lines.push(dateLabel);
  lines.push("");
  lines.push(`☉ 太陽｜${sunSign || ""}`.trim());
  lines.push(`☽ 月｜${moonSign || ""}`.trim());
  lines.push("");
  const captionBlock = captionCenter || buildCaptionFallback();
  captionBlock.split(/\n/).forEach((l) => lines.push(l));
  lines.push("");
  lines.push("✦ 観測ポイント");
  lines.push(observation || buildObservationFallback());
  lines.push("");
  lines.push("星は答えを示さず、");
  lines.push("構造だけを置いています。");
  lines.push("");
  lines.push("解釈はあなたのもの。");
  lines.push("");
  lines.push("LINEでは毎朝、");
  lines.push("ソラの配置とネイタルとの重なりも届けています。");

  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

module.exports = { renderIGCaption, pickObservationLine };
