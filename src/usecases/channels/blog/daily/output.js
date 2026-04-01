"use strict";

const dict = require("../../../../content/dict");
const { SPEC } = require("../../../../config/sora_spec");
const { buildRetrogradeMap } = require("../../../../domain/astro/retrograde");
const { formatDateYmd } = require("../../../../domain/astro/compute");
const { normalizeBodyKey, normalizeSignKey, normalizeAspectKey } = require("../../../../domain/canonical");
const { formatAspectDisplay } = require("../../../../presenters/format/format/common");
const { bodyLabelJa, signLabelJa } = require("../../../../presenters/shared/text/tokens");
const { leadAspectFromResonancePool, bodyTitleRank } = require("./resonance");
const { getMoonEventPhaseLabel, moonPhaseTitleLabel } = require("./selection");

function formatDateJaFromLocal(dateLocal) {
  const parts = String(dateLocal || "").trim().split("-");
  if (parts.length !== 3) return "";
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return "";
  return `${y}年${m}月${d}日`;
}

function formatDateDotsFromLocal(dateLocal) {
  const parts = String(dateLocal || "").trim().split("-");
  if (parts.length !== 3) return "";
  const y = Number(parts[0]);
  const m = String(Number(parts[1])).padStart(2, "0");
  const d = String(Number(parts[2])).padStart(2, "0");
  if (!Number.isFinite(y) || !Number.isFinite(Number(m)) || !Number.isFinite(Number(d))) return "";
  return `${y}.${m}.${d}`;
}

function storySignJa(story, bodyKey) {
  const direct =
    story?.public?.transit_signs?.[bodyKey]?.sign_ja ||
    story?.public?.[bodyKey]?.sign_ja ||
    "";
  if (direct) return direct;
  const rawKey =
    story?.public?.transit_signs?.[bodyKey]?.sign_key ||
    story?.public?.[bodyKey]?.sign_key ||
    "";
  const key = normalizeSignKey(rawKey);
  return key ? signLabelJa(dict, key) : "";
}

function formatElementCount(count = {}) {
  return `火${count.fire || 0} 地${count.earth || 0} 風${count.air || 0} 水${count.water || 0}`;
}

function formatModalityCount(count = {}) {
  return `活動${count.cardinal || 0} 不動${count.fixed || 0} 柔軟${count.mutable || 0}`;
}

function formatSignConcentration(counts = {}) {
  const entries = Object.entries(counts)
    .map(([k, v]) => [k, Number(v)])
    .filter(([k, v]) => k && Number.isFinite(v) && v > 0)
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
  if (!entries.length) return "";
  const top = entries.slice(0, 2).map(([k, v]) => {
    const label = signLabelJa(dict, k) || k;
    return `${label}${v}件`;
  });
  return top.join(" / ");
}

function getTransitInfo(story, bodyKey) {
  const raw = story?.public?.transit_signs?.[bodyKey] || story?.public?.[bodyKey] || {};
  const signKey = normalizeSignKey(raw?.sign_key || "");
  const signJa = raw?.sign_ja || signLabelJa(dict, signKey) || "";
  const lonDeg = Number.isFinite(Number(raw?.lon_deg)) ? Number(raw.lon_deg) : null;
  return { signKey, signJa, lonDeg };
}

function formatSignDegree(signKey, lonDeg) {
  const signJa = signLabelJa(dict, signKey) || signKey || "";
  if (!Number.isFinite(Number(lonDeg))) return signJa;
  const deg = ((Number(lonDeg) % 30) + 30) % 30;
  let degInt = Math.floor(deg + 1e-6);
  if (degInt >= 30) degInt = 29;
  return `${signJa} ${degInt}°`.trim();
}

function aspectLabelForLong(aspectKey, aspectDeg) {
  const key = normalizeAspectKey(aspectKey, aspectDeg);
  const meta = formatAspectDisplay({
    dict,
    rawType: aspectKey,
    aspectDeg,
  });
  return meta?.label || key || String(aspectKey || "");
}

function buildMoonEventTitle(story, dateLocal) {
  const asOfISO = story?.meta?.as_of || new Date().toISOString();
  const phaseLabel = getMoonEventPhaseLabel({ dateLocal, asOfISO });
  if (!phaseLabel) return "";

  const dateDots = formatDateDotsFromLocal(dateLocal)
    || formatDateYmd(new Date(asOfISO)).replace(/-/g, ".");
  const sunSign = storySignJa(story, "sun");
  const moonSign = storySignJa(story, "moon");
  if (!dateDots || !sunSign || !moonSign) return "";
  return `${dateDots}｜${moonSign}${phaseLabel}｜太陽 ${sunSign} × 月 ${moonSign}`;
}

function buildSeoTitle({ story, dateLocal }) {
  const fallback = `今日のソラ｜${dateLocal}`;
  const dateJa = formatDateJaFromLocal(dateLocal);
  const sunSign = storySignJa(story, "sun");
  const moonSign = storySignJa(story, "moon");
  const asOfISO = story?.meta?.as_of || (dateLocal ? `${dateLocal}T03:00:00.000Z` : new Date().toISOString());
  const moonPhase = moonPhaseTitleLabel({ dateLocal, asOfISO }) || "";
  if (!dateJa || !sunSign || !moonSign || !moonPhase) return fallback;
  return `${dateJa}の星の配置｜${sunSign} 太陽 × ${moonSign} 月｜${moonPhase}｜今日のソラ`;
}

function buildLeadAspectTitle({ story, dateLocal }) {
  const dateDots = formatDateDotsFromLocal(dateLocal);
  if (!dateDots) return "";
  const asOfISO = story?.meta?.as_of || (dateLocal ? `${dateLocal}T03:00:00.000Z` : new Date().toISOString());
  const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
  if (!skyAll.length) return "";

  const resonanceOrbLimit = SPEC?.orb?.paid ?? 3.0;
  const lead = leadAspectFromResonancePool(skyAll, resonanceOrbLimit)
    || [...skyAll].sort((a, b) => (a?.orb_deg ?? 99) - (b?.orb_deg ?? 99))[0];
  if (!lead) return "";

  const aKey = normalizeBodyKey(lead?.a || "");
  const bKey = normalizeBodyKey(lead?.b || "");
  if (!aKey || !bKey) return "";

  const aRank = bodyTitleRank(aKey);
  const bRank = bodyTitleRank(bKey);
  const leftKey = aRank <= bRank ? aKey : bKey;
  const rightKey = aRank <= bRank ? bKey : aKey;

  const retroMap = buildRetrogradeMap(asOfISO, [leftKey, rightKey]);
  const leftSign = leftKey === aKey ? (lead?.a_sign_ja || signLabelJa(dict, lead?.a_sign_key || "")) : (lead?.b_sign_ja || signLabelJa(dict, lead?.b_sign_key || ""));
  const rightSign = rightKey === aKey ? (lead?.a_sign_ja || signLabelJa(dict, lead?.a_sign_key || "")) : (lead?.b_sign_ja || signLabelJa(dict, lead?.b_sign_key || ""));
  const leftLabel = [
    `${bodyLabelJa(dict, leftKey)}${retroMap[leftKey] ? "(R)" : ""}`.trim(),
    leftSign || "",
  ].filter(Boolean).join(" ").trim();
  const rightLabel = [
    `${bodyLabelJa(dict, rightKey)}${retroMap[rightKey] ? "(R)" : ""}`.trim(),
    rightSign || "",
  ].filter(Boolean).join(" ").trim();

  const aspectLabel = aspectLabelForLong(lead?.aspect || lead?.type, lead?.aspect_deg);
  if (!leftLabel || !rightLabel || !aspectLabel) return "";

  return `${dateDots}｜${leftLabel} × ${rightLabel} ${aspectLabel}｜今日のソラ`;
}

function buildDailyTitle(story, dateLocal) {
  return (
    buildMoonEventTitle(story, dateLocal)
    || buildLeadAspectTitle({ story, dateLocal })
    || buildSeoTitle({ story, dateLocal })
  );
}

function buildAioseoMeta({ story, dateLocal, title }) {
  const dateJa = formatDateJaFromLocal(dateLocal) || String(dateLocal || "").trim();
  const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
  const resonanceOrbLimit = SPEC?.orb?.paid ?? 3.0;
  const lead = leadAspectFromResonancePool(skyAll, resonanceOrbLimit)
    || [...skyAll].sort((a, b) => (a?.orb_deg ?? 99) - (b?.orb_deg ?? 99))[0];

  let leadText = "";
  if (lead) {
    const aKey = normalizeBodyKey(lead?.a || "");
    const bKey = normalizeBodyKey(lead?.b || "");
    const leftLabel = bodyLabelJa(dict, aKey) || aKey;
    const rightLabel = bodyLabelJa(dict, bKey) || bKey;
    const deg = Number.isFinite(Number(lead?.aspect_deg)) ? Math.round(Number(lead.aspect_deg)) : null;
    if (leftLabel && rightLabel && Number.isFinite(deg)) {
      leadText = `${leftLabel}と${rightLabel}が${deg}度で接続し、主要なアスペクトが形成されています。`;
    } else if (leftLabel && rightLabel) {
      leadText = `${leftLabel}と${rightLabel}の主要アスペクトが形成されています。`;
    }
  }

  const description = [
    dateJa ? `${dateJa}の星の配置。` : "今日の星の配置。",
    leadText,
    "今日のトランジット構造と天体配置を一覧で確認できます。",
  ].filter(Boolean).join("");

  return {
    aioseo_title: String(title || "").trim(),
    aioseo_description: description,
    aioseo_focus_keyphrase: dateJa ? `${dateJa} 星の配置` : "今日の星の配置",
  };
}

function buildDailyEyecatchLines(story, dateLocal) {
  const dateDots = formatDateDotsFromLocal(dateLocal) || "";
  const title = buildLeadAspectTitle({ story, dateLocal });

  let line2 = "";
  if (title) {
    const parts = String(title).split("｜");
    if (parts.length >= 2) {
      line2 = parts[1].trim();
    }
  }

  return {
    line1: dateDots || "今日のソラ",
    line2: line2 || "今日のソラ",
    line3: "今日のソラ | sora-no-koe",
    kind: "lead_aspect",
  };
}

module.exports = {
  formatDateJaFromLocal,
  formatDateDotsFromLocal,
  formatElementCount,
  formatModalityCount,
  formatSignConcentration,
  getTransitInfo,
  formatSignDegree,
  aspectLabelForLong,
  buildMoonEventTitle,
  buildSeoTitle,
  buildLeadAspectTitle,
  buildDailyTitle,
  buildAioseoMeta,
  buildDailyEyecatchLines,
};
