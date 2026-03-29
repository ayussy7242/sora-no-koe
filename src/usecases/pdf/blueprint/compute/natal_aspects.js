"use strict";

const { BODY_ORDER_MAIN } = require("../../../../engine/pdf/blueprint_light/shared");
const { absAngularDistance } = require("./calc");

function buildMajorAspectDefs(dict) {
  const major = dict?.ASPECTS?.major || {};
  const orbRules = dict?.ORB_RULES_V1?.aspect_by_type || {};
  const defaults = {
    conjunction: { deg: 0, orb: 6.0 },
    opposition: { deg: 180, orb: 6.0 },
    square: { deg: 90, orb: 5.0 },
    trine: { deg: 120, orb: 5.0 },
    sextile: { deg: 60, orb: 4.5 },
  };
  const order = ["conjunction", "opposition", "square", "trine", "sextile"];
  return order
    .map((key) => {
      const base = defaults[key] || {};
      const aspect = major[key] || {};
      const deg = Number.isFinite(Number(aspect.deg)) ? Number(aspect.deg) : base.deg;
      const orb = Number.isFinite(Number(orbRules?.[key]?.orb_deg)) ? Number(orbRules[key].orb_deg) : base.orb;
      if (!Number.isFinite(deg)) return null;
      return { key, deg, orb, label_ja: aspect.label_ja || "" };
    })
    .filter(Boolean);
}

function buildNatalAspects({ longitudes, rowsMain, dict, max = 5 } = {}) {
  if (!longitudes) return [];
  const aspectDefs = buildMajorAspectDefs(dict);
  if (!aspectDefs.length) return [];
  const order = aspectDefs.map((d) => d.key);
  const priority = new Map(order.map((key, idx) => [key, idx]));
  const bodies = BODY_ORDER_MAIN.filter((k) => Number.isFinite(Number(longitudes[k])));
  const signByKey = new Map((rowsMain || []).map((row) => [row.key, row.meta?.sign_ja || ""]));
  const signKeyByKey = new Map((rowsMain || []).map((row) => [row.key, row.meta?.sign_key || ""]));
  const labelByKey = new Map((rowsMain || []).map((row) => [row.key, row.label || ""]));
  const out = [];

  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const aKey = bodies[i];
      const bKey = bodies[j];
      const lonA = Number(longitudes[aKey]);
      const lonB = Number(longitudes[bKey]);
      if (!Number.isFinite(lonA) || !Number.isFinite(lonB)) continue;
      const dist = absAngularDistance(lonA, lonB);
      let best = null;
      for (const aspect of aspectDefs) {
        const orb = Math.abs(dist - aspect.deg);
        if (orb > aspect.orb) continue;
        if (!best || orb < best.orb) {
          best = {
            a: aKey,
            b: bKey,
            type: aspect.key,
            aspect_deg: aspect.deg,
            orb_deg: Number(orb.toFixed(2)),
          };
        }
      }
      if (best) {
        out.push({
          ...best,
          a_label: labelByKey.get(aKey) || aKey,
          b_label: labelByKey.get(bKey) || bKey,
          a_sign_ja: signByKey.get(aKey) || "",
          b_sign_ja: signByKey.get(bKey) || "",
          a_sign_key: signKeyByKey.get(aKey) || "",
          b_sign_key: signKeyByKey.get(bKey) || "",
        });
      }
    }
  }

  out.sort((a, b) => {
    if (a.orb_deg !== b.orb_deg) return a.orb_deg - b.orb_deg;
    const pa = priority.get(a.type) ?? 99;
    const pb = priority.get(b.type) ?? 99;
    return pa - pb;
  });

  return out.slice(0, max);
}

module.exports = {
  buildMajorAspectDefs,
  buildNatalAspects,
};
