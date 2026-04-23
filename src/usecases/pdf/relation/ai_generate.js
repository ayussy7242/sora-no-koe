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

function buildPromptWithGuidance(cfg = {}) {
  const basePrompt = String(cfg?.prompt || "");
  const guidance = cfg?.guidance || null;
  if (!guidance) return `${basePrompt}\n\nINPUT:\n${JSON.stringify(cfg.input || {}, null, 2)}`;

  const lines = [];
  if (guidance.page || guidance.pageKey) {
    lines.push(`#PDF文脈`);
    if (guidance.page) lines.push(`- 対象ページ: ${guidance.page}`);
    if (guidance.pageKey) lines.push(`- page_key: ${guidance.pageKey}`);
  }
  if (guidance.role) {
    lines.push(`#このAI文の役割`);
    lines.push(`- ${guidance.role}`);
  }
  if (Array.isArray(guidance.rule) && guidance.rule.length) {
    lines.push(`#追加ルール`);
    guidance.rule.forEach((rule) => lines.push(`- ${rule}`));
  }

  const guidanceText = lines.length ? `\n\n${lines.join("\n")}` : "";
  return `${basePrompt}${guidanceText}\n\nINPUT:\n${JSON.stringify(cfg.input || {}, null, 2)}`;
}

function parseGeneratedItems(text = "") {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
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
  const meta = {};

  for (const key of keys) {
    const cfg = aiInputs[key];
    if (!cfg?.prompt || !cfg?.input) continue;
    const prompt = buildPromptWithGuidance(cfg);
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
    const items = parseGeneratedItems(limited);
    meta[key] = {
      key,
      source: cfg?.guidance?.source || null,
      role: cfg?.guidance?.role || null,
      output_kind: cfg?.guidance?.output_kind || null,
      item_count: cfg?.guidance?.item_count ?? null,
      prompt_preview: prompt.slice(0, 1200),
      output_length: Array.from(String(limited || "")).length,
      generated_at: new Date().toISOString(),
      items,
      item_count_ok: cfg?.guidance?.output_kind === "lines"
        ? items.length === Number(cfg?.guidance?.item_count || 0)
        : null,
      slots: Array.isArray(cfg?.guidance?.slots) ? cfg.guidance.slots.map((slot) => ({
        slot: slot.slot,
        source: slot.source,
        role: slot.role || "",
        rule: Array.isArray(slot.rule) ? slot.rule : [],
        output_kind: slot.output_kind || "summary",
        item_count: slot.item_count ?? null,
        required: typeof slot.required === "boolean" ? slot.required : null,
        length: slot.length || null,
      })) : [],
    };
  }

  return { ok: true, texts: out, meta };
}

module.exports = { generateRelationAiTexts };
