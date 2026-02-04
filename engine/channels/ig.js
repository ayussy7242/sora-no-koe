"use strict";

/**
 * channels/ig.js
 * - IG（FUSION優先）: 上位3 + secret + dist
 *
 * deps:
 * - normalizeAspectType
 * - fmtBodyJa / fmtDeg / fmtAspectJa
 * - publicSignJa / publicSignKey
 * - pickCenterPublicContact / pickSecretPublicContact
 * - buildNoContactLine
 * - buildFusionSentence
 * - buildNowModernPlanetCounts / buildDistLinesFromcounts
 * - RENDER_COPY
 * - FUSION_CTX（ctx.jsで作る）
 */

function renderIG(story, deps = {}) {
  const {
    normalizeAspectType,
    fmtBodyJa,
    fmtDeg,
    fmtAspectJa,
    publicSignJa,
    publicSignKey,
    pickCenterPublicContact,
    pickSecretPublicContact,
    buildNoContactLine,
    buildFusionSentence,
    buildNowModernPlanetCounts,
    buildDistLinesFromcounts,
    RENDER_COPY,
    FUSION_CTX,
  } = deps || {};

  const dateLabel = String(story?.meta?.date_local || "").replace(/-/g, ".");
  const moonSign = story?.public?.moon?.sign_ja || null;

  const skyTop = Array.isArray(story?.public?.sky_top) ? story.public.sky_top : [];
  const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];

  const distLines =
    typeof buildDistLinesFromcounts === "function" && typeof buildNowModernPlanetCounts === "function"
      ? buildDistLinesFromcounts(buildNowModernPlanetCounts(story), { forX: false })
      : "";

  function safeStr(v) {
    return v === null || v === undefined ? "" : String(v);
  }

  function toFusionItemFromPublicSky(s) {
    if (!s) return null;
    const aKey = s.a;
    const bKey = s.b;
    const aSignKey = typeof publicSignKey === "function" ? publicSignKey(story, aKey) : null;
    const bSignKey = typeof publicSignKey === "function" ? publicSignKey(story, bKey) : null;

    const aspTypeNorm = typeof normalizeAspectType === "function" ? normalizeAspectType(s.type) : String(s.type || "");
    const aspectLabelJa = typeof fmtAspectJa === "function" ? fmtAspectJa(aspTypeNorm) : "";

    return {
      natal: { body: aKey, sign: aSignKey },
      transit: { body: bKey, sign: bSignKey },
      aspect: { label_ja: aspectLabelJa, type: aspTypeNorm },
      orb: s.orb_deg,
    };
  }

  const BRAND_IG = RENDER_COPY?.BRAND_IG || "ソラのこえ。";
  const FOOTER_IG = RENDER_COPY?.FOOTER_IG || "星は語る。解釈はあなた。";

  const IG_FORMAT = RENDER_COPY?.IG_FORMAT || {
    SKY_LINE_NUM: (n, a, aSign, b, bSign) => `【${n}】${a}${aSign} × ${b}${bSign}`,
    SKY_LINE_ASPECT: (aspJa, orb) => `ー${aspJa}｜orb ${orb}°`,
    SECRET_HEAD: "【ひそかな配置】",
  };

  // skyが無いとき
  if (!skyTop.length && !skyAll.length) {
    const lines = [];
    lines.push(`🌌 ${BRAND_IG}`);
    lines.push(`[${dateLabel}｜今日のソラ]`);
    if (moonSign) lines.push(`月は ${moonSign} を通過中。`);

    if (distLines) {
      lines.push("");
      lines.push(distLines);
    }

    lines.push("");
    lines.push(typeof buildNoContactLine === "function" ? buildNoContactLine(story) : "今日は、接点がはっきり出ない配置として扱う。");
    lines.push("");
    lines.push(FOOTER_IG);
    return lines.join("\n");
  }

  const lines = [];
  lines.push(`🌌 ${BRAND_IG}`);
  lines.push(`[${dateLabel}｜今日のソラ]`);
  if (moonSign) lines.push(`月は ${moonSign} を通過中。`);

  if (distLines) {
    lines.push("");
    lines.push(distLines);
  }
  lines.push("");

  const list = skyTop.length ? skyTop.slice(0, 3) : [typeof pickCenterPublicContact === "function" ? pickCenterPublicContact(story, deps) : null].filter(Boolean);

  list.forEach((s, idx) => {
    const aKey = s.a;
    const bKey = s.b;

    const aLabel = typeof fmtBodyJa === "function" ? fmtBodyJa(aKey) : String(aKey || "");
    const bLabel = typeof fmtBodyJa === "function" ? fmtBodyJa(bKey) : String(bKey || "");

    const aSignJa = typeof publicSignJa === "function" ? publicSignJa(story, aKey) : "";
    const bSignJa = typeof publicSignJa === "function" ? publicSignJa(story, bKey) : "";

    const aSign = aSignJa ? `（${aSignJa}）` : "";
    const bSign = bSignJa ? `（${bSignJa}）` : "";

    const aspTypeNorm = typeof normalizeAspectType === "function" ? normalizeAspectType(s.type) : String(s.type || "");
    const aspectJa = typeof fmtAspectJa === "function" ? fmtAspectJa(aspTypeNorm) : "";
    const orb = typeof fmtDeg === "function" ? fmtDeg(s.orb_deg) : String(s.orb_deg ?? "");

    lines.push(IG_FORMAT.SKY_LINE_NUM(idx + 1, aLabel, aSign, bLabel, bSign));
    lines.push(IG_FORMAT.SKY_LINE_ASPECT(aspectJa, orb));

    const fusionItem = toFusionItemFromPublicSky(s);
    const fusionSentence =
      fusionItem && typeof buildFusionSentence === "function"
        ? buildFusionSentence(FUSION_CTX, fusionItem, { template: "sky" }) || ""
        : "";

    lines.push(safeStr(fusionSentence).trim() ? fusionSentence.trim() : "空気の接点が生まれやすい。");
    lines.push("");
  });

  const secret = typeof pickSecretPublicContact === "function" ? pickSecretPublicContact(story, deps) : null;
  if (secret) {
    const aKey = secret.a;
    const bKey = secret.b;

    const aLabel = typeof fmtBodyJa === "function" ? fmtBodyJa(aKey) : String(aKey || "");
    const bLabel = typeof fmtBodyJa === "function" ? fmtBodyJa(bKey) : String(bKey || "");

    const aSignJa = typeof publicSignJa === "function" ? publicSignJa(story, aKey) : "";
    const bSignJa = typeof publicSignJa === "function" ? publicSignJa(story, bKey) : "";

    const aSign = aSignJa ? `（${aSignJa}）` : "";
    const bSign = bSignJa ? `（${bSignJa}）` : "";

    const aspTypeNorm = typeof normalizeAspectType === "function" ? normalizeAspectType(secret.type) : String(secret.type || "");
    const aspectJa = typeof fmtAspectJa === "function" ? fmtAspectJa(aspTypeNorm) : "";
    const orb = typeof fmtDeg === "function" ? fmtDeg(secret.orb_deg) : String(secret.orb_deg ?? "");

    lines.push(IG_FORMAT.SECRET_HEAD);
    lines.push(`${aLabel}${aSign} × ${bLabel}${bSign}`);
    lines.push(IG_FORMAT.SKY_LINE_ASPECT(aspectJa, orb));
    lines.push("");

    const fusionItem = toFusionItemFromPublicSky(secret);
    const fusionSentence =
      fusionItem && typeof buildFusionSentence === "function"
        ? buildFusionSentence(FUSION_CTX, fusionItem, { template: "sky" }) || ""
        : "";

    lines.push(safeStr(fusionSentence).trim() ? fusionSentence.trim() : "空気の接点が生まれやすい。");
    lines.push("");
  }

  lines.push("");
  lines.push(FOOTER_IG);
  return lines.join("\n");
}

module.exports = { renderIG };
