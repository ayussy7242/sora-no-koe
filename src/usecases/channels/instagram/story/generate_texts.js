"use strict";

const { createChatCompletion } = require("../../../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
  SORA_AI_USER_GUIDE_IG_STORY_TODAY,
  SORA_AI_USER_GUIDE_IG_STORY_RESONANCE,
  SORA_AI_USER_GUIDE_IG_STORY_TOMORROW,
} = require("../../../../content/prompts/sora/sora_core");
const { buildTodayMoonInfo, findNextMoonSignChangeDetailed, detectMoonEventLocal } = require("../../../../domain/moon");
const { formatDateYmdHm, calcTransitLon } = require("../../../../domain/astro");
const { signKeyFromLon } = require("../../../../domain/moon/labels");
const { formatAspectDisplay } = require("../../../../presenters/format/format/common");
const { bodyLabelJa, signLabelJa } = require("../../../../presenters/shared/text/tokens");
const { pickPreferredResonanceAspect } = require("../../../../domain/resonance");
const { runAiTextPipeline } = require("../../../ai_text");
const { PRESETS } = require("../../../ai_text/presets");
const { resolveMaxRetries } = require("../ai/utils");
const { safeTrim, normalizeMultilineText } = require("../../../../utils/text/normalize");
const { formatJstTimeLabel, toDateLocalJST } = require("../../../../utils/time");
const { isRetrograde } = require("../../../../domain/astro/retrograde");

function normalizeText(text) {
  return normalizeMultilineText(text);
}

const SIGN_INGRESS_PLANETS = [
  "sun",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
];

const RETROGRADE_PLANETS = [
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
];

function buildAspectInput({ dict, aspect } = {}) {
  if (!aspect) return null;
  const info = formatAspectDisplay({
    dict,
    rawType: aspect.type || aspect.aspect,
    aspectDeg: aspect.aspect_deg,
    orbDeg: aspect.orb_deg,
    degPrecision: 0,
    orbPrecision: 2,
  });
  const aKey = aspect?.a || "";
  const bKey = aspect?.b || "";
  const aSignKey = aspect?.a_sign_key || "";
  const bSignKey = aspect?.b_sign_key || "";
  return {
    aKey,
    bKey,
    aLabel: bodyLabelJa(dict, aKey) || aKey,
    bLabel: bodyLabelJa(dict, bKey) || bKey,
    aSign: aspect?.a_sign_ja || signLabelJa(dict, aSignKey) || "",
    bSign: aspect?.b_sign_ja || signLabelJa(dict, bSignKey) || "",
    aSignKey,
    bSignKey,
    aspectLabel: info?.label || "",
    aspectDeg: info?.deg ?? aspect?.aspect_deg ?? "",
    orb: Number.isFinite(Number(info?.orb)) ? info.orb : Number(aspect?.orb_deg),
  };
}

function buildTodayPrompt({ moonSign, phaseLabel, sunSign, aspectInput }) {
  const a = aspectInput || {};
  const aspectSignature = buildResonanceSignature({ aspectInput: a });
  return [
    SORA_AI_USER_GUIDE_IG_STORY_TODAY,
    "",
    "INPUT:",
    `MOON_SIGN: ${safeTrim(moonSign)}`,
    `PHASE_LABEL: ${safeTrim(phaseLabel)}`,
    `SUN_SIGN: ${safeTrim(sunSign)}`,
    `TODAY_ASPECT_LABEL: ${safeTrim(a.aspectLabel)}`,
    `TODAY_ASPECT_SIGNATURE: ${safeTrim(aspectSignature)}`,
  ].join("\n");
}

function buildResonancePrompt({ aspectInput, nowAspectInput, nowMoonSign, nowPhaseLabel }) {
  const a = aspectInput || {};
  const n = nowAspectInput || {};
  return [
    SORA_AI_USER_GUIDE_IG_STORY_RESONANCE,
    "",
    "INPUT:",
    `ASPECT: ${safeTrim(a.aspectLabel)}`,
    `A_BODY: ${safeTrim(a.aLabel)}`,
    `B_BODY: ${safeTrim(a.bLabel)}`,
    `A_SIGN: ${safeTrim(a.aSign)}`,
    `B_SIGN: ${safeTrim(a.bSign)}`,
    `A_HOUSE: `,
    `B_HOUSE: `,
    `ORB: ${Number.isFinite(Number(a.orb)) ? Number(a.orb).toFixed(2) : ""}`,
    "",
    "NOW_INPUT:",
    `NOW_MOON_SIGN: ${safeTrim(nowMoonSign)}`,
    `NOW_PHASE_LABEL: ${safeTrim(nowPhaseLabel)}`,
    `NOW_ASPECT: ${safeTrim(n.aspectLabel)}`,
    `NOW_A_BODY: ${safeTrim(n.aLabel)}`,
    `NOW_B_BODY: ${safeTrim(n.bLabel)}`,
    `NOW_A_SIGN: ${safeTrim(n.aSign)}`,
    `NOW_B_SIGN: ${safeTrim(n.bSign)}`,
    `NOW_A_HOUSE: `,
    `NOW_B_HOUSE: `,
    `NOW_ORB: ${Number.isFinite(Number(n.orb)) ? Number(n.orb).toFixed(2) : ""}`,
  ].join("\n");
}

function formatTimeHm(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const t = formatJstTimeLabel(date, { fallback: "" });
  return t === "-" ? "" : t;
}

function resolveDateLocal(story) {
  return safeTrim(story?.meta?.date_local || story?.public?.date_local || "");
}

function addDaysDateLocalJST(dateLocal, offsetDays) {
  const base = new Date(`${dateLocal}T00:00:00+09:00`);
  if (Number.isNaN(base.getTime())) return dateLocal;
  const shiftMs = Number(offsetDays) * 86400000;
  if (!Number.isFinite(shiftMs) || shiftMs === 0) return dateLocal;
  const shifted = new Date(base.getTime() + shiftMs);
  return toDateLocalJST(shifted);
}

function isoFromDateLocalTime(dateLocal, hour = 0, minute = 0) {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  const d = new Date(`${dateLocal}T${hh}:${mm}:00+09:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function resolvePlanetSignKeyForDate({ planetKey, dateLocal, dict, hour = 12, minute = 0 } = {}) {
  if (!planetKey || !dateLocal) return "";
  const iso = isoFromDateLocalTime(dateLocal, hour, minute);
  if (!iso) return "";
  const lon = calcTransitLon(planetKey, iso);
  return signKeyFromLon(dict, lon) || "";
}

function resolveMoonMoveForDate({ dict, asOfISO, dateLocal } = {}) {
  const move = findNextMoonSignChangeDetailed({ dict, asOfISO });
  if (!move?.date || !move?.to?.label) return null;
  const moveDateLocal = toDateLocalJST(move.date);
  if (!moveDateLocal || !dateLocal || moveDateLocal !== dateLocal) return null;
  return move;
}

function detectSignIngressesForDate({ dateLocal, planets, dict } = {}) {
  if (!dateLocal) return [];
  const startIso = isoFromDateLocalTime(dateLocal, 0, 0);
  const nextDateLocal = addDaysDateLocalJST(dateLocal, 1);
  const endIso = isoFromDateLocalTime(nextDateLocal, 0, 0);
  if (!startIso || !endIso) return [];

  const out = [];
  (planets || []).forEach((planet) => {
    const lonStart = calcTransitLon(planet, startIso);
    const lonEnd = calcTransitLon(planet, endIso);
    const signStart = signKeyFromLon(dict, lonStart);
    const signEnd = signKeyFromLon(dict, lonEnd);
    if (!signStart || !signEnd || signStart === signEnd) return;
    out.push({ planetKey: planet, signKey: signEnd });
  });
  return out;
}

function detectRetrogradeStationsForDate({ dateLocal, planets } = {}) {
  if (!dateLocal) return [];
  const startIso = isoFromDateLocalTime(dateLocal, 0, 0);
  const nextDateLocal = addDaysDateLocalJST(dateLocal, 1);
  const endIso = isoFromDateLocalTime(nextDateLocal, 0, 0);
  if (!startIso || !endIso) return [];

  const out = [];
  (planets || []).forEach((planet) => {
    const startRetro = isRetrograde(planet, startIso);
    const endRetro = isRetrograde(planet, endIso);
    if (startRetro === endRetro) return;
    out.push({ planetKey: planet, type: endRetro ? "start" : "end" });
  });
  return out;
}

function formatMoonEventText(ev = {}) {
  const phase = safeTrim(ev?.phaseName || "");
  const sign = safeTrim(ev?.signJa || "");
  if (sign && phase) return `${sign}${phase}`;
  return phase || sign || "";
}

function orderByPlanetPriority(list, priority = []) {
  const rank = new Map(priority.map((key, idx) => [key, idx]));
  return (list || []).slice().sort((a, b) => {
    const ra = rank.has(a?.planetKey) ? rank.get(a.planetKey) : Infinity;
    const rb = rank.has(b?.planetKey) ? rank.get(b.planetKey) : Infinity;
    if (ra !== rb) return ra - rb;
    if (a?.type && b?.type && a.type !== b.type) return a.type === "start" ? -1 : 1;
    return 0;
  });
}

function uniqueEvents(events) {
  const seen = new Set();
  const out = [];
  for (const ev of events || []) {
    const key = `${ev?.kind || ""}|${ev?.text || ""}`;
    if (!ev?.text || seen.has(key)) continue;
    seen.add(key);
    out.push(ev);
  }
  return out;
}

function buildEventCandidates({ moonEvent, signIngresses, retroStations, nextAspectInput, moonMove, dateLocal, dict } = {}) {
  const candidates = [];

  if (moonEvent) {
    const eventIso = moonEvent?.date instanceof Date ? moonEvent.date.toISOString() : null;
    const eventLon = eventIso ? calcTransitLon("moon", eventIso) : null;
    const signKey = signKeyFromLon(dict, eventLon) || resolvePlanetSignKeyForDate({ planetKey: "moon", dateLocal, dict });
    candidates.push({
      kind: "moon_event",
      text: formatMoonEventText(moonEvent),
      time: formatTimeHm(moonEvent?.date),
      signKey,
    });
  }

  orderByPlanetPriority(signIngresses, SIGN_INGRESS_PLANETS).forEach((ingress) => {
    if (!ingress?.planetKey || !ingress?.signKey) return;
    const planetLabel = bodyLabelJa(dict, ingress.planetKey) || ingress.planetKey;
    const signLabel = signLabelJa(dict, ingress.signKey) || ingress.signKey;
    candidates.push({
      kind: "sign_ingress",
      text: `${planetLabel}、${signLabel}へ`,
      time: "",
      planetKey: ingress.planetKey,
      signKey: ingress.signKey,
    });
  });

  orderByPlanetPriority(retroStations, RETROGRADE_PLANETS).forEach((station) => {
    if (!station?.planetKey || !station?.type) return;
    const planetLabel = bodyLabelJa(dict, station.planetKey) || station.planetKey;
    const action = station.type === "start" ? "開始" : "終了";
    const kind = station.type === "start" ? "retrograde_start" : "retrograde_end";
    const signKey = resolvePlanetSignKeyForDate({ planetKey: station.planetKey, dateLocal, dict });
    candidates.push({
      kind,
      text: `${planetLabel}逆行、${action}`,
      time: "",
      planetKey: station.planetKey,
      signKey,
    });
  });

  const aspectSignature = buildResonanceSignature({ aspectInput: nextAspectInput });
  const orb = Number(nextAspectInput?.orb);
  if (aspectSignature && Number.isFinite(orb) && orb <= 1.0) {
    candidates.push({
      kind: "tight_aspect",
      text: aspectSignature,
      time: "",
      aSignKey: nextAspectInput?.aSignKey || "",
      bSignKey: nextAspectInput?.bSignKey || "",
    });
  }

  if (moonMove?.date && moonMove?.to?.label) {
    const moveDateLocal = toDateLocalJST(moonMove.date);
    if (!dateLocal || moveDateLocal === dateLocal) {
      candidates.push({
        kind: "moon_move",
        text: `月が${safeTrim(moonMove.to.label)}へ`,
        time: "",
        signKey: moonMove?.to?.key || "",
      });
    }
  }

  return uniqueEvents(candidates);
}

function pickTomorrowEvents({ moonEvent, signIngresses, retroStations, nextAspectInput, moonMove, dateLocal, dict, maxItems = 3 } = {}) {
  const candidates = buildEventCandidates({
    moonEvent,
    signIngresses,
    retroStations,
    nextAspectInput,
    moonMove,
    dateLocal,
    dict,
  });
  return candidates.slice(0, Math.max(0, Number(maxItems) || 0));
}

function buildTomorrowPrompt({ nextSunSign, nextMoonSign, nextPhaseLabel, nextAspectInput, moonMove, events }) {
  const a = nextAspectInput || {};
  const aspectSignature = buildResonanceSignature({ aspectInput: a });
  const moveTime = formatTimeHm(moonMove?.date);
  const moveTo = safeTrim(moonMove?.to?.label);
  const slots = [0, 1, 2].map((idx) => events?.[idx] || {});
  return [
    SORA_AI_USER_GUIDE_IG_STORY_TOMORROW,
    "",
    "INPUT:",
    `TOMORROW_SUN_SIGN: ${safeTrim(nextSunSign)}`,
    `TOMORROW_MOON_SIGN: ${safeTrim(nextMoonSign)}`,
    `TOMORROW_PHASE_LABEL: ${safeTrim(nextPhaseLabel)}`,
    `TOMORROW_MOON_MOVE_TO: ${moveTo}`,
    `TOMORROW_MOON_MOVE_TIME: ${moveTime}`,
    `TOMORROW_ASPECT_LABEL: ${safeTrim(a.aspectLabel)}`,
    `TOMORROW_ASPECT_SIGNATURE: ${safeTrim(aspectSignature)}`,
    `EVENT_1_KIND: ${safeTrim(slots[0].kind)}`,
    `EVENT_1_TEXT: ${safeTrim(slots[0].text)}`,
    `EVENT_1_TIME: ${safeTrim(slots[0].time)}`,
    `EVENT_2_KIND: ${safeTrim(slots[1].kind)}`,
    `EVENT_2_TEXT: ${safeTrim(slots[1].text)}`,
    `EVENT_2_TIME: ${safeTrim(slots[1].time)}`,
    `EVENT_3_KIND: ${safeTrim(slots[2].kind)}`,
    `EVENT_3_TEXT: ${safeTrim(slots[2].text)}`,
    `EVENT_3_TIME: ${safeTrim(slots[2].time)}`,
  ].join("\n");
}

function formatMoonAge(value) {
  if (!Number.isFinite(Number(value))) return "—";
  return Number(value).toFixed(1);
}

function formatIllumination(value) {
  if (!Number.isFinite(Number(value))) return "—";
  return `${Math.round(Number(value) * 100)}%`;
}

function formatAspectLine({ label, deg }) {
  if (!label && !Number.isFinite(Number(deg))) return "—";
  const degText = Number.isFinite(Number(deg)) ? `${Math.round(Number(deg))}°` : "";
  return [safeTrim(label), degText].filter(Boolean).join(" ");
}

function buildResonanceAspectLine({ aspectInput } = {}) {
  const a = aspectInput || {};
  const aspectLine = formatAspectLine({ label: a.aspectLabel, deg: a.aspectDeg });
  const orbText = Number.isFinite(Number(a.orb)) ? `${Number(a.orb).toFixed(2)}°` : "";
  if (!aspectLine) return "";
  return `${aspectLine}${orbText ? ` / orb ${orbText}` : ""}`;
}

function buildTodayDataLines({ moonSign, phaseLabel, moonAge, illumination, nextMove } = {}) {
  const lines = [
    `月相: ${safeTrim(phaseLabel) || "—"}`,
    `月の星座: ${safeTrim(moonSign) || "—"}`,
    `月齢: ${formatMoonAge(moonAge)}`,
    `照度: ${formatIllumination(illumination)}`,
  ];
  if (nextMove?.date && nextMove?.to?.label) {
    const when = formatDateYmdHm(nextMove.date);
    lines.push(`次の月移動: ${when} に ${nextMove.to.label} へ`);
  }
  return lines;
}

function buildResonanceDataLines({ aspectInput, nowAspectInput } = {}) {
  const lines = [];
  const aspectLine = buildResonanceAspectLine({ aspectInput });
  if (aspectLine) lines.push(aspectLine);
  const nowLine = buildResonanceAspectLine({ aspectInput: nowAspectInput });
  if (nowLine) lines.push(`今: ${nowLine}`);
  return lines;
}

function buildResonanceSignature({ aspectInput } = {}) {
  const a = aspectInput || {};
  if (!a?.aLabel || !a?.bLabel || !a?.aSign || !a?.bSign) return "";
  return `${safeTrim(a.aSign)}の${safeTrim(a.aLabel)} × ${safeTrim(a.bSign)}の${safeTrim(a.bLabel)}`;
}

function injectResonanceSignature(text, { aspectInput } = {}) {
  const signature = buildResonanceSignature({ aspectInput });
  const aspectLine = buildResonanceAspectLine({ aspectInput });
  const t = normalizeText(text);
  if (!signature && !aspectLine) return t;

  const a = aspectInput || {};
  const plain = a?.aLabel && a?.bLabel ? `${safeTrim(a.aLabel)} × ${safeTrim(a.bLabel)}` : "";
  const plainNoSpace = a?.aLabel && a?.bLabel ? `${safeTrim(a.aLabel)}×${safeTrim(a.bLabel)}` : "";
  let body = t;
  if (signature) {
    body = body.replace(plain, signature).replace(plainNoSpace, signature);
  }

  const leadLines = ["✨ 今日の共鳴", signature, aspectLine].filter(Boolean);
  if (!leadLines.length) return body;

  const isResonanceHeading = (line) => line.replace(/[✨\s]/g, "") === "今日の共鳴";
  const bodyLines = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !leadLines.includes(line) && !isResonanceHeading(line));

  return [leadLines.join("\n"), bodyLines.join("\n")].filter(Boolean).join("\n\n");
}

function buildTomorrowDataLines({ nextStory, nextAspectInput, dict } = {}) {
  const sunSign = safeTrim(nextStory?.public?.transit_signs?.sun?.sign_ja);
  const moonSign = safeTrim(nextStory?.public?.transit_signs?.moon?.sign_ja);
  const aspect = nextAspectInput || {};
  const aspectLine = [
    safeTrim(aspect.aLabel),
    safeTrim(aspect.bLabel),
  ].filter(Boolean).length
    ? `${safeTrim(aspect.aLabel)} × ${safeTrim(aspect.bLabel)}（${formatAspectLine({
        label: aspect.aspectLabel,
        deg: aspect.aspectDeg,
      })}）`
    : "—";
  return [
    `明日の太陽星座: ${sunSign || "—"}`,
    `明日の月星座: ${moonSign || "—"}`,
    `明日の主要アスペクト: ${aspectLine}`,
  ];
}

function appendFixedLines(text, lines = []) {
  const cleaned = normalizeText(text);
  const fixed = (lines || []).filter(Boolean).join("\n");
  if (!fixed) return cleaned;
  return [cleaned, fixed].filter(Boolean).join("\n\n");
}

async function generateTextWithRetry({
  userPrompt,
  openai,
  validate,
  maxRetries = 1,
  temperature = 0.5,
  maxTokens = 200,
}) {
  const apiKey = openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY missing" };
  const baseUrl = openai?.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = openai?.model || process.env.OPENAI_MODEL || "gpt-4o";
  const resolvedMaxRetries = resolveMaxRetries({ maxRetries, openaiMaxRetries: openai?.maxRetries });

  let retryNote = "";
  let lastText = "";
  let lastReason = "";

  for (let attempt = 0; attempt <= resolvedMaxRetries; attempt++) {
    const prompt =
      userPrompt +
      (retryNote ? `\n\nRETRY_NOTE: ${retryNote}` : "") +
      (lastText ? `\n\nPREV_OUTPUT:\n${lastText}\n\n上の出力を条件に合わせて整えて再出力。` : "");

    const text = await createChatCompletion({
      apiKey,
      baseUrl,
      model,
      messages: [
        { role: "system", content: SORA_AI_SYSTEM_PROMPT_COMMON },
        { role: "user", content: prompt },
      ],
      temperature,
      maxTokens,
    });

    const verdict = validate(text);
    if (verdict.ok) return { ok: true, text: verdict.text, model };

    lastText = String(text || "").trim();
    lastReason = verdict.reason || "";
    retryNote = `前回は条件外でした（${lastReason}）。短く整えて再出力。`;
  }

  return { ok: false, error: lastReason || "retry_exceeded" };
}

function fallbackToday({ moonSign, phaseLabel, sunSign, aspectInput } = {}) {
  const sign = safeTrim(moonSign) || "—";
  const phase = safeTrim(phaseLabel) || "静かな月相";
  const sun = safeTrim(sunSign) || "—";
  const aspect = buildResonanceSignature({ aspectInput }) || "ひとつの接続";
  return `${sun}の太陽 × ${sign}の月。\n${aspect}が今日の軸でした。\n${phase}の輪郭が残ります。\nどこが印象に残りましたか？`;
}

function fallbackResonance({ aspectInput, nowAspectInput, nowMoonSign, nowPhaseLabel } = {}) {
  const a = aspectInput?.aLabel || "天体";
  const b = aspectInput?.bLabel || "天体";
  const label = aspectInput?.aspectLabel || "接続";
  const deg = Number.isFinite(Number(aspectInput?.aspectDeg)) ? `${Math.round(Number(aspectInput.aspectDeg))}°` : "";
  const orb = Number.isFinite(Number(aspectInput?.orb)) ? `${Number(aspectInput.orb).toFixed(2)}°` : "";
  const nowA = nowAspectInput?.aLabel || "天体";
  const nowB = nowAspectInput?.bLabel || "天体";
  const nowLabel = nowAspectInput?.aspectLabel || "接続";
  const nowDeg = Number.isFinite(Number(nowAspectInput?.aspectDeg)) ? `${Math.round(Number(nowAspectInput.aspectDeg))}°` : "";
  const nowSign = safeTrim(nowMoonSign) || "—";
  const nowPhase = safeTrim(nowPhaseLabel) || "";
  const nowMoonText = nowPhase ? `${nowSign}の月、${nowPhase}` : `${nowSign}の月`;
  return `${a}×${b}の接続が${label}${deg}で近づきます。\n空の質感が静かに濃くなる配置です。\n今は${nowMoonText}、${nowA}×${nowB}の${nowLabel}${nowDeg}。\n何か感じた人いる？`;
}

function fallbackTomorrow({
  nextSunSign,
  nextMoonSign,
  nextPhaseLabel,
  nextAspectInput,
  moonMove,
  events,
} = {}) {
  const sun = safeTrim(nextSunSign) || "—";
  const moon = safeTrim(nextMoonSign) || "—";
  const phase = safeTrim(nextPhaseLabel) || "月相";
  const aspect = buildResonanceSignature({ aspectInput: nextAspectInput }) || "ひとつの接続";
  const moveTo = safeTrim(moonMove?.to?.label);
  const moveTime = formatTimeHm(moonMove?.date);
  const changeLine = moveTo && moveTime ? `${moveTime}、月は${moveTo}へ。` : `${phase}の流れ。`;
  const eventLines = (events || [])
    .map((ev) => {
      const text = safeTrim(ev?.text);
      const time = safeTrim(ev?.time);
      return text ? `${text}${time ? ` ${time}` : ""}` : "";
    })
    .filter(Boolean);
  return [
    `${sun}の太陽 × ${moon}の月。`,
    changeLine,
    `${aspect}が残る配置。`,
    ...eventLines,
    "どこが残りそう？",
  ].filter(Boolean).join("\n");
}

async function generateIgStoryTexts({
  dateLocal,
  story,
  tomorrowStory,
  nowStory,
  dict,
  openai,
  maxRetries = 1,
  asOfISO,
  asOfTomorrowISO,
  asOfNowISO,
  resonanceMode,
} = {}) {
  if (!story) throw new Error("story missing");
  const useDict = dict || require("../../../../content/dict");

  const info = buildTodayMoonInfo({ asOfISO, story, dict: useDict });
  const moonSign = safeTrim(info?.moonSign);
  const phaseLabel = safeTrim(info?.phase?.name);
  const sunSign = safeTrim(story?.public?.transit_signs?.sun?.sign_ja);

  const resonanceAspect = pickPreferredResonanceAspect(story, { resonanceMode });
  const resonanceInput = buildAspectInput({ dict: useDict, aspect: resonanceAspect });

  const todayPrompt = buildTodayPrompt({ moonSign, phaseLabel, sunSign, aspectInput: resonanceInput });
  const todayText = await generateTextWithRetry({
    userPrompt: todayPrompt,
    openai,
    validate: (text) => runAiTextPipeline({ rawText: text, preset: PRESETS.ig.story_today }),
    maxRetries,
    temperature: 0.5,
    maxTokens: 160,
  });

  const nowBaseStory = nowStory || story;
  const nowInfo = buildTodayMoonInfo({ asOfISO: asOfNowISO || asOfISO, story: nowBaseStory, dict: useDict });
  const nowMoonSign = safeTrim(nowInfo?.moonSign);
  const nowPhaseLabel = safeTrim(nowInfo?.phase?.name);
  const nowAspect = pickPreferredResonanceAspect(nowBaseStory, { resonanceMode, preferOutput: false });
  const nowAspectInput = buildAspectInput({ dict: useDict, aspect: nowAspect });
  const resonancePrompt = buildResonancePrompt({
    aspectInput: resonanceInput,
    nowAspectInput,
    nowMoonSign,
    nowPhaseLabel,
  });
  const resonanceText = await generateTextWithRetry({
    userPrompt: resonancePrompt,
    openai,
    validate: (text) => runAiTextPipeline({ rawText: text, preset: PRESETS.ig.story_resonance }),
    maxRetries,
    temperature: 0.5,
    maxTokens: 220,
  });

  const nextStory = tomorrowStory || story;
  const nextInfo = buildTodayMoonInfo({ asOfISO: asOfTomorrowISO, story: nextStory, dict: useDict });
  const nextMoonSign = safeTrim(nextInfo?.moonSign);
  const nextPhaseLabel = safeTrim(nextInfo?.phase?.name);
  const nextAspect = pickPreferredResonanceAspect(nextStory, { resonanceMode });
  const nextAspectInput = buildAspectInput({ dict: useDict, aspect: nextAspect });
  const nextSunSign = safeTrim(nextStory?.public?.transit_signs?.sun?.sign_ja);
  const tomorrowDateLocal = resolveDateLocal(nextStory);
  const nextMoonMove = resolveMoonMoveForDate({
    dict: useDict,
    asOfISO: asOfTomorrowISO || nextStory?.meta?.as_of || asOfISO,
    dateLocal: tomorrowDateLocal,
  });
  const moonEvent = detectMoonEventLocal({
    dateLocal: tomorrowDateLocal,
    asOfISO: asOfTomorrowISO || nextStory?.meta?.as_of || asOfISO,
    dict: useDict,
  });
  const signIngresses = detectSignIngressesForDate({
    dateLocal: tomorrowDateLocal,
    planets: SIGN_INGRESS_PLANETS,
    dict: useDict,
  });
  const retroStations = detectRetrogradeStationsForDate({
    dateLocal: tomorrowDateLocal,
    planets: RETROGRADE_PLANETS,
  });
  const tomorrowEvents = pickTomorrowEvents({
    moonEvent,
    signIngresses,
    retroStations,
    nextAspectInput,
    moonMove: nextMoonMove,
    dateLocal: tomorrowDateLocal,
    dict: useDict,
  });
  const tomorrowPrompt = buildTomorrowPrompt({
    nextSunSign,
    nextMoonSign,
    nextPhaseLabel,
    nextAspectInput,
    moonMove: nextMoonMove,
    events: tomorrowEvents,
  });
  const tomorrowText = await generateTextWithRetry({
    userPrompt: tomorrowPrompt,
    openai,
    validate: (text) => runAiTextPipeline({ rawText: text, preset: PRESETS.ig.story_tomorrow }),
    maxRetries,
    temperature: 0.5,
    maxTokens: 180,
  });

  const nextMoonMoveToday = findNextMoonSignChangeDetailed({ dict: useDict, asOfISO });
  const todayFixedLines = buildTodayDataLines({
    moonSign,
    phaseLabel,
    moonAge: info?.moonAge,
    illumination: info?.illumination,
    nextMove: nextMoonMoveToday,
  });
  const resonanceFixedLines = buildResonanceDataLines({
    aspectInput: resonanceInput,
    nowAspectInput,
  });
  const tomorrowFixedLines = buildTomorrowDataLines({
    nextStory,
    nextAspectInput,
    dict: useDict,
  });

  const todayBody = appendFixedLines(
    todayText.ok
      ? todayText.text
      : fallbackToday({ moonSign, phaseLabel, sunSign, aspectInput: resonanceInput }),
    todayFixedLines
  );
  const resonanceBody = appendFixedLines(
    injectResonanceSignature(
      resonanceText.ok
        ? resonanceText.text
        : fallbackResonance({
            aspectInput: resonanceInput,
            nowAspectInput,
            nowMoonSign,
            nowPhaseLabel,
          }),
      { aspectInput: resonanceInput }
    ),
    resonanceFixedLines
  );
  const tomorrowBody = appendFixedLines(
    tomorrowText.ok
      ? tomorrowText.text
      : fallbackTomorrow({
          nextSunSign,
          nextMoonSign,
          nextPhaseLabel,
          nextAspectInput,
          moonMove: nextMoonMove,
          events: tomorrowEvents,
        }),
    tomorrowFixedLines
  );

  return {
    ok: true,
    date_local: dateLocal,
    story_texts: {
      today: {
        title: "今日の空",
        body: todayBody,
        sticker_type: "poll",
        sticker_options: ["何か感じた", "静かな日"],
      },
      resonance: {
        title: "今日の共鳴",
        body: resonanceBody,
        sticker_type: "slider",
        sticker_emoji: "✨",
      },
      tomorrow: {
        title: "明日の空",
        body: tomorrowBody,
        sticker_type: "none",
      },
    },
    ai: {
      today: todayText.ok ? todayText.model : null,
      resonance: resonanceText.ok ? resonanceText.model : null,
      tomorrow: tomorrowText.ok ? tomorrowText.model : null,
    },
    source: {
      resonance_aspect: resonanceAspect || null,
      tomorrow_aspect: nextAspect || null,
      now_resonance_aspect: nowAspect || null,
      tomorrow_events: tomorrowEvents || [],
    },
  };
}

module.exports = {
  generateIgStoryTexts,
};
