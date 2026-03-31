"use strict";

/**
 * JSON extraction / repair helpers for LLM output.
 * If parsing fails, check here before prompt changes.
 */
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

module.exports = {
  extractJson,
  escapeNewlinesInJsonStrings,
  parseJsonWithRepair,
};
