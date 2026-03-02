"use strict";

function createSkyService({
  ASPECTS_ALL,
  PLANET_WEIGHT,
  signFromLon,
  getSignMetaByKey,
  absAngularDistance,
  toFixedPrecision,
}) {
  function attachSignsToSkyList(list, transitSigns) {
    const ts = transitSigns || {};
    const arr = Array.isArray(list) ? list : [];

    for (const r of arr) {
      const aHit = ts?.[r?.a];
      const bHit = ts?.[r?.b];

      if (aHit) {
        r.a_sign_key = String(aHit.sign_key || "").toLowerCase();
        r.a_sign_ja = aHit.sign_ja || null;
      }
      if (bHit) {
        r.b_sign_key = String(bHit.sign_key || "").toLowerCase();
        r.b_sign_ja = bHit.sign_ja || null;
      }
    }
  }

  function bestAspectForDistance(distDeg, aspectsList) {
    let best = null;
    const list = Array.isArray(aspectsList) ? aspectsList : [];
    for (const a of list) {
      const delta = Math.abs(distDeg - a.deg);
      if (!best || delta < best.delta) best = { type: a.type, aspect_deg: a.deg, delta };
    }
    return best;
  }

  function pickTopByOrb(items, n = 3) {
    return [...(items || [])]
      .sort((x, y) => (x?.orb_deg ?? 999) - (y?.orb_deg ?? 999))
      .slice(0, n);
  }

  function computeSkyStrataFromTransits(transitSigns) {
    const E = { fire: 0, earth: 0, air: 0, water: 0, unknown: 0 };
    const M = { cardinal: 0, fixed: 0, mutable: 0, unknown: 0 };

    const BODIES = new Set([
      "sun", "moon", "mercury", "venus", "mars",
      "jupiter", "saturn", "uranus", "neptune", "pluto",
    ]);

    for (const [body, info] of Object.entries(transitSigns || {})) {
      if (!BODIES.has(body)) continue;

      const signKey = String(info?.sign_key || "");
      if (!signKey) continue;

      const meta = getSignMetaByKey(signKey);
      const e = meta?.element || "unknown";
      const m = meta?.modality || "unknown";

      if (E[e] === undefined) E.unknown += 1;
      else E[e] += 1;

      if (M[m] === undefined) M.unknown += 1;
      else M[m] += 1;
    }

    const topKey = (obj) => {
      const entries = Object.entries(obj).filter(([k, v]) => k !== "unknown" && v > 0);
      if (!entries.length) return "mixed";
      entries.sort((a, b) => b[1] - a[1]);
      return entries[0][0];
    };

    return {
      method: "equal_count_modern",
      bodies_counted: 10,
      element_count: E,
      modality_count: M,
      top_element: topKey(E),
      top_modality: topKey(M),
    };
  }

  function buildSkyStrataFromContacts(contacts = []) {
    const E = { fire: 0, earth: 0, air: 0, water: 0 };
    const M = { cardinal: 0, fixed: 0, mutable: 0 };

    for (const c of contacts) {
      if (c?.element && E[c.element] !== undefined) {
        E[c.element]++;
      }
      if (c?.modality && M[c.modality] !== undefined) {
        M[c.modality]++;
      }
    }

    const topElement = Object.entries(E).sort((a, b) => b[1] - a[1])[0][0];
    const topModality = Object.entries(M).sort((a, b) => b[1] - a[1])[0][0];

    return {
      top_element: topElement,
      top_modality: topModality,
      source: "contacts",
    };
  }

  function buildPublicSkyList(transitBodies, aspectsList, { orbMaxDeg = 6, max = null } = {}) {
    const keys = Object.keys(transitBodies || {}).filter((k) => typeof transitBodies[k] === "number");
    if (keys.length < 2) return [];

    const out = [];
    const isChironLilith = (k) => {
      const s = String(k || "").toLowerCase();
      return s === "chiron" || s === "lilith";
    };

    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = keys[i];
        const b = keys[j];

        const dist = absAngularDistance(transitBodies[a], transitBodies[b]);
        const best = bestAspectForDistance(dist, aspectsList);
        if (!best) continue;

        const orb = (isChironLilith(a) || isChironLilith(b)) ? 8 : orbMaxDeg;
        if (best.delta <= orb) {
          out.push({
            a,
            b,
            type: best.type,
            aspect_deg: best.aspect_deg,
            orb_deg: Number(best.delta.toFixed(2)),
          });
        }
      }
    }

    out.sort((x, y) => (x.orb_deg - y.orb_deg) || (x.a + x.b).localeCompare(y.a + y.b));

    if (typeof max === "number") return out.slice(0, max);
    return out;
  }

  function buildPublicSkyAll(transitBodies, aspectsList, { orbMaxDeg = 6 } = {}) {
    return buildPublicSkyList(transitBodies, aspectsList, { orbMaxDeg });
  }

  function buildPublicSkyTopAll(transitBodies, aspectsList, { orbMaxDeg = 6, max = 3 } = {}) {
    return buildPublicSkyList(transitBodies, aspectsList, { orbMaxDeg, max });
  }

  function buildTouchPoints({ transitBodies, natalBodies, rules, withSigns = true }) {
    const results = [];
    const transitKeys = Object.keys(transitBodies || {});
    const natalKeys = Object.keys(natalBodies || {});
    const isChironLilith = (k) => {
      const s = String(k || "").toLowerCase();
      return s === "chiron" || s === "lilith";
    };
    const norm360 = (x) => ((Number(x) % 360) + 360) % 360;
    const signIndexFromLon = (lon) => Math.floor(norm360(lon) / 30);
    const ascLon = natalBodies?.asc;
    const ascIndex = Number.isFinite(Number(ascLon)) ? signIndexFromLon(ascLon) : null;
    const houseNumberForLon = (lon) => {
      if (ascIndex == null || !Number.isFinite(Number(lon))) return null;
      const signIndex = signIndexFromLon(lon);
      return ((signIndex - ascIndex + 12) % 12) + 1;
    };

    for (const t of transitKeys) {
      const tLon = transitBodies[t];
      if (typeof tLon !== "number") continue;

      for (const n of natalKeys) {
        const nLon = natalBodies[n];
        if (typeof nLon !== "number") continue;

        const dist = absAngularDistance(tLon, nLon);
        const best = bestAspectForDistance(dist, ASPECTS_ALL);

        if (!best) continue;

        const allow = rules?.aspects_used_all;
        if (Array.isArray(allow) && !allow.includes(best.type)) continue;
        const baseOrb = (rules?.orb_max_deg ?? 6);
        const orb = (isChironLilith(t) || isChironLilith(n)) ? 8 : baseOrb;
        if (best.delta > orb) continue;

        const base = {
          transit_body: t,
          natal_body_or_point: n,
          aspect: best.type,
          aspect_deg: best.aspect_deg,
          orb_deg: Number(best.delta.toFixed(2)),
          house_focus: houseNumberForLon(nLon),
          keywords: [],
        };

        if (withSigns) {
          const ts = signFromLon(tLon);
          const ns = signFromLon(nLon);
          base.transit_lon_deg = toFixedPrecision(tLon, 0.01);
          base.natal_lon_deg = toFixedPrecision(nLon, 0.01);
          base.transit_sign_key = ts.sign_key;
          base.transit_sign_ja = ts.sign_ja;
          base.natal_sign_key = ns.sign_key;
          base.natal_sign_ja = ns.sign_ja;
        }

        results.push(base);
      }
    }

    return results.sort((x, y) => x.orb_deg - y.orb_deg);
  }

  function buildSkyLayersFromTouchPoints(tps = []) {
    const sorted = [...tps].sort((a, b) => (a.orb_deg ?? 99) - (b.orb_deg ?? 99));

    const slow = new Set(["jupiter", "saturn", "uranus", "neptune", "pluto"]);

    // theme: slow bodies first, fallback to smallest orb
    const themeOne =
      sorted.find((x) => slow.has(x.transit_body) || slow.has(x.natal_body_or_point)) ??
      sorted[0] ??
      null;

    const importantNatal = new Set(["asc", "mc", "sun", "moon", "mercury", "venus", "mars"]);
    const touchPool = sorted
      .filter((x) => x !== themeOne)
      .sort((a, b) => {
        const ai = importantNatal.has(a.natal_body_or_point) ? -0.15 : 0;
        const bi = importantNatal.has(b.natal_body_or_point) ? -0.15 : 0;
        return (a.orb_deg ?? 99) + ai - ((b.orb_deg ?? 99) + bi);
      });

    const touch = touchPool.slice(0, 2);

    const hiddenOne =
      sorted.find((x) => x !== themeOne && (x.orb_deg ?? 99) <= 0.3) ??
      sorted.find((x) =>
        x !== themeOne &&
        (slow.has(x.transit_body) || slow.has(x.natal_body_or_point)) &&
        (x.orb_deg ?? 99) <= 1.2
      ) ??
      null;

    const hidden = hiddenOne ? [hiddenOne] : [];

    return { theme: themeOne ? [themeOne] : [], touch, hidden };
  }

  return {
    attachSignsToSkyList,
    computeSkyStrataFromTransits,
    buildSkyStrataFromContacts,
    buildPublicSkyAll,
    buildPublicSkyTopAll,
    buildTouchPoints,
    pickTopByOrb,
    buildSkyLayersFromTouchPoints,
  };
}

module.exports = { createSkyService };
