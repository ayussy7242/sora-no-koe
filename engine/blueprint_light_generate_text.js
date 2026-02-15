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
  /すると良い/g,
  /するとよい/g,
  /必ず/g,
  /確実/g,
  /が起きる/g,
  /になる/g,
];

const MIN_BODY_CHARS = 180;
const REQUIRED_BODY_KEYS = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
];
const REQUIRED_ANGLE_KEYS = ["asc", "mc", "ic", "dc"];

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

function isTooShort(text, minChars = MIN_BODY_CHARS) {
  if (typeof text !== "string") return true;
  return text.trim().length < minChars;
}

function isEmptyText(text) {
  return !text || String(text).trim().length === 0;
}

function validateOutput(data) {
  if (!data || typeof data !== "object") return { ok: false, reason: "not_object" };
  if (!Array.isArray(data.sections)) return { ok: false, reason: "sections_missing" };

  const ids = new Set(data.sections.map((s) => s?.id));
  const required = ["summary", "bodies", "chiron", "lilith", "nodes", "angles"];
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
  const MAX_BODY_CHARS = 380;
  const pickSection = (id) => data.sections.find((s) => s?.id === id) || null;

  const summary = pickSection("summary");
  if (Array.isArray(summary?.blocks)) {
    for (const block of summary.blocks) {
      if (!block?.text || String(block.text).trim().length === 0) {
        return { ok: false, reason: "summary_empty" };
      }
      if (tooLong(block?.text, 240)) return { ok: false, reason: "summary_too_long" };
    }
  }

  const normalizeKey = (key) => String(key || "").trim().toLowerCase();
  const bodies = pickSection("bodies");
  if (Array.isArray(bodies?.items)) {
    if (bodies.items.length !== REQUIRED_BODY_KEYS.length) return { ok: false, reason: "bodies_count" };
    const bodyKeys = bodies.items.map((item) => normalizeKey(item?.key));
    for (let i = 0; i < REQUIRED_BODY_KEYS.length; i += 1) {
      if (bodyKeys[i] !== REQUIRED_BODY_KEYS[i]) return { ok: false, reason: "bodies_keys" };
    }
    for (const item of bodies.items) {
      if (isEmptyText(item?.text)) return { ok: false, reason: "bodies_empty" };
      if (isTooShort(item?.text)) return { ok: false, reason: "bodies_too_short" };
      if (!String(item?.text).includes("\n")) return { ok: false, reason: "bodies_no_break" };
      if (tooLong(item?.text, MAX_BODY_CHARS)) return { ok: false, reason: "bodies_too_long" };
    }
  }

  const chiron = pickSection("chiron");
  if (isEmptyText(chiron?.text)) return { ok: false, reason: "chiron_empty" };
  if (isTooShort(chiron?.text)) return { ok: false, reason: "chiron_too_short" };
  if (!String(chiron?.text || "").includes("\n")) return { ok: false, reason: "chiron_no_break" };
  if (tooLong(chiron?.text, MAX_BODY_CHARS)) return { ok: false, reason: "chiron_too_long" };
  const lilith = pickSection("lilith");
  if (isEmptyText(lilith?.text)) return { ok: false, reason: "lilith_empty" };
  if (isTooShort(lilith?.text)) return { ok: false, reason: "lilith_too_short" };
  if (!String(lilith?.text || "").includes("\n")) return { ok: false, reason: "lilith_no_break" };
  if (tooLong(lilith?.text, MAX_BODY_CHARS)) return { ok: false, reason: "lilith_too_long" };

  const nodes = pickSection("nodes");
  if (nodes?.south || nodes?.north) {
    if (isEmptyText(nodes?.south?.text || nodes?.south)) return { ok: false, reason: "nodes_south_empty" };
    if (isEmptyText(nodes?.north?.text || nodes?.north)) return { ok: false, reason: "nodes_north_empty" };
    if (isTooShort(nodes?.south?.text || nodes?.south)) return { ok: false, reason: "nodes_south_too_short" };
    if (isTooShort(nodes?.north?.text || nodes?.north)) return { ok: false, reason: "nodes_north_too_short" };
    if (!String(nodes?.south?.text || nodes?.south || "").includes("\n")) {
      return { ok: false, reason: "nodes_south_no_break" };
    }
    if (!String(nodes?.north?.text || nodes?.north || "").includes("\n")) {
      return { ok: false, reason: "nodes_north_no_break" };
    }
    if (tooLong(nodes?.south?.text || nodes?.south, MAX_BODY_CHARS)) return { ok: false, reason: "nodes_south_too_long" };
    if (tooLong(nodes?.north?.text || nodes?.north, MAX_BODY_CHARS)) return { ok: false, reason: "nodes_north_too_long" };
  } else if (Array.isArray(nodes?.blocks)) {
    for (const block of nodes.blocks) {
      if (isEmptyText(block?.text)) return { ok: false, reason: "nodes_empty" };
      if (isTooShort(block?.text)) return { ok: false, reason: "nodes_too_short" };
      if (!String(block?.text || "").includes("\n")) return { ok: false, reason: "nodes_no_break" };
      if (tooLong(block?.text, MAX_BODY_CHARS)) return { ok: false, reason: "nodes_too_long" };
    }
  } else {
    return { ok: false, reason: "nodes_missing" };
  }

  const angles = pickSection("angles");
  if (Array.isArray(angles?.items)) {
    if (angles.items.length !== REQUIRED_ANGLE_KEYS.length) return { ok: false, reason: "angles_count" };
    const angleKeys = angles.items.map((item) => normalizeKey(item?.key));
    for (let i = 0; i < REQUIRED_ANGLE_KEYS.length; i += 1) {
      if (angleKeys[i] !== REQUIRED_ANGLE_KEYS[i]) return { ok: false, reason: "angles_keys" };
    }
    for (const item of angles.items) {
      if (isEmptyText(item?.text)) return { ok: false, reason: "angles_empty" };
      if (isTooShort(item?.text)) return { ok: false, reason: "angles_too_short" };
      if (!String(item?.text).includes("\n")) return { ok: false, reason: "angles_no_break" };
      if (tooLong(item?.text, MAX_BODY_CHARS)) return { ok: false, reason: "angles_too_long" };
    }
  }

  return { ok: true };
}

function extractBannedTerm(reason) {
  const match = String(reason || "").match(/banned:\/([^/]+)\//);
  return match ? match[1] : null;
}

function buildRetryNote(reason) {
  if (!reason) return "";
  const banned = extractBannedTerm(reason);
  if (banned) return `禁止語「${banned}」を使わないこと。`;
  if (reason === "bodies_count" || reason === "bodies_keys") {
    return "bodies.items は sun..pluto 10件を順序通りに出すこと。";
  }
  if (reason === "angles_count" || reason === "angles_keys") {
    return "angles.items は asc/mc/ic/dc の4件を順序通りに出すこと。";
  }
  if (String(reason).endsWith("_no_break")) {
    return "各 text に改行を1つ入れて2段落にすること。";
  }
  if (String(reason).endsWith("_too_short")) {
    return "各 text は最低180字にすること。";
  }
  return "";
}

async function generateBlueprintLightText({ env, input, maxTokens = 2200 }) {
  const apiKey = env?.OPENAI_API_KEY || process.env.OPENAI_API_KEY || "";
  if (!apiKey) return { ok: false, reason: "no_api_key" };

  const model =
    env?.OPENAI_MODEL_BLUEPRINT_LIGHT ||
    process.env.OPENAI_MODEL_BLUEPRINT_LIGHT ||
    "gpt-4o";
  const baseUrl = process.env.OPENAI_BASE_URL || env?.OPENAI_BASE_URL || "https://api.openai.com/v1";

  const baseUserPrompt = `${SORA_AI_USER_GUIDE_BLUEPRINT_LIGHT}\n\nINPUT:\n${JSON.stringify(input, null, 2)}`;

  let lastError = null;
  let retryNote = "";
  const maxAttempts = 3;
  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      const attemptMaxTokens = i === 0 ? maxTokens : Math.max(maxTokens, 2600);
      const attemptTemperature = i === 0 ? 0.6 : 0.7;
      const userPrompt = retryNote
        ? `${SORA_AI_USER_GUIDE_BLUEPRINT_LIGHT}\n\n【直前の修正】${retryNote}\n\nINPUT:\n${JSON.stringify(input, null, 2)}`
        : baseUserPrompt;
      const content = await createChatCompletion({
        apiKey,
        baseUrl,
        model,
        messages: [
          { role: "system", content: SORA_AI_SYSTEM_PROMPT_BLUEPRINT_LIGHT },
          { role: "user", content: userPrompt },
        ],
        temperature: attemptTemperature,
        maxTokens: attemptMaxTokens,
      });

      const jsonText = extractJson(content);
      if (!jsonText) throw new Error("json_extract_failed");

      const parsed = JSON.parse(jsonText);
      const v = validateOutput(parsed);
      if (!v.ok) {
        const err = new Error(`validation_failed:${v.reason}`);
        err.validationReason = v.reason;
        throw err;
      }

      return { ok: true, data: parsed };
    } catch (e) {
      lastError = e;
      const reason = e?.validationReason || "";
      const note = buildRetryNote(reason);
      retryNote = note || "";
    }
  }

  return { ok: false, reason: lastError?.message || "ai_failed" };
}

module.exports = { generateBlueprintLightText };
