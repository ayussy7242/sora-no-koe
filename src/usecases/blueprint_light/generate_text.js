"use strict";

const { createChatCompletion } = require("../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_BLUEPRINT_LIGHT,
  BLUEPRINT_LIGHT_USER_PROMPT_TEMPLATE,
  BLUEPRINT_LIGHT_V2_USER_PROMPT_TEMPLATE,
  BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_CORE,
  BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_ROLES,
  BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_ASPECTS,
} = require("../../content/prompts/sora_ai_prompts");
const {
  buildMasterChartFromKernel,
  writeMasterChartTmp,
} = require("./build_master_chart");
const {
  getSysPageData,
  getMapPageData,
  getObsPageData,
  getAnglesPageData,
  getPlanetPageData,
  getLayersPageData,
  getDeepPageData,
  getAspectPageData,
  getPatternPageData,
} = require("./page_extractors");

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
const MIN_BODY_CHARS = 80;
const MIN_SUMMARY_CHARS = 0;
const MIN_CLOSING_CHARS = 90;
const MIN_V2_CORE_TAGLINE_CHARS = 25;
const MIN_V2_CORE_CHARS = 200;
const MIN_V2_DASH_ELEMENT_CHARS = 160;
const MIN_V2_DASH_MODALITY_CHARS = 160;
const MIN_V2_DASH_DOMINANT_CHARS = 60;
const MIN_V2_DASH_HOUSE_CHARS = 60;
const MIN_V2_DASH_DIST_CHARS = 90;
const MIN_V2_DASH_FLOW_CHARS = 180;
const MIN_V2_DASH_STRUCTURE_CHARS = 230;
const MIN_V2_ROLE_LUM_CHARS = 70;
const MIN_V2_ROLE_PERSONAL_CHARS = 70;
const MIN_V2_ROLE_OUTER_CHARS = 70;
const MIN_V2_LAYER_CORE_CHARS = 90;
const MIN_V2_LAYER_PERSONAL_CHARS = 80;
const MIN_V2_LAYER_COLLECTIVE_CHARS = 80;
const MIN_V2_LAYER_FLOW_CHARS = 60;
const MIN_V2_DEEP_NODES_CHARS = 70;
const MIN_V2_DEEP_CHIRON_CHARS = 70;
const MIN_V2_DEEP_LILITH_CHARS = 70;
const MIN_V2_DEEP_PATTERN_CHARS = 90;
const MIN_V2_NATAL_OBS_CHARS = 200;
const MIN_V2_ANGLE_CHARS = 60;
const MIN_V2_ANGLE_AXIS_CHARS = 80;
const MIN_V2_ANGLE_INTRO_CHARS = 70;
const MIN_V2_ASPECT_CHARS = 80;
const MIN_V2_ASPECT_DYNAMICS_CHARS = 60;
const MIN_V2_PATTERN_NAME_CHARS = 8;
const MIN_V2_LIFE_DIRECTION_CHARS = 130;
const MIN_V2_PATTERN_CHARS = 35;
const MIN_V2_COSMIC_FOCUS_CHARS = 28;
const MIN_V2_COSMIC_TRAITS_CHARS = 35;
const MIN_V2_COSMIC_SIGNATURE_CHARS = 220;
const MIN_V2_CLOSING_CHARS = 120;

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

function parseJsonWithRepair(text) {
  if (!text) return { ok: false, error: "empty" };
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch (err) {
    try {
      const repaired = escapeNewlinesInJsonStrings(text);
      return { ok: true, data: JSON.parse(repaired) };
    } catch (err2) {
      return { ok: false, error: err2?.message || String(err2) };
    }
  }
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
    focus: {
      dominant_signs: dominantSigns,
      dominant_houses: (() => {
        const houseCounts = input?.kernel?.houses?.counts || {};
        return Object.entries(houseCounts)
          .map(([house, count]) => ({ house: Number(house), count: Number(count) }))
          .sort((a, b) => (b.count - a.count) || (a.house - b.house))
          .slice(0, 3)
          .map((row) => `${row.house}H`);
      })(),
      element_dominant: element?.dominant || [],
      modality_dominant: modality?.dominant || [],
      core_axis: {
        sun: bodies.find((row) => row.key === "sun") || null,
        moon: bodies.find((row) => row.key === "moon") || null,
        asc: angles.find((row) => row.key === "asc") || null,
      },
    },
  };
}

function buildAllBatchPromptSimple({ input, retryNote = "" }) {
  const header = BLUEPRINT_LIGHT_USER_PROMPT_TEMPLATE;

  const payload = buildSimpleBundle(input);
  const note = retryNote ? `\n\n【追加指示】${retryNote}\n` : "";
  return `${header}${note}\nINPUT:\n${JSON.stringify(payload || {}, null, 2)}`;
}

function buildV2Bundle(input) {
  const base = buildSimpleBundle(input);
  const aspects = Array.isArray(input?.kernel?.aspects) ? input.kernel.aspects : [];
  const houses = input?.kernel?.houses || null;
  return {
    ...base,
    aspects,
    houses,
  };
}

function buildAllBatchPromptV2({ input, retryNote = "" }) {
  const header = BLUEPRINT_LIGHT_V2_USER_PROMPT_TEMPLATE;
  const payload = input?.page_payload ? input.page_payload : buildV2Bundle(input);
  const note = retryNote ? `\n\n【追加指示】${retryNote}\n` : "";
  return `${header}${note}\nINPUT:\n${JSON.stringify(payload || {}, null, 2)}`;
}

function buildAllBatchPromptV2Segment({ input, outputShape, retryNote = "", template }) {
  const header = template || BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_CORE;
  const payload = input?.page_payload ? input.page_payload : buildV2Bundle(input);
  const note = retryNote ? `\n\n【追加指示】${retryNote}\n` : "";
  const shape = outputShape ? `\n\n出力JSONの形：\n${outputShape}\n` : "";
  return `${header}${shape}${note}\nINPUT:\n${JSON.stringify(payload || {}, null, 2)}`;
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
  const parsed = parseJsonWithRepair(jsonText);
  if (!parsed.ok) return { ok: false, reason: "json_parse_failed", error: parsed.error };
  if (!parsed.data || typeof parsed.data !== "object") return { ok: false, reason: "shape_invalid" };
  return { ok: true, data: parsed.data };
}

function writeDebugJsonArtifacts({ content, jsonText, tag }) {
  try {
    const fs = require("fs");
    const safeTag = String(tag || "v2");
    const base = `/tmp/blueprint_${safeTag}_${Date.now()}`;
    fs.writeFileSync(`${base}_raw.txt`, String(content || ""));
    if (jsonText) fs.writeFileSync(`${base}_json.txt`, String(jsonText));
    return base;
  } catch (_) {
    return null;
  }
}

async function generateAllBatchV2({ apiKey, baseUrl, model, input, retryNote = "", debug = false, debugTag = "v2" }) {
  const prompt = buildAllBatchPromptV2({ input, retryNote });
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
  if (!jsonText) {
    const debugPath = debug ? writeDebugJsonArtifacts({ content, jsonText: null, tag: `${debugTag}_extract` }) : null;
    return { ok: false, reason: "json_extract_failed", debugPath };
  }
  const parsed = parseJsonWithRepair(jsonText);
  if (!parsed.ok) {
    const debugPath = debug ? writeDebugJsonArtifacts({ content, jsonText, tag: `${debugTag}_parse` }) : null;
    return { ok: false, reason: "json_parse_failed", error: parsed.error, debugPath };
  }
  if (!parsed.data || typeof parsed.data !== "object") return { ok: false, reason: "shape_invalid" };
  return { ok: true, data: parsed.data };
}

async function generateAllBatchV2Segment({
  apiKey,
  baseUrl,
  model,
  input,
  outputShape,
  retryNote = "",
  template,
  debug = false,
  debugTag = "v2_segment",
}) {
  const prompt = buildAllBatchPromptV2Segment({ input, outputShape, retryNote, template });
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
  if (!jsonText) {
    const debugPath = debug ? writeDebugJsonArtifacts({ content, jsonText: null, tag: `${debugTag}_extract` }) : null;
    return { ok: false, reason: "json_extract_failed", debugPath };
  }
  const parsed = parseJsonWithRepair(jsonText);
  if (!parsed.ok) {
    const debugPath = debug ? writeDebugJsonArtifacts({ content, jsonText, tag: `${debugTag}_parse` }) : null;
    return { ok: false, reason: "json_parse_failed", error: parsed.error, debugPath };
  }
  if (!parsed.data || typeof parsed.data !== "object") return { ok: false, reason: "shape_invalid" };
  return { ok: true, data: parsed.data };
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
  out = tidyConsolidatedText(out, { minSentences: 3, maxSentences: 5 });
  return ensureCountsLine(out, kernel?.counts_line || "");
}

function normalizeClosingText(text, { minSentences = 3, maxSentences = 5, minChars = MIN_CLOSING_CHARS } = {}) {
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

function normalizeSectionText(text, { minSentences = 2, maxSentences = 4, minChars = MIN_BODY_CHARS } = {}) {
  let out = normalizeParagraph(coerceText(text));
  if (!out) return "";
  // 禁止語の除去は行わない（プロンプト側で禁止）
  out = out.replace(/モダリティ|モード/gi, "三区分");
  if (!out) return "";
  out = tidyConsolidatedText(out, { minSentences, maxSentences });
  if (isTooShort(out, minChars)) return out;
  return out;
}

function normalizeV2Text(text, { minSentences, maxSentences, minChars, maxChars }) {
  let out = normalizeParagraph(coerceText(text));
  if (!out) return "";
  out = out.replace(/モダリティ|モード/gi, "三区分");
  out = out
    .replace(/Cardinal/gi, "活動宮")
    .replace(/Fixed/gi, "固定宮")
    .replace(/Mutable/gi, "柔軟宮")
    .replace(/Cluster/gi, "集中型（クラスター）");
  if (!out) return "";
  out = tidyConsolidatedText(out, { minSentences, maxSentences });
  if (isTooShort(out, minChars)) return out;
  if (typeof maxChars !== "number" && typeof minChars === "number") {
    maxChars = minChars + 50;
  }
  if (typeof maxChars === "number" && out.length > maxChars) {
    out = out.slice(0, maxChars).replace(/[、。\\s]+$/g, "");
  }
  return out;
}

function stripLeadingPlacementClause(text) {
  let out = coerceText(text);
  if (!out) return "";
  const sentences = out.split("。");
  const firstSentence = sentences[0] || "";
  const hasPlacement =
    /(座).*(°|度)/.test(firstSentence) ||
    /(°|度).*(座)/.test(firstSentence) ||
    /(ASC|MC|IC|DC)/.test(firstSentence);
  if (hasPlacement && sentences.length > 1) {
    out = sentences.slice(1).join("。").trim();
  } else {
    const clauses = out.split(/、|，/);
    const firstClause = clauses[0] || "";
    const clauseHasPlacement = /(座).*(°|度)/.test(firstClause) || /(°|度).*(座)/.test(firstClause);
    if (clauseHasPlacement && clauses.length > 1) {
      out = clauses.slice(1).join("、").trim();
    }
  }
  return out.replace(/^[、。]+/, "").trim();
}

function stripPlacementTokens(text) {
  let out = coerceText(text);
  if (!out) return "";
  out = out.replace(/(牡羊座|牡牛座|双子座|蟹座|獅子座|乙女座|天秤座|蠍座|射手座|山羊座|水瓶座|魚座)/g, "");
  out = out.replace(/\b(Aries|Taurus|Gemini|Cancer|Leo|Virgo|Libra|Scorpio|Sagittarius|Capricorn|Aquarius|Pisces)\b/gi, "");
  out = out.replace(/\d+\s*(?:°|度)/g, "");
  out = out.replace(/\b\d+\s*H\b/gi, "");
  out = out.replace(/\b\d+\s*ハウス\b/g, "");
  out = out.replace(/[|｜]/g, " ");
  out = out.replace(/\s{2,}/g, " ").trim();
  return out;
}

function normalizeV2AspectText(text) {
  return normalizeV2Text(text, {
    minSentences: 1,
    maxSentences: 2,
    minChars: MIN_V2_ASPECT_CHARS,
    maxChars: 120,
  });
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
  const natalOk = typeof source?.natal_observation === "string" && source.natal_observation.trim();
  const closingOk = typeof source?.closing_summary === "string" && source.closing_summary.trim();
  return bodiesOk && anglesOk && nodesOk && chironOk && lilithOk && summaryOk && closingOk;
}

function hasAllRequiredKeysV2(source) {
  const dashboard = source?.dashboard || {};
  const planetRoles = source?.planet_roles || {};
  const systemLayers = source?.system_layers || {};
  const deepAxis = source?.deep_axis || {};
  const anglesV2 = source?.angles || {};
  const aspectMap = Array.isArray(source?.aspect_map) ? source.aspect_map : [];

  const coreOk = typeof source?.core_snapshot === "string" && source.core_snapshot.trim();
  const dashboardOk =
    typeof dashboard?.element_balance === "string" &&
    typeof dashboard?.modality_balance === "string" &&
    typeof dashboard?.dominant_signs === "string" &&
    typeof dashboard?.dominant_houses === "string" &&
    typeof dashboard?.planet_distribution === "string" &&
    typeof dashboard?.energy_flow === "string" &&
    typeof dashboard?.cosmic_structure === "string";
  const rolesOk =
    typeof planetRoles?.sun === "string" &&
    typeof planetRoles?.moon === "string" &&
    typeof planetRoles?.mercury === "string" &&
    typeof planetRoles?.venus === "string" &&
    typeof planetRoles?.mars === "string" &&
    typeof planetRoles?.jupiter === "string" &&
    typeof planetRoles?.saturn === "string" &&
    typeof planetRoles?.uranus === "string" &&
    typeof planetRoles?.neptune === "string" &&
    typeof planetRoles?.pluto === "string";
  const systemOk =
    typeof systemLayers?.core === "string" &&
    typeof systemLayers?.personal === "string" &&
    typeof systemLayers?.collective === "string" &&
    typeof systemLayers?.flow === "string";
  const deepOk =
    typeof deepAxis?.nodes === "string" &&
    typeof deepAxis?.chiron === "string" &&
    typeof deepAxis?.lilith === "string" &&
    typeof deepAxis?.pattern === "string";
  const anglesOk =
    typeof anglesV2?.intro === "string" &&
    typeof anglesV2?.asc === "string" &&
    typeof anglesV2?.mc === "string" &&
    typeof anglesV2?.ic === "string" &&
    typeof anglesV2?.dc === "string" &&
    typeof (anglesV2?.axis_structure || anglesV2?.axis_summary) === "string";
  const aspectOk = aspectMap.length >= 1 && aspectMap.every((row) => typeof row?.text === "string");
  const aspectDynamicsOk = typeof source?.aspect_dynamics === "string" && source.aspect_dynamics.trim();
  const patternNameOk = typeof source?.pattern_name === "string" && source.pattern_name.trim();
  const cosmicFocusOk = typeof source?.cosmic_focus === "string" && source.cosmic_focus.trim();
  const cosmicTraitsOk = typeof source?.cosmic_traits === "string" && source.cosmic_traits.trim();
  const cosmicSignatureOk = typeof source?.cosmic_signature === "string" && source.cosmic_signature.trim();
  const patternOk = typeof source?.chart_pattern === "string" && source.chart_pattern.trim();
  const lifeDirectionOk = typeof source?.life_direction === "string" && source.life_direction.trim();
  const natalOk = typeof source?.natal_observation === "string" && source.natal_observation.trim();
  const closingOk = typeof source?.closing_summary === "string" && source.closing_summary.trim();
  return (
    coreOk &&
    dashboardOk &&
    rolesOk &&
    systemOk &&
    deepOk &&
    anglesOk &&
    aspectOk &&
    aspectDynamicsOk &&
    patternNameOk &&
    cosmicFocusOk &&
    cosmicTraitsOk &&
    cosmicSignatureOk &&
    patternOk &&
    lifeDirectionOk &&
    natalOk &&
    closingOk
  );
}

function hasTooShortSectionsV2(source) {
  if (!source || typeof source !== "object") return true;
  const dashboard = source?.dashboard || {};
  const planetRoles = source?.planet_roles || {};
  const systemLayers = source?.system_layers || {};
  const deepAxis = source?.deep_axis || {};
  const angles = source?.angles || {};
  const aspectMap = Array.isArray(source?.aspect_map) ? source.aspect_map : [];

  const checks = [
    { text: source?.core_tagline, min: MIN_V2_CORE_TAGLINE_CHARS },
    { text: source?.core_snapshot, min: MIN_V2_CORE_CHARS },
    { text: dashboard?.element_balance, min: MIN_V2_DASH_ELEMENT_CHARS },
    { text: dashboard?.modality_balance, min: MIN_V2_DASH_MODALITY_CHARS },
    { text: dashboard?.dominant_signs, min: MIN_V2_DASH_DOMINANT_CHARS },
    { text: dashboard?.dominant_houses, min: MIN_V2_DASH_HOUSE_CHARS },
    { text: dashboard?.planet_distribution, min: MIN_V2_DASH_DIST_CHARS },
    { text: dashboard?.energy_flow, min: MIN_V2_DASH_FLOW_CHARS },
    { text: dashboard?.cosmic_structure, min: MIN_V2_DASH_STRUCTURE_CHARS },
    { text: planetRoles?.sun, min: MIN_V2_ROLE_LUM_CHARS },
    { text: planetRoles?.moon, min: MIN_V2_ROLE_LUM_CHARS },
    { text: planetRoles?.mercury, min: MIN_V2_ROLE_PERSONAL_CHARS },
    { text: planetRoles?.venus, min: MIN_V2_ROLE_PERSONAL_CHARS },
    { text: planetRoles?.mars, min: MIN_V2_ROLE_PERSONAL_CHARS },
    { text: planetRoles?.jupiter, min: MIN_V2_ROLE_OUTER_CHARS },
    { text: planetRoles?.saturn, min: MIN_V2_ROLE_OUTER_CHARS },
    { text: planetRoles?.uranus, min: MIN_V2_ROLE_OUTER_CHARS },
    { text: planetRoles?.neptune, min: MIN_V2_ROLE_OUTER_CHARS },
    { text: planetRoles?.pluto, min: MIN_V2_ROLE_OUTER_CHARS },
    { text: systemLayers?.core, min: MIN_V2_LAYER_CORE_CHARS },
    { text: systemLayers?.personal, min: MIN_V2_LAYER_PERSONAL_CHARS },
    { text: systemLayers?.collective, min: MIN_V2_LAYER_COLLECTIVE_CHARS },
    { text: systemLayers?.flow, min: MIN_V2_LAYER_FLOW_CHARS },
    { text: deepAxis?.nodes, min: MIN_V2_DEEP_NODES_CHARS },
    { text: deepAxis?.chiron, min: MIN_V2_DEEP_CHIRON_CHARS },
    { text: deepAxis?.lilith, min: MIN_V2_DEEP_LILITH_CHARS },
    { text: deepAxis?.pattern, min: MIN_V2_DEEP_PATTERN_CHARS },
    { text: angles?.intro, min: MIN_V2_ANGLE_INTRO_CHARS },
    { text: angles?.asc, min: MIN_V2_ANGLE_CHARS },
    { text: angles?.mc, min: MIN_V2_ANGLE_CHARS },
    { text: angles?.ic, min: MIN_V2_ANGLE_CHARS },
    { text: angles?.dc, min: MIN_V2_ANGLE_CHARS },
    { text: angles?.axis_structure || angles?.axis_summary, min: MIN_V2_ANGLE_AXIS_CHARS },
    { text: source?.aspect_dynamics, min: MIN_V2_ASPECT_DYNAMICS_CHARS },
    { text: source?.pattern_name, min: MIN_V2_PATTERN_NAME_CHARS },
    { text: source?.cosmic_focus, min: MIN_V2_COSMIC_FOCUS_CHARS },
    { text: source?.cosmic_traits, min: MIN_V2_COSMIC_TRAITS_CHARS },
    { text: source?.cosmic_signature, min: MIN_V2_COSMIC_SIGNATURE_CHARS },
    { text: source?.chart_pattern, min: MIN_V2_PATTERN_CHARS },
    { text: source?.life_direction, min: MIN_V2_LIFE_DIRECTION_CHARS },
    { text: source?.natal_observation, min: MIN_V2_NATAL_OBS_CHARS },
    { text: source?.closing_summary, min: MIN_V2_CLOSING_CHARS },
  ];

  const tooShort = checks.some((row) => isTooShort(row.text, row.min));
  if (tooShort) return true;

  if (aspectMap.length < 1) return true;
  return aspectMap.some((row) => isTooShort(row?.text, MIN_V2_ASPECT_CHARS));
}

function collectV2ValidationIssues(source) {
  const issues = { missing: [], tooShort: [], aspectCount: null };
  if (!source || typeof source !== "object") {
    issues.missing.push("source");
    return issues;
  }
  const dashboard = source?.dashboard || {};
  const planetRoles = source?.planet_roles || {};
  const systemLayers = source?.system_layers || {};
  const deepAxis = source?.deep_axis || {};
  const angles = source?.angles || {};
  const aspectMap = Array.isArray(source?.aspect_map) ? source.aspect_map : [];

  const requireText = (key, value) => {
    if (typeof value !== "string" || !value.trim()) issues.missing.push(key);
  };
  requireText("core_snapshot", source?.core_snapshot);
  requireText("dashboard.element_balance", dashboard?.element_balance);
  requireText("dashboard.modality_balance", dashboard?.modality_balance);
  requireText("dashboard.dominant_signs", dashboard?.dominant_signs);
  requireText("dashboard.dominant_houses", dashboard?.dominant_houses);
  requireText("dashboard.planet_distribution", dashboard?.planet_distribution);
  requireText("dashboard.energy_flow", dashboard?.energy_flow);
  requireText("dashboard.cosmic_structure", dashboard?.cosmic_structure);
  requireText("planet_roles.sun", planetRoles?.sun);
  requireText("planet_roles.moon", planetRoles?.moon);
  requireText("planet_roles.mercury", planetRoles?.mercury);
  requireText("planet_roles.venus", planetRoles?.venus);
  requireText("planet_roles.mars", planetRoles?.mars);
  requireText("planet_roles.jupiter", planetRoles?.jupiter);
  requireText("planet_roles.saturn", planetRoles?.saturn);
  requireText("planet_roles.uranus", planetRoles?.uranus);
  requireText("planet_roles.neptune", planetRoles?.neptune);
  requireText("planet_roles.pluto", planetRoles?.pluto);
  requireText("system_layers.core", systemLayers?.core);
  requireText("system_layers.personal", systemLayers?.personal);
  requireText("system_layers.collective", systemLayers?.collective);
  requireText("system_layers.flow", systemLayers?.flow);
  requireText("deep_axis.nodes", deepAxis?.nodes);
  requireText("deep_axis.chiron", deepAxis?.chiron);
  requireText("deep_axis.lilith", deepAxis?.lilith);
  requireText("deep_axis.pattern", deepAxis?.pattern);
  requireText("angles.asc", angles?.asc);
  requireText("angles.mc", angles?.mc);
  requireText("angles.ic", angles?.ic);
  requireText("angles.dc", angles?.dc);
  requireText("angles.axis_structure", angles?.axis_structure || angles?.axis_summary);
  requireText("angles.intro", angles?.intro);
  requireText("aspect_dynamics", source?.aspect_dynamics);
  requireText("pattern_name", source?.pattern_name);
  requireText("cosmic_focus", source?.cosmic_focus);
  requireText("cosmic_traits", source?.cosmic_traits);
  requireText("cosmic_signature", source?.cosmic_signature);
  requireText("chart_pattern", source?.chart_pattern);
  requireText("life_direction", source?.life_direction);
  requireText("natal_observation", source?.natal_observation);
  requireText("closing_summary", source?.closing_summary);

  const checkShort = (key, value, minChars) => {
    if (isTooShort(value, minChars)) issues.tooShort.push(key);
  };
  checkShort("core_tagline", source?.core_tagline, MIN_V2_CORE_TAGLINE_CHARS);
  checkShort("core_snapshot", source?.core_snapshot, MIN_V2_CORE_CHARS);
  checkShort("dashboard.element_balance", dashboard?.element_balance, MIN_V2_DASH_ELEMENT_CHARS);
  checkShort("dashboard.modality_balance", dashboard?.modality_balance, MIN_V2_DASH_MODALITY_CHARS);
  checkShort("dashboard.dominant_signs", dashboard?.dominant_signs, MIN_V2_DASH_DOMINANT_CHARS);
  checkShort("dashboard.dominant_houses", dashboard?.dominant_houses, MIN_V2_DASH_HOUSE_CHARS);
  checkShort("dashboard.planet_distribution", dashboard?.planet_distribution, MIN_V2_DASH_DIST_CHARS);
  checkShort("dashboard.energy_flow", dashboard?.energy_flow, MIN_V2_DASH_FLOW_CHARS);
  checkShort("dashboard.cosmic_structure", dashboard?.cosmic_structure, MIN_V2_DASH_STRUCTURE_CHARS);
  checkShort("planet_roles.sun", planetRoles?.sun, MIN_V2_ROLE_LUM_CHARS);
  checkShort("planet_roles.moon", planetRoles?.moon, MIN_V2_ROLE_LUM_CHARS);
  checkShort("planet_roles.mercury", planetRoles?.mercury, MIN_V2_ROLE_PERSONAL_CHARS);
  checkShort("planet_roles.venus", planetRoles?.venus, MIN_V2_ROLE_PERSONAL_CHARS);
  checkShort("planet_roles.mars", planetRoles?.mars, MIN_V2_ROLE_PERSONAL_CHARS);
  checkShort("planet_roles.jupiter", planetRoles?.jupiter, MIN_V2_ROLE_OUTER_CHARS);
  checkShort("planet_roles.saturn", planetRoles?.saturn, MIN_V2_ROLE_OUTER_CHARS);
  checkShort("planet_roles.uranus", planetRoles?.uranus, MIN_V2_ROLE_OUTER_CHARS);
  checkShort("planet_roles.neptune", planetRoles?.neptune, MIN_V2_ROLE_OUTER_CHARS);
  checkShort("planet_roles.pluto", planetRoles?.pluto, MIN_V2_ROLE_OUTER_CHARS);
  checkShort("system_layers.core", systemLayers?.core, MIN_V2_LAYER_CORE_CHARS);
  checkShort("system_layers.personal", systemLayers?.personal, MIN_V2_LAYER_PERSONAL_CHARS);
  checkShort("system_layers.collective", systemLayers?.collective, MIN_V2_LAYER_COLLECTIVE_CHARS);
  checkShort("system_layers.flow", systemLayers?.flow, MIN_V2_LAYER_FLOW_CHARS);
  checkShort("deep_axis.nodes", deepAxis?.nodes, MIN_V2_DEEP_NODES_CHARS);
  checkShort("deep_axis.chiron", deepAxis?.chiron, MIN_V2_DEEP_CHIRON_CHARS);
  checkShort("deep_axis.lilith", deepAxis?.lilith, MIN_V2_DEEP_LILITH_CHARS);
  checkShort("deep_axis.pattern", deepAxis?.pattern, MIN_V2_DEEP_PATTERN_CHARS);
  checkShort("angles.asc", angles?.asc, MIN_V2_ANGLE_CHARS);
  checkShort("angles.mc", angles?.mc, MIN_V2_ANGLE_CHARS);
  checkShort("angles.ic", angles?.ic, MIN_V2_ANGLE_CHARS);
  checkShort("angles.dc", angles?.dc, MIN_V2_ANGLE_CHARS);
  checkShort("angles.axis_structure", angles?.axis_structure || angles?.axis_summary, MIN_V2_ANGLE_AXIS_CHARS);
  checkShort("angles.intro", angles?.intro, MIN_V2_ANGLE_INTRO_CHARS);
  checkShort("aspect_dynamics", source?.aspect_dynamics, MIN_V2_ASPECT_DYNAMICS_CHARS);
  checkShort("pattern_name", source?.pattern_name, MIN_V2_PATTERN_NAME_CHARS);
  checkShort("cosmic_focus", source?.cosmic_focus, MIN_V2_COSMIC_FOCUS_CHARS);
  checkShort("cosmic_traits", source?.cosmic_traits, MIN_V2_COSMIC_TRAITS_CHARS);
  checkShort("cosmic_signature", source?.cosmic_signature, MIN_V2_COSMIC_SIGNATURE_CHARS);
  checkShort("chart_pattern", source?.chart_pattern, MIN_V2_PATTERN_CHARS);
  checkShort("life_direction", source?.life_direction, MIN_V2_LIFE_DIRECTION_CHARS);
  checkShort("natal_observation", source?.natal_observation, MIN_V2_NATAL_OBS_CHARS);
  checkShort("closing_summary", source?.closing_summary, MIN_V2_CLOSING_CHARS);

  issues.aspectCount = aspectMap.length;
  if (aspectMap.length < 3) issues.tooShort.push("aspect_map.count");
  aspectMap.forEach((row, idx) => {
    if (isTooShort(row?.text, MIN_V2_ASPECT_CHARS)) {
      issues.tooShort.push(`aspect_map[${idx}].text`);
    }
  });

  return issues;
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
        `各項目で動詞と語感を変える。sign/phase/element/modality は必要な範囲で1回入れてよい。文型の使い回しは禁止。${repeatedNote}`,
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
  if (batch?.ok && hasAllRequiredKeys(batch.data) && hasTemplateReuse(batch.data)) {
    batch = await generateAllBatchSimple({
      apiKey,
      baseUrl,
      model,
      input,
      retryNote:
        "テンプレの再利用は禁止。各本文は固有の語彙で書く。sign/phase/element/modality は必要な範囲で1回入れてよい。",
    });
  }
  if (batch?.ok && hasAllRequiredKeys(batch.data) && hasTooShortSections(batch.data)) {
    batch = await generateAllBatchSimple({
      apiKey,
      baseUrl,
      model,
      input,
      retryNote:
        "短すぎるので厚みを足す。各本文は2〜4文、80〜180字を目安にする。断片の羅列は禁止。",
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

async function generateBlueprintLightTextV2({ env, input }) {
  const apiKey = env?.OPENAI_API_KEY || process.env.OPENAI_API_KEY || "";
  if (!apiKey) return { ok: false, reason: "no_api_key" };
  const model =
    env?.OPENAI_MODEL_BLUEPRINT_LIGHT ||
    process.env.OPENAI_MODEL_BLUEPRINT_LIGHT ||
    "gpt-4o";
  const baseUrl = process.env.OPENAI_BASE_URL || env?.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const debug = String(env?.BLUEPRINT_DEBUG_JSON || process.env.BLUEPRINT_DEBUG_JSON || "") === "1";
  const kernel = input?.kernel || {};
  const slug =
    input?.slug ||
    input?.line_user_id ||
    input?.userId ||
    input?.user_id ||
    "local";
  const identity = input?.identity || input?.profile || {};

  const masterChart = buildMasterChartFromKernel(kernel, input?.longitudes || null);
  const masterPath = writeMasterChartTmp(slug, masterChart);

  const sysData = getSysPageData(masterChart, identity);
  const mapData = getMapPageData(masterChart);
  const obsData = getObsPageData(masterChart);
  const anglesData = getAnglesPageData(masterChart);
  const planetData = getPlanetPageData(masterChart);
  const layersData = getLayersPageData(masterChart);
  const deepData = getDeepPageData(masterChart);
  const aspectData = getAspectPageData(masterChart);
  const patternData = getPatternPageData(masterChart);

  const corePayload = {
    page: "CORE",
    sys: sysData,
    map: mapData,
    obs: obsData,
    pattern: patternData,
  };
  const rolesPayload = {
    page: "ROLES",
    planets: planetData,
    layers: layersData,
    deep: deepData,
    angles: anglesData?.angles || {},
  };
  const aspectsPayload = {
    page: "ASPECTS",
    aspects: aspectData,
  };

  const shapeCore = `{
  "core_tagline": "...",
  "core_snapshot": "...",
  "dashboard": {
    "element_balance": "...",
    "modality_balance": "...",
    "dominant_signs": "...",
    "dominant_houses": "...",
    "planet_distribution": "...",
    "energy_flow": "...",
    "cosmic_structure": "..."
  },
  "pattern_name": "...",
  "cosmic_focus": "...",
  "cosmic_traits": "...",
  "cosmic_signature": "...",
  "natal_observation": "...",
  "chart_pattern": "...",
  "life_direction": "...",
  "closing_summary": "..."
}`;
  const shapeRoles = `{
  "planet_roles": {
    "sun": "...",
    "moon": "...",
    "mercury": "...",
    "venus": "...",
    "mars": "...",
    "jupiter": "...",
    "saturn": "...",
    "uranus": "...",
    "neptune": "...",
    "pluto": "..."
  },
  "system_layers": {
    "core": "...",
    "personal": "...",
    "collective": "...",
    "flow": "..."
  },
  "deep_axis": {
    "nodes": "...",
    "chiron": "...",
    "lilith": "...",
    "pattern": "..."
  },
  "angles": {
    "intro": "...",
    "asc": "...",
    "mc": "...",
    "ic": "...",
    "dc": "...",
    "axis_structure": "..."
  }
}`;
  const shapeAspects = `{
  "aspect_map": [
    { "key": "aspect_1", "text": "..." },
    { "key": "aspect_2", "text": "..." },
    { "key": "aspect_3", "text": "..." }
  ],
  "aspect_dynamics": "..."
}`;

  const segment1 = await generateAllBatchV2Segment({
    apiKey,
    baseUrl,
    model,
    input: { page_payload: corePayload },
    outputShape: shapeCore,
    template: BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_CORE,
    retryNote: "出力は厳密なJSONのみ。末尾カンマ禁止。ダブルクォートのみ。",
    debug,
    debugTag: "v2_seg_core",
  });
  if (!segment1?.ok) return { ok: false, reason: segment1.reason || "ai_failed", debugPath: segment1.debugPath };

  const segment2 = await generateAllBatchV2Segment({
    apiKey,
    baseUrl,
    model,
    input: { page_payload: rolesPayload },
    outputShape: shapeRoles,
    template: BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_ROLES,
    retryNote: "出力は厳密なJSONのみ。末尾カンマ禁止。ダブルクォートのみ。",
    debug,
    debugTag: "v2_seg_roles",
  });
  if (!segment2?.ok) return { ok: false, reason: segment2.reason || "ai_failed", debugPath: segment2.debugPath };

  const segment3 = await generateAllBatchV2Segment({
    apiKey,
    baseUrl,
    model,
    input: { page_payload: aspectsPayload },
    outputShape: shapeAspects,
    template: BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_ASPECTS,
    retryNote: "出力は厳密なJSONのみ。末尾カンマ禁止。ダブルクォートのみ。",
    debug,
    debugTag: "v2_seg_aspects",
  });
  if (!segment3?.ok) return { ok: false, reason: segment3.reason || "ai_failed", debugPath: segment3.debugPath };

  const source = {
    ...(segment1.data || {}),
    ...(segment2.data || {}),
    ...(segment3.data || {}),
  };
  const dashboard = source?.dashboard || {};
  const planetRoles = source?.planet_roles || {};
  const systemLayers = source?.system_layers || {};
  const deepAxis = source?.deep_axis || {};
  const angles = source?.angles || {};
  const aspectMap = Array.isArray(source?.aspect_map) ? source.aspect_map : [];

  const data = {
    version: "blueprint_light_v2",
    core_tagline: normalizeV2Text(source?.core_tagline || "", {
      minSentences: 1,
      maxSentences: 1,
      minChars: MIN_V2_CORE_TAGLINE_CHARS,
      maxChars: 40,
    }),
    core_snapshot: normalizeV2Text(source?.core_snapshot || "", {
      minSentences: 3,
      maxSentences: 5,
      minChars: MIN_V2_CORE_CHARS,
      maxChars: 260,
    }),
    dashboard: {
      element_balance: normalizeV2Text(dashboard?.element_balance || "", {
        minSentences: 2,
        maxSentences: 4,
        minChars: MIN_V2_DASH_ELEMENT_CHARS,
        maxChars: 220,
      }),
      modality_balance: normalizeV2Text(dashboard?.modality_balance || "", {
        minSentences: 2,
        maxSentences: 4,
        minChars: MIN_V2_DASH_MODALITY_CHARS,
        maxChars: 220,
      }),
      dominant_signs: normalizeV2Text(dashboard?.dominant_signs || "", {
        minSentences: 1,
        maxSentences: 3,
        minChars: MIN_V2_DASH_DOMINANT_CHARS,
      }),
      dominant_houses: normalizeV2Text(dashboard?.dominant_houses || "", {
        minSentences: 1,
        maxSentences: 3,
        minChars: MIN_V2_DASH_HOUSE_CHARS,
      }),
      planet_distribution: normalizeV2Text(dashboard?.planet_distribution || "", {
        minSentences: 2,
        maxSentences: 4,
        minChars: MIN_V2_DASH_DIST_CHARS,
        maxChars: 140,
      }),
      energy_flow: normalizeV2Text(dashboard?.energy_flow || "", {
        minSentences: 2,
        maxSentences: 4,
        minChars: MIN_V2_DASH_FLOW_CHARS,
        maxChars: 240,
      }),
      cosmic_structure: normalizeV2Text(dashboard?.cosmic_structure || "", {
        minSentences: 3,
        maxSentences: 5,
        minChars: MIN_V2_DASH_STRUCTURE_CHARS,
        maxChars: 300,
      }),
    },
    planet_roles: {
      sun: stripPlacementTokens(stripLeadingPlacementClause(normalizeV2Text(planetRoles?.sun || "", {
        minSentences: 2,
        maxSentences: 4,
        minChars: MIN_V2_ROLE_LUM_CHARS,
        maxChars: 90,
      }))),
      moon: stripPlacementTokens(stripLeadingPlacementClause(normalizeV2Text(planetRoles?.moon || "", {
        minSentences: 2,
        maxSentences: 4,
        minChars: MIN_V2_ROLE_LUM_CHARS,
        maxChars: 90,
      }))),
      mercury: stripPlacementTokens(stripLeadingPlacementClause(normalizeV2Text(planetRoles?.mercury || "", {
        minSentences: 2,
        maxSentences: 4,
        minChars: MIN_V2_ROLE_PERSONAL_CHARS,
        maxChars: 90,
      }))),
      venus: stripPlacementTokens(stripLeadingPlacementClause(normalizeV2Text(planetRoles?.venus || "", {
        minSentences: 2,
        maxSentences: 4,
        minChars: MIN_V2_ROLE_PERSONAL_CHARS,
        maxChars: 90,
      }))),
      mars: stripPlacementTokens(stripLeadingPlacementClause(normalizeV2Text(planetRoles?.mars || "", {
        minSentences: 2,
        maxSentences: 4,
        minChars: MIN_V2_ROLE_PERSONAL_CHARS,
        maxChars: 90,
      }))),
      jupiter: stripPlacementTokens(stripLeadingPlacementClause(normalizeV2Text(planetRoles?.jupiter || "", {
        minSentences: 2,
        maxSentences: 4,
        minChars: MIN_V2_ROLE_OUTER_CHARS,
        maxChars: 90,
      }))),
      saturn: stripPlacementTokens(stripLeadingPlacementClause(normalizeV2Text(planetRoles?.saturn || "", {
        minSentences: 2,
        maxSentences: 4,
        minChars: MIN_V2_ROLE_OUTER_CHARS,
        maxChars: 90,
      }))),
      uranus: stripPlacementTokens(stripLeadingPlacementClause(normalizeV2Text(planetRoles?.uranus || "", {
        minSentences: 2,
        maxSentences: 4,
        minChars: MIN_V2_ROLE_OUTER_CHARS,
        maxChars: 90,
      }))),
      neptune: stripPlacementTokens(stripLeadingPlacementClause(normalizeV2Text(planetRoles?.neptune || "", {
        minSentences: 2,
        maxSentences: 4,
        minChars: MIN_V2_ROLE_OUTER_CHARS,
        maxChars: 90,
      }))),
      pluto: stripPlacementTokens(stripLeadingPlacementClause(normalizeV2Text(planetRoles?.pluto || "", {
        minSentences: 2,
        maxSentences: 4,
        minChars: MIN_V2_ROLE_OUTER_CHARS,
        maxChars: 90,
      }))),
    },
    system_layers: {
      core: stripPlacementTokens(normalizeV2Text(systemLayers?.core || "", {
        minSentences: 3,
        maxSentences: 5,
        minChars: MIN_V2_LAYER_CORE_CHARS,
        maxChars: 120,
      })),
      personal: stripPlacementTokens(normalizeV2Text(systemLayers?.personal || "", {
        minSentences: 3,
        maxSentences: 5,
        minChars: MIN_V2_LAYER_PERSONAL_CHARS,
        maxChars: 120,
      })),
      collective: stripPlacementTokens(normalizeV2Text(systemLayers?.collective || "", {
        minSentences: 3,
        maxSentences: 5,
        minChars: MIN_V2_LAYER_COLLECTIVE_CHARS,
        maxChars: 120,
      })),
      flow: stripPlacementTokens(normalizeV2Text(systemLayers?.flow || "", {
        minSentences: 3,
        maxSentences: 5,
        minChars: MIN_V2_LAYER_FLOW_CHARS,
        maxChars: 100,
      })),
    },
    deep_axis: {
      nodes: stripPlacementTokens(stripLeadingPlacementClause(normalizeV2Text(deepAxis?.nodes || "", {
        minSentences: 2,
        maxSentences: 4,
        minChars: MIN_V2_DEEP_NODES_CHARS,
        maxChars: 90,
      }))),
      chiron: stripPlacementTokens(stripLeadingPlacementClause(normalizeV2Text(deepAxis?.chiron || "", {
        minSentences: 2,
        maxSentences: 4,
        minChars: MIN_V2_DEEP_CHIRON_CHARS,
        maxChars: 90,
      }))),
      lilith: stripPlacementTokens(stripLeadingPlacementClause(normalizeV2Text(deepAxis?.lilith || "", {
        minSentences: 2,
        maxSentences: 4,
        minChars: MIN_V2_DEEP_LILITH_CHARS,
        maxChars: 90,
      }))),
      pattern: stripPlacementTokens(normalizeV2Text(deepAxis?.pattern || "", {
        minSentences: 3,
        maxSentences: 5,
        minChars: MIN_V2_DEEP_PATTERN_CHARS,
        maxChars: 120,
      })),
    },
    angles: {
      intro: stripPlacementTokens(normalizeV2Text(angles?.intro || "", {
        minSentences: 2,
        maxSentences: 4,
        minChars: MIN_V2_ANGLE_INTRO_CHARS,
        maxChars: 110,
      })),
      asc: stripPlacementTokens(stripLeadingPlacementClause(normalizeV2Text(angles?.asc || "", {
        minSentences: 2,
        maxSentences: 4,
        minChars: MIN_V2_ANGLE_CHARS,
        maxChars: 80,
      }))),
      mc: stripPlacementTokens(stripLeadingPlacementClause(normalizeV2Text(angles?.mc || "", {
        minSentences: 2,
        maxSentences: 4,
        minChars: MIN_V2_ANGLE_CHARS,
        maxChars: 80,
      }))),
      ic: stripPlacementTokens(stripLeadingPlacementClause(normalizeV2Text(angles?.ic || "", {
        minSentences: 2,
        maxSentences: 4,
        minChars: MIN_V2_ANGLE_CHARS,
        maxChars: 80,
      }))),
      dc: stripPlacementTokens(stripLeadingPlacementClause(normalizeV2Text(angles?.dc || "", {
        minSentences: 2,
        maxSentences: 4,
        minChars: MIN_V2_ANGLE_CHARS,
        maxChars: 80,
      }))),
      axis_structure: stripPlacementTokens(normalizeV2Text(
        angles?.axis_structure || angles?.axis_summary || "",
        {
          minSentences: 2,
          maxSentences: 4,
          minChars: MIN_V2_ANGLE_AXIS_CHARS,
          maxChars: 110,
        }
      )),
    },
    aspect_map: aspectMap.slice(0, 5).map((row, idx) => ({
      key: String(row?.key || `aspect_${idx + 1}`).trim(),
      text: normalizeV2AspectText(row?.text || ""),
    })),
    aspect_dynamics: normalizeV2Text(source?.aspect_dynamics || "", {
      minSentences: 1,
      maxSentences: 1,
      minChars: MIN_V2_ASPECT_DYNAMICS_CHARS,
      maxChars: 80,
    }),
    pattern_name: normalizeV2Text(source?.pattern_name || "", {
      minSentences: 1,
      maxSentences: 1,
      minChars: MIN_V2_PATTERN_NAME_CHARS,
    }),
    cosmic_focus: normalizeV2Text(source?.cosmic_focus || "", {
      minSentences: 1,
      maxSentences: 3,
      minChars: MIN_V2_COSMIC_FOCUS_CHARS,
    }),
    cosmic_traits: normalizeV2Text(source?.cosmic_traits || "", {
      minSentences: 1,
      maxSentences: 4,
      minChars: MIN_V2_COSMIC_TRAITS_CHARS,
    }),
    cosmic_signature: normalizeV2Text(source?.cosmic_signature || "", {
      minSentences: 2,
      maxSentences: 4,
      minChars: MIN_V2_COSMIC_SIGNATURE_CHARS,
      maxChars: 300,
    }),
    chart_pattern: normalizeV2Text(source?.chart_pattern || "", {
      minSentences: 2,
      maxSentences: 4,
      minChars: MIN_V2_PATTERN_CHARS,
      maxChars: 50,
    }),
    life_direction: normalizeV2Text(source?.life_direction || "", {
      minSentences: 2,
      maxSentences: 4,
      minChars: MIN_V2_LIFE_DIRECTION_CHARS,
      maxChars: 170,
    }),
    natal_observation: normalizeV2Text(source?.natal_observation || "", {
      minSentences: 3,
      maxSentences: 6,
      minChars: MIN_V2_NATAL_OBS_CHARS,
      maxChars: 260,
    }),
    closing_summary: normalizeV2Text(source?.closing_summary || "", {
      minSentences: 3,
      maxSentences: 5,
      minChars: MIN_V2_CLOSING_CHARS,
      maxChars: 160,
    }),
  };
  data.master_chart = masterChart;
  if (masterChart?.angular_planets) {
    data.angular_planets = masterChart.angular_planets;
  }

  if (!hasAllRequiredKeysV2(source)) {
    const issues = collectV2ValidationIssues(source);
    return { ok: false, reason: "validation_failed", issues };
  }

  const warnings = collectV2ValidationIssues(source);
  const warnOut = {};
  if (warnings?.tooShort?.length) warnOut.tooShort = warnings.tooShort;
  if (typeof warnings?.aspectCount === "number" && warnings.aspectCount < 3) {
    warnOut.aspectCount = warnings.aspectCount;
  }

  return {
    ok: true,
    data,
    warnings: Object.keys(warnOut).length ? warnOut : undefined,
    master_path: masterPath,
  };
}

module.exports = Object.freeze({
  generateBlueprintLightText,
  generateBlueprintLightTextV2,
});
