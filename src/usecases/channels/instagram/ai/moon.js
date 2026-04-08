"use strict";

const { createChatCompletion } = require("../../../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
  SORA_AI_USER_GUIDE_IG_MOON,
  SORA_AI_USER_GUIDE_IG_MOON_NIGHT_CAPTION,
} = require("../../../../content/prompts/sora/sora_core");
const { buildTodayMoonInfo, buildMoonSignChangeState } = require("../../../../domain/moon");
const { formatDateYmdHm } = require("../../../../domain/astro/compute");
const { runAiTextPipeline, generateWithRetry } = require("../../../ai_text");
const { PRESETS } = require("../../../ai_text/presets");
const { resolveMaxRetries } = require("./utils");
const { safeTrim } = require("../../../../utils/text/normalize");

function countSentences(text) {
  return String(text || "")
    .split(/[。！？]/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}


function buildMoonFallback({ moonSign, phaseLabel, variant } = {}) {
  const sign = safeTrim(moonSign) || "—";
  const phase = safeTrim(phaseLabel) || "静かな月相";
  const key = String(variant || "").toLowerCase();
  if (key === "caption" || key === "night_caption" || key === "night-caption") {
    return `${sign}の${phase}。静かな輪郭のまま、次の位置へ向かいます。`;
  }
  return `${sign}の月が空にあり、${phase}の輪郭が静かに残ります。月は余白として、景色に溶け込むように置かれます。`;
}

function buildMoonChangeHint(change) {
  if (!change || !change.changeType) return "";
  if (change.changeType === "just_ingressed" && change?.sign?.label) {
    return `${change.sign.label}に入ったばかり`;
  }
  if (change.changeType === "imminent" && change?.next?.to?.label) {
    return `まもなく${change.next.to.label}へ移る`;
  }
  return "";
}

function resolveMoonPhaseLabel(info) {
  const raw = safeTrim(info?.phase?.name || "");
  const illumination = Number(info?.illumination || 0);
  const isNewNow = Number.isFinite(illumination) && illumination <= 0.02;
  const isFullNow = Number.isFinite(illumination) && illumination >= 0.98;
  if (raw === "満月" && !isFullNow) return "満ちゆく月";
  if (raw === "新月" && !isNewNow) return "欠けてゆく月";
  return raw;
}

function resolveMoonGuide(variant) {
  const key = String(variant || "").toLowerCase();
  if (key === "caption" || key === "night_caption" || key === "night-caption") {
    return SORA_AI_USER_GUIDE_IG_MOON_NIGHT_CAPTION;
  }
  return SORA_AI_USER_GUIDE_IG_MOON;
}

function buildIgMoonPrompt({ story, dict, asOfISO, variant }) {
  const info = buildTodayMoonInfo({ asOfISO, story, dict });
  const change = buildMoonSignChangeState({ asOfISO, dict });
  const moonSign = safeTrim(info?.moonSign || "");
  const phaseLabel = safeTrim(resolveMoonPhaseLabel(info));
  const moonChangeHint = safeTrim(buildMoonChangeHint(change));
  const nextChange = change?.next || null;
  const nextChangeText = nextChange?.date
    ? `${formatDateYmdHm(nextChange.date)}（${nextChange.to?.label || ""}へ）`
    : "";
  const nextChangeHours = Number.isFinite(Number(nextChange?.hoursAhead))
    ? Number(nextChange.hoursAhead).toFixed(1)
    : "";

  return [
    resolveMoonGuide(variant),
    "",
    "INPUT:",
    `MOON_SIGN: ${moonSign}`,
    `PHASE_LABEL: ${phaseLabel}`,
    `MOON_CHANGE_HINT: ${moonChangeHint}`,
    `NEXT_MOON_SIGN_CHANGE: ${safeTrim(nextChangeText)}`,
    `NEXT_MOON_SIGN_CHANGE_HOURS_AHEAD: ${safeTrim(nextChangeHours)}`,
  ].join("\n");
}

async function generateIgMoonText({ story, dict, openai, maxRetries = 2, asOfISO, variant }) {
  const apiKey = openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY missing" };

  const model = openai?.model || process.env.OPENAI_MODEL || "gpt-4o";
  const resolvedMaxRetries = resolveMaxRetries({ maxRetries, openaiMaxRetries: openai?.maxRetries });

  const info = buildTodayMoonInfo({ asOfISO, story, dict });
  const moonSign = safeTrim(info?.moonSign || "");
  const phaseLabel = safeTrim(resolveMoonPhaseLabel(info));

  const result = await generateWithRetry({
    buildPrompt: () => buildIgMoonPrompt({ story, dict, asOfISO, variant }),
    buildRetryNote: () => {
      const key = String(variant || "").toLowerCase();
      if (key === "caption" || key === "night_caption" || key === "night-caption") {
        return "前回は条件外でした。4〜6行・180〜220文字・文末に絵文字1つを守り、余白ある改行で再出力。";
      }
      return "前回は条件外でした。「あなた」を避け、70〜100文字・2〜3文を目安に整えて再出力。";
    },
    validate: ({ raw }) => {
      const key = String(variant || "").toLowerCase();
      const preset = key === "caption" || key === "night_caption" || key === "night-caption"
        ? PRESETS.ig.moon_night_caption
        : PRESETS.ig.moon;
      const verdict = runAiTextPipeline({
        rawText: raw,
        preset,
      });
      if (verdict.ok) return { ok: true, text: verdict.text };
      return { ok: false, reason: verdict.reason || "" };
    },
    createChatCompletion,
    openai: {
      apiKey,
      baseUrl: openai?.baseUrl,
      model,
      maxRetries: openai?.maxRetries,
    },
    maxRetries: resolvedMaxRetries,
    systemPrompt: SORA_AI_SYSTEM_PROMPT_COMMON,
    temperature: 0.4,
    maxTokens: 160,
    context: { story, dict, asOfISO },
  });

  if (result.ok) return { ok: true, text: result.text, model, attempts: result.attempts, last_text: result.lastText };

  if (String(result.error || "").includes("missing") || String(result.error || "").startsWith("openai_error:")) {
    return { ok: false, error: result.error || "retry_exceeded", reason: result.reason, attempts: result.attempts, last_text: result.lastText };
  }

  const fallback = buildMoonFallback({ moonSign, phaseLabel, variant });
  return {
    ok: true,
    text: fallback,
    model,
    fallback: true,
    fallback_reason: result.reason || result.error || "",
    attempts: result.attempts,
    last_text: result.lastText,
  };
}

module.exports = {
  buildIgMoonPrompt,
  generateIgMoonText,
};
