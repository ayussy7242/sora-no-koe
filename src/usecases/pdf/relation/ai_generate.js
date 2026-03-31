"use strict";

const { createChatCompletion } = require("../../../integrations/openai/openai_client");
const { SYSTEM_BLUEPRINT_LIGHT } = require("../../../content/prompts/pdf/blueprint/light");
const { normalizeV2Text } = require("../blueprint/generation/text_utils");

function enforceSentenceLimit(text, maxSentences) {
  if (!maxSentences || maxSentences <= 0) return text;
  const parts = String(text || "")
    .split(/[。！？]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const sliced = parts.slice(0, maxSentences);
  if (!sliced.length) return text;
  let out = sliced.join("。");
  if (out && !out.endsWith("。")) out = `${out}。`;
  return out;
}

async function generateRelationAiTexts({ env, aiInputs } = {}) {
  const apiKey = env?.OPENAI_API_KEY || process.env.OPENAI_API_KEY || "";
  if (!apiKey) return { ok: false, reason: "no_api_key" };
  const model =
    env?.OPENAI_MODEL_RELATION ||
    process.env.OPENAI_MODEL_RELATION ||
    env?.OPENAI_MODEL_BLUEPRINT_LIGHT ||
    process.env.OPENAI_MODEL_BLUEPRINT_LIGHT ||
    "gpt-4o";
  const baseUrl = process.env.OPENAI_BASE_URL || env?.OPENAI_BASE_URL || "https://api.openai.com/v1";

  const keys = Object.keys(aiInputs || {});
  const out = {};

  for (const key of keys) {
    const cfg = aiInputs[key];
    if (!cfg?.prompt || !cfg?.input) continue;
    const prompt = `${cfg.prompt}\n\nINPUT:\n${JSON.stringify(cfg.input || {}, null, 2)}`;
    const content = await createChatCompletion({
      apiKey,
      baseUrl,
      model,
      messages: [
        { role: "system", content: SYSTEM_BLUEPRINT_LIGHT },
        { role: "user", content: prompt },
      ],
      temperature: 0.8,
      maxTokens: 900,
    });
    const raw = normalizeV2Text(content, {});
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      parsed = null;
    }
    let textOut = raw;
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.text === "string") {
        textOut = parsed.text;
      } else if (Array.isArray(parsed.lines)) {
        textOut = parsed.lines.filter((line) => typeof line === "string" && line.trim()).join("\n");
      }
    }
    const limited = enforceSentenceLimit(textOut, cfg?.limits?.sentences);
    out[key] = limited;
  }

  return { ok: true, texts: out };
}

module.exports = { generateRelationAiTexts };
