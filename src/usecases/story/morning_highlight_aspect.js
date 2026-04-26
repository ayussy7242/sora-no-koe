"use strict";

const { listImportantResonances } = require("../../domain/resonance");
const { normalizeBodyKey } = require("../../domain/canonical");
const { aspectInfo, signJa } = require("../../presenters/format/format/common");
const { bodyLabelJa } = require("../../presenters/shared/text/tokens");

function isMorningHighlightCandidate(item) {
  const candidate = item?.candidate || {};
  const aspectDeg = Math.round(Number(candidate?.aspect_deg));
  const orb = Number(candidate?.orb_deg);
  const reasons = Array.isArray(item?.reasons) ? item.reasons : [];
  const types = new Set(Array.isArray(item?.types) ? item.types : []);

  const isConjunction = aspectDeg === 0;
  const isMajor = [0, 60, 90, 120, 180].includes(aspectDeg);
  const isTightMajor = isMajor && Number.isFinite(orb) && orb <= 0.2;
  const isHighRank = types.has("critical") || reasons.includes("near_peak");
  const isRepresentative = reasons.includes("in_sky_top") || (Number(item?.score) >= 13);

  return isRepresentative && (isConjunction || isTightMajor || isHighRank);
}

function formatMorningHighlightAspect({ item, dict }) {
  const candidate = item?.candidate || {};
  const aKey = normalizeBodyKey(candidate?.a || "");
  const bKey = normalizeBodyKey(candidate?.b || "");
  const aLabel = bodyLabelJa(dict, aKey) || aKey;
  const bLabel = bodyLabelJa(dict, bKey) || bKey;
  const aSign = candidate?.a_sign_ja || signJa(dict, candidate?.a_sign_key || "") || "";
  const bSign = candidate?.b_sign_ja || signJa(dict, candidate?.b_sign_key || "") || "";
  const aspect = aspectInfo(dict, candidate?.type || candidate?.aspect, candidate?.aspect_deg);
  const label = aspect?.label_ja || "";
  const deg = Number.isFinite(Number(candidate?.aspect_deg)) ? `${Math.round(Number(candidate.aspect_deg))}°` : "";
  const aspectLabel = [label, deg].filter(Boolean).join(" ").trim();
  if (!aLabel || !bLabel || !aspectLabel) return "";
  return [
    `${aLabel}${aSign ? `（${aSign}）` : ""}`,
    "×",
    `${bLabel}${bSign ? `（${bSign}）` : ""}`,
    aspectLabel,
  ].join(" ").trim();
}

function buildMorningHighlightAspect({ story, dict } = {}) {
  const important = listImportantResonances({ story, skyTop: story?.public?.sky_top });
  const picked = important.find(isMorningHighlightCandidate);
  if (!picked) return null;
  const text = formatMorningHighlightAspect({ item: picked, dict });
  if (!text) return null;
  return {
    key: picked.key || "",
    score: Number.isFinite(Number(picked.score)) ? Number(picked.score) : null,
    reasons: picked.reasons || [],
    types: picked.types || [],
    text,
    candidate: picked.candidate || null,
  };
}

module.exports = {
  buildMorningHighlightAspect,
};
