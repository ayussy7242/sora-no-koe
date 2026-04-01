"use strict";

const { createChatCompletion } = require("../../../../integrations/openai/openai_client");
const { SORA_AI_SYSTEM_PROMPT_COMMON } = require("../../../../content/prompts/sora/sora_ai_prompts");
const { X_NEXT_30_DAYS_USER_GUIDE } = require("../../../../content/prompts/sns/x/next_30_days");
const { buildMonthlyContext } = require("./monthly");
const { toDateLocalJST } = require("../../../../utils/time_utils");
const { validateXAiText } = require("./common");

function monthKeyFromDateLocal(dateLocal) {
  const parts = String(dateLocal || "").split("-");
  if (parts.length < 2) return "";
  return `${parts[0]}-${String(parts[1]).padStart(2, "0")}`;
}

function buildNext30DaysContext({ story, dict, asOfISO }) {
  const base = buildMonthlyContext({ story, dict, asOfISO });
  const dateLocal = base?.dateLocal || story?.meta?.date_local || story?.public?.date_local || toDateLocalJST(new Date());
  const monthKey = monthKeyFromDateLocal(dateLocal);
  const filterInMonth = (ev) => {
    if (!ev?.date || !(ev.date instanceof Date)) return null;
    const evKey = toDateLocalJST(ev.date).slice(0, 7);
    return evKey === monthKey ? ev : null;
  };
  const newEvent = filterInMonth(base?.newEvent);
  const fullEvent = filterInMonth(base?.fullEvent);

  return { ...base, dateLocal, monthKey, newEvent, fullEvent };
}

function buildNext30DaysPrompt({ story, dict, context }) {
  const ctx = context || buildNext30DaysContext({ story, dict });
  const points = ctx.points && ctx.points.length ? ctx.points.join(" / ") : "none";
  const newLine = ctx.newEvent?.label ? `${ctx.newEvent.label} ${ctx.newEvent.dateLabel || ""}`.trim() : "—";
  const fullLine = ctx.fullEvent?.label ? `${ctx.fullEvent.label} ${ctx.fullEvent.dateLabel || ""}`.trim() : "—";

  return [
    X_NEXT_30_DAYS_USER_GUIDE,
    "",
    "INPUT:",
    `MONTH: ${ctx.monthLabel || "—"}`,
    `POINTS: ${points}`,
    `NEW_MOON: ${newLine}`,
    `FULL_MOON: ${fullLine}`,
  ].join("\n");
}

function validateText(text) {
  return validateXAiText(text, { minChars: 0, maxChars: 180, maxHashtags: 3, trimHashtags: true });
}

async function generateXNext30DaysAiText({ story, dict, openai, maxRetries = 1, context }) {
  const apiKey = openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY missing" };

  const envMax = Number(process.env.X_AI_MAX_RETRIES);
  const resolvedMaxRetries = Number.isFinite(envMax) ? Math.max(0, envMax) : maxRetries;
  const baseUrl = openai?.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = openai?.model || process.env.OPENAI_MODEL || "gpt-4o";
  const ctx = context || buildNext30DaysContext({ story, dict });

  let retryNote = "";
  let lastReason = "";
  let lastText = "";

  for (let attempt = 0; attempt <= resolvedMaxRetries; attempt++) {
    const userPrompt = buildNext30DaysPrompt({ story, dict, context: ctx }) +
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
      maxTokens: 200,
    });

    const verdict = validateText(text);
    if (verdict.ok) return { ok: true, text: verdict.text, model, context: ctx };

    lastReason = verdict.reason || "";
    lastText = String(text || "").trim();
    retryNote = `前回は条件外でした（${lastReason}）。3〜6行で短く整えて再出力。`;
  }

  return { ok: false, error: "retry_exceeded", reason: lastReason, last_text: lastText, context: ctx };
}

module.exports = {
  buildNext30DaysContext,
  buildNext30DaysPrompt,
  generateXNext30DaysAiText,
};
