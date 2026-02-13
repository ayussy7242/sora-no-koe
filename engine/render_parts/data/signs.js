"use strict";

/**
 * signs.js — sign helpers (v3.3.3)
 * - SIGNS_V1.signs のキー揺れを吸収
 * - publicSignJa/publicSignKey は story 直書き or 経度から推定
 */

module.exports = function makeSignHelpers(SIGNS_V1) {
  function signMeta(signKey) {
    const raw = String(signKey || "");
    const lower = raw.toLowerCase();

    const byLower = SIGNS_V1?.signs?.[lower];
    if (byLower) return byLower;

    const byRaw = SIGNS_V1?.signs?.[raw];
    if (byRaw) return byRaw;

    const signs = SIGNS_V1?.signs;
    if (signs && typeof signs === "object") {
      const hitKey = Object.keys(signs).find((k) => String(k).toLowerCase() === lower);
      if (hitKey) return signs[hitKey];
    }
    return null;
  }

  function signJaFromIndex(signIndex) {
    const FALLBACK_SIGNS_JA = [
      "牡羊座","牡牛座","双子座","蟹座","獅子座","乙女座",
      "天秤座","蠍座","射手座","山羊座","水瓶座","魚座"
    ];
    if (!Number.isFinite(signIndex) || signIndex < 0 || signIndex > 11) return null;

    const orderKeys = [
      "aries","taurus","gemini","cancer","leo","virgo",
      "libra","scorpio","sagittarius","capricorn","aquarius","pisces"
    ];
    const key = orderKeys[signIndex];
    const s = signMeta(key);
    if (s?.label_ja) return s.label_ja;

    return FALLBACK_SIGNS_JA[signIndex];
  }

  function signKeyFromIndex(signIndex) {
    const orderKeys = [
      "aries","taurus","gemini","cancer","leo","virgo",
      "libra","scorpio","sagittarius","capricorn","aquarius","pisces"
    ];
    if (!Number.isFinite(signIndex) || signIndex < 0 || signIndex > 11) return null;
    return orderKeys[signIndex];
  }

  function mod360(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return null;
    return ((n % 360) + 360) % 360;
  }

  function getTransitLonFromStory(story, bodyKey) {
    return (
      story?.public?.transit?.bodies?.[bodyKey] ??
      story?.public?.transit?.bodies_deg?.[bodyKey] ??
      story?.public?.transit_longitudes?.[bodyKey] ??
      story?.public?.bodies?.[bodyKey] ??
      story?.public?.transit_bodies?.[bodyKey] ??
      null
    );
  }

  function publicSignJa(story, bodyKey) {
    const direct = story?.public?.transit_signs?.[bodyKey]?.sign_ja;
    if (direct) return direct;

    const lon = mod360(getTransitLonFromStory(story, bodyKey));
    if (!Number.isFinite(lon)) return null;

    const signIndex = Math.floor(lon / 30);
    return signJaFromIndex(signIndex);
  }

  function publicSignKey(story, bodyKey) {
    const direct =
      story?.public?.transit_signs?.[bodyKey]?.sign_key ||
      story?.public?.transit_signs?.[bodyKey]?.sign_en ||
      story?.public?.transit_signs?.[bodyKey]?.sign ||
      null;

    if (direct) return String(direct).toLowerCase();

    const lon = mod360(getTransitLonFromStory(story, bodyKey));
    if (!Number.isFinite(lon)) return null;

    const signIndex = Math.floor(lon / 30);
    return signKeyFromIndex(signIndex);
  }

  return {
    signMeta,
    signJaFromIndex,
    signKeyFromIndex,
    publicSignJa,
    publicSignKey,
  };
};
