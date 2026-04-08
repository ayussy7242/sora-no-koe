"use strict";

const { createChatCompletion } = require("../../../../integrations/openai/openai_client");
const { SORA_AI_SYSTEM_PROMPT_COMMON } = require("../../../../content/prompts/sora/sora_core");
const { X_MOON_EVENT_USER_GUIDE } = require("../../../../content/prompts/sns/x/moon_event");
const { detectMoonEventLocal, moonEventKindLabelJa } = require("../../../../domain/moon");
const { toDateLocalJST } = require("../../../../utils/time");
const { validateXAiText } = require("./common");

function detectMoonEvent({ story, dict, asOfISO }) {
  const baseISO = asOfISO || story?.meta?.as_of || new Date().toISOString();
  const dateLocal = story?.meta?.date_local || story?.public?.date_local || "";
  return detectMoonEventLocal({ dateLocal, asOfISO: baseISO, dict });
}

function resolveMoonEventPromptInput({ story, event }) {
  const storyDate = String(story?.meta?.date_local || story?.public?.date_local || "").trim();
  const eventDateLocal = event?.date instanceof Date ? toDateLocalJST(event.date) : "";
  const dateLocal = storyDate || eventDateLocal || "";
  const kindLabel = event?.phaseName || moonEventKindLabelJa(event?.kind);
  const fallbackLabel = event?.signJa && kindLabel ? `${event.signJa}${kindLabel}` : kindLabel || "";
  const eventLabel = String(event?.label || event?.line1 || fallbackLabel || "").trim();
  const when = String(event?.dateLabel || event?.line2 || "").trim();
  return { dateLocal, eventLabel, when };
}

function buildMoonEventPrompt({ story, event }) {
  if (!event) return "";
  const input = resolveMoonEventPromptInput({ story, event });
  const date = input.dateLocal;
  const label = input.eventLabel;
  const when = input.when;

  return [
    X_MOON_EVENT_USER_GUIDE,
    "",
    "INPUT:",
    `DATE: ${date}`,
    `EVENT: ${label}`,
    `WHEN: ${when}`,
  ].join("\n");
}

function validateText(text, { maxChars } = {}) {
  return validateXAiText(text, {
    minChars: 0,
    maxChars: Number.isFinite(Number(maxChars)) ? Number(maxChars) : 180,
    maxHashtags: 0,
    trimHashtags: true,
  });
}

async function generateXMoonEventAiText({ story, dict, openai, maxRetries = 1, event, maxChars }) {
  const apiKey = openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY missing" };

  const envMax = Number(process.env.X_AI_MAX_RETRIES);
  const resolvedMaxRetries = Number.isFinite(envMax) ? Math.max(0, envMax) : maxRetries;
  const baseUrl = openai?.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = openai?.model || process.env.OPENAI_MODEL || "gpt-4o";
  const picked = event || detectMoonEvent({ story, dict, asOfISO: story?.meta?.as_of });
  if (!picked) return { ok: false, error: "moon_event_missing" };

  let retryNote = "";
  let lastReason = "";
  let lastText = "";

  for (let attempt = 0; attempt <= resolvedMaxRetries; attempt++) {
    const userPrompt = buildMoonEventPrompt({ story, event: picked }) +
      (retryNote ? `\n\nRETRY_NOTE: ${retryNote}` : "") +
      (lastText ? `\n\nPREV_OUTPUT:\n${lastText}\n\n上の出力を条件に合わせて整えて再出力。` : "");

    const text = await createChatCompletion({
      apiKey,
      baseUrl,
      model,
      messages: [
        { role: "system", content: SORA_AI_SYSTEM_PROMPT_COMMON },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      maxTokens: 120,
    });

    const verdict = validateText(text, { maxChars });
    if (verdict.ok) return { ok: true, text: verdict.text, model, event: picked };

    lastReason = verdict.reason || "";
    lastText = String(text || "").trim();
    retryNote = `前回は条件外でした（${lastReason}）。2〜4行で短く整えて再出力。`;
  }

  return { ok: false, error: "retry_exceeded", reason: lastReason, last_text: lastText, event: picked };
}

module.exports = {
  detectMoonEvent,
  buildMoonEventPrompt,
  generateXMoonEventAiText,
};
