"use strict";

function createSignHelpers({ SIGNS_V1, norm360 }) {
  function signKeyFromLon(lonDeg) {
    const idx = Math.floor(norm360(lonDeg) / 30);

    const fallbackOrder = [
      "aries", "taurus", "gemini", "cancer", "leo", "virgo",
      "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces",
    ];

    return SIGNS_V1?.order?.[idx] ?? fallbackOrder[idx] ?? null;
  }

  function signJaFromKey(signKeyRaw) {
    const key = String(signKeyRaw || "");
    if (!key) return null;

    // exact
    if (SIGNS_V1?.signs?.[key]?.label_ja) return SIGNS_V1.signs[key].label_ja;

    // lowercase
    const low = key.toLowerCase();
    if (SIGNS_V1?.signs?.[low]?.label_ja) return SIGNS_V1.signs[low].label_ja;

    // case-insensitive fallback
    const signs = SIGNS_V1?.signs || {};
    const hit = Object.keys(signs).find((k) => k.toLowerCase() === low);
    return hit ? (signs[hit]?.label_ja ?? null) : null;
  }

  function signFromLon(lonDeg) {
    const raw = signKeyFromLon(lonDeg);
    const sign_key = String(raw || "").toLowerCase();
    return { sign_key, sign_ja: signJaFromKey(sign_key) };
  }

  function getSignMetaByKey(signKeyRaw) {
    const key = String(signKeyRaw || "");
    if (!key) return null;

    // 1) exact
    if (SIGNS_V1?.signs?.[key]) return SIGNS_V1.signs[key];

    // 2) lowercase hit
    const low = key.toLowerCase();
    if (SIGNS_V1?.signs?.[low]) return SIGNS_V1.signs[low];

    // 3) case-insensitive search (safe)
    const signs = SIGNS_V1?.signs || {};
    const hit = Object.keys(signs).find((k) => k.toLowerCase() === low);
    return hit ? signs[hit] : null;
  }

  return { signKeyFromLon, signJaFromKey, signFromLon, getSignMetaByKey };
}

module.exports = { createSignHelpers };
