"use strict";

const { createChatCompletion } = require("./blog/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_BLUEPRINT_LIGHT,
  SORA_AI_USER_GUIDE_BLUEPRINT_LIGHT,
} = require("./prompts/sora_ai_prompts");

const BANNED_PATTERNS = [
  /あなた/g,
  /きみ/g,
  /君/g,
  /すべき/g,
  /しよう/g,
  /危険/g,
  /最悪/g,
  /注意/g,
  /当たる/g,
  /当てる/g,
  /起きる/g,
  /になる/g,
];

function extractJson(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  if (trimmed.startsWith("{")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return null;
}

function countText(obj) {
  if (obj == null) return "";
  if (typeof obj === "string") return obj;
  if (Array.isArray(obj)) return obj.map(countText).join(" ");
  if (typeof obj === "object") {
    return Object.values(obj).map(countText).join(" ");
  }
  return "";
}

function validateOutput(data) {
  if (!data || typeof data !== "object") return { ok: false, reason: "not_object" };
  if (!Array.isArray(data.sections)) return { ok: false, reason: "sections_missing" };

  const ids = new Set(data.sections.map((s) => s?.id));
  const required = ["natal_list", "summary", "bodies", "chiron", "lilith", "nodes", "angles"];
  for (const id of required) {
    if (!ids.has(id)) return { ok: false, reason: `section_missing:${id}` };
  }

  const allText = countText(data.sections);
  for (const re of BANNED_PATTERNS) {
    if (re.test(allText)) {
      if (data?.footer?.echo && re.test(String(data.footer.echo)) && String(data.footer.echo).includes("あなた")) {
        continue;
      }
      return { ok: false, reason: `banned:${re}` };
    }
  }

  const tooLong = (s, max) => typeof s === "string" && s.length > max;
  const pickSection = (id) => data.sections.find((s) => s?.id === id) || null;

  const summary = pickSection("summary");
  if (Array.isArray(summary?.blocks)) {
    for (const block of summary.blocks) {
      if (tooLong(block?.text, 240)) return { ok: false, reason: "summary_too_long" };
    }
  }

  const bodies = pickSection("bodies");
  if (Array.isArray(bodies?.items)) {
    for (const item of bodies.items) {
      if (tooLong(item?.text, 240)) return { ok: false, reason: "bodies_too_long" };
    }
  }

  const chiron = pickSection("chiron");
  if (tooLong(chiron?.text, 260)) return { ok: false, reason: "chiron_too_long" };
  const lilith = pickSection("lilith");
  if (tooLong(lilith?.text, 260)) return { ok: false, reason: "lilith_too_long" };

  const nodes = pickSection("nodes");
  if (Array.isArray(nodes?.blocks)) {
    for (const block of nodes.blocks) {
      if (tooLong(block?.text, 260)) return { ok: false, reason: "nodes_too_long" };
    }
  }

  const angles = pickSection("angles");
  if (Array.isArray(angles?.items)) {
    for (const item of angles.items) {
      if (tooLong(item?.text, 260)) return { ok: false, reason: "angles_too_long" };
    }
  }

  return { ok: true };
}

async function generateBlueprintLightText({ env, input, maxTokens = 2200 }) {
  const apiKey = env?.OPENAI_API_KEY || process.env.OPENAI_API_KEY || "";
  if (!apiKey) return { ok: false, reason: "no_api_key" };

  const model =
    env?.OPENAI_MODEL_BLUEPRINT_LIGHT ||
    process.env.OPENAI_MODEL_BLUEPRINT_LIGHT ||
    "gpt-4o";
  const baseUrl = process.env.OPENAI_BASE_URL || env?.OPENAI_BASE_URL || "https://api.openai.com/v1";

  const userPrompt = `${SORA_AI_USER_GUIDE_BLUEPRINT_LIGHT}\n\nINPUT:\n${JSON.stringify(input, null, 2)}`;

  let lastError = null;
  for (let i = 0; i < 2; i += 1) {
    try {
      const content = await createChatCompletion({
        apiKey,
        baseUrl,
        model,
        messages: [
          { role: "system", content: SORA_AI_SYSTEM_PROMPT_BLUEPRINT_LIGHT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.6,
        maxTokens,
      });

      const jsonText = extractJson(content);
      if (!jsonText) throw new Error("json_extract_failed");

      const parsed = JSON.parse(jsonText);
      const v = validateOutput(parsed);
      if (!v.ok) throw new Error(`validation_failed:${v.reason}`);

      return { ok: true, data: parsed };
    } catch (e) {
      lastError = e;
    }
  }

  return { ok: false, reason: lastError?.message || "ai_failed" };
}

module.exports = { generateBlueprintLightText };
