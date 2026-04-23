"use strict";

const { signJa } = require("../../../../presenters/format/format/common");
const { CORE_PLANETS } = require("../../../../domain/astro/constants");
const { runAiTextPipeline, generateWithRetry } = require("../../../ai_text");
const { PRESETS } = require("../../../ai_text/presets");
const { formatXAiText } = require("../../../ai_text/normalizers");

function validateXAiText(text, opts = {}) {
  const maxChars = Number.isFinite(Number(opts.maxChars)) ? Number(opts.maxChars) : null;
  const minChars = Number.isFinite(Number(opts.minChars)) ? Number(opts.minChars) : null;
  const maxHashtags = Number.isFinite(Number(opts.maxHashtags)) ? Number(opts.maxHashtags) : 0;
  const trimHashtags = opts.trimHashtags !== false;
  const normalizeSpaces = opts.normalizeSpaces !== false;

  const overrides = {
    ...(minChars != null ? { minChars } : {}),
    ...(maxChars != null ? { maxChars } : {}),
    xFormat: { normalizeSpaces, maxChars: maxChars != null ? maxChars : PRESETS.x.base.maxChars },
    hashtagRules: {
      maxHashtags,
      trimHashtags,
    },
  };

  const verdict = runAiTextPipeline({
    rawText: text,
    preset: PRESETS.x.base,
    overrides,
  });

  if (!verdict.ok) return { ok: false, reason: verdict.reason || "invalid" };
  return { ok: true, text: verdict.text, len: verdict.meta?.charCount || Array.from(String(verdict.text || "")).length };
}

function clampText(text, maxChars) {
  const max = Number.isFinite(Number(maxChars)) ? Number(maxChars) : null;
  const t = String(text || "").trim();
  if (!max) return t;
  const chars = Array.from(t);
  if (chars.length <= max) return t;
  return chars.slice(0, max).join("");
}

function stripTrailingPeriod(text) {
  return String(text || "").replace(/[。．.]\s*$/u, "");
}

function getSunMoonLabels({ story, dict }) {
  const transit = story?.public?.transit_signs || {};
  const sunKey = transit?.sun?.sign_key || "";
  const moonKey = transit?.moon?.sign_key || "";
  const sun = transit?.sun?.sign_ja || (sunKey ? signJa(dict, sunKey) : "") || "";
  const moon = transit?.moon?.sign_ja || (moonKey ? signJa(dict, moonKey) : "") || "";
  return { sun, moon };
}

function buildElementCount(story) {
  const counts = story?.meta?.element_count || story?.meta?.sky_strata?.element_count || story?.public?.sky_strata?.element_count || {};
  return {
    fire: Number(counts.fire || 0),
    earth: Number(counts.earth || 0),
    air: Number(counts.air || 0),
    water: Number(counts.water || 0),
  };
}

function buildModalityCount(story) {
  const counts = story?.meta?.modality_count || story?.meta?.sky_strata?.modality_count || story?.public?.sky_strata?.modality_count || {};
  return {
    cardinal: Number(counts.cardinal || 0),
    fixed: Number(counts.fixed || 0),
    mutable: Number(counts.mutable || 0),
  };
}

function buildTransitSigns({ story, dict, bodyOrder } = {}) {
  const transit = story?.meta?.transit_signs || story?.public?.transit_signs || {};
  const order = Array.isArray(bodyOrder) && bodyOrder.length ? bodyOrder : CORE_PLANETS;
  const out = {};
  order.forEach((k) => {
    const signKey = transit?.[k]?.sign_key || "";
    const signLabel = transit?.[k]?.sign_ja || signJa(dict, signKey || "") || "";
    if (signLabel) out[k] = signLabel;
  });
  return out;
}

function buildMorningFallback({ story, dict, maxChars }) {
  const { sun, moon } = getSunMoonLabels({ story, dict });
  const line1 = "朝の空は静かに動き始めています🌅";
  const line2 = (sun && moon)
    ? `太陽は${sun}、月は${moon}にあり、流れの輪郭が立ち上がっています🌌`
    : "空の配置がゆっくりと形を持ち始めています🌌";
  const line3 = "空にはまだ静かな余白が残っています🌿";
  const text = [line1, "", line2, "", line3].join("\n");
  return clampText(text, maxChars);
}

function buildNightFallback({ story, dict, maxChars, nextHint }) {
  const { sun, moon } = getSunMoonLabels({ story, dict });
  const line1 = "夜の空は静かに深まっています🌙";
  const line2 = (sun && moon)
    ? `太陽は${sun}、月は${moon}にあり、今日の気配が残る配置です🌌`
    : (moon ? `月は${moon}にあり、夜の質感がゆるやかに続きます🌌` : "夜の質感がゆるやかに続きます🌌");
  const hintText = stripTrailingPeriod(nextHint || "空は次の流れへ向かっています");
  const line3 = `${hintText}🌊`;
  const text = [line1, "", line2, "", line3].join("\n");
  return clampText(text, maxChars);
}

function buildResonanceFallback({ story, dict, maxChars, aspect }) {
  const raw = aspect?.raw || story?.meta?.x_source?.resonance_aspect || {};
  const aSign = aspect?.aSign || raw?.a_sign_ja || signJa(dict, raw?.a_sign_key || "");
  const bSign = aspect?.bSign || raw?.b_sign_ja || signJa(dict, raw?.b_sign_key || "");
  const pair = [aSign, bSign].filter(Boolean).join("と");

  const line1 = "空に小さな交差が生まれています🌌";
  const line2 = pair
    ? `${pair}の間で、静かな張力が残っています🌊`
    : "静かな張力が空に残っています🌊";
  const line3 = "空の振動がゆっくり広がっています✨";
  const text = [line1, "", line2, "", line3].join("\n");
  return clampText(text, maxChars);
}

function buildGenericFallback({ maxChars }) {
  const text = "空の流れを静かに観測します。";
  return clampText(text, maxChars);
}

function fallbackFactory(args = {}) {
  const channel = args.channel || "";
  switch (channel) {
    case "x_morning":
      return buildMorningFallback(args);
    case "x_night":
      return buildNightFallback(args);
    case "x_resonance":
      return buildResonanceFallback(args);
    default:
      return buildGenericFallback(args);
  }
}

function truncateToMaxChars(text, maxChars) {
  const max = Number.isFinite(Number(maxChars)) ? Number(maxChars) : null;
  if (!max) return String(text || "").trim();
  const chars = Array.from(String(text || "").trim());
  if (chars.length <= max) return chars.join("");
  return chars.slice(0, max).join("");
}

function buildRetryNote({ reason, template, minChars, maxChars, channel }) {
  if (typeof template === "function") {
    return template({ reason, minChars, maxChars, channel });
  }
  const base = String(template || "前回は条件外でした（${reason}）。条件に合わせて整えて再出力。");
  return base
    .replace(/\$\{reason\}/g, String(reason || "unknown"))
    .replace(/\$\{minChars\}/g, String(minChars ?? ""))
    .replace(/\$\{maxChars\}/g, String(maxChars ?? ""))
    .replace(/\$\{channel\}/g, String(channel || ""));
}

async function generateXAiWithRetry(opts = {}) {
  const channel = opts.channel || "";
  const prompt = String(opts.prompt || "").trim();
  const minChars = Number.isFinite(Number(opts.minChars)) ? Number(opts.minChars) : undefined;
  const maxChars = Number.isFinite(Number(opts.maxChars)) ? Number(opts.maxChars) : undefined;
  const maxTokens = Number.isFinite(Number(opts.maxTokens)) ? Number(opts.maxTokens) : 160;
  const temperature = Number.isFinite(Number(opts.temperature)) ? Number(opts.temperature) : 0.5;
  const envMax = Number(process.env.X_AI_MAX_RETRIES);
  const maxRetries = Number.isFinite(envMax)
    ? Math.max(0, envMax)
    : Number.isFinite(Number(opts.maxRetries))
      ? Number(opts.maxRetries)
      : 5;
  const fallbackFn = typeof opts.fallbackFactory === "function" ? opts.fallbackFactory : null;
  const allowFallback = opts.allowFallback !== false;
  const acceptTooLongByTruncation = opts.acceptTooLongByTruncation === true;
  const fallbackContext = opts.fallbackContext || {};
  const story = opts.story;
  const dict = opts.dict;

  const openai = opts.openai || {};
  const apiKey = openai.apiKey || process.env.OPENAI_API_KEY;
  const model = openai.model || process.env.OPENAI_MODEL || "gpt-4o";
  const systemPrompt = opts.systemPrompt || "";
  const create = opts.createChatCompletion;

  const finalizeFallback = (fallbackText, reason) => {
    const formatted = formatXAiText(fallbackText || "", { maxLineChars: opts.maxLineChars });
    const trimmed = truncateToMaxChars(formatted, maxChars);
    const safeText = trimmed || "空の流れを静かに観測します。";
    return {
      ok: true,
      text: safeText,
      model: model || null,
      fallback: true,
      fallback_reason: reason || "",
    };
  };

  if (!apiKey) {
    if (fallbackFn && allowFallback) {
      return finalizeFallback(
        fallbackFn({ channel, story, dict, maxChars, error: "OPENAI_API_KEY missing", errorReason: "OPENAI_API_KEY missing", ...fallbackContext }),
        "OPENAI_API_KEY missing"
      );
    }
    return { ok: false, error: "OPENAI_API_KEY missing" };
  }
  if (typeof create !== "function") {
    if (fallbackFn && allowFallback) {
      return finalizeFallback(
        fallbackFn({ channel, story, dict, maxChars, error: "createChatCompletion missing", errorReason: "createChatCompletion missing", ...fallbackContext }),
        "createChatCompletion missing"
      );
    }
    return { ok: false, error: "createChatCompletion missing" };
  }
  if (!prompt) {
    if (fallbackFn && allowFallback) {
      return finalizeFallback(
        fallbackFn({ channel, story, dict, maxChars, error: "prompt empty", errorReason: "prompt empty", ...fallbackContext }),
        "prompt empty"
      );
    }
    return { ok: false, error: "prompt empty" };
  }

  const result = await generateWithRetry({
    prompt,
    buildRetryNote: (reason) => {
      if (String(reason || "").startsWith("openai_error:")) {
        const message = String(reason || "").replace(/^openai_error:/, "");
        console.error("[x_ai_common] OpenAI error", { channel, message });
      }
      return buildRetryNote({
        reason,
        template: opts.retryNoteTemplate,
        minChars,
        maxChars,
        channel,
      });
    },
    validate: ({ raw }) => {
      const verdict = validateXAiText(raw, { minChars, maxChars });
      if (verdict.ok) return { ok: true, text: verdict.text };
      return { ok: false, reason: verdict.reason || "" };
    },
    createChatCompletion: create,
    openai: {
      apiKey,
      baseUrl: openai.baseUrl,
      model,
      maxRetries: openai.maxRetries,
    },
    maxRetries,
    systemPrompt,
    temperature,
    maxTokens,
    context: { channel, story, dict, minChars, maxChars },
  });

  if (result.ok) {
    const len = Array.from(String(result.text || "")).length;
    return { ok: true, text: result.text, model, len, attempts: result.attempts, last_text: result.lastText };
  }

  if (acceptTooLongByTruncation && String(result.reason || "").startsWith("too_long:") && result.lastText) {
    const formatted = formatXAiText(result.lastText, { maxLineChars: opts.maxLineChars });
    const trimmed = truncateToMaxChars(formatted, maxChars);
    const verdict = validateXAiText(trimmed, { minChars, maxChars });
    if (verdict.ok && verdict.text) {
      return {
        ok: true,
        text: verdict.text,
        model,
        len: verdict.len,
        attempts: result.attempts,
        last_text: result.lastText,
        truncated: true,
        fallback: false,
      };
    }
  }

  if (fallbackFn && allowFallback) {
    const fallbackResult = finalizeFallback(
      fallbackFn({
        channel,
        story,
        dict,
        maxChars,
        error: result.error || "retry_exceeded",
        errorReason: result.reason,
        lastText: result.lastText,
        minChars,
        ...fallbackContext,
      }),
      result.reason || "retry_exceeded"
    );
    return { ...fallbackResult, attempts: result.attempts, last_text: result.lastText };
  }

  return { ok: false, error: result.error || "retry_exceeded", reason: result.reason, last_text: result.lastText, attempts: result.attempts };
}

module.exports = {
  formatXAiText,
  validateXAiText,
  buildElementCount,
  buildModalityCount,
  buildTransitSigns,
  generateXAiWithRetry,
  fallbackFactory,
};
