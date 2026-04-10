"use strict";

const { listImportantResonances } = require("./importance");
const { isApplying } = require("../aspect/proximity");

function pickFromImportantList(list = [], preferTypes = []) {
  if (!Array.isArray(list) || !list.length) return null;
  const prefer = Array.isArray(preferTypes) ? preferTypes : [];
  for (const type of prefer) {
    const hit = list.find((item) => Array.isArray(item?.types) && item.types.includes(type));
    if (hit) return hit;
  }
  return list[0] || null;
}

function resolveCandidateBodies(item) {
  const candidate = item?.candidate || {};
  const a = String(candidate?.a || "").toLowerCase();
  const b = String(candidate?.b || "").toLowerCase();
  return { a, b };
}

function applyLineBias(list = []) {
  if (!Array.isArray(list) || !list.length) return list;
  return list.map((item) => {
    if (!item) return item;
    const { a, b } = resolveCandidateBodies(item);
    const flags = item?.flags || {};
    const hasSun = typeof flags.hasSun === "boolean" ? flags.hasSun : (a === "sun" || b === "sun");
    const hasMoon = typeof flags.hasMoon === "boolean" ? flags.hasMoon : (a === "moon" || b === "moon");
    const isSunMoonPair = typeof flags.isSunMoonPair === "boolean"
      ? flags.isSunMoonPair
      : ((a === "sun" && b === "moon") || (a === "moon" && b === "sun"));

    let bonus = 0;
    const reasons = [];
    if (isSunMoonPair) {
      const orb = Number(flags.orb);
      const pairBonus = Number.isFinite(orb) && orb > 2 ? 1 : 2;
      bonus += pairBonus;
      reasons.push(pairBonus === 2 ? "line_bias_luminary_pair" : "line_bias_luminary_pair_far");
    } else if (hasSun || hasMoon) {
      bonus += 1;
      reasons.push("line_bias_luminary");
    }

    if (!bonus) return item;
    return {
      ...item,
      score: (Number(item.score) || 0) + bonus,
      channel_bias: {
        ...(item.channel_bias || {}),
        line: { bonus, reasons },
      },
    };
  });
}

function applyInstagramBias(list = []) {
  if (!Array.isArray(list) || !list.length) return list;
  return list.map((item) => {
    if (!item) return item;
    const flags = item?.flags || {};
    const inSkyTop = !!flags.inSkyTop;
    if (!inSkyTop) return item;
    const bonus = 1;
    return {
      ...item,
      score: (Number(item.score) || 0) + bonus,
      channel_bias: {
        ...(item.channel_bias || {}),
        instagram: { bonus, reasons: ["ig_bias_sky_top"] },
      },
    };
  });
}

function applyXBias(list = [], opts = {}) {
  if (!Array.isArray(list) || !list.length) return list;
  const asOfISO = String(opts?.asOfISO || opts?.as_of || opts?.asOf || opts?.story?.meta?.as_of || "").trim();
  return list.map((item) => {
    if (!item) return item;
    const reasons = [];
    let bonus = 0;

    if (Array.isArray(item?.types) && item.types.includes("instant")) {
      bonus += 1;
      reasons.push("x_bias_instant");
    }

    if (asOfISO) {
      const candidate = item?.candidate || {};
      const applying = isApplying({
        kind: "transit-transit",
        aKey: candidate?.a,
        bKey: candidate?.b,
        aspectDeg: candidate?.aspect_deg,
        asOfISO,
        nowOrb: candidate?.orb_deg,
      });
      if (applying === true) {
        bonus += 1;
        reasons.push("x_bias_applying");
      }
    }

    if (!bonus) return item;
    return {
      ...item,
      score: (Number(item.score) || 0) + bonus,
      channel_bias: {
        ...(item.channel_bias || {}),
        x: { bonus, reasons },
      },
    };
  });
}

function pickResonanceForX(opts = {}) {
  const list = applyXBias(listImportantResonances(opts), { asOfISO: opts?.asOfISO || opts?.as_of, story: opts?.story });
  const item = pickFromImportantList(list, ["critical", "important", "instant", "representative"]);
  return { item, list };
}

function pickResonanceForInstagram(opts = {}) {
  const list = applyInstagramBias(listImportantResonances(opts));
  const item = pickFromImportantList(list, ["representative", "important", "critical", "instant"]);
  return { item, list };
}

function pickResonanceForLine(opts = {}) {
  const list = applyLineBias(listImportantResonances(opts));
  const item = pickFromImportantList(list, ["critical", "important", "representative", "instant"]);
  return { item, list };
}

module.exports = {
  pickFromImportantList,
  applyLineBias,
  applyInstagramBias,
  applyXBias,
  pickResonanceForX,
  pickResonanceForInstagram,
  pickResonanceForLine,
};
