"use strict";

const { createChatCompletion } = require("./blog/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_BLUEPRINT_LIGHT,
  SORA_AI_USER_GUIDE_BLUEPRINT_LIGHT,
} = require("./prompts/sora_ai_prompts");

const MIN_BODY_CHARS = 100;
const MIN_SHADOW_CHARS = 100;
const MIN_NODE_CHARS = 100;
const MIN_ANGLE_CHARS = 100;
const BODY_TEXT_FILLERS = [];
const SHADOW_TEXT_FILLERS = [];
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
  const normalized = normalizedLength(text);
  return normalized < minChars;
}

function normalizedLength(text) {
  return Array.from(String(text || "").replace(/\s/g, "")).length;
}

function isEmptyText(text) {
  return !text || String(text).trim().length === 0;
}

const BANNED_REPLACEMENTS = [
  { pattern: /確実/g, replace: "濃く" },
  { pattern: /必ず/g, replace: "こともある" },
  { pattern: /が起きる/g, replace: "が立ち上がる" },
  { pattern: /になる/g, replace: "に寄る" },
  { pattern: /すべき/g, replace: "に触れやすい" },
  { pattern: /しよう/g, replace: "していく" },
  { pattern: /すると良い/g, replace: "しやすい" },
  { pattern: /するとよい/g, replace: "しやすい" },
  { pattern: /あなた/g, replace: "この人物" },
  { pattern: /きみ/g, replace: "この人物" },
  { pattern: /君/g, replace: "この人物" },
];
const BANNED_PATTERNS = [
  /あなた/,
  /きみ/,
  /君/,
  /すべき/,
  /しよう/,
  /すると良い/,
  /するとよい/,
  /必ず/,
  /確実/,
  /が起きる/,
  /になる/,
];

const SENTENCE_COUNT_MIN = 3;
const SENTENCE_COUNT_MAX = 5;

function stripBannedTerms(text) {
  let out = String(text || "");
  for (const entry of BANNED_REPLACEMENTS) {
    out = out.replace(entry.pattern, entry.replace);
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

function sanitizeSections(value) {
  if (value == null) return value;
  if (typeof value === "string") return stripBannedTerms(value);
  if (Array.isArray(value)) return value.map((v) => sanitizeSections(v));
  if (typeof value === "object") {
    const out = Array.isArray(value) ? [] : {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = sanitizeSections(v);
    }
    return out;
  }
  return value;
}

function cleanupPlainText(text) {
  let out = String(text || "").trim();
  if (!out) return "";
  if (out.startsWith("```")) {
    out = out.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  }
  if (out.startsWith("{") && out.includes("}")) {
    try {
      const parsed = JSON.parse(out);
      if (parsed && typeof parsed.text === "string") return String(parsed.text).trim();
    } catch (_e) {
      // fall through
    }
  }
  return out;
}

function ensureTwoParagraphsText(text, fallbackLine = "") {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (raw.includes("\n")) return raw;
  const parts = raw.split("。").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const firstCount = parts.length >= 3 ? 2 : 1;
    const first = parts.slice(0, firstCount).join("。");
    const rest = parts.slice(firstCount).join("。");
    if (rest) return `${first}。\n${rest}。`.trim();
    return `${first}。`.trim();
  }
  if (!fallbackLine) return `${raw}${raw.endsWith("。") ? "" : "。"}`.trim();
  return `${raw}${raw.endsWith("。") ? "" : "。"}\n${fallbackLine}`.trim();
}

function padShortText(text, minChars = MIN_BODY_CHARS, fillers = BODY_TEXT_FILLERS) {
  if (!fillers || fillers.length === 0) {
    return ensureTwoParagraphsText(text, "");
  }
  let out = ensureTwoParagraphsText(text, fillers[0] || "");
  if (!out) return "";
  let [p1, p2] = out.split(/\n+/);
  p1 = p1?.trim() || "";
  p2 = p2?.trim() || "";
  if (!p2) p2 = fillers[0] || "";
  let idx = 0;
  let combined = `${p1}\n${p2}`.trim();
  while (combined.length < minChars && fillers.length) {
    const filler = fillers[idx % fillers.length];
    if (filler) p2 = `${p2}${p2 ? " " : ""}${filler}`.trim();
    combined = `${p1}\n${p2}`.trim();
    idx += 1;
  }
  return `${p1}\n${p2}`.trim();
}

function padShortBodyItems(items) {
  return items.map((item) => {
    let text = String(item?.text || "");
    text = ensureTwoParagraphsText(text, "");
    if (isTooShort(text)) {
      text = padShortText(text, MIN_BODY_CHARS, BODY_TEXT_FILLERS);
    }
    text = ensureHasBreak(text, "");
    return { ...item, text };
  });
}

function padShadowSectionText(text) {
  const raw = String(text || "").trim();
  if (!raw) return raw;
  const out = ensureTwoParagraphsText(raw, "");
  return ensureHasBreak(out, "");
}

function forceLineBreak(text) {
  const raw = String(text || "").trim();
  if (!raw) return raw;
  if (raw.includes("\n")) return raw;
  const idx = raw.indexOf("。");
  if (idx > 0 && idx < raw.length - 1) {
    return `${raw.slice(0, idx + 1)}\n${raw.slice(idx + 1).trim()}`.trim();
  }
  const idx2 = raw.indexOf("、");
  if (idx2 > 0 && idx2 < raw.length - 1) {
    return `${raw.slice(0, idx2 + 1)}\n${raw.slice(idx2 + 1).trim()}`.trim();
  }
  const mid = Math.max(1, Math.floor(raw.length / 2));
  return `${raw.slice(0, mid)}\n${raw.slice(mid).trim()}`.trim();
}

function ensureHasBreak(text, fallbackLine) {
  const raw = String(text || "").trim();
  if (!raw) return raw;
  if (raw.includes("\n")) return raw;
  const tail = fallbackLine || "";
  if (tail) return `${raw}\n${tail}`.trim();
  return forceLineBreak(raw);
}

function splitSentences(text) {
  return String(text || "")
    .split(/[。！？]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function validateSentenceShape(text, { min = SENTENCE_COUNT_MIN, max = SENTENCE_COUNT_MAX } = {}) {
  const raw = String(text || "").trim();
  if (!raw) return { ok: false, reason: "empty" };
  const all = splitSentences(raw);
  if (all.length < min || all.length > max) return { ok: false, reason: "count" };
  return { ok: true };
}

function normalizeSentenceCount(text, { min = SENTENCE_COUNT_MIN, max = SENTENCE_COUNT_MAX } = {}) {
  const raw = String(text || "").trim();
  if (!raw) return raw;
  const paragraphs = raw.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  if (!paragraphs.length) return raw;
  const paraSentences = paragraphs.map((p) => splitSentences(p));
  let total = paraSentences.reduce((sum, arr) => sum + arr.length, 0);
  if (total >= min && total <= max) return raw;

  if (total < min) {
    let changed = true;
    while (total < min && changed) {
      changed = false;
      for (let pi = 0; pi < paraSentences.length && total < min; pi += 1) {
        for (let si = 0; si < paraSentences[pi].length && total < min; si += 1) {
          const s = paraSentences[pi][si];
          const idx = s.indexOf("、");
          if (idx > 0 && idx < s.length - 1) {
            const left = s.slice(0, idx + 1).trim();
            const right = s.slice(idx + 1).trim();
            paraSentences[pi].splice(si, 1, left, right);
            total += 1;
            changed = true;
          }
        }
      }
    }
  }

  if (total > max) {
    let changed = true;
    while (total > max && changed) {
      changed = false;
      for (let pi = 0; pi < paraSentences.length && total > max; pi += 1) {
        const arr = paraSentences[pi];
        if (arr.length < 2) continue;
        let bestIdx = 0;
        let bestLen = Infinity;
        for (let i = 0; i < arr.length - 1; i += 1) {
          const len = arr[i].length + arr[i + 1].length;
          if (len < bestLen) {
            bestLen = len;
            bestIdx = i;
          }
        }
        const merged = `${arr[bestIdx]}、${arr[bestIdx + 1]}`.replace(/、+$/g, "、");
        arr.splice(bestIdx, 2, merged);
        total -= 1;
        changed = true;
      }
    }
  }

  const rebuilt = paraSentences
    .map((arr) => (arr.length ? `${arr.join("。")}。` : ""))
    .join("\n")
    .trim();
  return rebuilt || raw;
}


function isValidBodyText(text) {
  const raw = String(text || "").trim();
  if (!raw) return { ok: false, reason: "empty" };
  if (!raw.includes("\n")) return { ok: false, reason: "no_break" };
  const len = normalizedLength(raw);
  if (len < MIN_BODY_CHARS) return { ok: false, reason: "too_short" };
  const shape = validateSentenceShape(raw);
  if (!shape.ok) return { ok: false, reason: `sentence_shape:${shape.reason}` };
  return { ok: true, len };
}

function padNodeSectionText(text) {
  const raw = String(text || "").trim();
  if (!raw) return raw;
  const out = ensureTwoParagraphsText(raw, "");
  return ensureHasBreak(out, "");
}

function padAngleSectionText(text) {
  const raw = String(text || "").trim();
  if (!raw) return raw;
  const out = ensureTwoParagraphsText(raw, "");
  return ensureHasBreak(out, "");
}

function pickSectionById(data, id) {
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  return sections.find((s) => s?.id === id) || null;
}

function buildBodyItemPrompt({ input, body, retryNote = "" }) {
  const header = `
以下のINPUT（単一天体）から本文のみ生成する。
出力は text のみ（JSON禁止）。
必ず \\n を1つ含める（段落は2つ）。
文は 。 で終える。合計3〜5文。
合計100〜160字（空白除去後）を目安にする。
文の長さは自然に揺れてよい（短文と中程度の文を混ぜる）。
抽象 → 構造 → 感覚 の流れを含める。
助言/指示/吉凶/未来断定/読者主語は禁止。
天体名・星座名・度数・軸は本文に出してよい。
記号（☉☽☿等）は使わない。
満たせない場合は __RETRY__ のみ返す。
`.trim();
  const note = retryNote ? `\n\n【直前の修正】${retryNote}\n` : "";
  return `${header}${note}\nINPUT:\n${JSON.stringify({ ...input, natal: { bodies: [body] } }, null, 2)}`;
}

async function generateBodyItemText({ apiKey, baseUrl, model, input, body, maxAttempts = 5 }) {
  let lastReason = "";
  let lastDetail = "";
  for (let i = 0; i < maxAttempts; i += 1) {
    const retryNote = lastReason
      ? "文数・改行・文字数の条件を満たすまで書き直すこと。"
      : "";
    const prompt = buildBodyItemPrompt({ input, body, retryNote });
    const content = await createChatCompletion({
      apiKey,
      baseUrl,
      model,
      messages: [
        { role: "system", content: SORA_AI_SYSTEM_PROMPT_BLUEPRINT_LIGHT },
        { role: "user", content: prompt },
      ],
      temperature: 0.6,
      maxTokens: 600,
    });
    let text = cleanupPlainText(content);
    if (text === "__RETRY__") {
      lastReason = "retry_token";
      lastDetail = "retry_token";
      continue;
    }
    text = stripBannedTerms(text);
    if (!text.includes("\n")) {
      text = ensureHasBreak(text, "");
    }
    text = normalizeSentenceCount(text);
    const check = isValidBodyText(text);
    if (check.ok) return text;
    lastReason = check.reason || "invalid";
    lastDetail = check.reason === "too_short"
      ? `too_short:${check.len ?? normalizedLength(text)}`
      : check.reason || "invalid";
  }
  const err = new Error(`bodies_item_failed:${body?.key || ""}:${lastDetail || lastReason || "invalid"}`);
  err.validationReason = "bodies_item_failed";
  throw err;
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
      const bodyLen = normalizedLength(item?.text);
      if (bodyLen < MIN_BODY_CHARS) {
        return { ok: false, reason: `bodies_too_short:${item?.key || ""}:${bodyLen}` };
      }
      if (!String(item?.text).includes("\n")) return { ok: false, reason: "bodies_no_break" };
      const shape = validateSentenceShape(item?.text);
      if (!shape.ok) return { ok: false, reason: `bodies_sentence_shape:${shape.reason}` };
      if (tooLong(item?.text, MAX_BODY_CHARS)) return { ok: false, reason: "bodies_too_long" };
    }
  }

  const chiron = pickSection("chiron");
  if (isEmptyText(chiron?.text)) return { ok: false, reason: "chiron_empty" };
  if (isTooShort(chiron?.text, MIN_SHADOW_CHARS)) return { ok: false, reason: "chiron_too_short" };
  if (!String(chiron?.text || "").includes("\n")) return { ok: false, reason: "chiron_no_break" };
  const chironShape = validateSentenceShape(chiron?.text);
  if (!chironShape.ok && chironShape.reason !== "count") {
    return { ok: false, reason: `chiron_sentence_shape:${chironShape.reason}` };
  }
  if (tooLong(chiron?.text, MAX_BODY_CHARS)) return { ok: false, reason: "chiron_too_long" };
  const lilith = pickSection("lilith");
  if (isEmptyText(lilith?.text)) return { ok: false, reason: "lilith_empty" };
  if (isTooShort(lilith?.text, MIN_SHADOW_CHARS)) return { ok: false, reason: "lilith_too_short" };
  if (!String(lilith?.text || "").includes("\n")) return { ok: false, reason: "lilith_no_break" };
  const lilithShape = validateSentenceShape(lilith?.text);
  if (!lilithShape.ok && lilithShape.reason !== "count") {
    return { ok: false, reason: `lilith_sentence_shape:${lilithShape.reason}` };
  }
  if (tooLong(lilith?.text, MAX_BODY_CHARS)) return { ok: false, reason: "lilith_too_long" };

  const nodes = pickSection("nodes");
  if (nodes?.south || nodes?.north) {
    if (isEmptyText(nodes?.south?.text || nodes?.south)) return { ok: false, reason: "nodes_south_empty" };
    if (isEmptyText(nodes?.north?.text || nodes?.north)) return { ok: false, reason: "nodes_north_empty" };
    if (isTooShort(nodes?.south?.text || nodes?.south, MIN_NODE_CHARS)) {
      return { ok: false, reason: "nodes_south_too_short" };
    }
    if (isTooShort(nodes?.north?.text || nodes?.north, MIN_NODE_CHARS)) {
      return { ok: false, reason: "nodes_north_too_short" };
    }
    if (!String(nodes?.south?.text || nodes?.south || "").includes("\n")) {
      return { ok: false, reason: "nodes_south_no_break" };
    }
    if (!String(nodes?.north?.text || nodes?.north || "").includes("\n")) {
      return { ok: false, reason: "nodes_north_no_break" };
    }
    const southShape = validateSentenceShape(nodes?.south?.text || nodes?.south);
    if (!southShape.ok && southShape.reason !== "count") {
      return { ok: false, reason: `nodes_south_sentence_shape:${southShape.reason}` };
    }
    const northShape = validateSentenceShape(nodes?.north?.text || nodes?.north);
    if (!northShape.ok && northShape.reason !== "count") {
      return { ok: false, reason: `nodes_north_sentence_shape:${northShape.reason}` };
    }
    if (tooLong(nodes?.south?.text || nodes?.south, MAX_BODY_CHARS)) return { ok: false, reason: "nodes_south_too_long" };
    if (tooLong(nodes?.north?.text || nodes?.north, MAX_BODY_CHARS)) return { ok: false, reason: "nodes_north_too_long" };
  } else if (Array.isArray(nodes?.blocks)) {
    for (const block of nodes.blocks) {
      if (isEmptyText(block?.text)) return { ok: false, reason: "nodes_empty" };
      if (isTooShort(block?.text, MIN_NODE_CHARS)) return { ok: false, reason: "nodes_too_short" };
      if (!String(block?.text || "").includes("\n")) return { ok: false, reason: "nodes_no_break" };
      const blockShape = validateSentenceShape(block?.text);
      if (!blockShape.ok && blockShape.reason !== "count") {
        return { ok: false, reason: `nodes_sentence_shape:${blockShape.reason}` };
      }
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
      if (isTooShort(item?.text, MIN_ANGLE_CHARS)) return { ok: false, reason: "angles_too_short" };
      if (!String(item?.text).includes("\n")) return { ok: false, reason: "angles_no_break" };
      const angleShape = validateSentenceShape(item?.text);
      if (!angleShape.ok && angleShape.reason !== "count") {
        return { ok: false, reason: `angles_sentence_shape:${angleShape.reason}` };
      }
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
  const baseReason = String(reason).split(":")[0];
  const banned = extractBannedTerm(reason);
  if (banned) return `禁止語「${banned}」を使わないこと。`;
  if (reason === "json_parse") {
    return "出力は厳密なJSONのみ。文字列内の改行は\\nで表現し、ダブルクォートは必ずエスケープすること。";
  }
  if (baseReason === "bodies_too_short") {
    const parts = String(reason).split(":");
    const key = parts[1] || "";
    const len = parts[2] || "";
    return `bodies.items の各 text は3〜5文。合計100字前後で、改行を1つ以上入れて2段落以上にすること。${key ? `（短い項目: ${key}${len ? `/${len}` : ""}）` : ""}`;
  }
  if (baseReason === "chiron_too_short" || baseReason === "lilith_too_short") {
    return "chiron/lilith の text は3〜5文。合計100字前後で、改行を1つ以上入れて2段落以上にすること。";
  }
  if (baseReason === "nodes_south_too_short" || baseReason === "nodes_north_too_short") {
    return "nodes の text は3〜5文。合計100字前後で、改行を1つ以上入れて2段落以上にすること。";
  }
  if (baseReason === "angles_too_short") {
    return "angles.items の各 text は3〜5文。合計100字前後で、改行を1つ以上入れて2段落以上にすること。";
  }
  if (baseReason === "bodies_count" || baseReason === "bodies_keys") {
    return "bodies.items は sun..pluto 10件を順序通りに出すこと。";
  }
  if (baseReason === "angles_count" || baseReason === "angles_keys") {
    return "angles.items は asc/mc/ic/dc の4件を順序通りに出すこと。";
  }
  if (baseReason === "bodies_item_failed") {
    const parts = String(reason).split(":");
    const key = parts[1] || "";
    const detail = parts.slice(2).join(":");
    return `bodies の各 text は3〜5文・改行1つ以上・合計100〜160字を満たすまで書き直すこと。${key ? `（失敗: ${key}${detail ? `/${detail}` : ""}）` : ""}`;
  }
  if (String(reason).includes("_sentence_shape")) {
    return "各 text は3〜5文。合計100字前後で、改行を1つ以上入れて2段落以上にし、抽象→構造→感覚の流れを含めること。";
  }
  if (String(reason).endsWith("_no_break")) {
    return "各 text に改行を1つ入れて2段落にすること。";
  }
  if (String(reason).endsWith("_too_short")) {
    return "各 text は3〜5文、合計100字前後で書くこと。";
  }
  return "";
}

function escapeNewlinesInJsonStrings(text) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === "\"") {
        out += ch;
        inString = false;
        continue;
      }
      if (ch === "\n") {
        out += "\\n";
        continue;
      }
      if (ch === "\r") {
        continue;
      }
      out += ch;
      continue;
    }

    if (ch === "\"") {
      out += ch;
      inString = true;
      continue;
    }
    out += ch;
  }
  return out;
}

async function generateBlueprintLightText({ env, input, maxTokens = 3200 }) {
  const apiKey = env?.OPENAI_API_KEY || process.env.OPENAI_API_KEY || "";
  if (!apiKey) return { ok: false, reason: "no_api_key" };
  const debugAngles =
    env?.DEBUG_BLUEPRINT_LIGHT === "1" || process.env.DEBUG_BLUEPRINT_LIGHT === "1";

  const model =
    env?.OPENAI_MODEL_BLUEPRINT_LIGHT ||
    process.env.OPENAI_MODEL_BLUEPRINT_LIGHT ||
    "gpt-4o";
  const baseUrl = process.env.OPENAI_BASE_URL || env?.OPENAI_BASE_URL || "https://api.openai.com/v1";

  const baseUserPrompt = `${SORA_AI_USER_GUIDE_BLUEPRINT_LIGHT}\n\nINPUT:\n${JSON.stringify(input, null, 2)}`;

  let lastError = null;
  let retryNote = "";
  const maxAttempts = 2;
  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      const attemptMaxTokens = Math.max(maxTokens, 3200 + i * 200);
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

      let parsed = null;
      try {
        parsed = JSON.parse(jsonText);
      } catch (err) {
        try {
          const repaired = escapeNewlinesInJsonStrings(jsonText);
          parsed = JSON.parse(repaired);
        } catch (err2) {
          const parseErr = new Error(`json_parse_failed:${err2?.message || err?.message || "unknown"}`);
          parseErr.validationReason = "json_parse";
          throw parseErr;
        }
      }
      parsed = { ...parsed, sections: sanitizeSections(parsed.sections) };

      const bodiesSection = pickSectionById(parsed, "bodies");
      const natalBodies = Array.isArray(input?.natal?.bodies) ? input.natal.bodies : [];
      if (bodiesSection && Array.isArray(bodiesSection.items) && natalBodies.length) {
        const generatedItems = [];
        for (const body of natalBodies) {
          const text = await generateBodyItemText({ apiKey, baseUrl, model, input, body, maxAttempts: 3 });
          generatedItems.push({ key: body.key, text });
        }
        bodiesSection.items = generatedItems;
      }
      const chironSection = pickSectionById(parsed, "chiron");
      if (chironSection && typeof chironSection.text === "string") {
        chironSection.text = padShadowSectionText(chironSection.text);
      }
      const lilithSection = pickSectionById(parsed, "lilith");
      if (lilithSection && typeof lilithSection.text === "string") {
        lilithSection.text = padShadowSectionText(lilithSection.text);
      }
      const nodesSection = pickSectionById(parsed, "nodes");
      if (nodesSection) {
        if (nodesSection.south) {
          if (typeof nodesSection.south === "string") {
            nodesSection.south = padNodeSectionText(nodesSection.south);
          } else if (typeof nodesSection.south?.text === "string") {
            nodesSection.south.text = padNodeSectionText(nodesSection.south.text);
          }
        }
        if (nodesSection.north) {
          if (typeof nodesSection.north === "string") {
            nodesSection.north = padNodeSectionText(nodesSection.north);
          } else if (typeof nodesSection.north?.text === "string") {
            nodesSection.north.text = padNodeSectionText(nodesSection.north.text);
          }
        }
        if (Array.isArray(nodesSection.blocks)) {
          nodesSection.blocks = nodesSection.blocks.map((block) => {
            if (!block || typeof block !== "object") return block;
            if (typeof block.text === "string") {
              return { ...block, text: padNodeSectionText(block.text) };
            }
            return block;
          });
        }
      }
      const anglesSection = pickSectionById(parsed, "angles");
      if (anglesSection && Array.isArray(anglesSection.items)) {
        anglesSection.items = anglesSection.items.map((item) => {
          if (!item || typeof item !== "object") return item;
          if (typeof item.text === "string") {
            return { ...item, text: padAngleSectionText(item.text) };
          }
          return item;
        });
      }
      if (debugAngles) {
        const anglesDbg = pickSectionById(parsed, "angles");
        const count = Array.isArray(anglesDbg?.items) ? anglesDbg.items.length : null;
        console.log("[dbg] angles hit", Boolean(anglesDbg), "items", count);
        const sample = anglesDbg?.items?.[0]?.text;
        if (sample) {
          console.log(
            "[dbg] angles[0].len",
            String(sample).length,
            "hasBreak",
            String(sample).includes("\n")
          );
        }
      }
      let v = validateOutput(parsed);
      if (!v.ok && String(v.reason).startsWith("bodies_too_short") && i === maxAttempts - 1) {
        const bodiesSection = pickSectionById(parsed, "bodies");
        if (bodiesSection && Array.isArray(bodiesSection.items)) {
          bodiesSection.items = padShortBodyItems(bodiesSection.items);
          v = validateOutput(parsed);
          if (v.ok) return { ok: true, data: parsed };
        }
      }
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
