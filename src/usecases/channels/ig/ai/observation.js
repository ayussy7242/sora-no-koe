"use strict";

const { createChatCompletion } = require("../../../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
  SORA_AI_USER_GUIDE_IG_OBSERVATION,
} = require("../../../../content/prompts/sora/sora_ai_prompts");
const { runAiTextPipeline } = require("../../../ai_text");
const { PRESETS } = require("../../../ai_text/presets");
const { resolveMaxRetries, buildSignCountsLine, buildElementCountsLine, buildHouseFocusLine } = require("./utils");
const { safeTrim } = require("../../../../utils/text_normalize");

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

  const baseUrl = openai?.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = openai?.model || process.env.OPENAI_MODEL || "gpt-4o";
  const resolvedMaxRetries = resolveMaxRetries({ maxRetries, openaiMaxRetries: openai?.maxRetries });

  let retryNote = "";
  let lastReason = "";
  let lastText = "";

  for (let attempt = 0; attempt <= resolvedMaxRetries; attempt++) {
    const userPrompt = buildIgObservationPrompt({ story, dict }) +
      (retryNote ? `\n\nRETRY_NOTE: ${retryNote}` : "") +
      (lastText ? `\n\nPREV_OUTPUT:\n${lastText}\n\n上の出力を条件に合わせて整えて再出力。` : "");

    let text = "";
    try {
      text = await createChatCompletion({
        apiKey,
        baseUrl,
        model,
        messages: [
          { role: "system", content: SORA_AI_SYSTEM_PROMPT_COMMON },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
        maxTokens: 120,
      });
    } catch (err) {
      const message = err?.message || String(err || "openai_error");
      console.error("[ig_observation_ai] OpenAI error", { message });
      lastReason = `openai_error:${message}`;
      lastText = "";
      retryNote = buildRetryNote(lastReason);
      continue;
    }

    const verdict = runAiTextPipeline({
      rawText: text,
      preset: PRESETS.ig.observation,
    });
    if (verdict.ok) return { ok: true, text: verdict.text, model };

    lastReason = verdict.reason || "";
    lastText = String(text || "").trim();
    retryNote = buildRetryNote(lastReason);
  }

  return { ok: false, error: "retry_exceeded", reason: lastReason, last_text: lastText };
}

module.exports = {
  buildIgObservationPrompt,
  generateIgObservationText,
};
