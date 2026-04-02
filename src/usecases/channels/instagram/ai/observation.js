"use strict";

const { createChatCompletion } = require("../../../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
  SORA_AI_USER_GUIDE_IG_OBSERVATION,
} = require("../../../../content/prompts/sora/sora_core");
const { runAiTextPipeline, generateWithRetry } = require("../../../ai_text");
const { PRESETS } = require("../../../ai_text/presets");
const { resolveMaxRetries, buildSignCountsLine, buildElementCountsLine, buildHouseFocusLine } = require("./utils");
const { safeTrim } = require("../../../../utils/text/normalize");

function buildIgObservationPrompt({ story, dict }) {
  const date = safeTrim(story?.meta?.date_local || story?.public?.date_local || "");
  const signCounts = buildSignCountsLine({ story, dict });
  const elementCounts = buildElementCountsLine(story);
  const houseFocus = buildHouseFocusLine(story);

  return [
    SORA_AI_USER_GUIDE_IG_OBSERVATION,
    "",
    "INPUT:",
    `DATE: ${date}`,
    `TRANSIT_SIGNS: ${signCounts}`,
    `SKY_STRATA.element_count: ${elementCounts}`,
    `HOUSE_FOCUS.top: ${houseFocus}`,
  ].join("\n");
}

function buildRetryNote(reason) {
  const r = String(reason || "unknown");
  const lenMatch = r.match(/:(\d+)/);
  const lenInfo = lenMatch ? `いまのは${lenMatch[1]}文字なので、` : "";
  if (r.includes("has_you")) {
    return `前回は条件外（${r}）。「あなた」を避け、${lenInfo}10〜20文字目安（最大22文字）で再出力。`;
  }
  if (r.includes("too_long")) {
    return `前回は条件外（${r}）。${lenInfo}10〜20文字目安（最大22文字）で再出力。`;
  }
  if (r.includes("too_short")) {
    return `前回は条件外（${r}）。${lenInfo}10〜20文字目安（最大22文字）で再出力。`;
  }
  if (r.includes("empty")) {
    return `前回は条件外（${r}）。内容を入れ、10〜20文字目安（最大22文字）で再出力。`;
  }
  return `前回は条件外（${r}）。${lenInfo}10〜20文字目安（最大22文字）で再出力。`;
}

async function generateIgObservationText({ story, dict, openai, maxRetries = 5 }) {
  const apiKey = openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY missing" };

  const model = openai?.model || process.env.OPENAI_MODEL || "gpt-4o";
  const resolvedMaxRetries = resolveMaxRetries({ maxRetries, openaiMaxRetries: openai?.maxRetries });

  const result = await generateWithRetry({
    buildPrompt: () => buildIgObservationPrompt({ story, dict }),
    buildRetryNote: (reason) => buildRetryNote(reason),
    validate: ({ raw }) => {
      const verdict = runAiTextPipeline({
        rawText: raw,
        preset: PRESETS.ig.observation,
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
    maxTokens: 120,
    context: { story, dict },
  });

  if (result.ok) return { ok: true, text: result.text, model, attempts: result.attempts, last_text: result.lastText };
  return {
    ok: false,
    error: result.error || "retry_exceeded",
    reason: result.reason,
    last_text: result.lastText ? String(result.lastText).trim() : "",
    attempts: result.attempts,
  };
}

module.exports = {
  buildIgObservationPrompt,
  generateIgObservationText,
};
