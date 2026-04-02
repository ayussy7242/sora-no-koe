"use strict";

const { createChatCompletion } = require("../../../../integrations/openai/openai_client");
const { SORA_AI_SYSTEM_PROMPT_COMMON } = require("../../../../content/prompts/sora/sora_core");
const { X_MONTHLY_USER_GUIDE } = require("../../../../content/prompts/sns/x/monthly");
const {
  buildMoonEventsInMonth,
  listMoonSignChangesInMonth,
} = require("../../../../domain/moon");
const { buildMonthlyHighlights } = require("../../../../domain/monthly");
const { toDateLocalJST } = require("../../../../utils/time");
const { formatDateYmdHm } = require("../../../../domain/astro/compute");
const { validateXAiText } = require("./common");

function formatSignChangeItem(row) {
  if (!row || !(row.date instanceof Date) || Number.isNaN(row.date.getTime())) return "";
  const when = formatDateYmdHm(row.date);
  const fromLabel = row?.from?.label || "";
  const toLabel = row?.to?.label || "";
  const dir = fromLabel && toLabel ? `${fromLabel}→${toLabel}` : (toLabel || fromLabel);
  return [when, dir].filter(Boolean).join(" ");
}

function formatSignChanges(signChanges = [], { maxItems = 6 } = {}) {
  if (!Array.isArray(signChanges) || !signChanges.length) return "—";
  const items = signChanges
    .map(formatSignChangeItem)
    .filter(Boolean)
    .slice(0, maxItems);
  return items.length ? items.join(" / ") : "—";
}

function resolveXMonthlyPromptInput({ story, dict, asOfISO, resonanceMode } = {}) {
  const dateLocal = story?.meta?.date_local || story?.public?.date_local || toDateLocalJST(new Date());
  const points = buildMonthlyHighlights({ story, dict, max: 3, resonanceMode });
  const moonEvents = buildMoonEventsInMonth({ dateLocal, asOfISO: asOfISO || story?.meta?.as_of, dict });
  const signChanges = listMoonSignChangesInMonth({ dateLocal, asOfISO: asOfISO || story?.meta?.as_of, dict });
  const signChangesLine = formatSignChanges(signChanges);

  return {
    dateLocal,
    monthLabel: moonEvents?.monthLabel || "",
    monthKey: moonEvents?.monthKey || "",
    points,
    newEvent: moonEvents?.newEvent || null,
    fullEvent: moonEvents?.fullEvent || null,
    signChanges,
    signChangesLine,
  };
}

function buildMonthlyContext({ story, dict, asOfISO, resonanceMode }) {
  return resolveXMonthlyPromptInput({ story, dict, asOfISO, resonanceMode });
}

function buildMonthlyPrompt({ story, dict, context }) {
  const ctx = context || buildMonthlyContext({ story, dict });
  const points = ctx.points && ctx.points.length ? ctx.points.join(" / ") : "none";
  const newLine = ctx.newEvent?.label ? `${ctx.newEvent.label} ${ctx.newEvent.dateLabel || ""}`.trim() : "—";
  const fullLine = ctx.fullEvent?.label ? `${ctx.fullEvent.label} ${ctx.fullEvent.dateLabel || ""}`.trim() : "—";
  const signChanges = ctx.signChangesLine || "—";

  return [
    X_MONTHLY_USER_GUIDE,
    "",
    "INPUT:",
    `MONTH: ${ctx.monthLabel || "—"}`,
    `POINTS: ${points}`,
    `NEW_MOON: ${newLine}`,
    `FULL_MOON: ${fullLine}`,
    `MOON_SIGN_CHANGES: ${signChanges}`,
  ].join("\n");
}

function validateText(text) {
  return validateXAiText(text);
}

async function generateXMonthlyAiText({ story, dict, openai, maxRetries = 1, context }) {
  const apiKey = openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY missing" };

  const envMax = Number(process.env.X_AI_MAX_RETRIES);
  const resolvedMaxRetries = Number.isFinite(envMax) ? Math.max(0, envMax) : maxRetries;
  const baseUrl = openai?.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = openai?.model || process.env.OPENAI_MODEL || "gpt-4o";
  const ctx = context || buildMonthlyContext({ story, dict });

  let retryNote = "";
  let lastReason = "";
  let lastText = "";

  for (let attempt = 0; attempt <= resolvedMaxRetries; attempt++) {
    const userPrompt = buildMonthlyPrompt({ story, dict, context: ctx }) +
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
  buildMonthlyContext,
  buildMonthlyPrompt,
  generateXMonthlyAiText,
  resolveXMonthlyPromptInput,
};
