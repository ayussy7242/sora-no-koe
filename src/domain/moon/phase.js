"use strict";

const { SYNODIC_MONTH_DAYS } = require("./constants");

const NEW_MOON_MOMENT_AGE_DAYS = 0.5;
const FULL_MOON_MOMENT_AGE_DAYS = 14.9;
const FULL_MOON_LABEL_WINDOW_DAYS = 0.5;
const THIN_CRESCENT_MAX_AGE_DAYS = 2.4;
const THIN_CRESCENT_MAX_ILLUMINATION = 0.08;

function moonPhaseSymbolFromDeg(phaseDeg) {
  return astroPhaseFromDeg(phaseDeg).symbol;
}

function astroPhaseFromDeg(phaseDeg) {
  const v = Number(phaseDeg);
  if (!Number.isFinite(v)) return { key: "", name: "", symbol: "🌙" };
  const d = ((v % 360) + 360) % 360;
  if (d < 22.5 || d >= 337.5) return { key: "new", name: "新月", symbol: "🌑" };
  if (d < 67.5) return { key: "waxing_crescent", name: "三日月", symbol: "🌒" };
  if (d < 112.5) return { key: "first_quarter", name: "上弦", symbol: "🌓" };
  if (d < 157.5) return { key: "waxing_gibbous", name: "満ちゆく月", symbol: "🌔" };
  if (d < 202.5) return { key: "full", name: "満月", symbol: "🌕" };
  if (d < 247.5) return { key: "waning_gibbous", name: "欠けゆく月", symbol: "🌖" };
  if (d < 292.5) return { key: "last_quarter", name: "下弦", symbol: "🌗" };
  return { key: "waning_crescent", name: "残月", symbol: "🌘" };
}

function moonPhaseInfo(phaseDeg) {
  return astroPhaseFromDeg(phaseDeg);
}

function normalizeMoonPhaseByIllumination(phase, illumination, { fullThreshold = 0.98, newThreshold = 0.02 } = {}) {
  if (!phase) return phase;
  const illum = Number(illumination);
  const isFullNow = Number.isFinite(illum) && illum >= Number(fullThreshold);
  const isNewNow = Number.isFinite(illum) && illum <= Number(newThreshold);
  if (phase.name === "満月" && !isFullNow) {
    return { key: "waning_gibbous", name: "欠けゆく月", symbol: "🌖" };
  }
  if (phase.name === "新月" && !isNewNow) {
    return { key: "waxing_crescent", name: "三日月", symbol: "🌒" };
  }
  return phase;
}

function waNameFromMoonAge(moonAge) {
  if (!Number.isFinite(Number(moonAge))) return "";
  const ageRaw = Number(moonAge);
  const age = Math.max(0, Math.min(29, Math.floor(ageRaw + 0.5)));
  const map = {
    0: "新月",
    1: "二日月",
    2: "三日月",
    3: "三日月",
    4: "四日月",
    5: "五日月",
    6: "六日月",
    7: "上弦",
    8: "九夜月",
    9: "十日夜",
    10: "十日余月",
    11: "宵月",
    12: "十三夜",
    13: "小望月",
    14: "満月",
    15: "十六夜",
    16: "立待月",
    17: "居待月",
    18: "寝待月",
    19: "更待月",
    20: "二十日余月",
    21: "有明月",
    22: "有明月",
    23: "有明月",
    24: "有明月",
    25: "有明月",
    26: "有明月",
    27: "残月",
    28: "残月",
    29: "晦",
  };
  return map[age] || "";
}

function moonPhaseLabelFromKey(phaseKey, { withMoon = false } = {}) {
  const key = String(phaseKey || "").toLowerCase();
  if (key === "new") return "新月";
  if (key === "full") return "満月";
  if (key === "first_quarter" || key === "first-quarter") return withMoon ? "上弦の月" : "上弦";
  if (key === "last_quarter" || key === "last-quarter") return withMoon ? "下弦の月" : "下弦";
  return "";
}

function isMoonCyclePhaseName(phaseName) {
  const name = String(phaseName || "").trim();
  return name === "満ちゆく月" || name === "欠けゆく月";
}

function resolveMoonCycleLabel({ phaseName, moonAge, illumination } = {}) {
  const name = String(phaseName || "").trim();
  const age = Number.isFinite(Number(moonAge)) ? Number(moonAge) : null;
  const illum = Number.isFinite(Number(illumination)) ? Number(illumination) : null;
  if (!name) return "";
  if (name === "新月") {
    if (age != null) {
      if (age >= SYNODIC_MONTH_DAYS - 2) return "欠けゆく月";
      if (age >= NEW_MOON_MOMENT_AGE_DAYS) return "満ちゆく月";
      return "新月";
    }
    if (illum != null && illum > 0.01) return "満ちゆく月";
    return "新月";
  }
  if (name === "満月") {
    if (age != null) {
      if (Math.abs(age - FULL_MOON_MOMENT_AGE_DAYS) <= FULL_MOON_LABEL_WINDOW_DAYS) return "満月";
      if (age < FULL_MOON_MOMENT_AGE_DAYS) return "満ちゆく月";
      return "欠けゆく月";
    }
    if (illum != null && illum < 0.99) return "欠けゆく月";
    return "満月";
  }
  if (name === "上弦" || name === "上弦の月") return "上弦の月";
  if (name === "下弦" || name === "下弦の月") return "下弦の月";
  if (name === "満ちゆく月" || name === "三日月") return "満ちゆく月";
  if (name === "欠けゆく月" || name === "残月") return "欠けゆく月";
  return "";
}

function resolveMoonDisplayName({ phaseName, waName, moonAge, illumination, allowCycleName = true } = {}) {
  const phase = String(phaseName || "").trim();
  const wa = String(waName || "").trim();
  const age = Number.isFinite(Number(moonAge)) ? Number(moonAge) : null;
  const illum = Number.isFinite(Number(illumination)) ? Number(illumination) : null;

  if (phase === "新月") {
    if ((age != null && age < NEW_MOON_MOMENT_AGE_DAYS) || (illum != null && illum <= 0.01 && (age == null || age < NEW_MOON_MOMENT_AGE_DAYS))) return "新月";
    if (wa) return wa;
    return allowCycleName ? "満ちゆく月" : "新月直後";
  }
  if (phase === "満月") {
    if ((age != null && age < FULL_MOON_MOMENT_AGE_DAYS) || (illum != null && illum >= 0.99 && (age == null || age < FULL_MOON_MOMENT_AGE_DAYS))) return "満月";
    if (wa) return wa;
    return allowCycleName ? "欠けゆく月" : "満月直後";
  }
  if (phase === "三日月") {
    const stillThinCrescent =
      (age != null && age <= THIN_CRESCENT_MAX_AGE_DAYS)
      || (illum != null && illum <= THIN_CRESCENT_MAX_ILLUMINATION);
    if (!stillThinCrescent) return allowCycleName ? "満ちゆく月" : "満ちゆく月";
    if (wa) return wa;
    return "三日月";
  }
  if (wa) return wa;
  if (phase === "上弦" || phase === "上弦の月") return "上弦の月";
  if (phase === "下弦" || phase === "下弦の月") return "下弦の月";
  if (!allowCycleName) {
    if (phase === "満ちゆく月" && age != null && age < 1.5) return "新月直後";
    if (phase === "欠けゆく月" && illum != null && illum < 0.05) return "満月直後";
  }
  return phase;
}

function resolveMoonPhaseDisplayName({ phaseName, waName, allowCycleName = true } = {}) {
  return resolveMoonDisplayName({ phaseName, waName, allowCycleName });
}

function formatMoonPhaseLabel({ phaseName, waName }) {
  const core = String(phaseName || "").trim() || "—";
  const wa = String(waName || "").trim();
  if (wa && wa !== core) return `${core} (${wa})`;
  return core;
}

module.exports = {
  NEW_MOON_MOMENT_AGE_DAYS,
  FULL_MOON_MOMENT_AGE_DAYS,
  moonPhaseSymbolFromDeg,
  astroPhaseFromDeg,
  moonPhaseInfo,
  normalizeMoonPhaseByIllumination,
  waNameFromMoonAge,
  moonPhaseLabelFromKey,
  isMoonCyclePhaseName,
  resolveMoonCycleLabel,
  resolveMoonDisplayName,
  resolveMoonPhaseDisplayName,
  formatMoonPhaseLabel,
};
