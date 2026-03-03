"use strict";

const { createChatCompletion } = require("../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_BLUEPRINT_LIGHT,
  BLUEPRINT_LIGHT_USER_PROMPT_PREFIX,
} = require("../../content/prompts/sora_ai_prompts");

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

const MAX_TOKENS_ALL_BATCH = 5000;
const MIN_BODY_CHARS = 100;
const MIN_SUMMARY_CHARS = 0;
const MIN_CLOSING_CHARS = 140;

const HARD_BANNED_PATTERNS = [
  /あなた/,
  /すべき/,
  /した方がいい/,
  /したほうがいい/,
  /しよう/,
  /必ず/,
  /確実/,
  /絶対/,
  /運命/,
  /使命/,
];

const FACT_FORBIDDEN_PATTERNS = [
  /太陽|月|水星|金星|火星|木星|土星|天王星|海王星|冥王星|キロン|リリス|北ノード|南ノード|ノード/,
  /ASC|MC|IC|DC|アセンダント|ディセンダント|ミッドヘブン/i,
  /牡羊座|牡牛座|双子座|蟹座|獅子座|乙女座|天秤座|蠍座|射手座|山羊座|水瓶座|魚座/,
  /度数|orb|オーブ/i,
  /[0-9０-９]+(\.[0-9０-９]+)?\s*(度|°|′|’|'|分|秒)/,
  /コンジャンクション|オポジション|スクエア|トライン|セクスタイル|クインカンクス|セミセクスタイル|セミスクエア|セスキスクエア|インコンジャンクト/,
];

const PLANET_CORE_MAP = Object.freeze({
  sun: "自己表現",
  moon: "感情",
  mercury: "言葉",
  venus: "好意",
  mars: "推進",
  jupiter: "拡大",
  saturn: "構造",
  uranus: "更新",
  neptune: "理想",
  pluto: "深度",
  chiron: "傷",
  lilith: "衝動",
  south_node: "慣性",
  north_node: "方向",
  asc: "入口",
  mc: "表舞台",
  ic: "根",
  dc: "関係",
});

const TEMPLATE_PHRASES = [
  "先に空気が変わり、後で理由が整う。",
  "触れてから言葉が追う。",
  "余韻が残る。",
  "温度が残る。",
  "残り方が強い。",
  "前に出る。",
  "外へ向かう。",
];

const SIGN_INFO_MAP = Object.freeze({
  牡羊座: { element: "火", modality: "活動" },
  牡牛座: { element: "地", modality: "不動" },
  双子座: { element: "風", modality: "柔軟" },
  蟹座: { element: "水", modality: "活動" },
  獅子座: { element: "火", modality: "不動" },
  乙女座: { element: "地", modality: "柔軟" },
  天秤座: { element: "風", modality: "活動" },
  蠍座: { element: "水", modality: "不動" },
  射手座: { element: "火", modality: "柔軟" },
  山羊座: { element: "地", modality: "活動" },
  水瓶座: { element: "風", modality: "不動" },
  魚座: { element: "水", modality: "柔軟" },
});

function extractJson(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  if (trimmed.startsWith("{")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return null;
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
      if (ch === "\r") continue;
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

function normalizeParagraph(text) {
  let out = String(text || "").trim();
  if (!out) return "";
  out = out.replace(/\r/g, "");
  out = out.replace(/\\n/g, "\n");
  out = out
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

function coerceText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join("\n");
  if (value && typeof value === "object") {
    if (typeof value.text === "string") return value.text;
    if (typeof value.value === "string") return value.value;
    if (Array.isArray(value.lines)) return value.lines.join("\n");
    if (Array.isArray(value.items)) return value.items.join("\n");
    const collected = [];
    for (const v of Object.values(value)) {
      if (typeof v === "string") collected.push(v);
      else if (Array.isArray(v)) collected.push(v.filter((s) => typeof s === "string").join("\n"));
      else if (v && typeof v === "object" && typeof v.text === "string") collected.push(v.text);
    }
    if (collected.length) return collected.join("\n");
  }
  return String(value || "");
}

function normalizedLength(text) {
  return Array.from(String(text || "").replace(/\s/g, "")).length;
}

function stripFactTerms(text) {
  let out = String(text || "");
  out = out.replace(
    /太陽|月|水星|金星|火星|木星|土星|天王星|海王星|冥王星|キロン|リリス|北ノード|南ノード|ノード/g,
    ""
  );
  out = out.replace(/ASC|MC|IC|DC|アセンダント|ディセンダント|ミッドヘブン/gi, "");
  out = out.replace(
    /牡羊座|牡牛座|双子座|蟹座|獅子座|乙女座|天秤座|蠍座|射手座|山羊座|水瓶座|魚座/g,
    ""
  );
  out = out.replace(/[0-9０-９]+(\.[0-9０-９]+)?\s*(度|°|′|’|'|分|秒)/g, "");
  out = out.replace(/[0-9０-９]+/g, "");
  return normalizeParagraph(out);
}

function normalizeKey(text) {
  return String(text || "").replace(/[、。「」\s]/g, "").trim();
}

function collectSourceTexts(source) {
  const texts = [];
  const bodies = source?.bodies || {};
  const angles = source?.angles || {};
  const nodes = source?.nodes || {};

  for (const key of REQUIRED_BODY_KEYS) {
    if (typeof bodies[key] === "string") texts.push(bodies[key]);
  }
  for (const key of REQUIRED_ANGLE_KEYS) {
    if (typeof angles[key] === "string") texts.push(angles[key]);
  }
  if (typeof nodes?.south === "string") texts.push(nodes.south);
  if (typeof nodes?.north === "string") texts.push(nodes.north);
  if (typeof source?.chiron === "string") texts.push(source.chiron);
  if (typeof source?.lilith === "string") texts.push(source.lilith);

  return texts.filter(Boolean);
}

function hasTemplateReuse(source, { minRepeat = 3 } = {}) {
  const texts = collectSourceTexts(source);
  if (!texts.length) return false;

  const sentenceCounts = new Map();
  const paragraphCounts = new Map();

  for (const text of texts) {
    const para = normalizeKey(normalizeParagraph(text));
    if (para && para.length >= 8) {
      paragraphCounts.set(para, (paragraphCounts.get(para) || 0) + 1);
    }
    const sentences = splitSentences(text);
    for (const s of sentences) {
      const key = normalizeKey(s);
      if (!key || key.length < 6) continue;
      sentenceCounts.set(key, (sentenceCounts.get(key) || 0) + 1);
    }
  }

  for (const [, count] of paragraphCounts.entries()) {
    if (count >= 2) return true;
  }
  for (const [, count] of sentenceCounts.entries()) {
    if (count >= minRepeat) return true;
  }
  return false;
}

function collectTemplatePhraseHits(source, { minRepeat = 1, max = 5 } = {}) {
  const texts = collectSourceTexts(source);
  if (!texts.length) return [];
  const hits = [];
  for (const phrase of TEMPLATE_PHRASES) {
    let count = 0;
    for (const text of texts) {
      if (String(text || "").includes(phrase)) count += 1;
    }
    if (count >= minRepeat) hits.push(phrase);
  }
  return hits.slice(0, max);
}

function hasMissingSigns(source, input) {
  const bundle = buildSimpleBundle(input);
  const missing = [];

  for (const item of bundle?.bodies || []) {
    const sign = String(item?.sign || "").trim();
    const text = source?.bodies?.[item.key] || "";
    if (sign && typeof text === "string" && !text.includes(sign)) {
      missing.push(item.key);
    }
  }
  for (const item of bundle?.angles || []) {
    const sign = String(item?.sign || "").trim();
    const text = source?.angles?.[item.key] || "";
    if (sign && typeof text === "string" && !text.includes(sign)) {
      missing.push(item.key);
    }
  }
  const southSign = String(bundle?.nodes?.south?.sign || "").trim();
  const northSign = String(bundle?.nodes?.north?.sign || "").trim();
  if (southSign && typeof source?.nodes?.south === "string" && !source.nodes.south.includes(southSign)) {
    missing.push("nodes.south");
  }
  if (northSign && typeof source?.nodes?.north === "string" && !source.nodes.north.includes(northSign)) {
    missing.push("nodes.north");
  }
  const chironSign = String(bundle?.chiron?.sign || "").trim();
  if (chironSign && typeof source?.chiron === "string" && !source.chiron.includes(chironSign)) {
    missing.push("chiron");
  }
  const lilithSign = String(bundle?.lilith?.sign || "").trim();
  if (lilithSign && typeof source?.lilith === "string" && !source.lilith.includes(lilithSign)) {
    missing.push("lilith");
  }

  return missing.length > 0;
}

function collectRepeatedSentences(source, { minRepeat = 3, max = 4 } = {}) {
  const texts = collectSourceTexts(source);
  if (!texts.length) return [];
  const counts = new Map();
  for (const text of texts) {
    const sentences = splitSentences(text);
    for (const s of sentences) {
      const key = normalizeKey(s);
      if (!key || key.length < 6) continue;
      const entry = counts.get(key) || { count: 0, sample: s.trim() };
      entry.count += 1;
      counts.set(key, entry);
    }
  }
  const repeated = [];
  for (const entry of counts.values()) {
    if (entry.count >= minRepeat) repeated.push(entry.sample);
  }
  return repeated.slice(0, max);
}

function hasTooShortSections(source, { minChars = MIN_BODY_CHARS, ratio = 0.5 } = {}) {
  const texts = collectSourceTexts(source);
  if (!texts.length) return false;
  let short = 0;
  for (const text of texts) {
    if (normalizedLength(text) < minChars) short += 1;
  }
  return short / texts.length >= ratio;
}

function splitSentences(text) {
  return String(text || "")
    .split(/[。！？]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function tidyConsolidatedText(text, { minSentences = 3, maxSentences = 5 } = {}) {
  let out = normalizeParagraph(text);
  if (!out) return out;
  const sentences = splitSentences(out);
  const uniq = [];
  const seen = new Set();
  for (const s of sentences) {
    const key = s.replace(/[、。「」\s]/g, "");
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(s);
  }
  const sliced = uniq.slice(0, maxSentences);
  if (sliced.length < minSentences) {
    return out;
  }
  out = sliced.join("。");
  if (out && !out.endsWith("。")) out = `${out}。`;
  return out;
}

function ensureCountsLine(text, countsLine) {
  const line = String(countsLine || "").trim();
  if (!line) return String(text || "").trim();
  const raw = String(text || "").trim();
  if (!raw) return line;
  const lines = raw.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (lines[0] === line) return lines.join("\n");
  const filtered = lines.filter((l) => l !== line);
  return [line, ...filtered].join("\n");
}

function findHardViolation(text) {
  const raw = String(text || "");
  for (const re of HARD_BANNED_PATTERNS) {
    const match = raw.match(re);
    if (match && match[0]) return match[0];
  }
  return null;
}

function stripHardBanned(text) {
  let out = String(text || "");
  if (!out) return "";
  for (const re of HARD_BANNED_PATTERNS) {
    out = out.replace(re, "");
  }
  return normalizeParagraph(out);
}

function findFactViolation(text) {
  const raw = String(text || "");
  const compact = raw.replace(/\s/g, "");
  for (const pattern of FACT_FORBIDDEN_PATTERNS) {
    const m1 = raw.match(pattern);
    if (m1 && m1[0]) return m1[0];
    const m2 = compact.match(pattern);
    if (m2 && m2[0]) return m2[0];
  }
  return null;
}

function isTooShort(text, minChars) {
  const len = Array.from(String(text || "").replace(/\s/g, "")).length;
  return len < minChars;
}

function buildSimpleBundle(input) {
  const summary = input?.kernel?.summary || {};
  const element = summary?.element || {};
  const modality = summary?.modality || {};

  const bodiesKernel = Array.isArray(input?.kernel?.bodies) ? input.kernel.bodies : [];
  const anglesKernel = Array.isArray(input?.kernel?.angles) ? input.kernel.angles : [];
  const chironKernel = input?.kernel?.chiron || null;
  const lilithKernel = input?.kernel?.lilith || null;
  const nodesKernel = input?.kernel?.nodes || {};

  const bodies = bodiesKernel.map((body) => {
    const sign = body?.kernel?.meta?.sign_ja || "";
    const signInfo = SIGN_INFO_MAP[sign] || {};
    const phase = body?.kernel?.degree_phase_v2?.name || body?.kernel?.degree_phase?.key || "";
    return {
      key: body?.key || "",
      label: body?.kernel?.meta?.label || body?.kernel?.meta?.key || body?.key || "",
      sign,
      degree: body?.kernel?.meta?.deg ?? "",
      phase,
      element: signInfo.element || "",
      modality: signInfo.modality || "",
    };
  });

  const angles = anglesKernel.map((angle) => {
    const sign = angle?.kernel?.meta?.sign_ja || "";
    const signInfo = SIGN_INFO_MAP[sign] || {};
    const phase = angle?.kernel?.degree_phase_v2?.name || angle?.kernel?.degree_phase?.key || "";
    return {
      key: angle?.key || "",
      label: angle?.kernel?.meta?.label || angle?.kernel?.meta?.key || angle?.key || "",
      sign,
      degree: angle?.kernel?.meta?.deg ?? "",
      phase,
      element: signInfo.element || "",
      modality: signInfo.modality || "",
    };
  });

  const nodes = {
    south: nodesKernel?.south
      ? (() => {
          const sign = nodesKernel?.south?.kernel?.meta?.sign_ja || "";
          const signInfo = SIGN_INFO_MAP[sign] || {};
          const phase = nodesKernel?.south?.kernel?.degree_phase_v2?.name || nodesKernel?.south?.kernel?.degree_phase?.key || "";
          return {
            label: nodesKernel?.south?.kernel?.meta?.label || nodesKernel?.south?.kernel?.meta?.key || "南ノード",
            sign,
            degree: nodesKernel?.south?.kernel?.meta?.deg ?? "",
            phase,
            element: signInfo.element || "",
            modality: signInfo.modality || "",
          };
        })()
      : null,
    north: nodesKernel?.north
      ? (() => {
          const sign = nodesKernel?.north?.kernel?.meta?.sign_ja || "";
          const signInfo = SIGN_INFO_MAP[sign] || {};
          const phase = nodesKernel?.north?.kernel?.degree_phase_v2?.name || nodesKernel?.north?.kernel?.degree_phase?.key || "";
          return {
            label: nodesKernel?.north?.kernel?.meta?.label || nodesKernel?.north?.kernel?.meta?.key || "北ノード",
            sign,
            degree: nodesKernel?.north?.kernel?.meta?.deg ?? "",
            phase,
            element: signInfo.element || "",
            modality: signInfo.modality || "",
          };
        })()
      : null,
  };

  const chiron = chironKernel
    ? (() => {
        const sign = chironKernel?.kernel?.meta?.sign_ja || "";
        const signInfo = SIGN_INFO_MAP[sign] || {};
        const phase = chironKernel?.kernel?.degree_phase_v2?.name || chironKernel?.kernel?.degree_phase?.key || "";
        return {
          label: chironKernel?.kernel?.meta?.label || chironKernel?.kernel?.meta?.key || "キロン",
          sign,
          degree: chironKernel?.kernel?.meta?.deg ?? "",
          phase,
          element: signInfo.element || "",
          modality: signInfo.modality || "",
        };
      })()
    : null;
  const lilith = lilithKernel
    ? (() => {
        const sign = lilithKernel?.kernel?.meta?.sign_ja || "";
        const signInfo = SIGN_INFO_MAP[sign] || {};
        const phase = lilithKernel?.kernel?.degree_phase_v2?.name || lilithKernel?.kernel?.degree_phase?.key || "";
        return {
          label: lilithKernel?.kernel?.meta?.label || lilithKernel?.kernel?.meta?.key || "リリス",
          sign,
          degree: lilithKernel?.kernel?.meta?.deg ?? "",
          phase,
          element: signInfo.element || "",
          modality: signInfo.modality || "",
        };
      })()
    : null;

  const signCounts = bodies.reduce((acc, item) => {
    const sign = String(item?.sign || "").trim();
    if (!sign) return acc;
    acc[sign] = (acc[sign] || 0) + 1;
    return acc;
  }, {});
  const dominantSigns = Object.entries(signCounts)
    .sort((a, b) => b[1] - a[1])
    .filter(([, count]) => count >= 2)
    .map(([sign]) => sign);
  const stelliumSigns = Object.entries(signCounts)
    .filter(([, count]) => count >= 3)
    .map(([sign]) => sign);

  const angleSigns = anglesKernel.reduce((acc, angle) => {
    const key = String(angle?.key || "").trim().toLowerCase();
    const sign = String(angle?.kernel?.meta?.sign_ja || "").trim();
    if (!key || !sign) return acc;
    acc[key] = sign;
    return acc;
  }, {});

  return {
    summary: {
      element: {
        counts_line: element?.counts_line || "",
        counts: element?.counts || {},
        dominant: element?.dominant || [],
        missing: element?.missing || [],
        order_hint: element?.order_hint || "",
        residue_hint: element?.residue_hint || "",
      },
      modality: {
        counts_line: modality?.counts_line || "",
        counts: modality?.counts || {},
        dominant: modality?.dominant || [],
        missing: modality?.missing || [],
        order_hint: modality?.order_hint || "",
        residue_hint: modality?.residue_hint || "",
      },
    },
    bodies,
    angles,
    nodes,
    chiron,
    lilith,
    closing: {
      elements: element?.counts || {},
      element_dominant: element?.dominant || [],
      element_missing: element?.missing || [],
      modalities: modality?.counts || {},
      modality_dominant: modality?.dominant || [],
      modality_missing: modality?.missing || [],
      dominant_signs: dominantSigns,
      stellium_signs: stelliumSigns,
      bodies_signs: bodies.reduce((acc, item) => {
        if (!item?.key || !item?.sign) return acc;
        acc[item.key] = item.sign;
        return acc;
      }, {}),
      angles: angleSigns,
      nodes: {
        south: nodes?.south?.sign || "",
        north: nodes?.north?.sign || "",
      },
    },
  };
}

function buildAllBatchPromptSimple({ input, retryNote = "" }) {
  const header = `
${BLUEPRINT_LIGHT_USER_PROMPT_PREFIX}

以下のINPUTから本文を生成する。出力は **JSONのみ**（前後に文章を付けない）。
出力JSONの形：
{
  "summary": { "element": "...", "modality": "..." },
  "bodies": {
    "sun": "...", "moon": "...", "mercury": "...", "venus": "...", "mars": "...",
    "jupiter": "...", "saturn": "...", "uranus": "...", "neptune": "...", "pluto": "..."
  },
  "chiron": "...",
  "lilith": "...",
  "nodes": { "south": "...", "north": "..." },
  "angles": { "asc": "...", "mc": "...", "ic": "...", "dc": "..." },
  "closing_summary": "..."
}

========================
まず最初に（ここだけ守れば勝つ）
========================
- ここは占いじゃない。未来を断言しない。指示もしない。吉凶もしない。
- 新情報を足さない。INPUTにあるものだけで書く。
- INPUTの sign / phase / element / modality は全部「材料」としてもう渡ってる前提。ちゃんと使う。
- “意味”より先に入るものがある。まず「感触」「重さ」「気配」から書いていい。

========================
書き方の芯（温度）
========================
- 文章は「出来事の入り方」を描く。
  1) 先に入るもの（最初に届く層 / 反応する層）
  2) 後から来るもの（あとで言葉になる層 / 整う層）
  3) 残り方（余韻 / 定着 / 消えにくさ）
- この3つは **全項目に必須**。
  ただし、毎回同じ言い回しは禁止。項目ごとに言い換える。
- 分析っぽい説明で逃げない。体感の描写でいく。けど押しつけない（余白を残す）。

========================
言葉のNG（テンプレ化の元を切る）
========================
- 禁止語（本文に入れない）：
  あなた／すべき／した方がいい／したほうがいい／しよう／必ず／確実／絶対／運命／使命
- “分析語”に逃げない（本文に入れない）：
  示唆／象徴／可能性／課題／促す／影響

========================
テンプレ禁止（ここ超大事）
========================
- 同じ文型の使い回し禁止（語尾・動詞・流れを毎回変える）。
- 「A、B、C。」みたいな断片羅列は禁止。ちゃんと文として閉じる。
- “安全な型”を連発しない。項目ごとに視点と動きを変える。
- 1項目ごとに語感を変える（同じ動詞で始めない）。

========================
表記のルール（軽めに固定）
========================
- 星座名は各本文に **1回だけ** 入れる（列挙しない）。
- 天体名・度数は任意。必要なら1回だけ使ってよい（数値の羅列は避ける）。

========================
項目ごとの書き方
========================
[summary]
- counts_line は書かない（UI側で出る）。
- 4~6文。
- 要素／三区分の“手触り”を、そのまま書く。
  ※「先に入る→後から来る→残り方」を summary にも入れてOK（むしろ強い）。

[本文（bodies / chiron / lilith / nodes / angles）]
- 各本文は 6〜10文、改行なし。
- 必ず「先に入るもの／後から来るもの／残り方」を入れる（言い方は毎回変える）。
- “断言”で閉じない。余白を残して終える。

[closing_summary]
- 上のJSON全部をまたいで、全体の“入り方”と“残り方”をまとめる。
- 分析で閉じない。結論で断定しない。
- 10行くらい。改行OK。

`.trim();

  const payload = buildSimpleBundle(input);
  const note = retryNote ? `\n\n【追加指示】${retryNote}\n` : "";
  return `${header}${note}\nINPUT:\n${JSON.stringify(payload || {}, null, 2)}`;
}

async function generateAllBatchSimple({ apiKey, baseUrl, model, input, retryNote = "" }) {
  const prompt = buildAllBatchPromptSimple({ input, retryNote });
  const content = await createChatCompletion({
    apiKey,
    baseUrl,
    model,
    messages: [
      { role: "system", content: SORA_AI_SYSTEM_PROMPT_BLUEPRINT_LIGHT },
      { role: "user", content: prompt },
    ],
    temperature: 0.9,
    maxTokens: MAX_TOKENS_ALL_BATCH,
  });
  if (content === "__RETRY__") return { ok: false, reason: "retry" };
  const jsonText = extractJson(content);
  if (!jsonText) return { ok: false, reason: "json_extract_failed" };
  let parsed = null;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    const repaired = escapeNewlinesInJsonStrings(jsonText);
    parsed = JSON.parse(repaired);
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, reason: "shape_invalid" };
  return { ok: true, data: parsed };
}

function buildSummaryExampleLines(kernel, label = "") {
  const dominant = Array.isArray(kernel?.dominant) ? kernel.dominant : [];
  const missing = Array.isArray(kernel?.missing) ? kernel.missing : [];
  const orderHint = String(kernel?.order_hint || "").trim();
  const residueHint = String(kernel?.residue_hint || "").trim();

  if (label === "element") {
    const lines = [];
    if (dominant.length && missing.length) {
      if (missing.includes("風")) {
        lines.push(`${dominant.join("と")}が多く、${missing.join("・")}が存在しない構造。`);
      } else {
        lines.push(`${dominant.join("と")}が多く、${missing.join("・")}が欠ける構造。`);
      }
    } else if (dominant.length) {
      lines.push(`${dominant.join("と")}が多い構造。`);
    } else if (missing.length) {
      lines.push(`${missing.join("・")}が欠ける構造。`);
    }

    let reaction = "出来事や人の反応は「意味」より先に、感触として入ってきやすい。";
    if (orderHint.includes("感触")) reaction = "出来事や人の反応は「意味」より先に、感触・重さ・気配として入ってきやすい。";
    if (orderHint.includes("動き")) reaction = "出来事や反応は「意味」より先に、動き・勢いとして立ち上がりやすい。";
    if (orderHint.includes("揺らぎ")) reaction = "出来事や反応は「意味」より先に、揺らぎや気配として立ち上がりやすい。";
    lines.push(reaction);

    let orderLine = "理解してから感じるのではなく、感じてしまったあとに、言葉を探す。";
    if (orderHint.includes("動き")) orderLine = "考えてから動くのではなく、動いてから理由を探す。";
    if (orderHint.includes("揺らぎ")) orderLine = "整えてから動くのではなく、揺れが先に立つ。";
    lines.push(orderLine);

    if (missing.includes("風")) {
      lines.push("空気を説明する側というより、空気の中に最初から入ってしまう側の反応。");
    } else if (missing.includes("火")) {
      lines.push("点火を待つ側に寄る反応。");
    } else if (missing.includes("地")) {
      lines.push("着地を探しながら動く反応。");
    } else if (missing.includes("水")) {
      lines.push("余韻より先に輪郭を立てる反応。");
    } else if (residueHint) {
      lines.push(`${residueHint}。`);
    }
    return lines.filter(Boolean);
  }

  if (label === "modality") {
    const lines = [];
    if (dominant.length && missing.length) {
      lines.push(`${dominant.join("と")}が強く、${missing.join("・")}が欠ける。`);
    } else if (dominant.length) {
      lines.push(`${dominant.join("と")}が強い。`);
    } else if (missing.length) {
      lines.push(`${missing.join("・")}が欠ける。`);
    }
    lines.push("動き出しの圧と、留まり続ける圧が同時に強い。");
    lines.push("一度鳴った感触は、簡単には消えない。");
    lines.push("切り替えは「調整」ではなく、一度止まり、位相ごと変わる形で起きやすい。");
    return lines.filter(Boolean);
  }

  return [];
}

function buildSummaryExampleText(kernel, label = "") {
  const lines = [];
  const counts = String(kernel?.counts_line || "").trim();
  if (counts) lines.push(counts);
  const bodyLines = buildSummaryExampleLines(kernel, label);
  for (const line of bodyLines) {
    lines.push(line.endsWith("。") ? line : `${line}。`);
  }
  return lines.filter(Boolean).join("\n");
}

function normalizeSummaryText(text, kernel, label) {
  let out = normalizeParagraph(coerceText(text));
  if (!out || out.includes("[object Object]")) {
    return buildSummaryExampleText(kernel, label);
  }
  // 禁止語の除去は行わない（プロンプト側で禁止）
  out = out.replace(/モダリティ|モード/gi, "三区分");
  if (!out) return buildSummaryExampleText(kernel, label);
  out = tidyConsolidatedText(out, { minSentences: 3, maxSentences: 6 });
  return ensureCountsLine(out, kernel?.counts_line || "");
}

function normalizeClosingText(text, { minSentences = 4, maxSentences = 8, minChars = MIN_CLOSING_CHARS } = {}) {
  let out = normalizeParagraph(coerceText(text));
  if (!out) return "";
  // 禁止語の除去は行わない（プロンプト側で禁止）
  out = out.replace(/モダリティ|モード/gi, "三区分");
  if (!out) return "";
  out = tidyConsolidatedText(out, { minSentences, maxSentences });
  if (isTooShort(out, minChars)) return out;
  return out;
}

function hashString(seed) {
  const str = String(seed || "");
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash >>> 0;
}

function pickOne(list, seed) {
  if (!Array.isArray(list) || !list.length) return "";
  const idx = Math.abs(seed) % list.length;
  return String(list[idx] || "").trim();
}

function buildFallbackText(core, seedKey) {
  const seed = hashString(seedKey || core);
  const lead = pickOne([
    `${core}が場の軸になる。`,
    `${core}は静かな基準として置かれる。`,
    `${core}は内側で先に働き、外側で形になる。`,
  ], seed) || `${core}が場の軸になる。`;
  const order = pickOne([
    "流れが整ってから輪郭が出る。",
    "手触りが先に来て、あとで意味が結ばれる。",
    "形ができてから理由が追う。",
  ], seed + 3) || "流れが整ってから輪郭が出る。";
  const residue = pickOne([
    "重さがゆっくり残る。",
    "響きが長く続く。",
    "痕が静かに残る。",
  ], seed + 7) || "重さがゆっくり残る。";
  return `${lead}${order}${residue}`;
}

function normalizeSectionText(text, { minSentences = 3, maxSentences = 5, minChars = MIN_BODY_CHARS } = {}) {
  let out = normalizeParagraph(coerceText(text));
  if (!out) return "";
  // 禁止語の除去は行わない（プロンプト側で禁止）
  out = out.replace(/モダリティ|モード/gi, "三区分");
  if (!out) return "";
  out = tidyConsolidatedText(out, { minSentences, maxSentences });
  if (isTooShort(out, minChars)) return out;
  return out;
}

function hasAllRequiredKeys(source) {
  const bodies = source?.bodies || {};
  const angles = source?.angles || {};
  const nodes = source?.nodes || {};
  const bodiesOk = REQUIRED_BODY_KEYS.every((k) => typeof bodies[k] === "string" && bodies[k].trim());
  const anglesOk = REQUIRED_ANGLE_KEYS.every((k) => typeof angles[k] === "string" && angles[k].trim());
  const nodesOk =
    typeof nodes?.south === "string" &&
    nodes.south.trim() &&
    typeof nodes?.north === "string" &&
    nodes.north.trim();
  const chironOk = typeof source?.chiron === "string" && source.chiron.trim();
  const lilithOk = typeof source?.lilith === "string" && source.lilith.trim();
  const summaryOk = typeof source?.summary?.element === "string" && typeof source?.summary?.modality === "string";
  const closingOk = typeof source?.closing_summary === "string" && source.closing_summary.trim();
  return bodiesOk && anglesOk && nodesOk && chironOk && lilithOk && summaryOk && closingOk;
}

async function generateBlueprintLightText({ env, input }) {
  const apiKey = env?.OPENAI_API_KEY || process.env.OPENAI_API_KEY || "";
  if (!apiKey) return { ok: false, reason: "no_api_key" };
  const model =
    env?.OPENAI_MODEL_BLUEPRINT_LIGHT ||
    process.env.OPENAI_MODEL_BLUEPRINT_LIGHT ||
    "gpt-4o";
  const baseUrl = process.env.OPENAI_BASE_URL || env?.OPENAI_BASE_URL || "https://api.openai.com/v1";

  const bodyItems = Array.isArray(input?.kernel?.bodies) ? input.kernel.bodies : [];
  const angleItems = Array.isArray(input?.kernel?.angles) ? input.kernel.angles : [];

  let batch = await generateAllBatchSimple({ apiKey, baseUrl, model, input });
  if (!batch?.ok || !hasAllRequiredKeys(batch.data)) {
    batch = await generateAllBatchSimple({
      apiKey,
      baseUrl,
      model,
      input,
      retryNote: "JSONの全キー（summary/bodies/angles/nodes/chiron/lilith）を必ず出力すること。",
    });
  }
  if (batch?.ok && hasAllRequiredKeys(batch.data) && hasTemplateReuse(batch.data)) {
    const repeated = collectRepeatedSentences(batch.data);
    const repeatedNote = repeated.length ? `以下の文の再利用は禁止: ${repeated.join(" / ")}` : "";
    batch = await generateAllBatchSimple({
      apiKey,
      baseUrl,
      model,
      input,
      retryNote:
        `各項目で動詞と語感を変える。sign/phase/element/modality のどれかを必ず1回入れる。文型の使い回しは禁止。${repeatedNote}`,
    });
  }
  if (batch?.ok && hasAllRequiredKeys(batch.data)) {
    const templateHits = collectTemplatePhraseHits(batch.data, { minRepeat: 1 });
    if (templateHits.length) {
      batch = await generateAllBatchSimple({
        apiKey,
        baseUrl,
        model,
        input,
        retryNote:
          "同じフレーズや同じ文型の繰り返しが出ているため、別の語彙と流れで書き直すこと。",
      });
    }
  }
  if (batch?.ok && hasAllRequiredKeys(batch.data)) {
    const templateHits = collectTemplatePhraseHits(batch.data, { minRepeat: 1 });
    if (templateHits.length) {
      batch = await generateAllBatchSimple({
        apiKey,
        baseUrl,
        model,
        input,
        retryNote:
          "テンプレ的な言い回しを使わず、語尾・動詞・順序を全て変えて書き直すこと。",
      });
    }
  }
  if (batch?.ok && hasAllRequiredKeys(batch.data) && hasMissingSigns(batch.data, input)) {
    batch = await generateAllBatchSimple({
      apiKey,
      baseUrl,
      model,
      input,
      retryNote:
        "各本文にその項目の星座名を必ず1回入れる。星座名が入っていない本文は不正。",
    });
  }
  if (batch?.ok && hasAllRequiredKeys(batch.data) && hasTemplateReuse(batch.data)) {
    batch = await generateAllBatchSimple({
      apiKey,
      baseUrl,
      model,
      input,
      retryNote:
        "テンプレの再利用は禁止。各本文は固有の語彙で書く。sign/phase/element/modality を必ず1回入れる。",
    });
  }
  if (batch?.ok && hasAllRequiredKeys(batch.data) && hasTooShortSections(batch.data)) {
    batch = await generateAllBatchSimple({
      apiKey,
      baseUrl,
      model,
      input,
      retryNote:
        "短すぎるので厚みを足す。各本文は3〜5文、120〜200字を目安にする。断片の羅列は禁止。",
    });
  }
  if (!batch?.ok) return { ok: false, reason: batch.reason || "ai_failed" };

  const source = batch.data || {};
  const summaryKernel = input?.kernel?.summary || {};
  const summaryBlocks = {
    element: normalizeSummaryText(source?.summary?.element || "", summaryKernel?.element || {}, "element"),
    modality: normalizeSummaryText(source?.summary?.modality || "", summaryKernel?.modality || {}, "modality"),
  };

  const closingTextRaw = normalizeClosingText(source?.closing_summary || "");
  const pickSummaryBody = (text) => {
    const lines = String(text || "")
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!lines.length) return "";
    const body = lines.length > 1 ? lines.slice(1).join(" ") : lines[0];
    return body;
  };
  const closingText = closingTextRaw
    ? closingTextRaw
    : [pickSummaryBody(summaryBlocks.element), pickSummaryBody(summaryBlocks.modality)]
        .filter(Boolean)
        .join(" ");

  const bodies = bodyItems.map((body) => {
    const key = body?.key || "";
    const core = PLANET_CORE_MAP[key] || "構造";
    let text = normalizeSectionText(source?.bodies?.[key] || "");
    if (!text) text = buildFallbackText(core, `bodies.${key}`);
    return {
      key,
      text,
      fact_line: body?.fact_line || body?.kernel?.meta?.fact_line || "",
    };
  });

  const angles = angleItems.map((angle) => {
    const key = angle?.key || "";
    const core = PLANET_CORE_MAP[key] || "構造";
    let text = normalizeSectionText(source?.angles?.[key] || "");
    if (!text) text = buildFallbackText(core, `angles.${key}`);
    return {
      key,
      text,
      fact_line: angle?.fact_line || angle?.kernel?.meta?.fact_line || "",
    };
  });

  const chironCore = PLANET_CORE_MAP.chiron || "構造";
  const lilithCore = PLANET_CORE_MAP.lilith || "構造";
  const southCore = PLANET_CORE_MAP.south_node || "構造";
  const northCore = PLANET_CORE_MAP.north_node || "構造";

  let chironText = normalizeSectionText(source?.chiron || "");
  if (!chironText) chironText = buildFallbackText(chironCore, "chiron");

  let lilithText = normalizeSectionText(source?.lilith || "");
  if (!lilithText) lilithText = buildFallbackText(lilithCore, "lilith");

  let southNodeText = normalizeSectionText(source?.nodes?.south || "");
  if (!southNodeText) southNodeText = buildFallbackText(southCore, "nodes.south");

  let northNodeText = normalizeSectionText(source?.nodes?.north || "");
  if (!northNodeText) northNodeText = buildFallbackText(northCore, "nodes.north");

  const data = {
    version: "blueprint_light_v1",
    sections: [
      {
        id: "summary",
        blocks: [
          { id: "element", text: summaryBlocks.element },
          { id: "modality", text: summaryBlocks.modality },
        ],
      },
      {
        id: "bodies",
        items: bodies,
      },
      {
        id: "chiron",
        text: chironText,
      },
      {
        id: "lilith",
        text: lilithText,
      },
      {
        id: "nodes",
        south: { text: southNodeText },
        north: { text: northNodeText },
      },
      {
        id: "angles",
        items: angles,
      },
      {
        id: "closing_summary",
        title: "⑧ 全体の統括",
        text: closingText || "",
      },
    ],
    footer: {
      echo: "星は語る。解釈はあなたのもの🌃",
      note: "ソラのこえ / BLUEPRINT LIGHT v1",
    },
  };

  return { ok: true, data };
}

module.exports = Object.freeze({
  generateBlueprintLightText,
});
