"use strict";

function analyzeDistribution(counts) {
  const list = Array.isArray(counts) ? counts.slice() : [];
  const sorted = [...list].sort((a, b) => b - a);
  const max = sorted[0] ?? 0;
  const second = sorted[1] ?? 0;
  const min = sorted[sorted.length - 1] ?? 0;
  const spread = max - min;
  const zeros = list.filter((n) => n === 0).length;
  let type = "balanced";
  if (max >= 5 && min === 0) {
    type = "polarized";
  } else if (spread <= 1) {
    type = "balanced";
  } else if (min === 0) {
    type = "flat_missing";
  } else if (max - second >= 2) {
    type = "dominant";
  } else {
    type = "dominant";
  }
  return { max, min, spread, zeros, type };
}

function buildElementBecauseLine({ distribution }) {
  const type = distribution?.type || "dominant";
  if (type === "polarized") {
    return "偏りが極端なため、感触と言葉の順序が一方向に寄りやすい。";
  }
  if (type === "balanced") {
    return "偏りが少ないため、入り方は散りやすい。";
  }
  if (type === "flat_missing") {
    return "欠けがあるため、感触と言語化の順序がズレやすい。";
  }
  return "差がはっきりしているため、感触の入り方が偏りやすい。";
}

function buildModalityBecauseLine({ distribution }) {
  const type = distribution?.type || "dominant";
  if (type === "polarized") {
    return "偏りが極端なため、起動と維持の圧が同時に強くなる。";
  }
  if (type === "balanced") {
    return "偏りが少ないため、動きは循環しやすい。";
  }
  if (type === "flat_missing") {
    return "欠けがあるため、切り替えは後追いになりやすい。";
  }
  return "差がはっきりしているため、動き方に偏りが出やすい。";
}

function buildElementKernel(balance) {
  const elements = [
    { key: "火", count: balance?.fire ?? 0 },
    { key: "地", count: balance?.earth ?? 0 },
    { key: "風", count: balance?.air ?? 0 },
    { key: "水", count: balance?.water ?? 0 },
  ];
  const sorted = [...elements].sort((a, b) => b.count - a.count);
  const dominant = sorted.filter((e) => e.count > 0).slice(0, 2).map((e) => e.key);
  const missing = elements.filter((e) => e.count === 0).map((e) => e.key);
  const dominantKeys = dominant.join("");
  let orderHint = "感触が先に入る";
  if (dominantKeys.includes("火") || dominantKeys.includes("風")) {
    orderHint = "動きが先に立つ";
  }
  const residueHint = missing.length ? "空白が残る" : "重なりが残る";
  const countsLine = `🔥 火 ${balance?.fire ?? 0} / 🪨 地 ${balance?.earth ?? 0} / 💨 風 ${balance?.air ?? 0} / 💧 水 ${balance?.water ?? 0}`;

  const distribution = analyzeDistribution(elements.map((e) => e.count));
  const becauseLine = buildElementBecauseLine({ dominant, missing, distribution });

  return {
    dominant,
    missing,
    order_hint: orderHint,
    residue_hint: residueHint,
    counts_line: countsLine,
    because_line: becauseLine,
    distribution,
  };
}

function buildModalityKernel(balance) {
  const modalities = [
    { key: "活動", count: balance?.cardinal ?? 0 },
    { key: "不動", count: balance?.fixed ?? 0 },
    { key: "柔軟", count: balance?.mutable ?? 0 },
  ];
  const sorted = [...modalities].sort((a, b) => b.count - a.count);
  const dominant = sorted.filter((m) => m.count > 0).slice(0, 2).map((m) => m.key);
  const missing = modalities.filter((m) => m.count === 0).map((m) => m.key);
  const top = sorted[0]?.key || "";
  let orderHint = "動きの順序が交差する";
  if (top === "活動") orderHint = "動き出しが先に立つ";
  if (top === "不動") orderHint = "留まりが先に立つ";
  if (top === "柔軟") orderHint = "揺らぎが先に立つ";
  const residueHint = missing.length ? "切り替えが遅れる" : "留まりが残る";
  const countsLine = `🏃 活動 ${balance?.cardinal ?? 0} / 🧱 不動 ${balance?.fixed ?? 0} / 🌿 柔軟 ${balance?.mutable ?? 0}`;

  const distribution = analyzeDistribution(modalities.map((m) => m.count));
  const becauseLine = buildModalityBecauseLine({ dominant, missing, distribution });

  return {
    dominant,
    missing,
    order_hint: orderHint,
    residue_hint: residueHint,
    counts_line: countsLine,
    because_line: becauseLine,
    distribution,
  };
}

function buildElementBiasTerms(balance) {
  const fire = balance?.fire ?? 0;
  const earth = balance?.earth ?? 0;
  const air = balance?.air ?? 0;
  const water = balance?.water ?? 0;
  const hot = fire + air;
  const cool = earth + water;
  const terms = [];

  if (hot >= cool) {
    terms.push("動き", "外へ");
  } else {
    terms.push("感触", "重さ");
  }
  if (air === 0) terms.push("言葉は後");
  if (water === 0) terms.push("感触は遅い");
  if (earth === 0) terms.push("支えは後");
  if (fire === 0) terms.push("動きは遅い");

  return Array.from(new Set(terms.filter(Boolean)));
}

function buildModalityBiasTerms(balance) {
  const cardinal = balance?.cardinal ?? 0;
  const fixed = balance?.fixed ?? 0;
  const mutable = balance?.mutable ?? 0;
  const terms = [];
  if (cardinal >= fixed && cardinal >= mutable) terms.push("起動");
  if (fixed >= cardinal && fixed >= mutable) terms.push("留まり");
  if (mutable >= cardinal && mutable >= fixed) terms.push("揺らぎ");

  if (mutable === 0) terms.push("切替", "位相");
  if (fixed === 0) terms.push("留まりが薄い");
  if (cardinal === 0) terms.push("起動が遅い");

  return Array.from(new Set(terms.filter(Boolean)));
}

module.exports = {
  analyzeDistribution,
  buildElementBecauseLine,
  buildModalityBecauseLine,
  buildElementKernel,
  buildModalityKernel,
  buildElementBiasTerms,
  buildModalityBiasTerms,
};
