"use strict";

function wrapByChars(text, maxChars, maxLines = 2) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const chars = Array.from(raw);
  const limit = Number.isFinite(Number(maxChars)) ? Number(maxChars) : chars.length;
  const max = Number.isFinite(Number(maxLines)) ? Number(maxLines) : 2;
  if (chars.length <= limit) return [raw];
  const lines = [];
  let buf = "";
  for (const ch of chars) {
    if (Array.from(buf).length >= limit) {
      lines.push(buf);
      buf = "";
      if (lines.length >= max) break;
    }
    buf += ch;
  }
  if (buf && lines.length < max) lines.push(buf);
  return lines.slice(0, max);
}

function wrapLines(text, maxCharsOrOpts, maxLinesMaybe) {
  const raw = String(text || "");
  if (!raw.trim()) return [];

  let maxChars = 20;
  let maxLines = 3;
  let preserveNewlines = true;

  if (typeof maxCharsOrOpts === "object" && maxCharsOrOpts !== null) {
    maxChars = Number.isFinite(Number(maxCharsOrOpts.maxChars)) ? Number(maxCharsOrOpts.maxChars) : maxChars;
    maxLines = Number.isFinite(Number(maxCharsOrOpts.maxLines)) ? Number(maxCharsOrOpts.maxLines) : maxLines;
    preserveNewlines = maxCharsOrOpts.preserveNewlines !== false;
  } else {
    maxChars = Number.isFinite(Number(maxCharsOrOpts)) ? Number(maxCharsOrOpts) : maxChars;
    maxLines = Number.isFinite(Number(maxLinesMaybe)) ? Number(maxLinesMaybe) : maxLines;
  }

  const segments = preserveNewlines ? raw.split(/\r?\n/) : [raw];
  const lines = [];

  const pushWrapped = (segment) => {
    const trimmed = String(segment || "").trim();
    if (!trimmed) return;
    const chars = Array.from(trimmed);
    if (chars.length <= maxChars) {
      lines.push(trimmed);
      return;
    }
    let current = "";
    for (const ch of chars) {
      if (Array.from(current).length >= maxChars) {
        lines.push(current);
        current = "";
        if (lines.length >= maxLines) break;
      }
      current += ch;
    }
    if (current && lines.length < maxLines) lines.push(current);
  };

  segments.forEach(pushWrapped);
  let out = lines.slice(0, maxLines);
  if (out.length > 1) {
    let last = out[out.length - 1] || "";
    const punctOnly = (value) => /^[。、．，…！？!?]+$/.test(String(value || "").trim());
    if (punctOnly(last)) {
      out[out.length - 2] = `${out[out.length - 2]}${last}`;
      out = out.slice(0, -1);
    } else if (/^[。、．，…！？!?]/.test(last)) {
      out[out.length - 2] = `${out[out.length - 2]}${last[0]}`;
      last = last.slice(1);
      if (last.trim()) {
        out[out.length - 1] = last;
      } else {
        out = out.slice(0, -1);
      }
    }
  }
  return out;
}

module.exports = {
  wrapByChars,
  wrapLines,
};
