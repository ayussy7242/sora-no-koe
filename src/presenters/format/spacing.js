"use strict";

const SPACING_PROFILES = {
  x: {
    maxBlankLines: 1,
  },
  ig: {
    maxBlankLines: 2,
  },
};

function normalizeSpacing(text, profile = "x") {
  const raw = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return "";

  const settings = SPACING_PROFILES[profile] || SPACING_PROFILES.x;
  const maxBlankLines = Number.isInteger(settings.maxBlankLines) ? settings.maxBlankLines : 1;

  const lines = raw.split("\n");
  const out = [];
  let blankRun = 0;

  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed) {
      blankRun += 1;
      continue;
    }

    const blanksToKeep = Math.min(blankRun, maxBlankLines);
    for (let i = 0; i < blanksToKeep; i += 1) out.push("");
    blankRun = 0;
    out.push(trimmed);
  }

  return out.join("\n").trim();
}

module.exports = {
  normalizeSpacing,
};
