"use strict";

const { formatPublicSkyLine } = require("./sky");
const { formatPersonalTPLine } = require("./personal");

// --------------------
// Blocks (header + aline)
// --------------------

// A) そら系（sky）の「ヘッダ + sky Aline」
function formatPublicSkyBlock(story, s, prefixOrDeps, maybeDeps) {
  if (!s) return "";

  const prefix = typeof prefixOrDeps === "string" ? prefixOrDeps : "・";
  const deps = (typeof prefixOrDeps === "object" && prefixOrDeps) ? prefixOrDeps : (maybeDeps || {});

  const head = formatPublicSkyLine(story, s, prefix, deps);

  // ✅ 本命：render.js で注入した buildFusionSentence を使う
  const buildFusionSentence = deps?.buildFusionSentence;

  let body = "";
  if (typeof buildFusionSentence === "function") {
    body = String(
      // 🔧 deps を dictOrDeps として渡す / s を item として渡す / opts を第3引数へ
      buildFusionSentence(s, { template: "sky_aline", mode: "sky" }))
      .trim();
  }

  // ✅ fallback（古いDIでも落ちない）
  if (!body) {
    const { dict, buildAlineSkyFusionJa, fmtAspectJa } = deps || {};
    if (dict && typeof buildAlineSkyFusionJa === "function" && typeof fmtAspectJa === "function") {
      const aspectType = s.type;
      const aspectLabelJa = fmtAspectJa(aspectType);
      const aSignKey = s.a_sign_key || s.a_sign || "";
      const bSignKey = s.b_sign_key || s.b_sign || "";

      body = String(buildAlineSkyFusionJa({
        dict,
        aSignKey,
        bSignKey,
        aPlanetKey: s.a,
        bPlanetKey: s.b,
        aspectLabelJa,
        aspectType,
        orb_deg: s.orb_deg,
        tendencyDepth: "light",
      }) || "").trim();
    }
  }

  return body ? `${head}\n${body}`.trim() : head.trim();
}


// B) きょう（personal）の「ヘッダ + personal Aline」
function formatPersonalTPBlock(story, tp, prefixOrDeps, maybeDeps) {
  if (!tp) return "";

  const prefix = typeof prefixOrDeps === "string" ? prefixOrDeps : "";
  const deps = (typeof prefixOrDeps === "object" && prefixOrDeps) ? prefixOrDeps : (maybeDeps || {});

  const head = formatPersonalTPLine(story, tp, prefix, deps);

  const buildFusionSentence = deps?.buildFusionSentence;

  let body = "";
  if (typeof buildFusionSentence === "function") {
    body = String(
      // 🔧 deps, tp, opts の順
      buildFusionSentence(tp, { template: "aline", mode: "personal" })
    ).trim();
  }

  // ✅ fallback（古いDIでも落ちない）
  if (!body) {
    const { dict, buildAlineFusionJa, fmtAspectJa } = deps || {};
    if (dict && typeof buildAlineFusionJa === "function" && typeof fmtAspectJa === "function") {
      const aspectType = tp.aspect || tp.type;
      const aspectLabelJa = fmtAspectJa(aspectType);

      const natalSignKey = tp.natal_sign_key || tp.natal_sign_en || tp.natal_sign || "";
      const transitSignKey = tp.transit_sign_key || tp.transit_sign_en || tp.transit_sign || "";

      body = String(buildAlineFusionJa({
        dict,
        natalSignKey,
        transitSignKey,
        natalPlanetKey: tp.natal_body_or_point,
        transitPlanetKey: tp.transit_body,
        aspectLabelJa,
        aspectType,
        orb_deg: tp.orb_deg,
        tendencyDepth: "light",
      }) || "").trim();
    }
  }

  return body ? `${head}\n${body}`.trim() : head.trim();
}

module.exports = {
  formatPublicSkyBlock,
  formatPersonalTPBlock,
};
