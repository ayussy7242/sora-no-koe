"use strict";

const { emojiForBody, aspectDegFromMeta } = require("./format_shared");

// --------------------
// Personal TP helpers
// --------------------
function formatPersonalTPLine(storyOrTp, tpOrPrefix, prefixOrDeps, maybeDeps) {
  // ✅ 互換：旧）(tp, deps) / 新）(story, tp, prefix, deps)
  let tp = null;
  let prefix = "";
  let deps = {};

  // 呼び出しパターン判定
  if (tpOrPrefix && typeof tpOrPrefix === "object") {
    // (story, tp, prefix, deps)
    tp = tpOrPrefix;
    prefix = typeof prefixOrDeps === "string" ? prefixOrDeps : "";
    deps = maybeDeps || (typeof prefixOrDeps === "object" ? prefixOrDeps : {});
  } else {
    // (tp, deps) 形式で来た
    tp = storyOrTp;
    prefix = "";
    deps = (typeof tpOrPrefix === "object" && tpOrPrefix) ? tpOrPrefix : {};
  }

  if (!tp) return "";

  const { fmtAnyJa, fmtAspectJa, fmtDeg } = deps || {};

  if (typeof fmtAnyJa !== "function") throw new Error("format.formatPersonalTPLine: fmtAnyJa is required");
  if (typeof fmtAspectJa !== "function") throw new Error("format.formatPersonalTPLine: fmtAspectJa is required");
  if (typeof fmtDeg !== "function") throw new Error("format.formatPersonalTPLine: fmtDeg is required");

  const aKey = tp.natal_body_or_point;
  const bKey = tp.transit_body;
  const type = tp.aspect || tp.type;

  const aLabel = fmtAnyJa(aKey);
  const bLabel = fmtAnyJa(bKey);
  const aEmoji = emojiForBody(aKey);
  const bEmoji = emojiForBody(bKey);

  const aSignJa = tp.natal_sign_ja || tp.natal_sign_label_ja || tp.natal_sign || tp.natal_sign_en || "";
  const bSignJa = tp.transit_sign_ja || tp.transit_sign_label_ja || tp.transit_sign || tp.transit_sign_en || "";

  const aspectJa = fmtAspectJa(type);
  const orb = fmtDeg(tp.orb_deg);
  const deg = aspectDegFromMeta(type, deps);
  const degStr = Number.isFinite(deg) ? `${fmtDeg(deg, 0)}°` : "";

  const head = `${prefix}${aEmoji ? `${aEmoji} ` : ""}${aLabel}${aSignJa ? `（${aSignJa}）` : ""} × ${bEmoji ? `${bEmoji} ` : ""}${bLabel}${bSignJa ? `（${bSignJa}）` : ""}`;
  const tail = degStr ? `｜${aspectJa} ${degStr}（orb ${orb}°）` : `｜${aspectJa}（orb ${orb}°）`;
  return `${head}\n${tail}`;
}

module.exports = { formatPersonalTPLine };
