"use strict";

function resolveMaxRetries(value, fallback) {
  const n = Number(value);
  if (Number.isFinite(n)) return Math.max(0, n);
  const base = Number(fallback);
  return Number.isFinite(base) ? Math.max(0, base) : 0;
}

function buildRetryNote(buildRetryNoteFn, reason, meta) {
  if (typeof buildRetryNoteFn !== "function") return "";
  return String(buildRetryNoteFn(reason, meta) || "");
}

async function generateWithRetry(opts = {}) {
  const buildPrompt = opts.buildPrompt;
  const promptRaw = opts.prompt;
  const validate = opts.validate;
  const buildRetryNoteFn = opts.buildRetryNote;
  const createChatCompletion = opts.createChatCompletion;
  const context = opts.context || {};

  const openai = opts.openai || {};
  const apiKey = openai.apiKey || process.env.OPENAI_API_KEY;
  const baseUrl = openai.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = openai.model || process.env.OPENAI_MODEL || "gpt-4o";

  const maxRetries = resolveMaxRetries(
    opts.maxRetries,
    Number.isFinite(Number(openai.maxRetries)) ? Number(openai.maxRetries) : opts.defaultMaxRetries ?? 5
  );

  if (!apiKey) {
    return { ok: false, text: null, reason: "OPENAI_API_KEY missing", attempts: 0, lastText: "", error: "OPENAI_API_KEY missing" };
  }
  if (typeof createChatCompletion !== "function") {
    return { ok: false, text: null, reason: "createChatCompletion missing", attempts: 0, lastText: "", error: "createChatCompletion missing" };
  }
  if (typeof validate !== "function") {
    return { ok: false, text: null, reason: "validate missing", attempts: 0, lastText: "", error: "validate missing" };
  }
  if (typeof buildPrompt !== "function" && !String(promptRaw || "").trim()) {
    return { ok: false, text: null, reason: "prompt empty", attempts: 0, lastText: "", error: "prompt empty" };
  }

  const systemPrompt = String(opts.systemPrompt || "");
  const temperature = Number.isFinite(Number(opts.temperature)) ? Number(opts.temperature) : 0.5;
  const maxTokens = Number.isFinite(Number(opts.maxTokens)) ? Number(opts.maxTokens) : 160;

  let retryNote = "";
  let lastReason = "";
  let lastText = "";
  let attempts = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const basePrompt = typeof buildPrompt === "function"
      ? String(buildPrompt({ attempt, context }) || "")
      : String(promptRaw || "");
    const prompt = basePrompt.trim();
    if (!prompt) {
      return {
        ok: false,
        text: null,
        reason: "prompt empty",
        attempts,
        lastText,
        error: "prompt empty",
      };
    }

    const userPrompt = prompt +
      (retryNote ? `\n\nRETRY_NOTE: ${retryNote}` : "") +
      (lastText ? `\n\nPREV_OUTPUT:\n${lastText}\n\n上の出力を条件に合わせて整えて再出力。` : "");

    let raw = "";
    attempts += 1;
    try {
      raw = await createChatCompletion({
        apiKey,
        baseUrl,
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature,
        maxTokens,
      });
    } catch (err) {
      const message = err?.message || String(err || "openai_error");
      lastReason = `openai_error:${message}`;
      lastText = "";
      retryNote = buildRetryNote(buildRetryNoteFn, lastReason, { attempt, context, text: "", raw: "" });
      continue;
    }

    const rawText = String(raw || "");
    const text = rawText.trim();
    const verdict = validate({ text, raw: rawText, attempt, context });
    if (verdict?.ok) {
      const finalText = verdict.text != null ? verdict.text : text;
      return {
        ok: true,
        text: finalText,
        reason: verdict.reason || "",
        attempts,
        lastText: rawText,
        error: null,
      };
    }

    lastReason = verdict?.reason || "invalid";
    lastText = rawText;
    retryNote = buildRetryNote(buildRetryNoteFn, lastReason, { attempt, context, text, raw: rawText });
  }

  return {
    ok: false,
    text: null,
    reason: lastReason || "retry_exceeded",
    attempts,
    lastText,
    error: lastReason || "retry_exceeded",
  };
}

module.exports = {
  generateWithRetry,
};
