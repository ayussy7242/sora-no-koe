"use strict";

const { normalizeBodyKey } = require("../../domain/canonical");
const { bodyLabelJa } = require("../shared/text/tokens");
const { formatDateLabel, glyphForBody, signJa, aspectInfo } = require("./format/common");
const { formatJstTimeLabel } = require("../../utils/time");
const { refinePeakTime } = require("../../domain/aspect/proximity");
const {
  buildObservationAxisSummary,
  formatObservationFallback,
} = require("./ig_observation");

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
  const summary = buildObservationAxisSummary({ dict, transitSigns, skyStrata, houseFocus });
  return formatObservationFallback(summary);
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

function buildResonancePeakLabel({ dict, aspect, dateLocal, asOfISO }) {
  if (!aspect) return { dateLabel: formatDateLabel(dateLocal || ""), timeLabel: "" };
  const info = aspectInfo(dict, aspect?.type || aspect?.aspect, aspect?.aspect_deg);
  const deg = Number.isFinite(Number(info?.deg)) ? Number(info.deg) : safeNumber(aspect?.aspect_deg);
  const aKey = normalizeBodyKey(aspect?.a || "");
  const bKey = normalizeBodyKey(aspect?.b || "");
  const seedISO = aspect?.peak_at || aspect?.peak_at_iso || aspect?.peak_at_utc || null;
  const fallbackISO = asOfISO || (dateLocal ? `${dateLocal}T12:00:00+09:00` : undefined);
  const peakTime = Number.isFinite(Number(deg))
    ? refinePeakTime({
      kind: "transit-transit",
      aKey,
      bKey,
      aspectDeg: deg,
      seedISO,
      fallbackISO,
    })
    : null;
  const dateLabel = formatDateLabel(dateLocal || "");
  const timeLabel = peakTime ? formatJstTimeLabel(peakTime, { fallback: "" }) : "";
  return { dateLabel, timeLabel };
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
  const skyStrata = story?.public?.sky_strata || {};
  const elementCount = skyStrata?.element_count || {};
  const modeCount = skyStrata?.mode_count || skyStrata?.modality_count || {};
  const elementLine = `🔥 火${safeNumber(elementCount.fire) ?? 0}　🪨 地${safeNumber(elementCount.earth) ?? 0}　💨 風${safeNumber(elementCount.air) ?? 0}　💧 水${safeNumber(elementCount.water) ?? 0}`;
  const modeLine = `🏃 活動${safeNumber(modeCount.cardinal) ?? 0}　🧱 不動${safeNumber(modeCount.fixed) ?? 0}　🌿 柔軟${safeNumber(modeCount.mutable) ?? 0}`;
  const captionCenterRaw = parts.caption_center || "";
  const captionCenter = String(captionCenterRaw || "").trim();

  const observationRaw = parts.caption_observation || "";
  const observation = (() => {
    const raw = String(observationRaw || "").trim();
    if (!raw) return "";
    const lines = raw.split(/\r?\n/).map((l) => l.trim());
    while (lines.length && !lines[0]) lines.shift();
    if (lines[0] && /^✦\s*観測ポイント/.test(lines[0])) {
      lines.shift();
      while (lines.length && !lines[0]) lines.shift();
    }
    return lines.join("\n").trim();
  })();

  const resonance = story?.outputs?.ig?.source?.resonance_aspect || null;
  const tags = normalizeHashtags(parts.hashtags_morning, [
    "#占星術",
    "#ホロスコープ",
    "#星読み",
    "#西洋占星術",
    "#astrology",
  ]);

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
  const resonanceLines = formatAspectBlockForCaption({ dict, aspect: resonance, transitSigns: transit });
  lines.push("【今日の共鳴】");
  resonanceLines.forEach((l) => lines.push(l));
  lines.push("");
  lines.push("✦ 観測ポイント");
  lines.push(observation || buildObservationFallback());
  lines.push("");
  lines.push("✦ 今日のソラ属性");
  lines.push(elementLine);
  lines.push(modeLine);
  lines.push("");
  lines.push("星は答えを示さず、");
  lines.push("構造だけを置いています。");
  lines.push("");
  lines.push("解釈はあなたのもの。");
  lines.push("");
  lines.push("LINEでは毎朝、");
  lines.push("ソラの配置とネイタルとの重なりも届けています🌌");
  lines.push("");
  lines.push("登録時には、");
  lines.push("生まれた瞬間の配置をまとめた設計図（Blueprint）もお届けしています🌙");
  lines.push("");
  tags.forEach((tag) => lines.push(tag));

  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

function buildObservationLine(story, observationRaw, dict, resonance) {
  const raw = String(observationRaw || "").trim();
  if (raw) {
    const lines = raw.split(/\r?\n/).map((l) => l.trim());
    while (lines.length && !lines[0]) lines.shift();
    if (lines[0] && /^✦\s*観測ポイント/.test(lines[0])) {
      lines.shift();
      while (lines.length && !lines[0]) lines.shift();
    }
    const joined = lines.join("\n").trim();
    if (joined) return joined;
  }

  const aKey = normalizeBodyKey(resonance?.a || "");
  const bKey = normalizeBodyKey(resonance?.b || "");
  const aName = bodyLabelJa(dict, aKey);
  const bName = bodyLabelJa(dict, bKey);
  if (aName && bName) return `${aName}と${bName}の接続が、内側に静かな流れを残す配置。`;
  return "内側の変化が、外側の流れに静かに重なる配置。";
}

function renderIGCaptionMorning(story, deps = {}) {
  const dict = deps?.dict || require("../../content/dict");
  const dateLabel = formatDateLabel(story?.meta?.date_local || story?.public?.date_local || "");
  const transit = story?.public?.transit_signs || {};
  const sunSign = transit?.sun?.sign_ja || signJa(dict, transit?.sun?.sign_key || "");
  const moonSign = transit?.moon?.sign_ja || signJa(dict, transit?.moon?.sign_key || "");
  const igOut = story?.outputs?.ig || {};
  const parts = igOut?.parts || {};
  const resonance = story?.outputs?.ig?.source?.resonance_aspect || null;

  const skyStrata = story?.public?.sky_strata || {};
  const elementCount = skyStrata?.element_count || {};
  const modeCount = skyStrata?.mode_count || skyStrata?.modality_count || {};
  const elementLine = `🔥 火${safeNumber(elementCount.fire) ?? 0}　🪨 地${safeNumber(elementCount.earth) ?? 0}　💨 風${safeNumber(elementCount.air) ?? 0}　💧 水${safeNumber(elementCount.water) ?? 0}`;
  const modeLine = `🏃 活動${safeNumber(modeCount.cardinal) ?? 0}　🧱 不動${safeNumber(modeCount.fixed) ?? 0}　🌿 柔軟${safeNumber(modeCount.mutable) ?? 0}`;

  const captionCenterRaw = parts.caption_center || "";
  const captionCenter = String(captionCenterRaw || "").trim();
  const captionBlock = captionCenter || buildCaptionFallbackForMorning({ story, dict, sunSign, moonSign, resonance });
  const observation = buildObservationLine(story, parts.caption_observation, dict, resonance);

  const lines = [];
  lines.push(`🌌 ${dateLabel} 今日の星の配置`.trim());
  lines.push("");
  lines.push(`☉ 太陽｜${sunSign || ""}`.trim());
  lines.push(`☽ 月｜${moonSign || ""}`.trim());
  lines.push("");
  captionBlock.split(/\n/).forEach((l) => lines.push(l));
  lines.push("");
  lines.push("✦ 観測ポイント");
  lines.push(observation);
  lines.push("");
  lines.push("✦ 今日のソラ属性");
  lines.push(elementLine);
  lines.push(modeLine);
  lines.push("");
  lines.push("星は答えを示さず、");
  lines.push("構造だけを置いています。");
  lines.push("");
  lines.push("解釈はあなたのもの。");
  lines.push("");
  lines.push("LINEでは毎朝、");
  lines.push("ソラの配置とネイタルとの重なりも届けています🌌");
  lines.push("");
  lines.push("登録時には、");
  lines.push("生まれた瞬間の配置をまとめた設計図（Blueprint）もお届けしています🌙");
  lines.push("");
  lines.push("#占星術");
  lines.push("#ホロスコープ");
  lines.push("#星読み");
  lines.push("#西洋占星術");
  lines.push("#astrology");

  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

function buildCaptionFallbackForMorning({ story, dict, sunSign, moonSign, resonance }) {
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
}

function normalizeHashtags(raw, fallback = []) {
  const text = String(raw || "").trim();
  const matches = text.match(/[#＃][^\s#＃]+/g) || [];
  const cleaned = matches
    .map((tag) => tag.replace(/[#＃]/g, "").trim())
    .filter(Boolean)
    .map((tag) => `#${tag}`);
  const unique = [];
  cleaned.forEach((tag) => {
    if (!unique.includes(tag)) unique.push(tag);
  });
  const seed = unique.length ? unique : fallback;
  const out = seed.slice(0, 5);
  if (out.length < 5) {
    fallback.forEach((tag) => {
      if (out.length >= 5) return;
      if (!out.includes(tag)) out.push(tag);
    });
  }
  return out.slice(0, 5);
}

function renderIGCaptionResonance(story, deps = {}) {
  const dict = deps?.dict || require("../../content/dict");
  const dateLabel = formatDateLabel(story?.meta?.date_local || story?.public?.date_local || "");
  const asOfISO = story?.meta?.as_of || null;
  const resonance = story?.outputs?.ig?.source?.resonance_aspect || null;
  const transit = story?.public?.transit_signs || {};
  const igOut = story?.outputs?.ig || {};
  const parts = igOut?.parts || {};
  const tags = normalizeHashtags(parts.hashtags_resonance, [
    "#占星術",
    "#アスペクト",
    "#星読み",
    "#西洋占星術",
    "#astrology",
  ]);
  const resonanceLines = formatAspectBlockForCaption({ dict, aspect: resonance, transitSigns: transit });
  const resonanceText = String(parts.resonance_caption || parts.resonance || "").trim();
  const fallback = resonanceText
    ? resonanceText
    : (resonanceLines.length ? "配置が重なることで、流れが一時的に揺れやすくなります。" : "共鳴の角度は、静かに輪郭を残します。");
  const peak = buildResonancePeakLabel({
    dict,
    aspect: resonance,
    dateLocal: story?.meta?.date_local || story?.public?.date_local || "",
    asOfISO,
  });
  const peakHeader = [peak.dateLabel, peak.timeLabel].filter(Boolean).join(" ").trim();

  const lines = [];
  lines.push(`🪐 今日の共鳴 ${peakHeader || dateLabel}`.trim());
  lines.push("");
  lines.push("【今日の共鳴】");
  resonanceLines.forEach((l) => lines.push(l));
  lines.push("");
  lines.push(resonanceText || fallback);
  lines.push("");
  lines.push("LINE登録であなたの星の設計図(PDF)プレゼント中🎁");
  lines.push("");
  tags.forEach((tag) => lines.push(tag));

  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

function renderIGCaptionNight(story, deps = {}) {
  const dict = deps?.dict || require("../../content/dict");
  const dateLabel = formatDateLabel(story?.meta?.date_local || story?.public?.date_local || "");
  const igOut = story?.outputs?.ig || {};
  const parts = igOut?.parts || {};
  let moonText = String(parts.moon_caption || "").trim();
  const tags = normalizeHashtags(parts.hashtags_night, [
    "#占星術",
    "#月",
    "#月相",
    "#星読み",
    "#astrology",
  ]);

  const header = `🌌 ${dateLabel} 今日の夜の月`.trim();
  const normalizeLine = (s) => String(s || "").replace(/\s+/g, "").trim();
  const isNightTitleLine = (line) => {
    const l = String(line || "").trim();
    if (!l) return false;
    // Accept minor spacing variants: "🌌2026.04.14 今日の夜の月"
    if (dateLabel && normalizeLine(l) === normalizeLine(header)) return true;
    if (dateLabel && l.startsWith("🌌") && l.includes(dateLabel) && l.includes("今日の夜の月")) return true;
    // Fallback: if line contains "今日の夜の月" and a date-like label
    return l.startsWith("🌌") && l.includes("今日の夜の月") && /\d{4}\.\d{2}\.\d{2}/.test(l);
  };

  if (moonText) {
    const linesRaw = moonText.split("\n").map((l) => l.trim()).filter(Boolean);
    // AI がタイトルを入れてきた場合は捨てる（タイトルは固定で付ける）
    while (linesRaw.length && isNightTitleLine(linesRaw[0])) linesRaw.shift();
    moonText = linesRaw.join("\n").trim();
  }

  const lines = [];
  lines.push(header);
  if (moonText) {
    lines.push("");
    lines.push(moonText);
  }
  lines.push("");
  lines.push("LINEで毎朝星の配置配信中");
  lines.push("");
  tags.forEach((tag) => lines.push(tag));

  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

function splitSentences(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const matches = raw.match(/[^。！？]+[。！？]?/g);
  if (!matches) return [raw];
  return matches.map((s) => s.trim()).filter(Boolean);
}

function takeSentences(text, max = 2) {
  const sentences = splitSentences(text);
  if (!sentences.length) return "";
  const picked = sentences.slice(0, Math.max(1, max)).join("");
  return picked.trim();
}

function renderIGCaptionVariant(story, deps = {}) {
  const dict = deps?.dict || require("../../content/dict");
  const variant = String(deps?.variant || deps?.slot || "").toLowerCase();

  if (variant === "morning") {
    return renderIGCaptionMorning(story, { dict });
  }

  if (variant === "resonance") {
    return renderIGCaptionResonance(story, { dict });
  }

  if (variant === "night") {
    return renderIGCaptionNight(story, { dict });
  }

  return renderIGCaption(story, deps);
}

module.exports = {
  renderIGCaption,
  renderIGCaptionVariant,
  renderIGCaptionMorning,
  renderIGCaptionResonance,
  renderIGCaptionNight,
  pickObservationLine,
};
