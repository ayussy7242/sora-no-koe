"use strict";

const SPACING_PROFILES = {
  x: {
    maxBlankLines: 1,
  },
  ig: {
    maxBlankLines: 2,
  },
};

function splitSentences(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const matches = raw.match(/[^。！？\n]+[。！？]?/g);
  if (!matches) return [raw];
  return matches.map((s) => s.trim()).filter(Boolean);
}

function keepLineAsIs(line) {
  const raw = String(line || "").trim();
  if (!raw) return true;
  if (/^(?:[#＃][^\s#＃]+(?:\s+|$))+$/u.test(raw)) return true;
  if (/^[─—\-_=]{3,}$/u.test(raw)) return true;
  if (/^(?:【|✦|☉|☽|🪐|🌌|🌙|💫)/u.test(raw)) return true;
  if (raw === "×") return true;
  return false;
}

function spreadSentenceSpacing(text) {
  const raw = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return "";

  const lines = raw.split("\n");
  const out = [];

  lines.forEach((line, index) => {
    const trimmed = String(line || "").trim();
    if (!trimmed) {
      out.push("");
      return;
    }
    if (keepLineAsIs(trimmed)) {
      out.push(trimmed);
      return;
    }
    const sentences = splitSentences(trimmed);
    if (!sentences.length) {
      out.push(trimmed);
      return;
    }
    sentences.forEach((sentence, sentenceIndex) => {
      out.push(sentence);
      if (sentenceIndex < sentences.length - 1) out.push("");
    });
    if (index < lines.length - 1) out.push("");
  });

  return out.join("\n").trim();
}

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
  spreadSentenceSpacing,
};
