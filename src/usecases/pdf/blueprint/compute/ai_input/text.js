"use strict";

function normalizeSentenceCore(text) {
  let out = String(text || "")
    .replace(/、\s*。/g, "。")
    .replace(/,\s*。/g, "。")
    .replace(/[、,]+$/g, "")
    .replace(/で[、,]*$/g, "")
    .trim();
  if (/[はがをにとへ]$/.test(out) && out.length > 1) {
    out = out.replace(/([はがをにとへ])$/, "").trim();
  }
  return out;
}

function splitByCommaAdaptive(sentence, { maxParts = 6, targetLen = 26 } = {}) {
  const parts = String(sentence || "")
    .split("、")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length <= 1) return [sentence];
  const out = [];
  let current = "";
  for (const part of parts) {
    if (!current) {
      current = part;
      continue;
    }
    const next = `${current}、${part}`;
    if (next.length <= targetLen || out.length >= maxParts - 1) {
      current = next;
      continue;
    }
    out.push(current);
    current = part;
  }
  if (current) out.push(current);
  return out;
}

function dedupeSentences(lines) {
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    const key = String(line || "").replace(/[。、「」、\s]/g, "");
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function splitByConnectors(sentence) {
  const core = String(sentence || "");
  if (!core) return [];
  const withCuts = core.replace(/(が、|けれど|しかし|一方|だが)/g, "。$1");
  return withCuts
    .split("。")
    .map((s) => s.trim())
    .filter(Boolean);
}

function wrapParagraph(text, { maxLines = 4 } = {}) {
  const raw = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/、\s*。/g, "。")
    .replace(/,\s*。/g, "。")
    .trim();
  if (!raw) return raw;
  let sentences = raw
    .split("。")
    .map((s) => s.trim())
    .filter(Boolean);
  const expanded = [];
  for (const sentence of sentences) {
    const core = normalizeSentenceCore(sentence);
    if (!core) continue;
    if (core.length > 80 && /が、|けれど|しかし|一方|だが/.test(core)) {
      const chunks = splitByConnectors(core);
      expanded.push(...chunks);
      continue;
    }
    const commaCount = (core.match(/、/g) || []).length;
    if (core.length > 110 && commaCount >= 2) {
      const chunks = splitByCommaAdaptive(core, { maxParts: 6, targetLen: 26 });
      expanded.push(...chunks);
      continue;
    }
    if (core.length > 70 && commaCount >= 2) {
      const chunks = splitByCommaAdaptive(core, { maxParts: 4, targetLen: 24 });
      expanded.push(...chunks);
      continue;
    }
    expanded.push(core);
  }
  const lines = dedupeSentences(expanded).map((s) => (s.endsWith("。") ? s : `${s}。`));
  if (lines.length > maxLines) {
    const out = [...lines];
    while (out.length > maxLines && out.length >= 2) {
      const last = out.pop();
      out[out.length - 1] = `${out[out.length - 1]}${last}`;
    }
    return out.join("\n");
  }
  return lines.join("\n");
}

function wrapSummaryText(text, { maxLines = 10 } = {}) {
  const raw = String(text || "").trim();
  if (!raw) return raw;
  const lines = raw.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return raw;
  const first = lines[0];
  const isCounts = /^(?:🔥|🏃|🪨|💨|💧)/.test(first) && /[0-9]/.test(first);
  if (!isCounts) return wrapParagraph(raw, { maxLines });
  const rest = lines.slice(1).join(" ");
  const wrapped = wrapParagraph(rest, { maxLines: Math.max(2, maxLines - 1) });
  return wrapped ? `${first}\n${wrapped}` : first;
}

module.exports = {
  normalizeSentenceCore,
  splitByCommaAdaptive,
  dedupeSentences,
  splitByConnectors,
  wrapParagraph,
  wrapSummaryText,
};
