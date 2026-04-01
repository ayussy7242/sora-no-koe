"use strict";

const dict = require("../../../content/dict");
const { normalizeBodyKey } = require("../../../domain/canonical");
const { BLOG_TITLE_EXCLUDE_BODIES, BLOG_TITLE_BODY_RANK } = require("./blog_daily_constants");

function isResonanceBodyExcluded(row) {
  const aKey = normalizeBodyKey(row?.a || "");
  const bKey = normalizeBodyKey(row?.b || "");
  return BLOG_TITLE_EXCLUDE_BODIES.has(aKey) || BLOG_TITLE_EXCLUDE_BODIES.has(bKey);
}

function bodyTitleRank(key) {
  return BLOG_TITLE_BODY_RANK[normalizeBodyKey(key || "")] ?? 99;
}

function compareResonanceItems(a, b) {
  const orbA = Number.isFinite(Number(a?.orb_deg)) ? Number(a.orb_deg) : 99;
  const orbB = Number.isFinite(Number(b?.orb_deg)) ? Number(b.orb_deg) : 99;
  if (orbA !== orbB) return orbA - orbB;

  const aRank = [bodyTitleRank(a?.a), bodyTitleRank(a?.b)].sort((x, y) => x - y);
  const bRank = [bodyTitleRank(b?.a), bodyTitleRank(b?.b)].sort((x, y) => x - y);
  if (aRank[0] !== bRank[0]) return aRank[0] - bRank[0];
  if (aRank[1] !== bRank[1]) return aRank[1] - bRank[1];

  const aKeys = [normalizeBodyKey(a?.a || ""), normalizeBodyKey(a?.b || "")].sort();
  const bKeys = [normalizeBodyKey(b?.a || ""), normalizeBodyKey(b?.b || "")].sort();
  if (aKeys[0] !== bKeys[0]) return aKeys[0] < bKeys[0] ? -1 : 1;
  if (aKeys[1] !== bKeys[1]) return aKeys[1] < bKeys[1] ? -1 : 1;
  return 0;
}

function leadAspectFromResonancePool(skyAll, orbLimit) {
  if (!Array.isArray(skyAll) || skyAll.length === 0) return null;
  const filtered = skyAll
    .filter((item) => Number(item?.orb_deg) <= Number(orbLimit))
    .filter((item) => !isResonanceBodyExcluded(item))
    .sort(compareResonanceItems);
  return filtered[0] || null;
}

function normalizeAspectType(raw) {
  const x = String(raw || "").trim().toLowerCase();
  if (!x) return "";
  const base = x.replace(/_\d+$/, "");
  const map = {
    inconjunct: "quincunx_150",
    quincunx: "quincunx_150",
    semisquare: "semi_square_45",
    semi_square: "semi_square_45",
    sesquisquare: "sesqui_square_135",
    sesqui_square: "sesqui_square_135",
  };
  return map[base] || base;
}

const ASPECTS_META = {
  ...(dict?.ASPECTS_V2?.major || {}),
  ...(dict?.ASPECTS_V2?.deep_space || {}),
  ...(dict?.ASPECTS_V2?.craft_space || {}),
};

const ASPECTS_MAJOR_KEYS = new Set(Object.keys(dict?.ASPECTS_V2?.major || {}));
const ASPECTS_DEEP_KEYS = new Set(Object.keys(dict?.ASPECTS_V2?.deep_space || {}));
const ASPECTS_CRAFT_KEYS = new Set(Object.keys(dict?.ASPECTS_V2?.craft_space || {}));
const ASPECTS_RARE_PRI = new Set([
  "quintile_72",
  "biquintile_144",
  "septile_51",
  "biseptile_102",
  "triseptile_154",
  "sesqui_square_135",
]);

const ASPECT_QUALITY_MAP = Object.freeze({
  conjunction: ["密度", "重なり", "厚み", "濃度", "合流"],
  opposition: ["張り", "対照", "揺れ", "鏡", "間"],
  square: ["ざらつき", "圧", "ひずみ", "引っかかり", "張り"],
  trine: ["ほどけ", "風通し", "抜け", "ゆるみ", "余白"],
  sextile: ["通路", "ひらき", "空白", "ゆるみ", "交点"],
  semi_square_45: ["ざらつき", "引っかかり", "端差", "張り", "圧"],
  sesqui_square_135: ["圧", "引っかかり", "蓄積", "調整", "摩耗"],
  quincunx_150: ["ずれ", "未調整", "折れ", "違和感", "端差"],
  semi_sextile_30: ["にじみ", "余白", "境目", "滲点", "ゆらぎ"],
  quintile_72: ["工夫", "編み直し", "妙技", "ひらめき", "端差"],
  biquintile_144: ["調律", "余白", "抜け", "響き", "整え直し"],
  novile_40: ["静けさ", "ゆるみ", "余白", "ほどけ", "にじみ"],
  binovile_80: ["静けさ", "ゆるみ", "余白", "ほどけ", "にじみ"],
  quadranovile_160: ["静けさ", "ゆるみ", "余白", "ほどけ", "にじみ"],
  decile_36: ["伸び", "抜け", "ひらき", "工夫", "通り"],
  tridecile_108: ["伸び", "抜け", "ひらき", "工夫", "通り"],
  // aliases / family keys
  inconjunct: ["ずれ", "未調整", "折れ", "違和感", "端差"],
  quincunx: ["ずれ", "未調整", "折れ", "違和感", "端差"],
  semisquare: ["ざらつき", "引っかかり", "端差", "張り", "圧"],
  sesquisquare: ["圧", "引っかかり", "蓄積", "調整", "摩耗"],
  semisextile: ["にじみ", "余白", "境目", "滲点", "ゆらぎ"],
  quintile: ["工夫", "編み直し", "妙技", "ひらめき", "端差"],
  biquintile: ["調律", "余白", "抜け", "響き", "整え直し"],
  novile: ["静けさ", "ゆるみ", "余白", "ほどけ", "にじみ"],
  binovile: ["静けさ", "ゆるみ", "余白", "ほどけ", "にじみ"],
  trinovile: ["静けさ", "ゆるみ", "余白", "ほどけ", "にじみ"],
  quadranovile: ["静けさ", "ゆるみ", "余白", "ほどけ", "にじみ"],
  decile: ["伸び", "抜け", "ひらき", "工夫", "通り"],
  tridecile: ["伸び", "抜け", "ひらき", "工夫", "通り"],
  septile_family: ["縁", "響き", "余韻", "隔たり", "引力"],
  septile: ["縁", "響き", "余韻", "隔たり", "引力"],
  biseptile: ["縁", "響き", "余韻", "隔たり", "引力"],
  triseptile: ["縁", "響き", "余韻", "隔たり", "引力"],
});

const ASPECT_QUALITY_BUCKETS = Object.freeze({
  yin: ["ざらつき", "にじみ", "引っかかり", "ひずみ", "圧", "張り"],
  harmony: ["余白", "通路", "交点", "調律", "ゆるみ", "空白"],
  yang: ["抜け", "風通し", "ひらき", "伸び", "ほどけ", "通り"],
});

const ASPECT_TONE_HARD = new Set([
  "square",
  "opposition",
  "quincunx_150",
  "inconjunct",
  "semi_square_45",
  "sesqui_square_135",
  "semisquare",
  "sesquisquare",
  "quincunx",
  "septile",
  "biseptile",
  "triseptile",
  "septile_family",
]);
const ASPECT_TONE_SOFT = new Set([
  "trine",
  "sextile",
  "semi_sextile_30",
  "quintile_72",
  "biquintile_144",
  "novile_40",
  "binovile_80",
  "trinovile_120",
  "quadranovile_160",
  "decile_36",
  "tridecile_108",
  "semi_sextile",
  "quintile",
  "biquintile",
  "novile",
  "binovile",
  "trinovile",
  "quadranovile",
  "decile",
  "tridecile",
]);

function hash32(input) {
  const s = String(input || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function uniqList(list) {
  const out = [];
  const seen = new Set();
  for (const item of list || []) {
    const v = String(item || "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function pickBySeed(list, seed, count = 1) {
  const arr = Array.isArray(list) ? [...list] : [];
  if (!arr.length) return [];
  const out = [];
  const used = new Set();
  for (let i = 0; i < count; i++) {
    const idx = (seed + i * 7) % arr.length;
    const v = arr[idx];
    if (used.has(v)) continue;
    used.add(v);
    out.push(v);
  }
  return out;
}

function aspectMeta(typeRaw) {
  const key = normalizeAspectType(typeRaw);
  return ASPECTS_META?.[key] || null;
}

function aspectToneBucket(typeRaw) {
  const key = normalizeAspectType(typeRaw);
  if (ASPECT_TONE_HARD.has(key)) return "yin";
  if (ASPECT_TONE_SOFT.has(key)) return "yang";
  return "harmony";
}

function aspectQualityLabel(typeRaw, seed) {
  const key = normalizeAspectType(typeRaw);
  const bucket = aspectToneBucket(typeRaw);
  const pool = uniqList([
    ...(ASPECT_QUALITY_BUCKETS[bucket] || []),
    ...(ASPECT_QUALITY_MAP[key] || []),
  ]);
  return pickBySeed(pool, seed, 1)[0] || "余白";
}

function getAspectByType(typeRaw) {
  return aspectMeta(typeRaw);
}

function isRareAspect(typeRaw) {
  const key = normalizeAspectType(typeRaw);
  return ASPECTS_DEEP_KEYS.has(key) || ASPECTS_CRAFT_KEYS.has(key);
}

function aspectRoleSentence(typeRaw) {
  const meta = aspectMeta(typeRaw);
  if (!meta) return "";
  if (meta.role_line) return meta.role_line;
  const core = String(meta.core || "").trim();
  if (!core) return "";
  return `${core}が残る角度`;
}

function aspectRoleEcho(typeRaw) {
  const meta = aspectMeta(typeRaw);
  if (!meta) return "同じ質感が別の層にも残る";
  const core = String(meta.core || "").trim();
  if (!core) return "同じ質感が別の層にも残る";
  return `${core}の質感が、別の層にも静かに残る`;
}

function pickTripletByBucket(items, bucketFn, order, seed) {
  const out = [];
  const used = new Set();
  const sorted = [...items].sort((a, b) => (a?.orb_deg ?? 99) - (b?.orb_deg ?? 99));
  for (const bucket of order) {
    const hit = sorted.find((x) => !used.has(x) && bucketFn(x) === bucket);
    if (hit) {
      used.add(hit);
      out.push(hit);
    }
  }
  for (const x of sorted) {
    if (out.length >= 3) break;
    if (used.has(x)) continue;
    used.add(x);
    out.push(x);
  }
  if (out.length > 3) return out.slice(0, 3);
  if (out.length < 3 && items.length) {
    const fill = pickBySeed(items, hash32(seed || "fill"), 3);
    for (const x of fill) {
      if (out.length >= 3) break;
      if (!out.includes(x)) out.push(x);
    }
  }
  return out;
}

function pickSecondaryAspect(all, primary) {
  const primaryKey = normalizeAspectType(primary?.type);
  const primarySig = `${primary?.a}-${primary?.b}-${primaryKey}`;

  const others = all.filter((x) => {
    const key = normalizeAspectType(x?.type);
    const sig = `${x?.a}-${x?.b}-${key}`;
    return sig !== primarySig;
  });

  const byOrb = [...others].sort((a, b) => (a?.orb_deg ?? 99) - (b?.orb_deg ?? 99));

  // 1) rare (deep/craft)
  const rare = byOrb.find((x) => isRareAspect(x?.type));
  if (rare) return rare;

  // 2) priority set (quintile / septile / sesqui, etc.)
  const pri = byOrb.find((x) => ASPECTS_RARE_PRI.has(normalizeAspectType(x?.type)));
  if (pri) return pri;

  // 3) different aspect type from primary
  const diff = byOrb.find((x) => normalizeAspectType(x?.type) !== primaryKey);
  if (diff) return diff;

  return null;
}

function aspectLabelWithDeg(typeRaw) {
  const meta = aspectMeta(typeRaw);
  if (!meta) return String(typeRaw || "");
  const deg = Number.isFinite(meta.deg) ? `${meta.deg}°` : "";
  return deg ? `${meta.label_ja}（${deg}）` : meta.label_ja;
}

module.exports = {
  isResonanceBodyExcluded,
  bodyTitleRank,
  compareResonanceItems,
  leadAspectFromResonancePool,
  normalizeAspectType,
  ASPECTS_META,
  ASPECTS_MAJOR_KEYS,
  ASPECTS_DEEP_KEYS,
  ASPECTS_CRAFT_KEYS,
  ASPECTS_RARE_PRI,
  ASPECT_QUALITY_MAP,
  ASPECT_QUALITY_BUCKETS,
  aspectMeta,
  aspectToneBucket,
  aspectQualityLabel,
  getAspectByType,
  isRareAspect,
  aspectRoleSentence,
  aspectRoleEcho,
  pickTripletByBucket,
  pickSecondaryAspect,
  aspectLabelWithDeg,
  uniqList,
  hash32,
  pickBySeed,
};
