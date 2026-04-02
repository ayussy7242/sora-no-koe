"use strict";

const { createChatCompletion } = require("../../../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
  SORA_AI_USER_GUIDE_IG_MOON,
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


function buildMoonFallback({ moonSign, phaseLabel } = {}) {
  const sign = safeTrim(moonSign) || "—";
  const phase = safeTrim(phaseLabel) || "静かな月相";
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

function buildIgMoonPrompt({ story, dict, asOfISO }) {
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
    SORA_AI_USER_GUIDE_IG_MOON,
    "",
    "INPUT:",
    `MOON_SIGN: ${moonSign}`,
    `PHASE_LABEL: ${phaseLabel}`,
    `MOON_CHANGE_HINT: ${moonChangeHint}`,
    `NEXT_MOON_SIGN_CHANGE: ${safeTrim(nextChangeText)}`,
    `NEXT_MOON_SIGN_CHANGE_HOURS_AHEAD: ${safeTrim(nextChangeHours)}`,
  ].join("\n");
}

async function generateIgMoonText({ story, dict, openai, maxRetries = 1, asOfISO }) {
  const apiKey = openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY missing" };

  const model = openai?.model || process.env.OPENAI_MODEL || "gpt-4o";
  const resolvedMaxRetries = resolveMaxRetries({ maxRetries, openaiMaxRetries: openai?.maxRetries });

  const info = buildTodayMoonInfo({ asOfISO, story, dict });
  const moonSign = safeTrim(info?.moonSign || "");
  const phaseLabel = safeTrim(resolveMoonPhaseLabel(info));

  const result = await generateWithRetry({
    buildPrompt: () => buildIgMoonPrompt({ story, dict, asOfISO }),
    buildRetryNote: () => "前回は条件外でした。「あなた」を避け、短すぎず長すぎない範囲で整えて再出力。",
    validate: ({ raw }) => {
      const verdict = runAiTextPipeline({
        rawText: raw,
        preset: PRESETS.ig.moon,
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

  const fallback = buildMoonFallback({ moonSign, phaseLabel });
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
