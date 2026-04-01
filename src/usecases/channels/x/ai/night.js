"use strict";

const { createChatCompletion } = require("../../../../integrations/openai/openai_client");
const { SORA_AI_SYSTEM_PROMPT_COMMON } = require("../../../../content/prompts/sora/sora_core");
const { X_NIGHT_USER_GUIDE } = require("../../../../content/prompts/sns/x/night");
const { formatDateYmdHm } = require("../../../../domain/astro/compute");
const {
  buildNextMoonEvents,
  orderedMoonEvents,
  lastMajorMoonEvent,
  buildMoonSignChangeState,
  moonSignAtIso,
} = require("../../../../domain/moon");
const { toDateLocalJST } = require("../../../../utils/time");
const { generateXAiWithRetry, fallbackFactory, buildElementCount, buildModalityCount, buildTransitSigns } = require("./common");
const { safeTrim } = require("../../../../utils/text/normalize");


function tomorrowNoonJstIso(asOfISO) {
  const base = new Date(asOfISO || Date.now());
  if (Number.isNaN(base.getTime())) return null;
  const dateLocal = toDateLocalJST(base);
  if (!dateLocal) return null;
  const baseMidnight = new Date(`${dateLocal}T00:00:00+09:00`);
  if (Number.isNaN(baseMidnight.getTime())) return null;
  const tomorrowNoon = new Date(baseMidnight.getTime() + 36 * 3600000);
  return tomorrowNoon.toISOString();
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
  const change = buildMoonSignChangeState({ dict, asOfISO, maxHours: 96 });
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
  const change = buildMoonSignChangeState({ dict, asOfISO, maxHours: 96 });
  const lastChange = change?.prev || null;
  const nextChange = change?.next || null;
  const tomorrowNoonIso = tomorrowNoonJstIso(asOfISO);
  const tomorrowSign = tomorrowNoonIso ? moonSignAtIso({ dict, iso: tomorrowNoonIso }) : null;

  const lastChangeText = lastChange?.date
    ? `${formatDateYmdHm(lastChange.date)}（${lastChange.to?.label || ""}入り）`
    : "";
  const nextChangeText = nextChange?.date
    ? `${formatDateYmdHm(nextChange.date)}（${nextChange.to?.label || ""}へ）`
    : "";
  const tomorrowText = tomorrowSign?.label || "";
  const nextChangeHours = Number.isFinite(Number(nextChange?.hoursAhead))
    ? Number(nextChange.hoursAhead).toFixed(1)
    : "";
  const nextChangeIso = nextChange?.date instanceof Date ? nextChange.date.toISOString() : "";
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
    `SUN_SIGN: ${safeTrim(sun)}`,
    `MOON_SIGN: ${safeTrim(moon)}`,
    `TRANSIT_SIGNS: ${JSON.stringify(transitSigns)}`,
    `SKY_STRATA.element_count: ${JSON.stringify(elementCount)}`,
    `SKY_STRATA.modality_count: ${JSON.stringify(modalityCount)}`,
    `NEXT_TRANSIT_HINTS: ${safeTrim(nextHints)}`,
    `LAST_MOON_SIGN_CHANGE: ${safeTrim(lastChangeText)}`,
    `NEXT_MOON_SIGN_CHANGE: ${safeTrim(nextChangeText)}`,
    `NEXT_MOON_SIGN_CHANGE_ISO: ${safeTrim(nextChangeIso)}`,
    `NEXT_MOON_SIGN_CHANGE_HOURS_AHEAD: ${safeTrim(nextChangeHours)}`,
    `TOMORROW_MOON_SIGN: ${safeTrim(tomorrowText)}`,
    `TOMORROW_MOON_SIGN_BASIS: JST 12:00`,
    `MOON_CHANGE_HINT: ${safeTrim(moonChangeHint)}`,
    `MOON_SIGN_DEG: ${safeTrim(moonDegInSign)}`,
    `MOON_SIGN_PHASE: ${safeTrim(moonPhaseStage)}`,
  ].join("\n");
}

async function generateXNightAiText({ story, dict, openai, maxRetries, maxChars }) {
  const nextHints = buildNextTransitHints(story, dict);
  const resolvedMaxChars = Number.isFinite(Number(maxChars)) ? Number(maxChars) : 180;
  return generateXAiWithRetry({
    channel: "x_night",
    prompt: buildXNightPrompt({ story, dict }),
    minChars: 0,
    maxChars: resolvedMaxChars,
    maxTokens: 180,
    temperature: 0.5,
    maxRetries,
    openai,
    story,
    dict,
    systemPrompt: SORA_AI_SYSTEM_PROMPT_COMMON,
    createChatCompletion,
    retryNoteTemplate: "前回は条件外でした（${reason}）。90〜120文字で整えて再出力。",
    fallbackFactory,
    fallbackContext: { nextHint: nextHints },
  });
}

module.exports = {
  buildXNightPrompt,
  generateXNightAiText,
};
