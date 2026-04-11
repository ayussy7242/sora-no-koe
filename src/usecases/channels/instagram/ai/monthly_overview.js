"use strict";

const { createChatCompletion } = require("../../../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
  SORA_AI_USER_GUIDE_IG_MONTHLY_CAPTION,
} = require("../../../../content/prompts/sora/sora_core");
const { runAiTextPipeline, generateWithRetry } = require("../../../ai_text");
const { PRESETS } = require("../../../ai_text/presets");
const { resolveMaxRetries } = require("./utils");
const { aspectInfo, signJa } = require("../../../../presenters/format/format/common");
const { bodyLabelJa } = require("../../../../presenters/shared/text/tokens");
const { normalizeBodyKey } = require("../../../../domain/canonical");

function formatMonthDot(month) {
  const [y, m] = String(month || "").split("-");
  if (!y || !m) return String(month || "");
  return `${y}.${m}`;
}

function formatPhaseLine({ item, dict }) {
  if (!item?.date_local) return "";
  const sign = signJa(dict, item.sign_key || "");
  const label = item.label || "";
  const moonName = item.moon_name_en || item.moon_name_ja || "";
  return [item.date_local, sign, label, moonName].filter(Boolean).join(" ");
}

function formatRetroLine({ item, dict }) {
  if (!item?.start_local || !item?.end_local) return "";
  const body = bodyLabelJa(dict, normalizeBodyKey(item.planet_key || "")) || item.planet_key || "";
  const signStart = signJa(dict, item.sign_key_start || "");
  const signEnd = signJa(dict, item.sign_key_end || "");
  const signLabel = signStart && signEnd && signStart !== signEnd ? `${signStart}→${signEnd}` : (signStart || signEnd || "");
  return [body, item.start_local, "〜", item.end_local, signLabel].filter(Boolean).join(" ");
}

function formatIngressLine({ item, dict }) {
  if (!item?.date_local) return "";
  const body = bodyLabelJa(dict, normalizeBodyKey(item.planet_key || "")) || item.planet_key || "";
  const sign = signJa(dict, item.sign_key || "");
  return [item.date_local, body, "→", sign].filter(Boolean).join(" ");
}

function formatAspectLine({ item, dict }) {
  if (!item?.date_local) return "";
  const a = bodyLabelJa(dict, normalizeBodyKey(item.a || "")) || item.a || "";
  const b = bodyLabelJa(dict, normalizeBodyKey(item.b || "")) || item.b || "";
  const aSign = signJa(dict, item.a_sign_key || "") || "";
  const bSign = signJa(dict, item.b_sign_key || "") || "";
  const info = aspectInfo(dict, item.aspect_key || item.type || "", item.aspect_deg);
  const aspectLabel = info?.label_ja || String(item.aspect_key || item.type || "").trim();
  const deg = Number.isFinite(Number(info?.deg)) ? `${Number(info.deg)}°` : "";
  return [item.date_local, a, aSign, aspectLabel, deg, b, bSign].filter(Boolean).join(" ");
}

function buildCaptionPrompt({ month, reference, dict }) {
  const phases = Array.isArray(reference?.moon?.phases) ? reference.moon.phases : [];
  const retrogrades = Array.isArray(reference?.retrogrades) ? reference.retrogrades : [];
  const ingresses = Array.isArray(reference?.sign_ingresses) ? reference.sign_ingresses : [];
  const aspects = Array.isArray(reference?.aspects) ? reference.aspects : [];

  const phaseLines = phases.map((p) => formatPhaseLine({ item: p, dict })).filter(Boolean);
  const retroLines = retrogrades.map((r) => formatRetroLine({ item: r, dict })).filter(Boolean);
  const ingressLines = ingresses.map((r) => formatIngressLine({ item: r, dict })).filter(Boolean);
  const aspectLines = aspects.map((a) => formatAspectLine({ item: a, dict })).filter(Boolean);

  return [
    SORA_AI_USER_GUIDE_IG_MONTHLY_CAPTION,
    "",
    "INPUT:",
    `MONTH: ${month}`,
    `TITLE_LINE: ⭐️ ${formatMonthDot(month)} 今月の星カレンダー`,
    `PHASES: ${phaseLines.join(" | ")}`,
    `RETROGRADES: ${retroLines.join(" | ")}`,
    `SIGN_INGRESSES: ${ingressLines.join(" | ")}`,
    `ASPECTS: ${aspectLines.join(" | ")}`,
  ].join("\n");
}

function buildCaptionFallback({ month, reference, dict }) {
  const lines = [];
  const fulls = (reference?.moon?.phases || []).filter((p) => p.phase_key === "full");
  const news = (reference?.moon?.phases || []).filter((p) => p.phase_key === "new");
  fulls.forEach((p) => {
    lines.push([p.date_local, signJa(dict, p.sign_key || ""), "満月", p.moon_name_en || p.moon_name_ja || ""].filter(Boolean).join(" "));
  });
  news.forEach((p) => {
    lines.push([p.date_local, signJa(dict, p.sign_key || ""), "新月"].filter(Boolean).join(" "));
  });
  (reference?.sign_ingresses || []).slice(0, 4).forEach((i) => {
    const body = bodyLabelJa(dict, normalizeBodyKey(i.planet_key || "")) || i.planet_key || "";
    lines.push([i.date_local, body, "→", signJa(dict, i.sign_key || "")].filter(Boolean).join(" "));
  });
  (reference?.retrogrades || []).slice(0, 3).forEach((r) => {
    const body = bodyLabelJa(dict, normalizeBodyKey(r.planet_key || "")) || r.planet_key || "";
    lines.push([body, r.start_local, "〜", r.end_local].filter(Boolean).join(" "));
  });
  const tags = buildCaptionHashtags({ reference, dict });
  return [lines.filter(Boolean).slice(0, 10).join("\n"), tags].filter(Boolean).join("\n");
}

function buildCaptionHashtags({ reference, dict }) {
  const tags = new Set();
  const add = (t) => {
    const v = String(t || "").trim();
    if (!v) return;
    tags.add(v.startsWith("#") ? v : `#${v}`);
  };
  add("ソラのこえ");
  add("今月の空");
  add("月相");
  add("逆行");
  add("星座移動");

  const phases = Array.isArray(reference?.moon?.phases) ? reference.moon.phases : [];
  phases.forEach((p) => {
    const sign = signJa(dict, p.sign_key || "");
    if (sign) add(sign);
  });
  (reference?.retrogrades || []).forEach((r) => {
    const body = bodyLabelJa(dict, normalizeBodyKey(r.planet_key || "")) || "";
    if (body) add(body);
  });
  (reference?.sign_ingresses || []).forEach((i) => {
    const body = bodyLabelJa(dict, normalizeBodyKey(i.planet_key || "")) || "";
    if (body) add(body);
  });

  return Array.from(tags).slice(0, 10).join(" ");
}

async function generateIgMonthlyCaptionText({ month, reference, dict, openai, maxRetries = 1 }) {
  const apiKey = openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY missing" };

  const model = openai?.model || process.env.OPENAI_MODEL || "gpt-4o";
  const resolvedMaxRetries = resolveMaxRetries({ maxRetries, openaiMaxRetries: openai?.maxRetries });

  const result = await generateWithRetry({
    buildPrompt: () => buildCaptionPrompt({ month, reference, dict }),
    buildRetryNote: () =>
      "条件外でした。今月の予定が読める形式で、全項目を含め、まとめ行とハッシュタグ行まで書いて再出力してください。",
    validate: ({ raw }) => {
      const verdict = runAiTextPipeline({
        rawText: raw,
        preset: PRESETS.ig.monthly_caption,
      });
      if (!verdict.ok) return { ok: false, reason: verdict.reason || "" };
      const text = String(verdict.text || "");
      if (!text.includes("今月の空模様のまとめ")) return { ok: false, reason: "missing_summary" };
      if (!text.split("\n").some((line) => line.trim().startsWith("#"))) return { ok: false, reason: "missing_hashtags" };
      return { ok: true, text: verdict.text };
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
    maxTokens: 520,
    context: { month, reference },
  });

  if (result.ok) return { ok: true, text: result.text, model, attempts: result.attempts, last_text: result.lastText };

  if (String(result.error || "").includes("missing") || String(result.error || "").startsWith("openai_error:")) {
    return { ok: false, error: result.error || "retry_exceeded", reason: result.reason, attempts: result.attempts, last_text: result.lastText };
  }

  const fallback = buildCaptionFallback({ month, reference, dict });
  return {
    ok: true,
    text: fallback,
    model,
    fallback: true,
    reason: result.reason || "",
    fallback_reason: result.reason || result.error || "",
    attempts: result.attempts,
    last_text: result.lastText,
  };
}

module.exports = {
  generateIgMonthlyCaptionText,
  formatMonthDot,
  buildCaptionFallback,
  buildCaptionHashtags,
};
