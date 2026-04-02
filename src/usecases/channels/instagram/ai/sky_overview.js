"use strict";

const { createChatCompletion } = require("../../../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
  SORA_AI_USER_GUIDE_IG_SKY_OVERVIEW,
} = require("../../../../content/prompts/sora/sora_core");
const { runAiTextPipeline, generateWithRetry } = require("../../../ai_text");
const { PRESETS } = require("../../../ai_text/presets");
const { resolveMaxRetries, buildSignCountsLine, buildElementCountsLine, buildHouseFocusLine } = require("./utils");
const { safeTrim } = require("../../../../utils/text/normalize");

function buildIgSkyOverviewPrompt({ story, dict }) {
  const date = safeTrim(story?.meta?.date_local || story?.public?.date_local || "");
  const signCounts = buildSignCountsLine({ story, dict });
  const elementCounts = buildElementCountsLine(story);
  const houseFocus = buildHouseFocusLine(story);

  return [
    SORA_AI_USER_GUIDE_IG_SKY_OVERVIEW,
    "",
    "INPUT:",
    `DATE: ${date}`,
    `TRANSIT_SIGNS: ${signCounts}`,
    `SKY_STRATA.element_count: ${elementCounts}`,
    `HOUSE_FOCUS.top: ${houseFocus}`,
  ].join("\n");
}

async function generateIgSkyOverviewText({ story, dict, openai, maxRetries = 2 }) {
  const apiKey = openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY missing" };

  const model = openai?.model || process.env.OPENAI_MODEL || "gpt-4o";
  const resolvedMaxRetries = resolveMaxRetries({ maxRetries, openaiMaxRetries: openai?.maxRetries });

  const result = await generateWithRetry({
    buildPrompt: () => buildIgSkyOverviewPrompt({ story, dict }),
    buildRetryNote: () => "前回は条件外でした。「あなた」を避けて、もう少し長めに整えて再出力。",
    validate: ({ raw }) => {
      const verdict = runAiTextPipeline({
        rawText: raw,
        preset: PRESETS.ig.sky_overview,
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
    temperature: 0.45,
    maxTokens: 320,
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
  buildIgSkyOverviewPrompt,
  generateIgSkyOverviewText,
};
