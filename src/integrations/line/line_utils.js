"use strict";

function safeLineText(text, maxText = 4800) {
  const limit = Number.isFinite(Number(maxText)) ? Number(maxText) : 4800;
  const raw = text == null ? "" : String(text);
  if (!limit) return raw;
  return raw.length > limit ? raw.slice(0, limit) : raw;
}

module.exports = { safeLineText };
