"use strict";

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

function waNameFromMoonAge(moonAge) {
  if (!Number.isFinite(Number(moonAge))) return "";
  const ageRaw = Number(moonAge);
  const age = Math.max(0, Math.min(29, Math.floor(ageRaw + 1e-6)));
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

function formatMoonPhaseLabel({ phaseName, waName }) {
  const core = String(phaseName || "").trim() || "—";
  const wa = String(waName || "").trim();
  if (wa && wa !== core) return `${core}（${wa}）`;
  return core;
}

module.exports = {
  moonPhaseSymbolFromDeg,
  astroPhaseFromDeg,
  moonPhaseInfo,
  waNameFromMoonAge,
  formatMoonPhaseLabel,
};
