"use strict";

function countChars(text) {
  return Array.from(String(text || "")).length;
}

function hasForbidden(text) {
  const t = String(text || "");
  const forbidden = /(すべき|した方がいい|するといい|してください|必ず|確実|運命|使命|アドバイス|促されるでしょう)/;
  return forbidden.test(t);
}

function findSplitIndex(chars, maxChars, marks, maxOverflow = 2, minSplitChars = 6) {
  const splitMarks = new Set(marks);
  const candidates = [];
  for (let i = 0; i < chars.length; i++) {
    if (!splitMarks.has(chars[i])) continue;
    const idx = i + 1;
    if (idx < minSplitChars) continue;
    candidates.push(idx);
  }

  const before = candidates.filter((i) => i <= maxChars);
  if (before.length) return before[before.length - 1];

  const after = candidates.filter((i) => i <= maxChars + maxOverflow);
  if (after.length) return after[0];

  return null;
}

function collapseBlankRuns(lines) {
  const out = [];
  let blankRun = 0;
  const flushBlanks = () => {
    if (blankRun <= 0) return;
    if (blankRun >= 3) {
      out.push("");
    } else {
      for (let i = 0; i < blankRun; i++) out.push("");
    }
    blankRun = 0;
  };

  for (const line of lines) {
    const isBlank = !String(line || "").trim();
    if (isBlank) {
      blankRun += 1;
      continue;
    }
    flushBlanks();
    out.push(line);
  }
  flushBlanks();

  return out;
}

function isEmojiLine(line, maxChars = 4) {
  const t = String(line || "").trim();
  if (!t) return false;
  const chars = Array.from(t);
  if (chars.length < 1 || chars.length > maxChars) return false;
  return chars.every((ch) => /\p{Extended_Pictographic}/u.test(ch));
}

function mergeTrailingEmojiLines(lines, maxChars = 4) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isEmojiLine(line, maxChars)) {
      const hasPrev = out.length > 0 && String(out[out.length - 1] || "").trim();
      const next = lines[i + 1];
      const hasNextText = next && String(next || "").trim() && !isEmojiLine(next, maxChars);
      if (hasPrev && !hasNextText) {
        let emoji = String(line || "").trim();
        i += 1;
        while (i < lines.length && isEmojiLine(lines[i], maxChars)) {
          emoji += String(lines[i] || "").trim();
          i += 1;
        }
        out[out.length - 1] = `${out[out.length - 1]}${emoji}`;
        continue;
      }
    }
    out.push(line);
    i += 1;
  }
  return out;
}

function formatXAiText(text, opts = {}) {
  const maxLineChars = Number.isFinite(Number(opts.maxLineChars)) ? Number(opts.maxLineChars) : 20;
  const mergeEmoji = opts.mergeEmoji !== false;

  const rawLines = String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n");

  const normalized = collapseBlankRuns(rawLines);

  const out = [];
  for (const line of normalized) {
    const isBlank = !String(line || "").trim();
    if (isBlank) {
      out.push("");
      continue;
    }
    const trimmed = String(line || "").trim();
    const chars = Array.from(trimmed);
    if (chars.length <= maxLineChars) {
      out.push(trimmed);
      continue;
    }
    let splitAt = findSplitIndex(chars, maxLineChars, ["、"]);
    let splitMark = "、";
    if (splitAt == null) {
      splitAt = findSplitIndex(chars, maxLineChars, ["。"]);
      splitMark = "。";
    }
    if (splitAt == null) {
      out.push(trimmed);
      continue;
    }
    const left = chars.slice(0, splitAt).join("").trim();
    const right = chars.slice(splitAt).join("").trim();
    if (!left || !right) {
      out.push(trimmed);
      continue;
    }
    out.push(left);
    if (splitMark === "。") out.push("");
    out.push(right);
  }

  const merged = mergeEmoji ? mergeTrailingEmojiLines(out) : out;
  return merged.join("\n").trim();
}

function validateXAiText(text, opts = {}) {
  const t = formatXAiText(text, opts);
  if (!t) return { ok: false, reason: "empty" };
  if (t.includes("あなた")) return { ok: false, reason: "has_you" };
  if (hasForbidden(t)) return { ok: false, reason: "has_forbidden" };
  const len = countChars(t);
  const minChars = Number.isFinite(Number(opts.minChars)) ? Number(opts.minChars) : 60;
  const maxChars = Number.isFinite(Number(opts.maxChars)) ? Number(opts.maxChars) : 180;
  if (len < minChars) return { ok: false, reason: `too_short:${len}` };
  if (len > maxChars) return { ok: false, reason: `too_long:${len}` };
  return { ok: true, text: t, len };
}

module.exports = {
  formatXAiText,
  validateXAiText,
};
