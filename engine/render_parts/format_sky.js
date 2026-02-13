"use strict";

const { emojiForBody, aspectDegFromMeta } = require("./format_shared");

// --------------------
// Public / Sora helpers (line format)
// --------------------
function formatPublicSkyLine(story, s, prefixOrDeps, maybeDeps) {
  if (!s) return "";

  // ✅ 互換：第3引数が prefix の場合がある
  const prefix = typeof prefixOrDeps === "string" ? prefixOrDeps : "・";
  const deps = (typeof prefixOrDeps === "object" && prefixOrDeps) ? prefixOrDeps : (maybeDeps || {});

  const { fmtAnyJa, publicSignJa, fmtAspectJa, fmtDeg } = deps || {};

  if (typeof fmtAnyJa !== "function") throw new Error("format.formatPublicSkyLine: fmtAnyJa is required");
  if (typeof publicSignJa !== "function") throw new Error("format.formatPublicSkyLine: publicSignJa is required");
  if (typeof fmtAspectJa !== "function") throw new Error("format.formatPublicSkyLine: fmtAspectJa is required");
  if (typeof fmtDeg !== "function") throw new Error("format.formatPublicSkyLine: fmtDeg is required");

  const aKey = s.a;
  const bKey = s.b;

  const aLabel = fmtAnyJa(aKey);
  const bLabel = fmtAnyJa(bKey);
  const aEmoji = emojiForBody(aKey);
  const bEmoji = emojiForBody(bKey);

  const aSignJa = s.a_sign_ja || publicSignJa(story, aKey);
  const bSignJa = s.b_sign_ja || publicSignJa(story, bKey);

  const aspectJa = fmtAspectJa(s.type);
  const orb = fmtDeg(s.orb_deg);
  const deg = aspectDegFromMeta(s.type, deps);
  const degStr = Number.isFinite(deg) ? `${fmtDeg(deg, 0)}°` : "";

  const head = `${prefix}${aEmoji ? `${aEmoji} ` : ""}${aLabel}（${aSignJa}）× ${bEmoji ? `${bEmoji} ` : ""}${bLabel}（${bSignJa}）`;
  const tail = degStr ? `｜${aspectJa} ${degStr}（orb ${orb}°）` : `｜${aspectJa}（orb ${orb}°）`;
  return `${head}\n${tail}`;
}

// Soraも同じで良いなら alias でOK（将来差分出すなら別実装に）
function formatSoraSkyLine(story, s, prefixOrDeps, maybeDeps) {
  return formatPublicSkyLine(story, s, prefixOrDeps, maybeDeps);
}

module.exports = { formatPublicSkyLine, formatSoraSkyLine };
