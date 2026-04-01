"use strict";

const { createChatCompletion } = require("../../../../integrations/openai/openai_client");
const { SORA_AI_SYSTEM_PROMPT_COMMON } = require("../../../../content/prompts/sora/sora_core");
const { X_MONTHLY_USER_GUIDE } = require("../../../../content/prompts/sns/x/monthly");
const { buildNextMoonEvents, formatMoonEventDisplay } = require("../../../../domain/moon");
const { listWithOrb } = require("../../../../domain/aspect_selection");
const { normalizeBodyKey } = require("../../../../domain/canonical");
const { aspectInfo, signJa } = require("../../../../presenters/format/format/common");
const { CORE_PLANETS, DEEP_BODIES } = require("../../../../domain/astro/constants");
const { bodyLabelJa } = require("../../../../presenters/shared/text/tokens");
const { toDateLocalJST } = require("../../../../utils/time");
const { validateXAiText } = require("./common");

function formatMonthLabel(dateLocal) {
  const [y, m] = String(dateLocal || "").split("-");
  if (!y || !m) return "";
  return `${Number(y)}年${Number(m)}月`;
}

function buildMonthlyPoints({ story, dict, max = 3, resonanceMode }) {
  const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
  const coreBodies = new Set(CORE_PLANETS);
  const deepBodies = new Set(DEEP_BODIES);
  const mode = resonanceMode || story?.meta?.resonance_mode || "core";
  const all = listWithOrb(skyAll);
  const corePool = all.filter((row) => {
    const aKey = normalizeBodyKey(row?.a || "");
    const bKey = normalizeBodyKey(row?.b || "");
    return coreBodies.has(aKey) && coreBodies.has(bKey);
  });
  const deepPool = all.filter((row) => {
    const aKey = normalizeBodyKey(row?.a || "");
    const bKey = normalizeBodyKey(row?.b || "");
    return deepBodies.has(aKey) || deepBodies.has(bKey);
  });
  const useDeep = mode === "deep";
  const pool = useDeep
    ? (deepPool.length ? deepPool : corePool)
    : (corePool.length ? corePool : deepPool);
  const picked = pool
    .sort((a, b) => Number(a?.orb_deg) - Number(b?.orb_deg))
    .slice(0, max);

  return picked.map((row) => {
    const aKey = normalizeBodyKey(row?.a || "");
    const bKey = normalizeBodyKey(row?.b || "");
    const aLabel = bodyLabelJa(dict, aKey);
    const bLabel = bodyLabelJa(dict, bKey);
    const aSign = row?.a_sign_ja || signJa(dict, row?.a_sign_key || "");
    const bSign = row?.b_sign_ja || signJa(dict, row?.b_sign_key || "");
    const aspect = aspectInfo(dict, row?.type || row?.aspect || row?.aspT, row?.aspect_deg);
    const aspectLabel = aspect?.label_ja || String(row?.type || row?.aspect || "");
    return `${aLabel}（${aSign}）×${bLabel}（${bSign}）｜${aspectLabel}`;
  });
}

function buildMonthlyContext({ story, dict, asOfISO, resonanceMode }) {
  const dateLocal = story?.meta?.date_local || story?.public?.date_local || toDateLocalJST(new Date());
  const monthLabel = formatMonthLabel(dateLocal);
  const points = buildMonthlyPoints({ story, dict, max: 3, resonanceMode });
  const events = buildNextMoonEvents(asOfISO || story?.meta?.as_of, dict);
  const newEvent = events?.new ? formatMoonEventDisplay(events.new) : null;
  const fullEvent = events?.full ? formatMoonEventDisplay(events.full) : null;

  return { dateLocal, monthLabel, points, newEvent, fullEvent };
}

function buildMonthlyPrompt({ story, dict, context }) {
  const ctx = context || buildMonthlyContext({ story, dict });
  const points = ctx.points && ctx.points.length ? ctx.points.join(" / ") : "none";
  const newLine = ctx.newEvent?.label ? `${ctx.newEvent.label} ${ctx.newEvent.dateLabel || ""}`.trim() : "—";
  const fullLine = ctx.fullEvent?.label ? `${ctx.fullEvent.label} ${ctx.fullEvent.dateLabel || ""}`.trim() : "—";

  return [
    X_MONTHLY_USER_GUIDE,
    "",
    "INPUT:",
    `MONTH: ${ctx.monthLabel || "—"}`,
    `POINTS: ${points}`,
    `NEW_MOON: ${newLine}`,
    `FULL_MOON: ${fullLine}`,
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
};
