"use strict";

/**
 * Retry heuristics and hard/soft bans.
 * If generation retries unexpectedly, check these rules.
 */
const { normalizeParagraph, splitSentences } = require("./text_utils");

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
  const TEMPLATE_PHRASES = [
    "先に空気が変わり、後で理由が整う。",
    "触れてから言葉が追う。",
    "余韻が残る。",
    "温度が残る。",
    "残り方が強い。",
    "前に出る。",
    "外へ向かう。",
  ];
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
  const bundle = input;
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

module.exports = {
  HARD_BANNED_PATTERNS,
  FACT_FORBIDDEN_PATTERNS,
  collectSourceTexts,
  hasTemplateReuse,
  collectTemplatePhraseHits,
  hasMissingSigns,
  collectRepeatedSentences,
  findHardViolation,
  stripHardBanned,
  findFactViolation,
  normalizeKey,
};
