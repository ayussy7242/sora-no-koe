"use strict";

const { createChatCompletion } = require("../../../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
  SORA_AI_USER_GUIDE_IG_STORY_TODAY,
  SORA_AI_USER_GUIDE_IG_STORY_RESONANCE,
  SORA_AI_USER_GUIDE_IG_STORY_TOMORROW,
} = require("../../../../content/prompts/sora/sora_core");
const { buildTodayMoonInfo, findNextMoonSignChangeDetailed } = require("../../../../domain/moon_info");
const { formatDateYmdHm } = require("../../../../domain/astro");
const { formatAspectDisplay } = require("../../../../presenters/format/format/common");
const { bodyLabelJa, signLabelJa } = require("../../../../presenters/shared/text/tokens");
const { pickPreferredResonanceAspect } = require("../../../../domain/resonance");
const { runAiTextPipeline } = require("../../../ai_text");
const { PRESETS } = require("../../../ai_text/presets");
const { resolveMaxRetries } = require("../ai/utils");
const { safeTrim, normalizeMultilineText } = require("../../../../utils/text_normalize");

function normalizeText(text) {
  return normalizeMultilineText(text);
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
    `MOON_SIGN: ${safeTrim(moonSign)}`,
    `PHASE_LABEL: ${safeTrim(phaseLabel)}`,
    `SUN_SIGN: ${safeTrim(sunSign)}`,
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

function buildTomorrowPrompt({ nextMoonSign, nextPhaseLabel, nextAspectInput }) {
  const a = nextAspectInput || {};
  return [
    SORA_AI_USER_GUIDE_IG_STORY_TOMORROW,
    "",
    "INPUT:",
    `NEXT_MOON_SIGN: ${safeTrim(nextMoonSign)}`,
    `NEXT_PHASE_LABEL: ${safeTrim(nextPhaseLabel)}`,
    `NEXT_ASPECT: ${safeTrim(a.aspectLabel)}`,
    `NEXT_A_BODY: ${safeTrim(a.aLabel)}`,
    `NEXT_B_BODY: ${safeTrim(a.bLabel)}`,
    `NEXT_A_SIGN: ${safeTrim(a.aSign)}`,
    `NEXT_B_SIGN: ${safeTrim(a.bSign)}`,
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

function fallbackToday({ moonSign, phaseLabel } = {}) {
  const sign = safeTrim(moonSign) || "—";
  const phase = safeTrim(phaseLabel) || "静かな月相";
  return `今日の空、どうでしたか？\n${sign}の月と${phase}の輪郭が残ります。\n静かな余韻が空に置かれます。`;
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

function fallbackTomorrow({ nextMoonSign, nextPhaseLabel, nextAspectInput } = {}) {
  const sign = safeTrim(nextMoonSign) || "—";
  const phase = safeTrim(nextPhaseLabel) || "月相";
  const a = nextAspectInput?.aLabel || "";
  const b = nextAspectInput?.bLabel || "";
  const aspect = a && b ? `${a}×${b}` : "ひとつの接続";
  return `明日は${sign}の月、${phase}の空。\n${aspect}が見えやすい配置です。\nこの流れは、明日にもそのまま続いていきます。\nどんな空になりそうですか？`;
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

  const todayPrompt = buildTodayPrompt({ moonSign, phaseLabel, sunSign });
  const todayText = await generateTextWithRetry({
    userPrompt: todayPrompt,
    openai,
    validate: (text) => runAiTextPipeline({ rawText: text, preset: PRESETS.ig.story_today }),
    maxRetries,
    temperature: 0.5,
    maxTokens: 160,
  });

  const resonanceAspect = pickPreferredResonanceAspect(story, { resonanceMode });
  const resonanceInput = buildAspectInput({ dict: useDict, aspect: resonanceAspect });
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
  const tomorrowPrompt = buildTomorrowPrompt({
    nextMoonSign,
    nextPhaseLabel,
    nextAspectInput,
  });
  const tomorrowText = await generateTextWithRetry({
    userPrompt: tomorrowPrompt,
    openai,
    validate: (text) => runAiTextPipeline({ rawText: text, preset: PRESETS.ig.story_tomorrow }),
    maxRetries,
    temperature: 0.5,
    maxTokens: 180,
  });

  const nextMoonMove = findNextMoonSignChangeDetailed({ dict: useDict, asOfISO });
  const todayFixedLines = buildTodayDataLines({
    moonSign,
    phaseLabel,
    moonAge: info?.moonAge,
    illumination: info?.illumination,
    nextMove: nextMoonMove,
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
    todayText.ok ? todayText.text : fallbackToday({ moonSign, phaseLabel }),
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
    tomorrowText.ok ? tomorrowText.text : fallbackTomorrow({ nextMoonSign, nextPhaseLabel, nextAspectInput }),
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
    },
  };
}

module.exports = {
  generateIgStoryTexts,
};
