"use strict";

const { createChatCompletion } = require("../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
  SORA_AI_USER_GUIDE_IG_STORY_TODAY,
  SORA_AI_USER_GUIDE_IG_STORY_RESONANCE,
  SORA_AI_USER_GUIDE_IG_STORY_TOMORROW,
} = require("../../content/prompts/sora_ai_prompts");
const { buildTodayMoonInfo } = require("../../domain/moon_info");
const { formatAspectDisplay } = require("../../presenters/format/format/line_common");
const { bodyLabelJa, signLabelJa } = require("../../presenters/shared/text/tokens");

function safeText(x) {
  return String(x || "").trim();
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function countQuestions(text) {
  const t = String(text || "");
  const m = t.match(/[？?]/g);
  return m ? m.length : 0;
}

function countChars(text) {
  return Array.from(String(text || "").replace(/\n/g, "")).length;
}

function validateStoryText(text, { min, max, maxQuestions = 1 } = {}) {
  const t = normalizeText(text);
  if (!t) return { ok: false, reason: "empty" };
  if (t.includes("あなた")) return { ok: false, reason: "has_you" };
  const len = countChars(t);
  if (Number.isFinite(min) && len < min) return { ok: false, reason: `too_short:${len}` };
  if (Number.isFinite(max) && len > max) return { ok: false, reason: `too_long:${len}` };
  if (countQuestions(t) > maxQuestions) return { ok: false, reason: "too_many_questions" };
  return { ok: true, text: t, len };
}

function pickPreferredResonanceAspect(story) {
  const skyTop = Array.isArray(story?.public?.sky_top) ? story.public.sky_top : [];
  const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
  const pool = [...skyTop, ...skyAll];
  if (!pool.length) return null;

  const coreBodies = new Set([
    "sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto",
  ]);

  const withinOne = pool
    .map((row) => ({ row, orb: Number(row?.orb_deg) }))
    .filter((r) => Number.isFinite(r.orb) && r.orb <= 1.0);

  const coreHits = withinOne.filter(({ row }) => coreBodies.has(row?.a) && coreBodies.has(row?.b));
  if (coreHits.length) {
    coreHits.sort((a, b) => a.orb - b.orb);
    return coreHits[0].row;
  }

  const outerBodies = new Set(["lilith", "chiron"]);
  const outerHits = withinOne.filter(({ row }) => outerBodies.has(row?.a) || outerBodies.has(row?.b));
  if (outerHits.length) {
    outerHits.sort((a, b) => a.orb - b.orb);
    return outerHits[0].row;
  }

  return skyTop[0] || skyAll[0] || null;
}

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
    aspectLabel: info?.label || "",
    aspectDeg: info?.deg ?? aspect?.aspect_deg ?? "",
    orb: Number.isFinite(Number(info?.orb)) ? info.orb : Number(aspect?.orb_deg),
  };
}

function buildTodayPrompt({ moonSign, phaseLabel, sunSign }) {
  return [
    SORA_AI_USER_GUIDE_IG_STORY_TODAY,
    "",
    "INPUT:",
    `MOON_SIGN: ${safeText(moonSign)}`,
    `PHASE_LABEL: ${safeText(phaseLabel)}`,
    `SUN_SIGN: ${safeText(sunSign)}`,
  ].join("\n");
}

function buildResonancePrompt({ aspectInput }) {
  const a = aspectInput || {};
  return [
    SORA_AI_USER_GUIDE_IG_STORY_RESONANCE,
    "",
    "INPUT:",
    `ASPECT: ${safeText(a.aspectLabel)}`,
    `A_BODY: ${safeText(a.aLabel)}`,
    `B_BODY: ${safeText(a.bLabel)}`,
    `A_SIGN: ${safeText(a.aSign)}`,
    `B_SIGN: ${safeText(a.bSign)}`,
    `A_HOUSE: `,
    `B_HOUSE: `,
    `ORB: ${Number.isFinite(Number(a.orb)) ? Number(a.orb).toFixed(2) : ""}`,
  ].join("\n");
}

function buildTomorrowPrompt({ nextMoonSign, nextPhaseLabel, nextAspectInput }) {
  const a = nextAspectInput || {};
  return [
    SORA_AI_USER_GUIDE_IG_STORY_TOMORROW,
    "",
    "INPUT:",
    `NEXT_MOON_SIGN: ${safeText(nextMoonSign)}`,
    `NEXT_PHASE_LABEL: ${safeText(nextPhaseLabel)}`,
    `NEXT_ASPECT: ${safeText(a.aspectLabel)}`,
    `NEXT_A_BODY: ${safeText(a.aLabel)}`,
    `NEXT_B_BODY: ${safeText(a.bLabel)}`,
    `NEXT_A_SIGN: ${safeText(a.aSign)}`,
    `NEXT_B_SIGN: ${safeText(a.bSign)}`,
  ].join("\n");
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

  let retryNote = "";
  let lastText = "";
  let lastReason = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
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

function fallbackToday({ moonSign, phaseLabel } = {}) {
  const sign = safeText(moonSign) || "—";
  const phase = safeText(phaseLabel) || "静かな月相";
  return `今日の空、どうでしたか？\n${sign}の月と${phase}の輪郭が残ります。\n静かな余韻が空に置かれます。`;
}

function fallbackResonance({ aspectInput } = {}) {
  const a = aspectInput?.aLabel || "天体";
  const b = aspectInput?.bLabel || "天体";
  const label = aspectInput?.aspectLabel || "接続";
  const deg = Number.isFinite(Number(aspectInput?.aspectDeg)) ? `${Math.round(Number(aspectInput.aspectDeg))}°` : "";
  const orb = Number.isFinite(Number(aspectInput?.orb)) ? `${Number(aspectInput.orb).toFixed(2)}°` : "";
  return `${a}×${b}の接続が${label}${deg}で近づきます。\n空の質感が静かに濃くなる配置です。\n何か感じた人いる？`;
}

function fallbackTomorrow({ nextMoonSign, nextPhaseLabel, nextAspectInput } = {}) {
  const sign = safeText(nextMoonSign) || "—";
  const phase = safeText(nextPhaseLabel) || "月相";
  const a = nextAspectInput?.aLabel || "";
  const b = nextAspectInput?.bLabel || "";
  const aspect = a && b ? `${a}×${b}` : "ひとつの接続";
  return `明日は${sign}の月、${phase}の空。\n${aspect}が見えやすい配置です。\n朝8:10 更新します。`;
}

async function generateIgStoryTexts({
  dateLocal,
  story,
  tomorrowStory,
  dict,
  openai,
  maxRetries = 1,
  asOfISO,
  asOfTomorrowISO,
} = {}) {
  if (!story) throw new Error("story missing");
  const useDict = dict || require("../../content/dict");

  const info = buildTodayMoonInfo({ asOfISO, story, dict: useDict });
  const moonSign = safeText(info?.moonSign);
  const phaseLabel = safeText(info?.phase?.name);
  const sunSign = safeText(story?.public?.transit_signs?.sun?.sign_ja);

  const todayPrompt = buildTodayPrompt({ moonSign, phaseLabel, sunSign });
  const todayText = await generateTextWithRetry({
    userPrompt: todayPrompt,
    openai,
    validate: (text) => validateStoryText(text, { min: 40, max: 90 }),
    maxRetries,
    temperature: 0.5,
    maxTokens: 160,
  });

  const resonanceAspect = pickPreferredResonanceAspect(story);
  const resonanceInput = buildAspectInput({ dict: useDict, aspect: resonanceAspect });
  const resonancePrompt = buildResonancePrompt({ aspectInput: resonanceInput });
  const resonanceText = await generateTextWithRetry({
    userPrompt: resonancePrompt,
    openai,
    validate: (text) => validateStoryText(text, { min: 50, max: 110 }),
    maxRetries,
    temperature: 0.5,
    maxTokens: 190,
  });

  const nextStory = tomorrowStory || story;
  const nextInfo = buildTodayMoonInfo({ asOfISO: asOfTomorrowISO, story: nextStory, dict: useDict });
  const nextMoonSign = safeText(nextInfo?.moonSign);
  const nextPhaseLabel = safeText(nextInfo?.phase?.name);
  const nextAspect = pickPreferredResonanceAspect(nextStory);
  const nextAspectInput = buildAspectInput({ dict: useDict, aspect: nextAspect });
  const tomorrowPrompt = buildTomorrowPrompt({
    nextMoonSign,
    nextPhaseLabel,
    nextAspectInput,
  });
  const tomorrowText = await generateTextWithRetry({
    userPrompt: tomorrowPrompt,
    openai,
    validate: (text) => validateStoryText(text, { min: 45, max: 100 }),
    maxRetries,
    temperature: 0.5,
    maxTokens: 180,
  });

  return {
    ok: true,
    date_local: dateLocal,
    story_texts: {
      today: {
        title: "今日の空",
        body: todayText.ok ? todayText.text : fallbackToday({ moonSign, phaseLabel }),
        sticker_type: "poll",
        sticker_options: ["何か感じた", "静かな日"],
      },
      resonance: {
        title: "今日の共鳴",
        body: resonanceText.ok ? resonanceText.text : fallbackResonance({ aspectInput: resonanceInput }),
        sticker_type: "slider",
        sticker_emoji: "✨",
      },
      tomorrow: {
        title: "明日の空",
        body: tomorrowText.ok ? tomorrowText.text : fallbackTomorrow({ nextMoonSign, nextPhaseLabel, nextAspectInput }),
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
    },
  };
}

module.exports = {
  generateIgStoryTexts,
};
