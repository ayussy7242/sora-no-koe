"use strict";

// --------------------
// X helpers (minimal format) (DI)
// --------------------
function formatSkyLineX(story, s, emoji, deps = {}) {
  if (!s) return "";

  const { fmtAnyJa, publicSignJa, fmtAspectJa, fmtDeg } = deps;

  if (typeof fmtAnyJa !== "function") throw new Error("format.formatSkyLineX: fmtAnyJa is required");
  if (typeof publicSignJa !== "function") throw new Error("format.formatSkyLineX: publicSignJa is required");
  if (typeof fmtAspectJa !== "function") throw new Error("format.formatSkyLineX: fmtAspectJa is required");
  if (typeof fmtDeg !== "function") throw new Error("format.formatSkyLineX: fmtDeg is required");

  const aKey = s.a;
  const bKey = s.b;

  const aLabel = fmtAnyJa(aKey);
  const bLabel = fmtAnyJa(bKey);

  const aSignJa = s.a_sign_ja || publicSignJa(story, aKey);
  const bSignJa = s.b_sign_ja || publicSignJa(story, bKey);

  const aspectJa = fmtAspectJa(s.type);
  const orb = fmtDeg(s.orb_deg);

  return `${emoji}${aLabel} ${aSignJa} × ${bLabel} ${bSignJa}｜${aspectJa} ${orb}°`;
}

module.exports = { formatSkyLineX };
