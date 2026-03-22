"use strict";

function normalizeBaseUrl(baseUrl) {
  const s = String(baseUrl || "").trim();
  return s.replace(/\/+$/, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  if (!Number.isFinite(Number(status))) return false;
  const s = Number(status);
  return s === 408 || s === 409 || s === 429 || (s >= 500 && s <= 599);
}

async function createChatCompletion({
  apiKey,
  baseUrl,
  model,
  messages,
  temperature = 0.7,
  maxTokens = 1200,
  timeoutMs = 120000,
  maxRetries = 6,
  retryBaseMs = 1200,
  retryMaxMs = 12000,
} = {}) {
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");
  const base = normalizeBaseUrl(baseUrl || "https://api.openai.com/v1");
  const url = `${base}/chat/completions`;

  const payload = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  let attempt = 0;
  let lastError = null;
  const maxTry = Math.max(0, Number(maxRetries));

  while (attempt <= maxTry) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = Number.isFinite(Number(timeoutMs)) && timeoutMs > 0
      ? setTimeout(() => {
        if (controller) controller.abort();
      }, Number(timeoutMs))
      : null;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined,
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json?.error?.message || JSON.stringify(json);
        const err = new Error(`OpenAI request failed (${res.status}): ${msg}`);
        err.status = res.status;
        err.response = json;
        throw err;
      }

      const content = json?.choices?.[0]?.message?.content;
      if (!content) throw new Error("OpenAI returned empty content");
      return String(content).trim();
    } catch (err) {
      lastError = err;
      const status = err?.status;
      const retryable = isRetryableStatus(status) || err?.name === "AbortError";
      if (!retryable || attempt >= maxTry) break;
      const expo = Math.min(retryMaxMs, retryBaseMs * Math.pow(1.8, attempt));
      const jitter = expo * (0.2 + Math.random() * 0.3);
      await sleep(expo + jitter);
      attempt += 1;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  throw lastError || new Error("OpenAI request failed");
}

module.exports = { createChatCompletion };
