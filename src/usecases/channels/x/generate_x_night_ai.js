"use strict";

const { createChatCompletion } = require("../../../integrations/openai/openai_client");
const { SORA_AI_SYSTEM_PROMPT_COMMON } = require("../../../content/prompts/sora/sora_ai_prompts");
const { X_NIGHT_USER_GUIDE } = require("../../../content/prompts/sns/x/x_night_prompts");
const { signJa } = require("../../../presenters/format/format/common");
const { calcTransitLon, norm360, formatDateYmdHm } = require("../../../domain/astro_compute");
const {
  buildNextMoonEvents,
  orderedMoonEvents,
  lastMajorMoonEvent,
  buildMoonSignChangeState,
  moonSignAtIso,
} = require("../../../domain/moon_info");
const { toDateLocalJST } = require("../../../utils/time_utils");
const { generateXAiWithRetry, fallbackFactory } = require("./x_ai_common");

function safeText(x) {
  return String(x || "").trim();
}

function buildElementCount(story) {
  const counts = story?.public?.sky_strata?.element_count || story?.meta?.sky_strata?.element_count || {};
  return {
    fire: Number(counts.fire || 0),
    earth: Number(counts.earth || 0),
    air: Number(counts.air || 0),
    water: Number(counts.water || 0),
  };
}

function buildModalityCount(story) {
  const counts = story?.public?.sky_strata?.modality_count || story?.meta?.sky_strata?.modality_count || {};
  return {
    cardinal: Number(counts.cardinal || 0),
    fixed: Number(counts.fixed || 0),
    mutable: Number(counts.mutable || 0),
  };
}

function buildTransitSigns({ story, dict }) {
  const transit = story?.public?.transit_signs || {};
  const bodyOrder = [
    "sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto",
  ];
  const out = {};
  bodyOrder.forEach((k) => {
    const signKey = transit?.[k]?.sign_key || "";
    const signLabel = transit?.[k]?.sign_ja || signJa(dict, signKey || "") || "";
    if (signLabel) out[k] = signLabel;
  });
  return out;
}


function tomorrowMidnightJstIso(asOfISO) {
  const base = new Date(asOfISO || Date.now());
  if (Number.isNaN(base.getTime())) return null;
  const dateLocal = toDateLocalJST(base);
  if (!dateLocal) return null;
  const baseMidnight = new Date(`${dateLocal}T00:00:00+09:00`);
  if (Number.isNaN(baseMidnight.getTime())) return null;
  const tomorrow = new Date(baseMidnight.getTime() + 24 * 3600000);
  return tomorrow.toISOString();
}

function buildPhaseLabel({ kind, signLabel }) {
  const phaseName = kind === "new" ? "新月" : "満月";
  return signLabel ? `${signLabel}${phaseName}` : phaseName;
}

function buildNextMoonPhaseHint({ dict, asOfISO, maxHours = 24, imminentHours = 3, recentHours = 3 }) {
  const base = new Date(asOfISO || Date.now());
  if (Number.isNaN(base.getTime())) return null;

  const recent = lastMajorMoonEvent(asOfISO);
  if (recent?.date instanceof Date && !Number.isNaN(recent.date.getTime())) {
    const hoursAgo = (base.getTime() - recent.date.getTime()) / 3600000;
    if (Number.isFinite(hoursAgo) && hoursAgo >= 0 && hoursAgo <= recentHours) {
      const signLabel = moonSignAtIso({ dict, iso: recent.date.toISOString() })?.label || "";
      const label = buildPhaseLabel({ kind: recent.kind, signLabel });
      return { text: `${label}を迎えた直後`, kind: "recent", hoursAgo };
    }
  }

  const events = buildNextMoonEvents(asOfISO, dict);
  const ordered = orderedMoonEvents(events);
  const ev = ordered[0];
  if (!ev?.date || Number.isNaN(ev.date.getTime())) return null;

  const hoursAhead = (ev.date.getTime() - base.getTime()) / 3600000;
  if (!Number.isFinite(hoursAhead) || hoursAhead < 0 || hoursAhead > maxHours) return null;

  const label = buildPhaseLabel({ kind: ev.kind, signLabel: ev.signJa || "" });
  const text = hoursAhead <= imminentHours
    ? `まもなく${label}を迎える`
    : `このあと${label}を迎える`;
  return { text, kind: "upcoming", hoursAhead };
}

function buildNextTransitHints(story, dict) {
  const asOfISO = story?.meta?.as_of || new Date().toISOString();
  const change = buildMoonSignChangeState({ dict, asOfISO });
  const current = change?.sign || null;
  const next = change?.next || null;
  const phase = buildNextMoonPhaseHint({ dict, asOfISO });

  if (change?.isJustIngressed && current?.label) {
    return `今夜は月が${current.label}に入ったばかり`;
  }
  if (change?.isImminentChange && next?.to?.label) {
    return `まもなく月は${next.to.label}へ移る`;
  }

  if (phase?.kind === "recent") return phase.text;
  if (phase?.text && (!next?.hoursAhead || phase.hoursAhead <= next.hoursAhead)) {
    return phase.text;
  }
  if (next?.to?.label) {
    const text = next.hoursAhead != null && next.hoursAhead <= 3
      ? `まもなく月は${next.to.label}へ移る`
      : `月はこのあと${next.to.label}へ移る`;
    return text;
  }
  if (current?.label) {
    return `月はこのまま${current.label}を進む`;
  }
  return "";
}

function buildXNightPrompt({ story, dict }) {
  const transitSigns = buildTransitSigns({ story, dict });
  const elementCount = buildElementCount(story);
  const modalityCount = buildModalityCount(story);
  const sun = transitSigns.sun || "";
  const moon = transitSigns.moon || "";
  const nextHints = buildNextTransitHints(story, dict);
  const asOfISO = story?.meta?.as_of || new Date().toISOString();
  const change = buildMoonSignChangeState({ dict, asOfISO });
  const lastChange = change?.prev || null;
  const nextChange = change?.next || null;
  const tomorrowIso = tomorrowMidnightJstIso(asOfISO);
  const tomorrowSign = tomorrowIso ? moonSignAtIso({ dict, iso: tomorrowIso }) : null;

  const lastChangeText = lastChange?.date
    ? `${formatDateYmdHm(lastChange.date)}（${lastChange.to?.label || ""}入り）`
    : "";
  const nextChangeText = nextChange?.date
    ? `${formatDateYmdHm(nextChange.date)}（${nextChange.to?.label || ""}へ）`
    : "";
  const tomorrowText = tomorrowSign?.label || "";
  const moonChangeHint = change?.changeType === "just_ingressed"
    ? `${change?.sign?.label || ""}に入ったばかり`
    : (change?.changeType === "imminent" && change?.next?.to?.label)
      ? `まもなく${change.next.to.label}へ移る`
      : "";
  const moonDegInSign = Number.isFinite(Number(change?.degInSign)) ? Number(change.degInSign).toFixed(1) : "";
  const moonPhaseStage = change?.phase || "";

  return [
    X_NIGHT_USER_GUIDE,
    "",
    "INPUT:",
    `SUN_SIGN: ${safeText(sun)}`,
    `MOON_SIGN: ${safeText(moon)}`,
    `TRANSIT_SIGNS: ${JSON.stringify(transitSigns)}`,
    `SKY_STRATA.element_count: ${JSON.stringify(elementCount)}`,
    `SKY_STRATA.modality_count: ${JSON.stringify(modalityCount)}`,
    `NEXT_TRANSIT_HINTS: ${safeText(nextHints)}`,
    `LAST_MOON_SIGN_CHANGE: ${safeText(lastChangeText)}`,
    `NEXT_MOON_SIGN_CHANGE: ${safeText(nextChangeText)}`,
    `TOMORROW_MOON_SIGN: ${safeText(tomorrowText)}`,
    `MOON_CHANGE_HINT: ${safeText(moonChangeHint)}`,
    `MOON_SIGN_DEG: ${safeText(moonDegInSign)}`,
    `MOON_SIGN_PHASE: ${safeText(moonPhaseStage)}`,
  ].join("\n");
}

async function generateXNightAiText({ story, dict, openai, maxRetries }) {
  const nextHints = buildNextTransitHints(story, dict);
  return generateXAiWithRetry({
    channel: "x_night",
    prompt: buildXNightPrompt({ story, dict }),
    minChars: 100,
    maxChars: 140,
    maxTokens: 180,
    temperature: 0.5,
    maxRetries,
    openai,
    story,
    dict,
    systemPrompt: SORA_AI_SYSTEM_PROMPT_COMMON,
    createChatCompletion,
    retryNoteTemplate: "前回は条件外でした（${reason}）。助言禁止・短文で整えて再出力。",
    fallbackFactory,
    fallbackContext: { nextHint: nextHints },
  });
}

module.exports = {
  buildXNightPrompt,
  generateXNightAiText,
};
