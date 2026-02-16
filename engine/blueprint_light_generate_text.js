"use strict";

const { createChatCompletion } = require("./blog/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_BLUEPRINT_LIGHT,
  SORA_AI_USER_GUIDE_BLUEPRINT_LIGHT,
} = require("./prompts/sora_ai_prompts");

const MIN_BODY_CHARS = 160;
const MIN_SHADOW_CHARS = 160;
const MIN_NODE_CHARS = 160;
const MIN_ANGLE_CHARS = 160;
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
  /輪郭は、?静かに/,
  /言葉にせずとも/,
  /が立ち上がる/,
];

const SENTENCE_COUNT_MIN = 3;
const SENTENCE_COUNT_MAX = 5;
const STRICT_SENTENCE_MIN = 4;
const STRICT_SENTENCE_MAX = 4;
const STRICT_SENTENCE_RULE =
  "必ず4文。1段落目2文＋改行＋2段落目2文。文数は「。」の数で数える（4文＝「。」4つ）。";
const RELAXED_SENTENCE_RULE =
  "3〜5文。段落は2つ。文数は「。」の数で数える（3〜5文＝「。」3〜5つ）。";
const RETRY_SENTENCE_RULE =
  "基本は4文（1段落目2文＋改行＋2段落目2文）。難しい場合は3〜5文。文数は「。」の数で数える。";

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



function isValidSectionText(
  text,
  { minChars = MIN_BODY_CHARS, sentenceMin = SENTENCE_COUNT_MIN, sentenceMax = SENTENCE_COUNT_MAX } = {}
) {
  const raw = String(text || "").trim();
  if (!raw) return { ok: false, reason: "empty" };
  if (!raw.includes("\n")) return { ok: false, reason: "no_break" };
  const len = normalizedLength(raw);
  if (len < minChars) return { ok: false, reason: "too_short" };
  const shape = validateSentenceShape(raw, { min: sentenceMin, max: sentenceMax });
  if (!shape.ok) return { ok: false, reason: `sentence_shape:${shape.reason}` };
  return { ok: true, len };
}

function pickSectionById(data, id) {
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  return sections.find((s) => s?.id === id) || null;
}

function buildBodyItemPrompt({ input, body, retryNote = "", sentenceRule = STRICT_SENTENCE_RULE }) {
  const header = `
以下のINPUT（単一天体）から本文のみ生成する。
出力は text のみ（JSON禁止）。
必ず \\n を1つ含める（段落は2つ）。
${sentenceRule}
文末はすべて「。」で終える。
「。」は文末にのみ使う。文中では使わない。
「！」や「？」は使わない。
空白除去で160文字以上（必須）。200字前後を目安にする。
160文字未満なら書き直してから出力すること（短くまとめない）。
出力前に文字数・文数・改行の条件を満たしているか必ず確認すること。
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

function buildSectionPrompt({ input, sectionId, item, retryNote = "", sentenceRule = STRICT_SENTENCE_RULE }) {
  const header = `
以下のINPUT（単一セクション）から本文のみ生成する。
  出力は text のみ（JSON禁止）。
  必ず \\n を1つ含める（段落は2つ）。
${sentenceRule}
文末はすべて「。」で終える。
「。」は文末にのみ使う。文中では使わない。
「！」や「？」は使わない。
空白除去で160文字以上（必須）。200字前後を目安にする。
160文字未満なら書き直してから出力すること（短くまとめない）。
出力前に文字数・文数・改行の条件を満たしているか必ず確認すること。
文の長さは自然に揺れてよい（短文と中程度の文を混ぜる）。
抽象 → 構造 → 感覚 の流れを含める。
助言/指示/吉凶/未来断定/読者主語は禁止。
天体名・星座名・度数・軸は本文に出してよい。
記号（☉☽☿等）は使わない。
満たせない場合は __RETRY__ のみ返す。
`.trim();
  const note = retryNote ? `\n\n【直前の修正】${retryNote}\n` : "";
  const payload = { section: sectionId, item, input };
  return `${header}${note}\nINPUT:\n${JSON.stringify(payload, null, 2)}`;
}

async function generateBodyItemText({ apiKey, baseUrl, model, input, body, maxAttempts = 10 }) {
  let lastReason = "";
  let lastDetail = "";
  let lastCount = 0;
  let lastLen = 0;
  const strictAttempts = Math.min(6, maxAttempts);
  for (let i = 0; i < maxAttempts; i += 1) {
    const isStrict = i < strictAttempts;
    const sentenceRule = isStrict ? STRICT_SENTENCE_RULE : RELAXED_SENTENCE_RULE;
    const retryNote = lastReason
      ? isStrict
        ? `必ず4文（1段落目2文＋改行＋2段落目2文）で書き直すこと。前回は${lastCount || "?"}文、空白除去${lastLen || "?"}文字。`
        : `3〜5文・2段落で書き直すこと。前回は${lastCount || "?"}文、空白除去${lastLen || "?"}文字。`
      : "";
    const prompt = buildBodyItemPrompt({ input, body, retryNote, sentenceRule });
    const content = await createChatCompletion({
      apiKey,
      baseUrl,
      model,
      messages: [
        { role: "system", content: SORA_AI_SYSTEM_PROMPT_BLUEPRINT_LIGHT },
        { role: "user", content: prompt },
      ],
      temperature: 0.6,
      maxTokens: 800,
    });
    let text = cleanupPlainText(content);
    if (text === "__RETRY__") {
      lastReason = "retry_token";
      lastDetail = "retry_token";
      continue;
    }
    const count = splitSentences(text).length;
    const len = normalizedLength(text);
    const check = isValidSectionText(text, {
      minChars: MIN_BODY_CHARS,
      sentenceMin: isStrict ? STRICT_SENTENCE_MIN : SENTENCE_COUNT_MIN,
      sentenceMax: isStrict ? STRICT_SENTENCE_MAX : SENTENCE_COUNT_MAX,
    });
    if (check.ok) return text;
    lastReason = check.reason || "invalid";
    lastCount = count;
    lastLen = len;
    if (check.reason === "too_short") {
      lastDetail = `too_short:${len}`;
    } else if (check.reason?.startsWith("sentence_shape")) {
      lastDetail = `sentence_shape:count:${count}`;
    } else if (check.reason === "no_break") {
      lastDetail = "no_break";
    } else {
      lastDetail = check.reason || "invalid";
    }
  }
  const err = new Error(`bodies_item_failed:${body?.key || ""}:${lastDetail || lastReason || "invalid"}`);
  err.validationReason = "bodies_item_failed";
  throw err;
}

async function generateSectionText({ apiKey, baseUrl, model, input, sectionId, item, minChars = MIN_SHADOW_CHARS, maxAttempts = 10 }) {
  let lastReason = "";
  let lastDetail = "";
  let lastCount = 0;
  let lastLen = 0;
  const strictAttempts = Math.min(6, maxAttempts);
  for (let i = 0; i < maxAttempts; i += 1) {
    const isStrict = i < strictAttempts;
    const sentenceRule = isStrict ? STRICT_SENTENCE_RULE : RELAXED_SENTENCE_RULE;
    const retryNote = lastReason
      ? isStrict
        ? `必ず4文（1段落目2文＋改行＋2段落目2文）で書き直すこと。前回は${lastCount || "?"}文、空白除去${lastLen || "?"}文字。`
        : `3〜5文・2段落で書き直すこと。前回は${lastCount || "?"}文、空白除去${lastLen || "?"}文字。`
      : "";
    const prompt = buildSectionPrompt({ input, sectionId, item, retryNote, sentenceRule });
    const content = await createChatCompletion({
      apiKey,
      baseUrl,
      model,
      messages: [
        { role: "system", content: SORA_AI_SYSTEM_PROMPT_BLUEPRINT_LIGHT },
        { role: "user", content: prompt },
      ],
      temperature: 0.6,
      maxTokens: 800,
    });
    let text = cleanupPlainText(content);
    if (text === "__RETRY__") {
      lastReason = "retry_token";
      lastDetail = "retry_token";
      continue;
    }
    const count = splitSentences(text).length;
    const len = normalizedLength(text);
    const check = isValidSectionText(text, {
      minChars,
      sentenceMin: isStrict ? STRICT_SENTENCE_MIN : SENTENCE_COUNT_MIN,
      sentenceMax: isStrict ? STRICT_SENTENCE_MAX : SENTENCE_COUNT_MAX,
    });
    if (check.ok) return text;
    lastReason = check.reason || "invalid";
    lastCount = count;
    lastLen = len;
    if (check.reason === "too_short") {
      lastDetail = `too_short:${len}`;
    } else if (check.reason?.startsWith("sentence_shape")) {
      lastDetail = `sentence_shape:count:${count}`;
    } else if (check.reason === "no_break") {
      lastDetail = "no_break";
    } else {
      lastDetail = check.reason || "invalid";
    }
  }
  const err = new Error(`section_item_failed:${sectionId}:${lastDetail || lastReason || "invalid"}`);
  err.validationReason = "section_item_failed";
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
    return `bodies.items の各 text は空白除去160文字以上（必須）・200字前後を目安。${RETRY_SENTENCE_RULE} 文末は「。」で終える。160未満は出力しない。${key ? `（短い項目: ${key}${len ? `/${len}` : ""}）` : ""}`;
  }
  if (baseReason === "chiron_too_short" || baseReason === "lilith_too_short") {
    return `chiron/lilith の text は空白除去160文字以上（必須）・200字前後を目安。${RETRY_SENTENCE_RULE} 文末は「。」で終える。160未満は出力しない。`;
  }
  if (baseReason === "nodes_south_too_short" || baseReason === "nodes_north_too_short") {
    return `nodes の text は空白除去160文字以上（必須）・200字前後を目安。${RETRY_SENTENCE_RULE} 文末は「。」で終える。160未満は出力しない。`;
  }
  if (baseReason === "angles_too_short") {
    return `angles.items の各 text は空白除去160文字以上（必須）・200字前後を目安。${RETRY_SENTENCE_RULE} 文末は「。」で終える。160未満は出力しない。`;
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
    return `bodies の各 text は空白除去160文字以上（必須）・200字前後を目安。${RETRY_SENTENCE_RULE} 文末は「。」で書き直すこと。160未満は出力しない。${key ? `（失敗: ${key}${detail ? `/${detail}` : ""}）` : ""}`;
  }
  if (baseReason === "section_item_failed") {
    const parts = String(reason).split(":");
    const key = parts[1] || "";
    const detail = parts.slice(2).join(":");
    return `各セクションの text は空白除去160文字以上（必須）・200字前後を目安。${RETRY_SENTENCE_RULE} 文末は「。」で書き直すこと。160未満は出力しない。${key ? `（失敗: ${key}${detail ? `/${detail}` : ""}）` : ""}`;
  }
  if (String(reason).includes("_sentence_shape")) {
    return `各 text は空白除去160文字以上（必須）・200字前後を目安。${RETRY_SENTENCE_RULE} 抽象→構造→感覚の流れを含めること。160未満は出力しない。`;
  }
  if (String(reason).endsWith("_no_break")) {
    return `各 text は${RETRY_SENTENCE_RULE} 文末は「。」で終える。`;
  }
  if (String(reason).endsWith("_too_short")) {
    return `各 text は空白除去160文字以上（必須）・200字前後を目安。${RETRY_SENTENCE_RULE} 文末は「。」で終える。160未満は出力しない。`;
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
      parsed = { ...parsed };

      const bodiesSection = pickSectionById(parsed, "bodies");
      const natalBodies = Array.isArray(input?.natal?.bodies) ? input.natal.bodies : [];
      if (bodiesSection && Array.isArray(bodiesSection.items) && natalBodies.length) {
        const generatedItems = [];
        for (const body of natalBodies) {
          const text = await generateBodyItemText({ apiKey, baseUrl, model, input, body, maxAttempts: 10 });
          generatedItems.push({ key: body.key, text });
        }
        bodiesSection.items = generatedItems;
      }
      const extrasList = Array.isArray(input?.natal?.extras) ? input.natal.extras : [];
      const chironSection = pickSectionById(parsed, "chiron");
      const chironExtra = extrasList.find((e) => e?.key === "chiron");
      if (chironSection && chironExtra) {
        chironSection.text = await generateSectionText({
          apiKey,
          baseUrl,
          model,
          input,
          sectionId: "chiron",
          item: chironExtra,
          minChars: MIN_SHADOW_CHARS,
          maxAttempts: 10,
        });
      }
      const lilithSection = pickSectionById(parsed, "lilith");
      const lilithExtra = extrasList.find((e) => e?.key === "lilith");
      if (lilithSection && lilithExtra) {
        lilithSection.text = await generateSectionText({
          apiKey,
          baseUrl,
          model,
          input,
          sectionId: "lilith",
          item: lilithExtra,
          minChars: MIN_SHADOW_CHARS,
          maxAttempts: 10,
        });
      }
      const nodesSection = pickSectionById(parsed, "nodes");
      if (nodesSection) {
        const southNode = extrasList.find((e) => e?.key === "south_node");
        const northNode = extrasList.find((e) => e?.key === "north_node");
        if (southNode) {
          nodesSection.south = nodesSection.south || {};
          nodesSection.south.text = await generateSectionText({
            apiKey,
            baseUrl,
            model,
            input,
            sectionId: "nodes_south",
            item: southNode,
            minChars: MIN_NODE_CHARS,
            maxAttempts: 10,
          });
        }
        if (northNode) {
          nodesSection.north = nodesSection.north || {};
          nodesSection.north.text = await generateSectionText({
            apiKey,
            baseUrl,
            model,
            input,
            sectionId: "nodes_north",
            item: northNode,
            minChars: MIN_NODE_CHARS,
            maxAttempts: 10,
          });
        }
      }
      const anglesSection = pickSectionById(parsed, "angles");
      const angleList = Array.isArray(input?.natal?.angles) ? input.natal.angles : [];
      if (anglesSection && angleList.length) {
        const angleItems = [];
        for (const angle of angleList) {
          const text = await generateSectionText({
            apiKey,
            baseUrl,
            model,
            input,
            sectionId: "angles",
            item: angle,
            minChars: MIN_ANGLE_CHARS,
            maxAttempts: 10,
          });
          angleItems.push({ key: angle.key, text });
        }
        anglesSection.items = angleItems;
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
