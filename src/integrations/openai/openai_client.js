"use strict";

function normalizeBaseUrl(baseUrl) {
  const s = String(baseUrl || "").trim();
  return s.replace(/\/+$/, "");
}

async function createChatCompletion({ apiKey, baseUrl, model, messages, temperature = 0.7, maxTokens = 1200 }) {
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");
  const base = normalizeBaseUrl(baseUrl || "https://api.openai.com/v1");
  const url = `${base}/chat/completions`;

  const payload = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || JSON.stringify(json);
    throw new Error(`OpenAI request failed (${res.status}): ${msg}`);
  }

  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned empty content");
  return String(content).trim();
}

module.exports = { createChatCompletion };
