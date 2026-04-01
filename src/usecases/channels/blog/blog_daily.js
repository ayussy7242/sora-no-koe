"use strict";

const fs = require("fs");
const path = require("path");

const dict = require("../../../content/dict");
const { createChatCompletion } = require("../../../integrations/openai/openai_client");
const { buildBlogBlocks, blocksToInput, buildMoonBlockHtml } = require("../../../presenters/blog/story_blocks");
const { buildSoraWheelSvg } = require("../../../engine/graphics/sora_wheel");
const { EXTENDED_PLANETS, DEEP_BODIES } = require("../../../domain/astro/constants");
const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
} = require("../../../content/prompts/sora/sora_ai_prompts");
const {
  BLOG_BLOCKS_USER_GUIDE,
  BLOG_BLOCK_SECTION_GUIDE,
  BLOG_BLOCK_ITEM_GUIDE,
  BLOG_STRUCT_HOUSE_GUIDE,
  BLOG_STRUCT_ELEMENT_GUIDE,
  BLOG_LONG_OVERVIEW_GUIDE,
  BLOG_LONG_POSITION_GUIDE,
  BLOG_LONG_RESONANCE_GUIDE,
  BLOG_LONG_HOUSE_GUIDE,
  BLOG_LONG_ELEMENTS_GUIDE,
  BLOG_LONG_RETRO_GUIDE,
  BLOG_LONG_AFTERTASTE_GUIDE,
} = require("../../../content/prompts/blog/blog_blocks");
const { BLOG_MOON_EVENT_GUIDE } = require("../../../content/prompts/blog/blog_moon_event");
const { SPEC } = require("../../../config/sora_spec");
const { resolveProximityConfig } = require("../../../config/aspect_channel_config");
const { buildRetrogradeMap } = require("../../../domain/astro/retrograde");
const { weightForBody } = require("../../../domain/touch_point_scoring");
const {
  computeTokyoAscDeg,
  signIndexFromKey,
  houseNumberForSignIndex,
  formatDateYmd,
  formatDateYmdHm,
  findNextMoonPhase,
} = require("../../../domain/astro_compute");
const { trendLabelJa, findTransitWindowAroundNow, isApplying } = require("../../../domain/aspect_proximity");
const { toDateLocalJST } = require("../../../utils/time_utils");
const { bodyGlyph, bodyLabelJa, signLabelJa, signGlyph } = require("../../../presenters/shared/text/tokens");
const { normalizeBodyKey, normalizeSignKey, normalizeAspectKey } = require("../../../domain/canonical");
const { formatAspectDisplay } = require("../../../presenters/format/format/common");
const {
  formatTodayMoonLines,
  formatNextMoonLines,
} = require("../../../domain/moon_info");
const {
  escapeHtml,
  renderRawBlock,
  renderBlocksPreview,
  pushParagraphs,
  markdownToHtml,
  softenText,
  enforceSingleClosing,
} = require("./blog_daily_text");

const BLOG_BANNED_TERMS = [
  "あなた",
  "あなたは",
  "あなたが",
  "必ず",
  "確実",
  "逃れられない",
  "絶対",
  "運命",
  "使命",
  "すべき",
  "した方がいい",
  "したほうがいい",
  "しよう",
  "求められる",
  "必要",
  "べき",
  "これその配置のまま",
  "日本語校正フェーズ",
  "校正フェーズ",
  "日本語校正",
  "内部処理",
  "処理しました",
  "実行しました",
];

const BLOG_TITLE_EXCLUDE_BODIES = new Set(DEEP_BODIES);

function isResonanceBodyExcluded(row) {
  const aKey = normalizeBodyKey(row?.a || "");
  const bKey = normalizeBodyKey(row?.b || "");
  return BLOG_TITLE_EXCLUDE_BODIES.has(aKey) || BLOG_TITLE_EXCLUDE_BODIES.has(bKey);
}

const BLOG_TITLE_BODY_ORDER = EXTENDED_PLANETS;
const BLOG_TITLE_BODY_RANK = BLOG_TITLE_BODY_ORDER.reduce((acc, key, idx) => {
  acc[key] = idx + 1;
  return acc;
}, {});

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

function findBannedTerm(text) {
  const s = String(text || "");
  if (!s) return "";
  for (const t of BLOG_BANNED_TERMS) {
    if (t && s.includes(t)) return t;
  }
  return "";
}

function buildAioseoMeta({ story, dateLocal, title }) {
  const dateJa = formatDateJaFromLocal(dateLocal) || String(dateLocal || "").trim();
  const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
  const resonanceOrbLimit = SPEC?.orb?.paid ?? 3.0;
  const lead = leadAspectFromResonancePool(skyAll, resonanceOrbLimit)
    || [...skyAll].sort((a, b) => (a?.orb_deg ?? 99) - (b?.orb_deg ?? 99))[0];

  let leadText = "";
  if (lead) {
    const aKey = normalizeBodyKey(lead?.a || "");
    const bKey = normalizeBodyKey(lead?.b || "");
    const leftLabel = bodyLabelJa(dict, aKey) || aKey;
    const rightLabel = bodyLabelJa(dict, bKey) || bKey;
    const deg = Number.isFinite(Number(lead?.aspect_deg)) ? Math.round(Number(lead.aspect_deg)) : null;
    if (leftLabel && rightLabel && Number.isFinite(deg)) {
      leadText = `${leftLabel}と${rightLabel}が${deg}度で接続し、主要なアスペクトが形成されています。`;
    } else if (leftLabel && rightLabel) {
      leadText = `${leftLabel}と${rightLabel}の主要アスペクトが形成されています。`;
    }
  }

  const description = [
    dateJa ? `${dateJa}の星の配置。` : "今日の星の配置。",
    leadText,
    "今日のトランジット構造と天体配置を一覧で確認できます。",
  ].filter(Boolean).join("");

  return {
    aioseo_title: String(title || "").trim(),
    aioseo_description: description,
    aioseo_focus_keyphrase: dateJa ? `${dateJa} 星の配置` : "今日の星の配置",
  };
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

function splitCoreWords(core) {
  return String(core || "")
    .split(/[・/／,]/g)
    .map((s) => s.trim())
    .filter(Boolean);
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

function signJa(signKey) {
  const k = String(signKey || "").toLowerCase();
  return dict?.SIGNS_V2?.signs?.[k]?.label_ja || signKey || "";
}

function signElement(signKey) {
  const k = String(signKey || "").toLowerCase();
  return dict?.SIGNS_V2?.signs?.[k]?.element || "";
}

function signLabelFromLon(dictObj, lon) {
  if (!Number.isFinite(Number(lon))) return "—";
  const order = dictObj?.SIGNS_V2?.order || dictObj?.SIGNS?.order || [
    "aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces",
  ];
  const idx = Math.floor((((Number(lon) % 360) + 360) % 360) / 30);
  const key = order[idx];
  return key ? signLabelJa(dict, key) : "—";
}

const TSUKIJI_BODY_THEME = {
  sun: "意志",
  moon: "感情",
  mercury: "思考",
  venus: "愛",
  mars: "行動",
  jupiter: "拡張",
  saturn: "現実",
  uranus: "変革",
  neptune: "理想",
  pluto: "変容",
  chiron: "癒し",
  lilith: "影",
};

function tsukijiThemeForBody(bodyKey) {
  const key = String(bodyKey || "").toLowerCase();
  return TSUKIJI_BODY_THEME[key] || bodyLabelJa(dict, key) || key || "";
}

function buildTsukijiThemeLine(aKey, bKey) {
  const a = tsukijiThemeForBody(aKey);
  const b = tsukijiThemeForBody(bKey);
  if (!a || !b) return "";
  return `構造：${a} × ${b}`;
}

function findMoonPhaseInJstDate(dateLocal, phaseDeg) {
  if (!dateLocal) return null;
  const start = new Date(`${dateLocal}T00:00:00+09:00`);
  const end = new Date(`${dateLocal}T23:59:59+09:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const next = findNextMoonPhase(start.toISOString(), phaseDeg);
  if (next && next.getTime() <= end.getTime()) return next;
  return null;
}

function elementBucket(element) {
  if (element === "fire") return "yang";
  if (element === "air") return "harmony";
  if (element === "earth" || element === "water") return "yin";
  return "harmony";
}

function fusionTokensFor(signKey, bodyKey) {
  const sKey = String(signKey || "").toLowerCase();
  const bKey = String(bodyKey || "").toLowerCase();
  const s = dict?.SIGN_FLAVOR_V1?.signs?.[sKey];
  const sp = s?.by_body?.[bKey];
  const f = sp?.fusion;
  if (!f) return [];
  return uniqList([
    ...(f.A || []),
    ...(f.B || []),
    ...(f.expression || []),
    ...(f.process || []),
    ...(f.clarity || []),
    ...(f.tendency || []),
  ]);
}

function aspectMeta(typeRaw) {
  const key = normalizeAspectType(typeRaw);
  return ASPECTS_META?.[key] || null;
}

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

function dominantLabel(strata) {
  const elemCount = strata?.element_count || {};
  const modCount = strata?.modality_count || {};

  const pickTop = (obj) => {
    const entries = Object.entries(obj).filter(([k]) => k !== "unknown");
    if (!entries.length) return { key: "", top: 0, second: 0 };
    entries.sort((a, b) => b[1] - a[1]);
    return { key: entries[0][0], top: entries[0][1], second: entries[1]?.[1] ?? 0 };
  };

  const e = pickTop(elemCount);
  const m = pickTop(modCount);
  const clear =
    (e.top >= 5 || (e.top - e.second) >= 2) &&
    (m.top >= 5 || (m.top - m.second) >= 2);

  if (!clear) return "";

  const elemJa = dict?.ELEMENTS_V1?.elements?.[e.key]?.label_ja || "";
  const modJa = dict?.MODALITIES_V1?.modalities?.[m.key]?.label_ja || "";
  return [elemJa, modJa].filter(Boolean).join("×");
}

function aspectLabelWithDeg(typeRaw) {
  const meta = aspectMeta(typeRaw);
  if (!meta) return String(typeRaw || "");
  const deg = Number.isFinite(meta.deg) ? `${meta.deg}°` : "";
  return deg ? `${meta.label_ja}（${deg}）` : meta.label_ja;
}

function pickList(list, limit = 3) {
  if (!Array.isArray(list) || list.length === 0) return [];
  return list.slice(0, limit);
}

function planetTouch(planetKey) {
  const key = String(planetKey || "").toLowerCase();
  const p = dict?.SOAR_STYLE_V1?.planets?.[key];
  return pickList(p?.touch, 3);
}

function signTouch(signKey) {
  const key = String(signKey || "").toLowerCase();
  const s = dict?.SOAR_STYLE_V1?.signs?.[key];
  return pickList(s?.touch, 3);
}

function aspectVoice(typeRaw) {
  const key = normalizeAspectType(typeRaw);
  const v = dict?.ASPECTS_V2?.voice_templates?.[key];
  if (!v) return [];
  const parts = [v.touch, v.gap, v.rest].flat().filter(Boolean);
  return pickList(parts, 4);
}

function systemPrompt() {
  return SORA_AI_SYSTEM_PROMPT_COMMON;
}

function userPrompt({ dateLocal, dataBlock }) {
  return [
    BLOG_BLOCKS_USER_GUIDE,
    "",
    `日付: ${dateLocal}`,
    "",
    "INPUT:",
    dataBlock,
  ].join("\n");
}

function formatDateJaFromLocal(dateLocal) {
  const parts = String(dateLocal || "").trim().split("-");
  if (parts.length !== 3) return "";
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return "";
  return `${y}年${m}月${d}日`;
}

function formatDateDotsFromLocal(dateLocal) {
  const parts = String(dateLocal || "").trim().split("-");
  if (parts.length !== 3) return "";
  const y = Number(parts[0]);
  const m = String(Number(parts[1])).padStart(2, "0");
  const d = String(Number(parts[2])).padStart(2, "0");
  if (!Number.isFinite(y) || !Number.isFinite(Number(m)) || !Number.isFinite(Number(d))) return "";
  return `${y}.${m}.${d}`;
}

function storySignJa(story, bodyKey) {
  const direct =
    story?.public?.transit_signs?.[bodyKey]?.sign_ja ||
    story?.public?.[bodyKey]?.sign_ja ||
    "";
  if (direct) return direct;
  const rawKey =
    story?.public?.transit_signs?.[bodyKey]?.sign_key ||
    story?.public?.[bodyKey]?.sign_key ||
    "";
  const key = normalizeSignKey(rawKey);
  return key ? signLabelJa(dict, key) : "";
}

function extractMoonPhaseLabel({ asOfISO, story }) {
  const todayMoon = formatTodayMoonLines({ asOfISO, story, dict });
  const phaseLine = todayMoon?.lines?.[1] || "";
  if (!phaseLine) return "";
  const main = phaseLine.split("｜")[0] || "";
  const label = main.split("（")[0].trim();
  return label;
}

function lastFullMoonDate(asOfISO) {
  if (!asOfISO) return null;
  const base = new Date(asOfISO);
  if (Number.isNaN(base.getTime())) return null;
  const start1 = new Date(base.getTime() - 25 * 86400000).toISOString();
  let full = findNextMoonPhase(start1, 180);
  if (full && full.getTime() > base.getTime()) {
    const start2 = new Date(base.getTime() - 55 * 86400000).toISOString();
    full = findNextMoonPhase(start2, 180);
    if (full && full.getTime() > base.getTime()) return null;
  }
  return full;
}

function diffDaysJst(dateLocal, date) {
  if (!dateLocal || !(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const fullLocal = toDateLocalJST(date);
  if (!fullLocal) return null;
  const a = new Date(`${dateLocal}T00:00:00+09:00`);
  const b = new Date(`${fullLocal}T00:00:00+09:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function moonPhaseTitleLabel({ dateLocal, asOfISO }) {
  if (!dateLocal) return "";
  const newMoonAt = findMoonPhaseInJstDate(dateLocal, 0);
  if (newMoonAt instanceof Date) return "新月";
  const firstQuarterAt = findMoonPhaseInJstDate(dateLocal, 90);
  if (firstQuarterAt instanceof Date) return "上弦";
  const fullMoonAt = findMoonPhaseInJstDate(dateLocal, 180);
  if (fullMoonAt instanceof Date) return "満月";
  const lastQuarterAt = findMoonPhaseInJstDate(dateLocal, 270);
  if (lastQuarterAt instanceof Date) return "下弦";

  const lastFull = lastFullMoonDate(asOfISO);
  const diff = diffDaysJst(dateLocal, lastFull);
  if (!Number.isFinite(diff)) return "";
  if (diff === 1) return "十六夜";
  if (diff === 2) return "立待月";
  if (diff === 3) return "居待月";
  if (diff === 4) return "寝待月";
  if (diff === 5) return "更待月";
  return "";
}

function isMoonEventPhaseLabel(label) {
  return label === "新月" || label === "満月";
}

function getMoonEventPhaseLabel({ dateLocal, asOfISO }) {
  const label = moonPhaseTitleLabel({ dateLocal, asOfISO });
  return isMoonEventPhaseLabel(label) ? label : "";
}

function formatElementCount(count = {}) {
  return `火${count.fire || 0} 地${count.earth || 0} 風${count.air || 0} 水${count.water || 0}`;
}

function formatModalityCount(count = {}) {
  return `活動${count.cardinal || 0} 不動${count.fixed || 0} 柔軟${count.mutable || 0}`;
}

function formatSignConcentration(counts = {}) {
  const entries = Object.entries(counts)
    .map(([k, v]) => [k, Number(v)])
    .filter(([k, v]) => k && Number.isFinite(v) && v > 0)
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
  if (!entries.length) return "";
  const top = entries.slice(0, 2).map(([k, v]) => {
    const label = signLabelJa(dict, k) || k;
    return `${label}${v}件`;
  });
  return top.join(" / ");
}

function getTransitInfo(story, bodyKey) {
  const raw = story?.public?.transit_signs?.[bodyKey] || story?.public?.[bodyKey] || {};
  const signKey = normalizeSignKey(raw?.sign_key || "");
  const signJa = raw?.sign_ja || signLabelJa(dict, signKey) || "";
  const lonDeg = Number.isFinite(Number(raw?.lon_deg)) ? Number(raw.lon_deg) : null;
  return { signKey, signJa, lonDeg };
}

function buildMoonEventTitle(story, dateLocal) {
  const asOfISO = story?.meta?.as_of || new Date().toISOString();
  const phaseLabel = getMoonEventPhaseLabel({ dateLocal, asOfISO });
  if (!phaseLabel) return "";

  const dateDots = formatDateDotsFromLocal(dateLocal)
    || formatDateYmd(new Date(asOfISO)).replace(/-/g, ".");
  const sunSign = storySignJa(story, "sun");
  const moonSign = storySignJa(story, "moon");
  if (!dateDots || !sunSign || !moonSign) return "";
  return `${dateDots}｜${moonSign}${phaseLabel}｜太陽 ${sunSign} × 月 ${moonSign}`;
}

function buildMoonEventPrompt({ story, dateLocal, phaseLabel }) {
  const asOfISO = story?.meta?.as_of || new Date().toISOString();
  const dateDots = formatDateDotsFromLocal(dateLocal)
    || formatDateYmd(new Date(asOfISO)).replace(/-/g, ".");

  const sun = getTransitInfo(story, "sun");
  const moon = getTransitInfo(story, "moon");
  const sunSignDeg = sun.signKey ? formatSignDegree(sun.signKey, sun.lonDeg) : (sun.signJa || "—");
  const moonSignDeg = moon.signKey ? formatSignDegree(moon.signKey, moon.lonDeg) : (moon.signJa || "—");

  const aspectDeg = phaseLabel === "新月" ? 0 : 180;
  const aspectKey = phaseLabel === "新月" ? "conjunction" : "opposition";
  const aspectLabel = aspectLabelForLong(aspectKey, aspectDeg);

  const axisWords = phaseLabel === "新月"
    ? "重なり / 収束 / 密度"
    : "向かい合い / 張力 / 対向";

  const strata = story?.public?.sky_strata || {};
  const elements = formatElementCount(strata.element_count || {});
  const modalities = formatModalityCount(strata.modality_count || {});

  const signCounts = {};
  const transit = story?.public?.transit_signs || {};
  BLOG_STRUCT_BODY_ORDER.forEach((key) => {
    const signKey = normalizeSignKey(transit?.[key]?.sign_key || "");
    if (!signKey) return;
    signCounts[signKey] = (signCounts[signKey] || 0) + 1;
  });
  const distribution = formatSignConcentration(signCounts);

  const inputLines = [
    `DATE_DOTS: ${dateDots}`,
    `PHASE: ${phaseLabel}`,
    `SUN_SIGN: ${sun.signJa || "—"}`,
    `MOON_SIGN: ${moon.signJa || "—"}`,
    `SUN_SIGN_DEG: ${sunSignDeg}`,
    `MOON_SIGN_DEG: ${moonSignDeg}`,
    `ASPECT: ${aspectLabel} ${aspectDeg}°`,
    `AXIS_WORDS: ${axisWords}`,
    `ELEMENTS: ${elements}`,
    `MODALITIES: ${modalities}`,
    `DISTRIBUTION: ${distribution || "—"}`,
  ];

  return [
    BLOG_MOON_EVENT_GUIDE,
    "",
    "INPUT:",
    inputLines.join("\n"),
  ].join("\n");
}

async function generateMoonEventDraft({ story, dateLocal, phaseLabel, runWithRetry, model }) {
  if (!phaseLabel) return "";
  const prompt = buildMoonEventPrompt({ story, dateLocal, phaseLabel });
  const text = await runWithRetry({ userContent: prompt, model, maxTokens: 1200 });
  return stripAiLogs(text);
}

function buildSeoTitle({ story, dateLocal }) {
  const fallback = `今日のソラ｜${dateLocal}`;
  const dateJa = formatDateJaFromLocal(dateLocal);
  const sunSign = storySignJa(story, "sun");
  const moonSign = storySignJa(story, "moon");
  const asOfISO = story?.meta?.as_of || (dateLocal ? `${dateLocal}T03:00:00.000Z` : new Date().toISOString());
  const moonPhase = moonPhaseTitleLabel({ dateLocal, asOfISO });
  if (!dateJa || !sunSign || !moonSign || !moonPhase) return fallback;
  return `${dateJa}の星の配置｜${sunSign} 太陽 × ${moonSign} 月｜${moonPhase}｜今日のソラ`;
}

function buildLeadAspectTitle({ story, dateLocal }) {
  const dateDots = formatDateDotsFromLocal(dateLocal);
  if (!dateDots) return "";
  const asOfISO = story?.meta?.as_of || (dateLocal ? `${dateLocal}T03:00:00.000Z` : new Date().toISOString());
  const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
  if (!skyAll.length) return "";

  const resonanceOrbLimit = SPEC?.orb?.paid ?? 3.0;
  const lead = leadAspectFromResonancePool(skyAll, resonanceOrbLimit)
    || [...skyAll].sort((a, b) => (a?.orb_deg ?? 99) - (b?.orb_deg ?? 99))[0];
  if (!lead) return "";

  const aKey = normalizeBodyKey(lead?.a || "");
  const bKey = normalizeBodyKey(lead?.b || "");
  if (!aKey || !bKey) return "";

  const aRank = bodyTitleRank(aKey);
  const bRank = bodyTitleRank(bKey);
  const leftKey = aRank <= bRank ? aKey : bKey;
  const rightKey = aRank <= bRank ? bKey : aKey;

  const retroMap = buildRetrogradeMap(asOfISO, [leftKey, rightKey]);
  const leftSign = leftKey === aKey ? (lead?.a_sign_ja || signLabelJa(dict, lead?.a_sign_key || "")) : (lead?.b_sign_ja || signLabelJa(dict, lead?.b_sign_key || ""));
  const rightSign = rightKey === aKey ? (lead?.a_sign_ja || signLabelJa(dict, lead?.a_sign_key || "")) : (lead?.b_sign_ja || signLabelJa(dict, lead?.b_sign_key || ""));
  const leftLabel = [
    `${bodyLabelJa(dict, leftKey)}${retroMap[leftKey] ? "(R)" : ""}`.trim(),
    leftSign || "",
  ].filter(Boolean).join(" ").trim();
  const rightLabel = [
    `${bodyLabelJa(dict, rightKey)}${retroMap[rightKey] ? "(R)" : ""}`.trim(),
    rightSign || "",
  ].filter(Boolean).join(" ").trim();

  const aspectLabel = aspectLabelForLong(lead?.aspect || lead?.type, lead?.aspect_deg);
  if (!leftLabel || !rightLabel || !aspectLabel) return "";

  return `${dateDots}｜${leftLabel} × ${rightLabel} ${aspectLabel}｜今日のソラ`;
}

function buildDailyTitle(story, dateLocal) {
  return (
    buildMoonEventTitle(story, dateLocal)
    || buildLeadAspectTitle({ story, dateLocal })
    || buildSeoTitle({ story, dateLocal })
  );
}

function stripAiLogs(text) {
  if (!text) return text;
  let out = String(text);
  out = out.replace(/<p>[^<]*日本語校正フェーズ[^<]*<\/p>\s*/g, "");
  out = out.replace(/<p>[^<]*以下が修正後の本文です[^<]*<\/p>\s*/g, "");
  out = out.replace(/<p>[^<]*日本語校正[^<]*<\/p>\s*/g, "");
  out = out.replace(/^.*日本語校正フェーズ.*$/gim, "");
  out = out.replace(/^.*以下が修正後の本文です.*$/gim, "");
  out = out.replace(/^.*日本語校正.*$/gim, "");
  out = out.replace(/これその配置のまま/g, "");
  out = out.replace(/置かれているされる/g, "置かれている");
  out = out.replace(/残っているする/g, "残っている");
  out = out.replace(/されるする/g, "される");
  out = out.replace(/しているする/g, "している");
  out = out.replace(/してるする/g, "してる");
  out = out.replace(/残るする/g, "残る");
  // strip fenced code markers (``` / ```html) while keeping inner text
  out = out.replace(/```[a-zA-Z0-9_-]*\s*\n/g, "");
  out = out.replace(/\n```/g, "\n");
  out = out.replace(/```/g, "");
  return out.trim();
}

function replaceMoonBlockHtml(html, moonHtml) {
  if (!html || !moonHtml) return html;
  const block = String(moonHtml).trim();
  if (!block) return html;
  const re = /<h2>(?:\d+｜)?🌙 本日の月<\/h2>[\s\S]*?(?=<h2>[^<]*<\/h2>|$)/;
  if (!re.test(html)) return html;
  return String(html).replace(re, `${block}\n`);
}

function injectMoonBlock(html, { story, dateLocal }) {
  const asOfISO = story?.meta?.as_of || (dateLocal ? `${dateLocal}T03:00:00.000Z` : new Date().toISOString());
  const moonHtml = buildMoonBlockHtml({ story, asOfISO });
  return replaceMoonBlockHtml(html, moonHtml);
}

function splitH2Sections(html) {
  const out = [];
  const re = /<h2>([^<]+)<\/h2>/g;
  let match = null;
  let lastTitle = null;
  let lastIndex = 0;
  while ((match = re.exec(html))) {
    if (lastTitle != null) {
      out.push({
        title: lastTitle,
        html: html.slice(lastIndex, match.index).trim(),
      });
    }
    lastTitle = match[1];
    lastIndex = match.index;
  }
  if (lastTitle != null) {
    out.push({
      title: lastTitle,
      html: html.slice(lastIndex).trim(),
    });
  }
  return out;
}

function replaceH2Title(sectionHtml, newTitle) {
  if (!sectionHtml || !newTitle) return sectionHtml;
  return String(sectionHtml).replace(/<h2>[^<]*<\/h2>/, `<h2>${newTitle}</h2>`);
}

function buildHouseBlockHtml({ story, asOfISO }) {
  const { rows } = buildHouseRowsPublic(story, asOfISO);
  const top = rows.filter((row) => Number(row.score || 0) > 0).slice(0, 3);
  const parts = [];
  parts.push("<h2>4｜🏠 ハウス集中</h2>");
  if (!top.length) {
    parts.push("<p>集中は観測されていない</p>");
    return parts.join("\n");
  }

  const houseDesc = {
    1: ["自己の輪郭に天体が集中し、", "始まりや内側の動きが表面化しやすい配置。"],
    2: ["所有や価値の領域に天体が集まり、", "資源の扱い方が浮かび上がりやすい配置。"],
    3: ["ことばと近距離の領域に天体が集中し、", "情報の往来が密になりやすい配置。"],
    4: ["基盤の領域に天体が集まり、", "居場所や感情の揺れが大きくなりやすい配置。"],
    5: ["創造の領域に天体が集中し、", "表現や遊びの回路が開きやすい配置。"],
    6: ["生活の領域に天体が集まり、", "日々の調整や整えが増えやすい配置。"],
    7: ["対人の領域に天体が集中し、", "関係性の鏡がはっきり見えやすい配置。"],
    8: ["深層の領域に天体が集まり、", "共有や変容のテーマが浮かびやすい配置。"],
    9: ["視野の領域に天体が集中し、", "思想や方向性の調整が起こりやすい配置。"],
    10: ["社会領域に天体が集中し、", "外側の役割や立場に関わる動きが浮かびやすい配置。"],
    11: ["つながりの領域に天体が集まり、", "未来像や関係網の変化が出やすい配置。"],
    12: ["静かな領域に天体が集まり、", "内面の整理や回復が進みやすい配置。"],
  };

  parts.push("<p>今日の天体集中ハウス TOP3</p>");
  top.forEach((row) => {
    const count = row.items.length;
    const title = `第${row.houseNo}ハウス｜${count}天体`;
    const bodies = row.items.length ? row.items.join("｜").replace(/\(R\)/g, "（R）") : "";
    const desc = houseDesc[row.houseNo] || ["天体が集まり、", "その領域の動きが際立ちやすい配置。"];
    const descHtml = `${escapeHtml(desc[0])}<br>${escapeHtml(desc[1])}`;

    parts.push("<div class=\"house-block\">");
    parts.push(`<strong>${escapeHtml(title)}</strong><br>`);
    if (bodies) parts.push(`${escapeHtml(bodies)}`);
    parts.push("<p>");
    parts.push(descHtml);
    parts.push("</p>");
    parts.push("</div>");
  });
  return parts.join("\n");
}

function applyPremiumLayout(html, { story, dateLocal }) {
  if (!html) return html;
  const asOfISO = story?.meta?.as_of || (dateLocal ? `${dateLocal}T03:00:00.000Z` : new Date().toISOString());

  // backup legacy full html
  backupLegacyHtml({ html, dateLocal });

  // detach closing lines if present
  let body = String(html).trim();
  const closingMark = "星は答えを示さず、構造だけを置いています。";
  const idx = body.indexOf(closingMark);
  if (idx >= 0) {
    body = body.slice(0, idx).trim();
  }

  // ensure moon block is injected before splitting
  body = injectMoonBlock(body, { story, dateLocal });

  const sections = splitH2Sections(body);
  const pick = (keywords = []) => sections.find((s) => keywords.some((k) => s.title.includes(k)));

  const overview = pick(["全体圧"]);
  const positions = pick(["きょうのソラの配置", "配置"]);
  const resonance = pick(["共鳴"]);
  const elements = pick(["元素／三区分", "元素"]);
  const tsukiji = pick(["つきじ"]);
  const kinjitsu = pick(["近日"]);
  const aftertaste = pick(["余韻"]);

  const moonHtml = buildMoonBlockHtml({ story, asOfISO });
  const wheelHtml = buildWheelHtml({ story, dateLocal });
  const houseHtml = buildHouseBlockHtml({ story, asOfISO });

  const freeParts = [];
  if (overview?.html) {
    const base = replaceH2Title(overview.html, "1｜全体圧");
    const combined = wheelHtml ? `${base}\n${wheelHtml}` : base;
    freeParts.push(combined);
  }
  if (positions?.html) freeParts.push(replaceH2Title(positions.html, "2｜配置"));
  if (moonHtml) freeParts.push(replaceH2Title(moonHtml, "3｜月"));
  if (resonance?.html) freeParts.push(replaceH2Title(resonance.html, "4｜共鳴"));
  const hideAfterResonance = String(process.env.BLOG_HIDE_AFTER_RESONANCE || "0") === "1";
  if (!hideAfterResonance) {
    if (houseHtml) freeParts.push(replaceH2Title(houseHtml, "5｜🏠 ハウス集中"));
    if (elements?.html) freeParts.push(replaceH2Title(elements.html, "6｜🔥 元素／三区分"));
    if (tsukiji?.html) freeParts.push(replaceH2Title(tsukiji.html, "7｜🌙 つきじ（継続接近ログ）"));
    if (kinjitsu?.html) freeParts.push(replaceH2Title(kinjitsu.html, "8｜📅 近日（接近予定）"));
    if (aftertaste?.html) freeParts.push(replaceH2Title(aftertaste.html, "9｜余韻"));
  }

  const merged = freeParts.filter((s) => s && String(s).trim()).join("\n\n");
  const withSpacing = addHeadingSpacing(merged);
  const closing = buildBlogClosingBlock();
  return [withSpacing, closing].filter((s) => s && String(s).trim()).join("\n\n");
}

function buildBlogClosingBlock() {
  const lineUrl = process.env.LINE_ADD_FRIEND_URL || "https://lin.ee/ZDjvxg8E";
  return [
    "<p>星は答えを示さず、構造だけを置いています。<br>星は語る。解釈はあなたのもの🌃</p>",
    "<p>毎朝<br>LINEでソラの配置<br>あなたの星×きょうの空配信中✨️<br>ともだち登録であなたの星の設計図 PDFプレゼント🎁<br>" + escapeHtml(lineUrl) + "</p>",
  ].join("\n");
}

function backupLegacyHtml({ html, dateLocal }) {
  if (!html) return;
  const enabled = String(process.env.BLOG_LEGACY_BACKUP || "1") !== "0";
  if (!enabled) return;
  try {
    const dir = path.join("/tmp", "blog", "legacy");
    fs.mkdirSync(dir, { recursive: true });
    const name = dateLocal ? `blog_legacy_${dateLocal}.html` : "blog_legacy_latest.html";
    fs.writeFileSync(path.join(dir, name), String(html), "utf8");
  } catch (_err) {
    // ignore backup errors
  }
}

function addHeadingSpacing(html) {
  if (!html) return html;
  let first = true;
  return String(html).replace(/<h2>/g, () => {
    if (first) {
      first = false;
      return "<h2>";
    }
    return "<br>\n<h2>";
  });
}

function buildWheelHtml({ story, dateLocal } = {}) {
  const enabled = String(process.env.BLOG_WHEEL_ENABLED || "1") !== "0";
  if (!enabled) return "";
  if (!story) return "";
  const mode = String(process.env.BLOG_WHEEL_MODE || "media").toLowerCase();
  if (mode === "media") return "<!--SORA_WHEEL_MEDIA-->";
  const dateLabel = String(dateLocal || story?.meta?.date_local || story?.public?.date_local || "")
    .trim()
    .replace(/-/g, ".");
  try {
    const svg = buildSoraWheelSvg({ story, dateLabel, size: 720 });
    if (!svg) return "";
    const responsiveSvg = String(svg).replace(
      "<svg ",
      "<svg style=\"width:100%;height:auto;display:block;\" "
    );
    return [
      "<div style=\"max-width:720px;margin:28px auto 40px;\">",
      responsiveSvg,
      "</div>",
    ].join("\n");
  } catch (_e) {
    return "";
  }
}

function buildDailyEyecatchLines(story, dateLocal) {
  const dateDots = formatDateDotsFromLocal(dateLocal) || "";
  const asOfISO = story?.meta?.as_of || (dateLocal ? `${dateLocal}T03:00:00.000Z` : new Date().toISOString());
  const title = buildLeadAspectTitle({ story, dateLocal });

  let line2 = "";
  if (title) {
    const parts = String(title).split("｜");
    if (parts.length >= 2) {
      line2 = parts[1].trim();
    }
  }

  return {
    line1: dateDots || "今日のソラ",
    line2: line2 || "今日のソラ",
    line3: "今日のソラ | sora-no-koe",
    kind: "lead_aspect",
  };
}

async function generateDailyDraft({ story, dateLocal, openai }) {
  const blocks = buildBlogBlocks(story, { dateLocal });
  const dataBlock = blocksToInput(blocks);

  const noAi =
    openai?.noAi === true ||
    process.env.BLOG_NO_AI === "1" ||
    process.env.BLOG_PREVIEW === "1";
  if (noAi) {
    return renderBlocksPreview(blocks);
  }

  const mode = String(openai?.mode || process.env.BLOG_GEN_MODE || "single").toLowerCase();
  const modelMain =
    openai?.modelBlog ||
    openai?.model ||
    process.env.OPENAI_MODEL_BLOG ||
    process.env.OPENAI_MODEL ||
    "gpt-4o";
  const modelParts =
    openai?.modelBlogParts ||
    process.env.OPENAI_MODEL_BLOG_PARTS ||
    modelMain;

  const closing = "星は答えを示さず、構造だけを置いています。\n星は語る。解釈はあなたのもの🌃";

  const buildMessages = (userContent, retryNote = "") => [
    { role: "system", content: systemPrompt() },
    {
      role: "user",
      content: retryNote ? `${userContent}\n\n【NG修正】${retryNote}` : userContent,
    },
  ];

  const runWithRetry = async ({ userContent, model, maxTokens = 2200 }) => {
    const runOnce = async (retryNote = "") =>
      createChatCompletion({
        apiKey: openai.apiKey,
        baseUrl: openai.baseUrl,
        model,
        messages: buildMessages(userContent, retryNote),
        temperature: 0.7,
        maxTokens,
      });

    const text = await runOnce();
    const cleaned = softenText(text);
    const banned = findBannedTerm(cleaned);
    if (banned) {
      const retryText = await runOnce(
        `禁止語「${banned}」を含めない。未来断定/指示/救済/運命固定/絶対語/本文の「あなた」を避ける。`
      );
      return softenText(retryText);
    }
    return cleaned;
  };

  const appendStructureLog = async (body) => {
    const log = await buildStructureLogHtml({
      story,
      dateLocal,
      runWithRetry,
      modelParts,
      enableAi: Boolean(openai?.apiKey),
    });
    const merged = [body, log].filter(Boolean).join("\n\n");
    return stripAiLogs(enforceSingleClosing(merged, closing));
  };

  const moonEventPhase = getMoonEventPhaseLabel({ dateLocal, asOfISO: story?.meta?.as_of });
  const moonEventEnabled = String(
    openai?.moonEventEnabled ?? process.env.BLOG_MOON_EVENT_ENABLED ?? "1"
  ) !== "0";
  const shouldMoonEvent =
    moonEventEnabled &&
    moonEventPhase &&
    (mode === "single" || mode === "auto" || mode === "moon_event");
  if (shouldMoonEvent) {
    const html = await generateMoonEventDraft({
      story,
      dateLocal,
      phaseLabel: moonEventPhase,
      runWithRetry,
      model: modelMain,
    });
    if (html) return html;
  }

  if (mode === "long_v2") {
    const html = await generateLongV2({
      story,
      dateLocal,
      runWithRetry,
      modelMain,
      modelParts,
    });
    const out = stripAiLogs(enforceSingleClosing(html, closing));
    return applyPremiumLayout(out, { story, dateLocal });
  }

  if (mode === "block") {
    const parts = [];
    for (const block of blocks) {
    if (block?.render === "html" && typeof block?.html === "string") {
      parts.push(block.html.trim());
      continue;
    }
    if (block?.render === "raw") {
      parts.push(renderRawBlock(block));
      continue;
    }
      const blockInput = blocksToInput([block]);
      const content = [
        BLOG_BLOCKS_USER_GUIDE,
        "",
        `日付: ${dateLocal}`,
        "",
        "INPUT:",
        blockInput,
      ].join("\n");
      const html = await runWithRetry({ userContent: content, model: modelParts, maxTokens: 1400 });
      parts.push(html.trim());
    }
    const out = await appendStructureLog(parts.join("\n\n").trim());
    return applyPremiumLayout(out, { story, dateLocal });
  }

  if (mode === "item") {
    const out = [];
    for (const block of blocks) {
      if (block?.render === "raw") {
        out.push(renderRawBlock(block));
        continue;
      }
      const facts = Array.isArray(block?.facts) && block.facts.length
        ? `FACTS:\n- ${block.facts.join("\n- ")}`
        : "FACTS: none";
      const headerPrompt = [
        BLOG_BLOCK_SECTION_GUIDE,
        "",
        `日付: ${dateLocal}`,
        "",
        `BLOCK_TITLE: ${block.title}`,
        facts,
      ].join("\n");
      const headerHtml = await runWithRetry({ userContent: headerPrompt, model: modelParts, maxTokens: 800 });
      out.push(headerHtml.trim());

      const items = Array.isArray(block?.items) ? block.items : [];
      if (block.itemsAsH3 && items.length) {
        for (let i = 0; i < items.length; i++) {
          const title = `${i + 1}. ${items[i]}`;
          const itemPrompt = [
            BLOG_BLOCK_ITEM_GUIDE,
            "",
            `日付: ${dateLocal}`,
            "",
            `BLOCK_TITLE: ${block.title}`,
            `H3_TITLE: ${title}`,
            facts,
          ].join("\n");
          const itemHtml = await runWithRetry({ userContent: itemPrompt, model: modelParts, maxTokens: 700 });
          out.push(itemHtml.trim());
        }
      } else if (items.length) {
        for (let i = 0; i < items.length; i++) {
          const title = `${block.title} ${i + 1}`;
          const itemPrompt = [
            BLOG_BLOCK_ITEM_GUIDE,
            "",
            `日付: ${dateLocal}`,
            "",
            `BLOCK_TITLE: ${block.title}`,
            `H3_TITLE: ${title}`,
            facts,
          ].join("\n");
          const itemHtml = await runWithRetry({ userContent: itemPrompt, model: modelParts, maxTokens: 600 });
          out.push(itemHtml.trim());
        }
      }
    }
    const outHtml = await appendStructureLog(out.join("\n\n").trim());
    return applyPremiumLayout(outHtml, { story, dateLocal });
  }

  const baseUser = userPrompt({ dateLocal, dataBlock });
  const text = await runWithRetry({ userContent: baseUser, model: modelMain, maxTokens: 2200 });
  const out = await appendStructureLog(text);
  return applyPremiumLayout(out, { story, dateLocal });
}

const BLOG_STRUCT_BODY_ORDER = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
  "lilith",
  "chiron",
];

const BLOG_STRUCT_SIGN_ORDER =
  dict?.SIGNS_V2?.order ||
  dict?.SIGNS?.order || [
    "aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces",
  ];

const BLOG_STRUCT_TSUKIJI_MIN_DAYS = 30;
const BLOG_STRUCT_TSUKIJI_MAX = 3;
const BLOG_PROXIMITY_CFG = resolveProximityConfig("blog_daily", dict);

function buildHouseRowsPublic(story, asOfISO) {
  const transitSigns = story?.public?.transit_signs || {};
  const ascDeg = asOfISO ? computeTokyoAscDeg(asOfISO) : null;
  const ascIndex = Number.isFinite(Number(ascDeg))
    ? Math.floor((((Number(ascDeg) % 360) + 360) % 360) / 30)
    : null;

  const retroMap = buildRetrogradeMap(asOfISO, BLOG_STRUCT_BODY_ORDER);

  const buckets = new Map();
  for (let h = 1; h <= 12; h++) {
    const signKey = ascIndex != null ? BLOG_STRUCT_SIGN_ORDER[(ascIndex + h - 1) % 12] : null;
    buckets.set(h, {
      houseNo: h,
      signKey,
      signJa: signKey ? signLabelJa(dict, signKey) : "",
      signGlyph: signKey ? signGlyph(signKey) : "",
      items: [],
      score: 0,
    });
  }

  BLOG_STRUCT_BODY_ORDER.forEach((key) => {
    const signKeyRaw = transitSigns?.[key]?.sign_key || "";
    const signKey = normalizeSignKey(signKeyRaw || "");
    const signIndex = signIndexFromKey(dict, signKey || "");
    if (signIndex < 0 || ascIndex == null) return;
    const houseNo = houseNumberForSignIndex(signIndex, ascIndex);
    const bucket = buckets.get(houseNo);
    if (!bucket) return;

    const bodyLabel = bodyLabelJa(dict, key) || key;
    const glyph = bodyGlyph(key);
    const retro = retroMap[key] ? SPEC.retro.suffix : "";
    const entry = `${glyph ? `${glyph}` : ""}${bodyLabel}${retro}`.trim();

    bucket.items.push(entry);
    bucket.score += weightForBody(key);
  });

  const rows = Array.from(buckets.values());
  rows.sort((a, b) => (b.score - a.score) || (a.houseNo - b.houseNo));
  return { rows, retroMap };
}

function formatHouseLogLine(row) {
  const signText = `${row.signGlyph || ""}${row.signJa || ""}`.trim() || "—";
  const bodiesRaw = row.items.length ? row.items.join(" ") : "—";
  const bodies = bodiesRaw.replace(/\(R\)/g, "（R）");
  return `第${row.houseNo}ハウス｜${signText}｜${bodies}`;
}

function buildTsukijiRowsPublic(story, asOfISO) {
  const longLogs = Array.isArray(story?.public?.kinjitsu_long) ? story.public.kinjitsu_long : [];
  const now = new Date(asOfISO || new Date().toISOString());
  if (Number.isNaN(now.getTime())) return [];
  if (longLogs.length) {
    return longLogs
      .map((row) => ({
        aKey: normalizeBodyKey(row?.a || ""),
        bKey: normalizeBodyKey(row?.b || ""),
        aSignKey: row?.a_sign_key || "",
        bSignKey: row?.b_sign_key || "",
        aSignJa: row?.a_sign_ja || "",
        bSignJa: row?.b_sign_ja || "",
        aspect: normalizeAspectKey(row?.aspect || row?.type, row?.aspect_deg),
        aspectDeg: Number(row?.aspect_deg),
        orb: Number(row?.now_orb),
        start: row?.start_at ? new Date(row.start_at) : null,
        peak: row?.peak_at ? new Date(row.peak_at) : null,
        end: row?.end_at ? new Date(row.end_at) : null,
        durationDays: Number(row?.duration_days),
      }))
      .filter((r) => r.aKey && r.bKey)
      .filter((r) => {
        if (!(r.start instanceof Date) || !(r.end instanceof Date)) return true;
        if (Number.isNaN(r.start.getTime()) || Number.isNaN(r.end.getTime())) return true;
        return r.start <= now && now <= r.end;
      })
      .filter((r) => {
        const duration = Number.isFinite(Number(r.durationDays))
          ? Number(r.durationDays)
          : (r.start && r.end ? Math.ceil((r.end.getTime() - r.start.getTime()) / 86400000) : null);
        return duration == null || duration >= BLOG_STRUCT_TSUKIJI_MIN_DAYS;
      });
  }

  const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];

  const rows = [];
  const seen = new Set();

  skyAll.forEach((row) => {
    const orbRaw = Number(row?.orb_deg);
    const orb = Number.isFinite(orbRaw) ? orbRaw : null;
    const aKey = normalizeBodyKey(row?.a || "");
    const bKey = normalizeBodyKey(row?.b || "");
    if (!aKey || !bKey) return;

    const sig = [aKey, bKey].sort().join("|");
    if (seen.has(sig)) return;
    seen.add(sig);

    const aspectDeg = Number(row?.aspect_deg);
    if (!Number.isFinite(aspectDeg)) return;

    const window = findTransitWindowAroundNow({
      kind: BLOG_PROXIMITY_CFG.kind,
      aKey,
      bKey,
      aspectDeg,
      asOfISO: asOfISO || new Date().toISOString(),
      maxDays: BLOG_PROXIMITY_CFG.windowDays,
      orbLimit: BLOG_PROXIMITY_CFG.orbLimit,
      requireSign: BLOG_PROXIMITY_CFG.requireSign,
      signOrder: BLOG_PROXIMITY_CFG.signOrder || BLOG_STRUCT_SIGN_ORDER,
    });
    if (!window?.start || !window?.end) return;
    const durationDays = Math.ceil((window.end.getTime() - window.start.getTime()) / 86400000);
    if (durationDays < BLOG_STRUCT_TSUKIJI_MIN_DAYS) return;
    if (!(window.start <= now && now <= window.end)) return;

    rows.push({
      aKey,
      bKey,
      aSignKey: row?.a_sign_key || "",
      bSignKey: row?.b_sign_key || "",
      aSignJa: row?.a_sign_ja || "",
      bSignJa: row?.b_sign_ja || "",
      aspect: normalizeAspectKey(row?.type || row?.aspect, aspectDeg),
      aspectDeg,
      orb,
      start: window.start,
      peak: window.peak,
      end: window.end,
      durationDays,
    });
  });

  rows.sort((a, b) => {
    const ao = Number.isFinite(Number(a.orb)) ? Number(a.orb) : 999;
    const bo = Number.isFinite(Number(b.orb)) ? Number(b.orb) : 999;
    return ao - bo;
  });
  let filtered = rows;
  if (BLOG_PROXIMITY_CFG.preferApplying === true) {
    const applyingRows = rows.filter((row) => {
      if (!row?.aKey || !row?.bKey || !Number.isFinite(Number(row?.aspectDeg))) return false;
      return isApplying({
        kind: BLOG_PROXIMITY_CFG.kind,
        aKey: row.aKey,
        bKey: row.bKey,
        aspectDeg: row.aspectDeg,
        asOfISO,
        horizonHours: BLOG_PROXIMITY_CFG.horizonHours,
        nowOrb: row.orb,
      }) === true;
    });
    if (applyingRows.length) {
      filtered = applyingRows;
    } else if (BLOG_PROXIMITY_CFG.fallbackOutsideOrb === false) {
      filtered = [];
    }
  }

  const maxItems = Number.isFinite(Number(BLOG_PROXIMITY_CFG.maxItems))
    ? Number(BLOG_PROXIMITY_CFG.maxItems)
    : BLOG_STRUCT_TSUKIJI_MAX;
  return filtered.slice(0, maxItems);
}

function buildKinjitsuRowsPublic(story) {
  const items = Array.isArray(story?.public?.kinjitsu_short)
    ? story.public.kinjitsu_short
    : (Array.isArray(story?.public?.kinjitsu) ? story.public.kinjitsu : []);
  return items
    .filter((it) => Number.isFinite(Number(it?.now_orb)))
    .sort((a, b) => Number(a.now_orb) - Number(b.now_orb))
    .slice(0, 5);
}

function buildElementLinesPublic(story) {
  const strata = story?.public?.sky_strata || {};
  const e = strata.element_count || {};
  const m = strata.modality_count || {};
  const elementLine = `🔥${e.fire || 0} 🪨${e.earth || 0} 💨${e.air || 0} 💧${e.water || 0}`;
  const modalityLine = `🏃${m.cardinal || 0} 🧱${m.fixed || 0} 🌿${m.mutable || 0}`;
  return { elementLine, modalityLine };
}

async function buildStructureLogHtml({ story, dateLocal, runWithRetry, modelParts, enableAi }) {
  const asOfISO = story?.meta?.as_of || new Date().toISOString();

  const sections = [];

  // Elements / modalities
  const { elementLine, modalityLine } = buildElementLinesPublic(story);
  sections.push("<h2>🔥 元素／三区分（T）</h2>");
  sections.push(`<p>${escapeHtml(elementLine)}</p>`);
  sections.push(`<p>${escapeHtml(modalityLine)}</p>`);
  if (enableAi) {
    const prompt = [
      BLOG_STRUCT_ELEMENT_GUIDE,
      "",
      `日付: ${dateLocal}`,
      `ELEMENTS: ${elementLine}`,
      `MODALITIES: ${modalityLine}`,
    ].join("\n");
    const comment = await runWithRetry({ userContent: prompt, model: modelParts, maxTokens: 160 });
    sections.push(`<p>${escapeHtml(comment)}</p>`);
  }

  // Tsukiji (long-term)
  const tsukijiRows = buildTsukijiRowsPublic(story, asOfISO);
  sections.push("<h2>🌙 つきじ（継続接近ログ）</h2>");
  sections.push("<p>長期的に続く接近の記録です。短期の「近日」とは別に、じわじわ効く接点を追います。</p>");
  if (!tsukijiRows.length) {
    sections.push("<p>該当なし</p>");
  } else {
    const retroMap = buildRetrogradeMap(asOfISO, Array.from(new Set(tsukijiRows.flatMap((r) => [r.aKey, r.bKey]))));
    tsukijiRows.forEach((row) => {
      const aLabel = `${bodyGlyph(row.aKey)}${bodyLabelJa(dict, row.aKey)}${retroMap[row.aKey] ? SPEC.retro.suffix : ""}`;
      const bLabel = `${bodyGlyph(row.bKey)}${bodyLabelJa(dict, row.bKey)}${retroMap[row.bKey] ? SPEC.retro.suffix : ""}`;
      const aSign = row.aSignJa || signLabelJa(dict, row.aSignKey);
      const bSign = row.bSignJa || signLabelJa(dict, row.bSignKey);
      const themeLine = buildTsukijiThemeLine(row.aKey, row.bKey);
      const orbText = Number.isFinite(Number(row.orb)) ? `現在 orb ${row.orb.toFixed(1)}°` : "";
      const startText = row.start ? formatDateYmd(row.start) : "-";
      const peakText = row.peak ? formatDateYmd(row.peak) : "-";
      const endText = row.end ? formatDateYmd(row.end) : "-";
      const durationText = Number.isFinite(Number(row.durationDays)) ? `継続：約${row.durationDays}日` : "";
      const line = [
        `(T) ${aLabel}（${aSign}）`,
        `× (T) ${bLabel}（${bSign}）`,
        themeLine,
        orbText,
        `開始 ${startText}`,
        `ピーク ${peakText}`,
        `終了予定 ${endText}`,
        durationText,
      ].filter(Boolean).join("<br>");
      sections.push(`<p>${escapeHtml(line).replace(/&lt;br&gt;/g, "<br>")}</p>`);
    });
  }

  // Kinjitsu
  const kinjitsuRows = buildKinjitsuRowsPublic(story);
  sections.push("<h2>📅 近日（接近予定）</h2>");
  if (!kinjitsuRows.length) {
    sections.push("<p>該当なし</p>");
  } else {
    kinjitsuRows.forEach((row) => {
      const aKey = normalizeBodyKey(row?.a || "");
      const bKey = normalizeBodyKey(row?.b || "");
      const aLabel = `${bodyGlyph(aKey)}${bodyLabelJa(dict, aKey)}`;
      const bLabel = `${bodyGlyph(bKey)}${bodyLabelJa(dict, bKey)}`;
      const aSign = row?.a_sign_ja || signLabelJa(dict, row?.a_sign_key);
      const bSign = row?.b_sign_ja || signLabelJa(dict, row?.b_sign_key);
      const aspectLabel = aspectLabelForLong(row?.aspect || row?.type, row?.aspect_deg);
      const degText = Number.isFinite(Number(row?.aspect_deg)) ? `${Math.round(row.aspect_deg)}°` : "";
      const orbText = Number.isFinite(Number(row?.now_orb)) ? `現在 orb ${Number(row.now_orb).toFixed(1)}°` : "";
      const startText = row?.start_at ? formatDateYmd(new Date(row.start_at)) : "-";
      const peakText = row?.peak_at ? formatDateYmdHm(new Date(row.peak_at)) : (row?.peak_label ? row.peak_label : "-");
      const endText = row?.end_at ? formatDateYmd(new Date(row.end_at)) : "-";
      const line = [
        `(T) ${aLabel}（${aSign}）`,
        `× (T) ${bLabel}（${bSign}）`,
        `${aspectLabel} ${degText}`.trim(),
        `開始 ${startText}`,
        `最接近 ${peakText}`,
        `終了予定 ${endText}`,
        orbText,
      ].filter(Boolean).join("<br>");
      sections.push(`<p>${escapeHtml(line).replace(/&lt;br&gt;/g, "<br>")}</p>`);
    });
  }

  return sections.join("\n");
}

function formatSignDegree(signKey, lonDeg) {
  const signJa = signLabelJa(dict, signKey) || signKey || "";
  if (!Number.isFinite(Number(lonDeg))) return signJa;
  const deg = ((Number(lonDeg) % 30) + 30) % 30;
  let degInt = Math.floor(deg + 1e-6);
  if (degInt >= 30) degInt = 29;
  return `${signJa} ${degInt}°`.trim();
}

function aspectLabelForLong(aspectKey, aspectDeg) {
  const key = normalizeAspectKey(aspectKey, aspectDeg);
  const meta = formatAspectDisplay({
    dict,
    rawType: aspectKey,
    aspectDeg,
  });
  return meta?.label || key || String(aspectKey || "");
}

async function generateLongV2({ story, dateLocal, runWithRetry, modelMain, modelParts }) {
  const pub = story?.public || {};
  const asOfISO = story?.meta?.as_of || new Date().toISOString();
  const dateLabel = String(dateLocal || "")
    .trim()
    .replace(/-/g, ".") || formatDateYmd(new Date(asOfISO));

  const retroMap = buildRetrogradeMap(asOfISO, BLOG_STRUCT_BODY_ORDER);
  const retroBodies = BLOG_STRUCT_BODY_ORDER.filter((k) => retroMap[k]);

  const ascDeg = computeTokyoAscDeg(asOfISO);
  const ascIndex = Number.isFinite(Number(ascDeg))
    ? Math.floor((((Number(ascDeg) % 360) + 360) % 360) / 30)
    : null;
  const bodyHouseMap = new Map();

  const strata = pub.sky_strata || {};
  const e = strata.element_count || {};
  const m = strata.modality_count || {};
  const elementLine = `🔥${e.fire || 0} 🪨${e.earth || 0} 💨${e.air || 0} 💧${e.water || 0}`;
  const modalityLine = `🏃${m.cardinal || 0} 🧱${m.fixed || 0} 🌿${m.mutable || 0}`;

  const skyAll = Array.isArray(pub.sky_all) ? [...pub.sky_all] : [];
  skyAll.sort((a, b) => (a?.orb_deg ?? 99) - (b?.orb_deg ?? 99));
  const resonanceAll = skyAll
    .filter((row) => Number(row?.orb_deg) <= (SPEC?.orb?.paid ?? 3.0))
    .filter((row) => !isResonanceBodyExcluded(row));
  const resonancePool = [...resonanceAll];
  const strongest = resonancePool[0] || skyAll[0] || null;
  const resonanceTop = resonancePool
    .map((row) => {
      const aKey = normalizeBodyKey(row?.a || "");
      const bKey = normalizeBodyKey(row?.b || "");
      const aspectDeg = Number(row?.aspect_deg);
      const orb = Number(row?.orb_deg);
      const trend = trendLabelJa({
        kind: BLOG_PROXIMITY_CFG.kind,
        aKey,
        bKey,
        aspectDeg,
        asOfISO,
        horizonHours: BLOG_PROXIMITY_CFG.horizonHours,
      });
      const applying = trend === "接近中";
      const exact = Number.isFinite(orb) && orb <= 0.05;
      return { ...row, _orb: orb, _applying: applying, _exact: exact };
    })
    .sort((a, b) => {
      if (a._exact !== b._exact) return a._exact ? -1 : 1;
      if (a._applying !== b._applying) return a._applying ? -1 : 1;
      return (a._orb ?? 99) - (b._orb ?? 99);
    })
    .slice(0, 1);

  const { rows: houseRows } = buildHouseRowsPublic(story, asOfISO);
  const topHouses = houseRows.filter((r) => r.score > 0).slice(0, 3).map((r) => `第${r.houseNo}ハウス`);

  const retroList = retroBodies.length
    ? retroBodies.map((k) => `${bodyGlyph(k)} ${bodyLabelJa(dict, k)}`.trim()).join(" / ")
    : "なし";

  const overviewFacts = [
    `${elementLine}`,
    `${modalityLine}`,
    `逆行: ${retroList}`,
    strongest
      ? `強い角度: ${aspectLabelForLong(strongest.type, strongest.aspect_deg)} ${Math.round(strongest.aspect_deg)}°`
      : "強い角度: —",
  ];

  const overviewPrompt = [
    BLOG_LONG_OVERVIEW_GUIDE,
    "",
    `日付: ${dateLabel}`,
    `FACTS: ${overviewFacts.join(" / ")}`,
  ].join("\n");

  const overviewText = await runWithRetry({ userContent: overviewPrompt, model: modelMain, maxTokens: 500 });

  const lines = [];
  lines.push("<h1>🌌 きょうのそら</h1>");
  lines.push("<h2>0｜今日の全体圧</h2>");
  pushParagraphs(lines, overviewText);

  // 1) Positions
  lines.push("<h2>1｜配置</h2>");
  const transit = pub.transit_signs || {};
  for (const key of BLOG_STRUCT_BODY_ORDER) {
    const info = transit?.[key];
    if (!info) continue;
    const signKey = normalizeSignKey(info.sign_key || "");
    const signIndex = signIndexFromKey(dict, signKey || "");
    if (signIndex >= 0 && ascIndex != null) {
      const houseNo = houseNumberForSignIndex(signIndex, ascIndex);
      if (houseNo) bodyHouseMap.set(key, houseNo);
    }
    const glyph = bodyGlyph(key);
    const bodyLabel = bodyLabelJa(dict, key);
    const retroSuffix = retroMap[key] ? "（R）" : "";
    const houseNo = bodyHouseMap.get(key);
    const houseText = houseNo ? `第${houseNo}ハウス` : "第—ハウス";
    const title = `${glyph ? `${glyph} ` : ""}${bodyLabel}${retroSuffix}｜${formatSignDegree(signKey, info.lon_deg)}｜${houseText}`.trim();
    const retro = retroMap[key] ? "あり" : "なし";
    const facts = [
      `逆行: ${retro}`,
      `位置: ${signLabelJa(dict, signKey)} ${Number.isFinite(Number(info.lon_deg)) ? ((info.lon_deg % 30 + 30) % 30).toFixed(0) : "—"}°`,
      houseNo ? `所属ハウス: 第${houseNo}ハウス` : "所属ハウス: —",
    ];
    const prompt = [
      BLOG_LONG_POSITION_GUIDE,
      "",
      `日付: ${dateLabel}`,
      `TITLE: ${title}`,
      `FACTS: ${facts.join(" / ")}`,
    ].join("\n");
    const text = await runWithRetry({ userContent: prompt, model: modelParts, maxTokens: 420 });
    lines.push(`<h3>${escapeHtml(title)}</h3>`);
    pushParagraphs(lines, text);
  }

  // 2) Resonance
  lines.push("<h2>2｜共鳴</h2>");
  if (!resonanceTop.length) {
    lines.push("<p>該当なし</p>");
  }
  for (const row of resonanceTop) {
    const aKey = normalizeBodyKey(row?.a || "");
    const bKey = normalizeBodyKey(row?.b || "");
    const aLabel = `${bodyGlyph(aKey)} ${bodyLabelJa(dict, aKey)}`.trim();
    const bLabel = `${bodyGlyph(bKey)} ${bodyLabelJa(dict, bKey)}`.trim();
    const aSign = row?.a_sign_ja || signLabelJa(dict, row?.a_sign_key);
    const bSign = row?.b_sign_ja || signLabelJa(dict, row?.b_sign_key);
    const aspectDeg = Number(row?.aspect_deg);
    const aspLabel = aspectLabelForLong(row?.type, aspectDeg);
    const orb = Number(row?.orb_deg);
    const trend = trendLabelJa({
      kind: BLOG_PROXIMITY_CFG.kind,
      aKey,
      bKey,
      aspectDeg,
      asOfISO,
      horizonHours: BLOG_PROXIMITY_CFG.horizonHours,
    });
    const title = `(T) ${aLabel}（${aSign}） × (T) ${bLabel}（${bSign}）`;
    const facts = [
      `角度: ${aspLabel} ${Math.round(aspectDeg)}°`,
      `orb: ${Number.isFinite(orb) ? orb.toFixed(1) : "—"}°`,
      `状態: ${trend || "—"}`,
    ];
    const prompt = [
      BLOG_LONG_RESONANCE_GUIDE,
      "",
      `日付: ${dateLabel}`,
      `TITLE: ${title}`,
      `FACTS: ${facts.join(" / ")}`,
    ].join("\n");
    const text = await runWithRetry({ userContent: prompt, model: modelParts, maxTokens: 220 });
    lines.push(`<h3>${escapeHtml(title)}</h3>`);
    pushParagraphs(lines, text);
  }

  // 3) Houses
  lines.push("<h2>3｜🏠 はうす</h2>");
  lines.push("<h3>■ ログ</h3>");
  const houseLogRows = houseRows.filter((row) => Number(row.score || 0) > 0);
  if (!houseLogRows.length) {
    lines.push("<p>集中は観測されていない</p>");
  } else {
    houseLogRows.forEach((row) => {
      lines.push(`<p>${escapeHtml(formatHouseLogLine(row))}</p>`);
    });
  }

  const detailHouseRows = houseRows.filter((row) => row.score > 0).slice(0, 3);
  for (const row of detailHouseRows) {
    const logLine = formatHouseLogLine(row);
    const title = logLine;
    const facts = [
      `支配: ${row.signGlyph || ""}${row.signJa || ""}`.trim(),
      `天体: ${row.items.length ? row.items.join(" ") : "—"}`,
      `score: ${Number(row.score || 0).toFixed(2)}`,
    ];
    const signElement = dict?.SIGNS_V2?.signs?.[row.signKey]?.element || "";
    const temp = (signElement === "fire" || signElement === "air") ? "外向" : (signElement ? "内向" : "—");
    facts.push(`圧の温度: ${temp}`);
    const prompt = [
      BLOG_LONG_HOUSE_GUIDE,
      "",
      `日付: ${dateLabel}`,
      `TITLE: ${title}`,
      `FACTS: ${facts.join(" / ")}`,
    ].join("\n");
    const text = await runWithRetry({ userContent: prompt, model: modelParts, maxTokens: 200 });
    lines.push(`<h3>${escapeHtml(title)}</h3>`);
    pushParagraphs(lines, text);
  }

  // 4) Elements
  lines.push("<h2>4｜🔥 元素／三区分</h2>");
  lines.push(`<p>${escapeHtml(elementLine)}</p>`);
  lines.push(`<p>${escapeHtml(modalityLine)}</p>`);
  const elementsPrompt = [
    BLOG_LONG_ELEMENTS_GUIDE,
    "",
    `日付: ${dateLabel}`,
    `FACTS: ${elementLine} / ${modalityLine}`,
  ].join("\n");
  const elementsText = await runWithRetry({ userContent: elementsPrompt, model: modelMain, maxTokens: 700 });
  pushParagraphs(lines, elementsText);

  // 6) Kinjitsu log (lightweight)
  lines.push("<h2>6｜📅 近日</h2>");
  const kinjitsuRows = buildKinjitsuRowsPublic(story).slice(0, 3);
  if (!kinjitsuRows.length) {
    lines.push("<p>該当なし</p>");
  } else {
    const kinjitsuRetro = buildRetrogradeMap(asOfISO, Array.from(new Set(kinjitsuRows.flatMap((r) => [
      normalizeBodyKey(r?.a || ""),
      normalizeBodyKey(r?.b || ""),
    ]).filter(Boolean))));
    for (const row of kinjitsuRows) {
      const aKey = normalizeBodyKey(row?.a || "");
      const bKey = normalizeBodyKey(row?.b || "");
      const aLabel = `${bodyGlyph(aKey)} ${bodyLabelJa(dict, aKey)}${kinjitsuRetro[aKey] ? "（R）" : ""}`.trim();
      const bLabel = `${bodyGlyph(bKey)} ${bodyLabelJa(dict, bKey)}${kinjitsuRetro[bKey] ? "（R）" : ""}`.trim();
      const aspLabel = aspectLabelForLong(row?.aspect, row?.aspect_deg);
      const degText = `${Math.round(row?.aspect_deg)}°`;
      const orbText = Number.isFinite(Number(row?.now_orb)) ? `${Number(row.now_orb).toFixed(1)}°` : "—";
      const peakText = row?.peak_at ? formatDateYmdHm(new Date(row.peak_at)) : (row?.peak_label ? row.peak_label : "-");

      const afterPrompt = [
        "以下のFACTSから「余韻」を1行で書く。",
        "出力は日本語本文のみ（HTMLなし）。",
        "20〜45字。1文のみ。",
        "占い化しない。未来断定/指示/救済/運命固定/絶対語は禁止。",
        "主語は構造（配置/角度/圧/残り方）。",
        `FACTS: ${aLabel} × ${bLabel} / ${aspLabel} ${degText} / 現在 orb ${orbText}`,
      ].join("\n");
      const afterTextRaw = await runWithRetry({ userContent: afterPrompt, model: modelParts, maxTokens: 90 });
      const afterText = String(afterTextRaw || "").split(/\r?\n/)[0].trim();

      const line = [
        `★ ${aLabel} × ${bLabel}`,
        `${aspLabel} ${degText}`.trim(),
        `最接近 ${peakText}`,
        `現在 orb ${orbText}`,
        `余韻 ${afterText}`.trim(),
      ].filter(Boolean).join("<br>");
      lines.push(`<p>${escapeHtml(line).replace(/&lt;br&gt;/g, "<br>")}</p>`);
    }
  }

  const todayMoon = formatTodayMoonLines({ asOfISO, story, dict });
  todayMoon.lines.forEach((line) => lines.push(`<p>${escapeHtml(line)}</p>`));

  const nextMoon = formatNextMoonLines({ asOfISO, dict });
  nextMoon.items.forEach((item) => {
    const block = item.lines.join("<br>");
    lines.push(`<p>${escapeHtml(block).replace(/&lt;br&gt;/g, "<br>")}</p>`);
  });

  const nextSoon = nextMoon.items?.[0];

  if (nextSoon?.line) {
    const moonAfterPrompt = [
      "以下のFACTSから「余韻」を1行で書く。",
      "出力は日本語本文のみ（HTMLなし）。",
      "15〜35字。1文のみ。",
      "占い化しない。未来断定/指示/救済/運命固定/絶対語は禁止。",
      "主語は構造（配置/角度/圧/残り方）。",
      `FACTS: ${nextSoon.line}`,
    ].join("\n");
    const moonAfterRaw = await runWithRetry({ userContent: moonAfterPrompt, model: modelParts, maxTokens: 70 });
    const moonAfter = String(moonAfterRaw || "").split(/\r?\n/)[0].trim();
    lines.push(`<p>${escapeHtml(moonAfter)}</p>`);
  }

  return lines.join("\n");
}

module.exports = {
  generateDailyDraft,
  buildDailyTitle,
  buildDailyEyecatchLines,
  buildAioseoMeta,
  markdownToHtml,
  escapeHtml,
};
