"use strict";

const { calcTransitLon } = require("../astro_compute");
const { signKeyFromLon, signLabelJa, degInSignFromLon } = require("./labels");

function moonSignAtIso({ dict, iso }) {
  const lon = calcTransitLon("moon", iso);
  const key = signKeyFromLon(dict, lon);
  const label = key ? (signLabelJa(dict, key) || "") : "";
  const degInSign = degInSignFromLon(lon);
  return { key, label, lon, degInSign };
}

function refineSignChangeTime({ dict, fromIso, toIso, targetKey, maxIterations = 20 }) {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  if (!targetKey) return null;
  let lo = from.getTime();
  let hi = to.getTime();
  if (lo >= hi) return null;

  for (let i = 0; i < maxIterations; i += 1) {
    if (hi - lo <= 60000) break;
    const mid = Math.floor((lo + hi) / 2);
    const sign = moonSignAtIso({ dict, iso: new Date(mid).toISOString() });
    if (sign?.key === targetKey) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return new Date(hi);
}

function findPrevMoonSignChangeDetailed({ dict, asOfISO, maxHours = 72, stepMinutes = 60 }) {
  const base = new Date(asOfISO || Date.now());
  if (Number.isNaN(base.getTime())) return null;
  const current = moonSignAtIso({ dict, iso: base.toISOString() });
  if (!current?.key) return null;

  const maxSteps = Math.ceil((maxHours * 60) / stepMinutes);
  let lastSameTime = base;
  for (let i = 1; i <= maxSteps; i += 1) {
    const t = new Date(base.getTime() - i * stepMinutes * 60000);
    const sign = moonSignAtIso({ dict, iso: t.toISOString() });
    if (sign?.key && sign.key !== current.key) {
      const changeTime = refineSignChangeTime({
        dict,
        fromIso: t.toISOString(),
        toIso: lastSameTime.toISOString(),
        targetKey: current.key,
      }) || lastSameTime;
      const hoursAgo = (base.getTime() - changeTime.getTime()) / 3600000;
      return { from: sign, to: current, date: changeTime, hoursAgo };
    }
    lastSameTime = t;
  }
  return null;
}

function findNextMoonSignChangeDetailed({ dict, asOfISO, maxHours = 72, stepMinutes = 60 }) {
  const base = new Date(asOfISO || Date.now());
  if (Number.isNaN(base.getTime())) return null;
  const current = moonSignAtIso({ dict, iso: base.toISOString() });
  if (!current?.key) return null;

  const maxSteps = Math.ceil((maxHours * 60) / stepMinutes);
  let prev = current;
  let prevTime = base;
  for (let i = 1; i <= maxSteps; i += 1) {
    const t = new Date(base.getTime() + i * stepMinutes * 60000);
    const next = moonSignAtIso({ dict, iso: t.toISOString() });
    if (next?.key && next.key !== prev.key) {
      const changeTime = refineSignChangeTime({
        dict,
        fromIso: prevTime.toISOString(),
        toIso: t.toISOString(),
        targetKey: next.key,
      }) || t;
      const hoursAhead = (changeTime.getTime() - base.getTime()) / 3600000;
      return { from: current, to: next, date: changeTime, hoursAhead };
    }
    prev = next;
    prevTime = t;
  }
  return null;
}

function buildMoonSignChangeState({
  asOfISO,
  dict,
  justIngressDeg = 1.0,
  imminentHours = 3,
  maxHours = 72,
  stepMinutes = 60,
} = {}) {
  const base = new Date(asOfISO || Date.now());
  if (Number.isNaN(base.getTime())) return null;
  const current = moonSignAtIso({ dict, iso: base.toISOString() });
  if (!current?.key) return null;

  const prev = findPrevMoonSignChangeDetailed({ dict, asOfISO: base.toISOString(), maxHours, stepMinutes });
  const next = findNextMoonSignChangeDetailed({ dict, asOfISO: base.toISOString(), maxHours, stepMinutes });
  const degInSign = current.degInSign;
  let phase = "";
  if (Number.isFinite(Number(degInSign))) {
    if (degInSign < 10) phase = "initial";
    else if (degInSign < 20) phase = "mid";
    else phase = "late";
  }
  const remainingDeg = Number.isFinite(Number(degInSign)) ? Math.max(0, 30 - Number(degInSign)) : null;
  const remainingHours = Number.isFinite(Number(next?.hoursAhead)) ? Number(next.hoursAhead) : null;
  const isJustIngressed = Number.isFinite(Number(degInSign)) ? Number(degInSign) <= Number(justIngressDeg) : false;
  const isImminentChange = Number.isFinite(Number(next?.hoursAhead))
    ? Number(next.hoursAhead) <= Number(imminentHours)
    : false;

  let changeType = "none";
  if (isJustIngressed) changeType = "just_ingressed";
  else if (isImminentChange) changeType = "imminent";

  return {
    asOfISO: base.toISOString(),
    sign: { key: current.key, label: current.label },
    lon: current.lon,
    degInSign,
    phase,
    remainingDeg,
    remainingHours,
    isJustIngressed,
    isImminentChange,
    changeType,
    prev,
    next,
  };
}

module.exports = {
  moonSignAtIso,
  refineSignChangeTime,
  findPrevMoonSignChangeDetailed,
  findNextMoonSignChangeDetailed,
  buildMoonSignChangeState,
};
