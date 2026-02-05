"use strict";

/**
 * channels/line_today.js (Unified / deps-safe) — FIXED SSOT
 * - LINE「今日のソラのこえ」(personal優先 / 無ければpublic)
 *
 * ✅ FIX方針
 * - personal は formatPersonalTPLine を最優先（無ければ Block）
 * - public fallback は formatPublicSkyLine を最優先（無ければ Block）
 * - どれも無い場合は buildNoContactLine へフォールバック
 * - fusion は “あれば追記” のみ（本文のフォーマットは壊さない）
 *
 * deps:
 * - tpKey, getSkyLayers
 * - pickCenterPublicContact, pickSecretPublicContact
 * - buildNoContactLine
 * - buildYoinLine
 * - buildNowModernPlanetCounts, buildPersonalTPCounts, buildDistLinesFromcounts
 * - formatPersonalTPLine / formatPersonalTPBlock
 * - formatPublicSkyLine / formatPublicSkyBlock
 * - buildFusionSentence（任意）
 * - publicSignKey（任意 / sky fusion用）
 * - RENDER_COPY
 *
 * NOTE:
 * - format* は (story, item, prefix, deps) で呼ぶ（deps渡し必須）
 */

function clampYoin2(s) {
  const lines = String(s || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const maxLines = 4;
  const out = lines.slice(0, maxLines);

  if (out.length) {
    const lastIdx = out.length - 1;
    if (out[lastIdx].length > 60) {
      const m = out[lastIdx].match(/^(.{1,80}?。)/);
      if (m) out[lastIdx] = m[1];
    }
  }

  return out.filter(Boolean).join("\n");
}


function safeStr(x) {
  return String(x ?? "");
}


function buildLineMainFallback({ dateLabel, parts, distLines, kusouYoin, footerLines, cta }) {
  const lines = [];
  lines.push(`🌌 今日のソラのこえ。｜${dateLabel}`);
  lines.push("");
  lines.push(parts || "");
  if (distLines) {
    lines.push("");
    lines.push(distLines);
  }
  if (kusouYoin) {
    lines.push("");
    lines.push(kusouYoin);
  }
  if (footerLines) {
    lines.push("");
    lines.push(footerLines);
  }
  if (cta) {
    lines.push("");
    lines.push(cta);
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* =========================
 * deps resolver (揺れ吸収)
 * ========================= */
function pickDep(deps, ...paths) {
  for (const p of paths) {
    const seg = p.split(".");
    let cur = deps;
    for (const s of seg) {
      cur = cur?.[s];
      if (!cur) break;
    }
    if (cur) return cur;
  }
  return null;
}

function resolveFormatters(deps) {
  return {
    // personal（TP）
    fmtPersonalTPLine:
      pickDep(deps, "fmt.formatPersonalTPLine") ||
      pickDep(deps, "formatPersonalTPLine") ||
      null,
    fmtPersonalTPBlock:
      pickDep(deps, "fmt.formatPersonalTPBlock") ||
      pickDep(deps, "formatPersonalTPBlock") ||
      null,

    // public（sky）
    fmtPublicSkyLine:
      pickDep(deps, "fmt.formatPublicSkyLine") ||
      pickDep(deps, "formatPublicSkyLine") ||
      null,
    fmtPublicSkyBlock:
      pickDep(deps, "fmt.formatPublicSkyBlock") ||
      pickDep(deps, "formatPublicSkyBlock") ||
      null,
  };
}

/**
 * FNV-1a 32bit hash (stable)
 */
function hash32(input) {
  const s = safeStr(input);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function _pickMany(pool, seed, count = 1) {
  const arr = (Array.isArray(pool) ? pool.filter(Boolean) : []).slice();
  if (!arr.length || count <= 0) return [];
  const out = [];
  for (let i = 0; i < count; i++) {
    if (!arr.length) break;
    const idx = hash32(`${seed}|${i}`) % arr.length;
    out.push(arr.splice(idx, 1)[0]);
  }
  return out;
}

function _lowerKey(x) {
  return safeStr(x).toLowerCase().trim();
}

function _getSignFlavor(dict, signKey, planetKey) {
  const sf = dict?.SIGN_FLAVOR_V1 || dict?.sign_flavor || null;
  const sKey = _lowerKey(signKey);
  const pKey = _lowerKey(planetKey);
  const sign = sf?.signs?.[sKey] || null;
  const by = sign?.by_body?.[pKey] || null;
  return { sf, sign, by };
}

function _getSoarStyle(dict) {
  return dict?.SOAR_STYLE_V1 || require("../../dict/soar_style.v1").SOAR_STYLE_V1;
}

function _pickOne(pool, seed) {
  const arr = Array.isArray(pool) ? pool.filter(Boolean) : [];
  if (!arr.length) return "";
  return _pickMany(arr, `${seed}|one`, 1)[0];
}

function _subjectFromStyle(style, planetKey, seed, avoidTokens = []) {
  const k = _lowerKey(planetKey);
  if (k === "neptune") {
    const pool = ["感覚", "体感", "余韻", "直感", "気配"];
    const filtered = pool.filter((s) => {
      const t = String(s || "");
      return !avoidTokens.some((a) => a && t.includes(a));
    });
    return _pickOne(filtered.length ? filtered : pool, `${seed}|subj|${k}`) || "感覚";
  }
  const pool = style?.personal_subjects?.[k] || style?.planets?.[k]?.subjects || [];
  const filtered = pool.filter((s) => {
    const t = String(s || "");
    return !avoidTokens.some((a) => a && t.includes(a));
  });
  return _pickOne(filtered.length ? filtered : pool, `${seed}|subj|${k}`) || "心";
}

function _avoidTokensFromModifier(modifier) {
  const s = String(modifier || "");
  const tokens = [];
  const roots = [
    ["価値", ["価値観", "価値"]],
    ["基準", ["基準", "起点"]],
    ["安心", ["安心", "安心の置きどころ"]],
    ["印象", ["印象", "第一印象"]],
    ["距離", ["距離感", "距離"]],
    ["反応", ["反応"]],
    ["感覚", ["感覚", "体感"]],
    ["意志", ["意志", "意識"]],
    ["言葉", ["言葉", "伝え方"]],
    ["思考", ["思考", "考え"]],
    ["境界", ["境界", "輪郭"]],
    ["中心", ["中心", "核", "起点"]],
  ];
  roots.forEach(([k, list]) => {
    if (s.includes(k)) list.forEach((t) => tokens.push(t));
  });
  return Array.from(new Set(tokens.filter(Boolean)));
}

function _modeFromStyle(style, planetKey, seed, avoidTokens = []) {
  const k = _lowerKey(planetKey);
  const pool = style?.personal_modes?.[k] || style?.planets?.[k]?.modes || [];
  const filtered = pool.filter((s) => {
    const t = String(s || "");
    return !avoidTokens.some((a) => a && t.includes(a));
  });
  return _pickOne(filtered.length ? filtered : pool, `${seed}|mode|${k}`) || "反応";
}

function _stateFromStyle(style, aspectKey, depth, seed) {
  const key = _normAspectKey(aspectKey);
  const pool =
    style?.state_by_aspect?.[key]?.[depth] ||
    style?.state_by_aspect?.[key]?.light ||
    style?.states?.[depth] ||
    style?.states?.light ||
    [];
  return _pickOne(pool, `${seed}|state|${key}|${depth}`) || "揺れやすい";
}

function _stateFromStyleDistinct(style, aspectKey, depth, seed, avoid = []) {
  const key = _normAspectKey(aspectKey);
  const toneKey = _aspectToneCategory(aspectKey);
  const basePool =
    style?.state_by_aspect?.[key]?.[depth] ||
    style?.state_by_aspect?.[key]?.light ||
    style?.state_by_tone?.[toneKey] ||
    style?.states?.[depth] ||
    style?.states?.light ||
    [];
  const filtered = basePool.filter((s) => {
    const t = String(s || "");
    return !avoid.some((a) => a && t.includes(a));
  });
  let pool = filtered;
  if (!pool.length && avoid.length) {
    const altPool = [
      ...(style?.state_by_tone?.[toneKey] || []),
      ...(style?.states?.[depth] || []),
      ...(style?.states?.light || []),
    ].filter((s) => {
      const t = String(s || "");
      return !avoid.some((a) => a && t.includes(a));
    });
    pool = altPool;
  }
  const pick = _pickOne(pool.length ? pool : basePool, `${seed}|state|${key}|${depth}`) || "揺れやすい";
  return pick;
}

function _stateAvoidFromTension(tensionText) {
  const t = String(tensionText || "");
  const avoid = [];
  if (!t) return avoid;
  ["折り合い", "微調整", "調整", "調整点", "揺れ", "張り", "引っかかり"].forEach((w) => {
    if (t.includes(w)) avoid.push(w);
  });
  return avoid;
}

function _shortStateFromTone(style, aspectKey, seed, avoid = []) {
  const toneKey = _aspectToneCategory(aspectKey);
  const pool = style?.state_short_by_tone?.[toneKey] || [];
  const filtered = pool.filter((s) => {
    const t = String(s || "");
    return !avoid.some((a) => a && t.includes(a));
  });
  return _pickOne(filtered.length ? filtered : pool, `${seed}|short|${toneKey}`) || "";
}

function _dedupeModePrefix(mode, subject) {
  const m = String(mode || "").trim();
  const s = String(subject || "").trim();
  if (!m) return "";
  if (s && (m === s || s.includes(m) || m.includes(s))) return "";
  return `${m}として、`;
}

function _fillDynamicSlots(text, dict, seed, aspectKey) {
  const s = String(text || "");
  if (!s || (!s.includes("{drive}") && !s.includes("{dyn}"))) return s;
  const sf = dict?.SIGN_FLAVOR_V1 || dict?.sign_flavor || null;
  const dynamics = sf?.grammar?.dynamics || {};
  const dynByAspect = sf?.grammar?.dynamics_by_aspect || {};
  const toneKey = _aspectToneCategory(aspectKey);
  const drivePool = dynamics.drive || [];
  const dynPool =
    (Array.isArray(dynByAspect?.[toneKey]) && dynByAspect[toneKey].length)
      ? dynByAspect[toneKey]
      : (dynamics.dyn || []);
  const drive = _pickOne(drivePool, `${seed}|drive|${aspectKey}`) || "";
  const dyn = _pickOne(dynPool, `${seed}|dyn|${aspectKey}`) || "";
  return s.replace(/\{drive\}/g, drive).replace(/\{dyn\}/g, dyn).trim();
}

function _toDotDate(s) {
  return String(s || "").replace(/-/g, ".");
}

function renderSoraUraSilentPersonalLine(story, deps = {}) {
  const { fmt } = deps || {};
  const { formatPersonalTPLine } =
    (fmt && (fmt.formatPersonalTPLine || fmt.formatPersonalTPLine)) || {};

  const dateLabel = _toDotDate(story?.meta?.date_local);
  const list = Array.isArray(story?.personal?.touch_points_all) ? story.personal.touch_points_all : [];

  const filtered = list
    .filter((tp) => {
      const a = String(tp?.natal_body_or_point || "").toLowerCase();
      const b = String(tp?.transit_body || "").toLowerCase();
      return a === "chiron" || b === "chiron" || a === "lilith" || b === "lilith";
    })
    .sort((a, b) => Number(a?.orb_deg ?? 99) - Number(b?.orb_deg ?? 99))
    .slice(0, 5);

  if (!filtered.length) {
    return `🌒 沈黙のほし｜${dateLabel}\n今日は沈黙。`;
  }

  const lines = filtered.map((tp) => {
    const header = typeof formatPersonalTPLine === "function"
      ? formatPersonalTPLine(story, tp, "・", deps)
      : "";
    const flavor = buildFlavorBlockPersonal({ story, item: tp, deps });
    return [header, flavor].filter(Boolean).join("\n");
  }).join("\n\n");

  return [`🌒 沈黙のほし｜${dateLabel}`, lines].join("\n").trim();
}
function _uniq(arr) {
  const seen = new Set();
  const out = [];
  (arr || []).forEach((v) => {
    const s = String(v || "");
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  });
  return out;
}

function _aspectToneCategory(aspectKey) {
  const k = _normAspectKey(aspectKey);
  if (k.includes("quincunx") || k.includes("semi_square") || k.includes("sesqui_square") || k.includes("semi_sextile")) return "adjust";
  if (k.includes("square") || k.includes("opposition")) return "tense";
  if (k.includes("trine") || k.includes("sextile")) return "smooth";
  if (k.includes("conjunction")) return "blend";
  if (k.includes("quintile") || k.includes("biquintile")) return "craft";
  return "adjust";
}

function _aspectKeywordProfile(aspectKey) {
  const k = _normAspectKey(aspectKey);
  if (["square", "opposition"].includes(k)) return { a: 2, b: 3, tone: 2 };
  if (["trine", "sextile"].includes(k)) return { a: 3, b: 2, tone: 1 };
  if (["conjunction"].includes(k)) return { a: 2, b: 2, tone: 2 };
  if (["quintile_72", "biquintile_144"].includes(k)) return { a: 3, b: 1, tone: 2 };
  if (["quincunx_150", "semi_square_45", "sesqui_square_135", "semi_sextile_30"].includes(k)) return { a: 2, b: 2, tone: 2 };
  return { a: 2, b: 2, tone: 1 };
}

function _pickAspectToneWords(dict, aspectKey, seed, count = 1) {
  const sf = dict?.SIGN_FLAVOR_V1 || dict?.sign_flavor || null;
  const pool = sf?.grammar?.aspect_tone?.[_aspectToneCategory(aspectKey)] || [];
  return _pickMany(pool, `${seed}|tone|${aspectKey}`, count);
}

function _signModifierFromStyle(style, signKey, planetKey, seed, dict) {
  const k = _lowerKey(planetKey);
  const template = style?.planets?.[k]?.modifier_template || "に寄りやすい";
  const keywords = style?.signs?.[_lowerKey(signKey)]?.keywords || [];
  const picked = _pickMany(keywords, `${seed}|kw|${k}|${signKey}`, 2);
  const signLabel =
    dict?.SIGNS_V2?.signs?.[_lowerKey(signKey)]?.label_ja ||
    dict?.SIGNS_V1?.signs?.[_lowerKey(signKey)]?.label_ja ||
    signKey;
  const keyPhrase = picked.length ? picked.join("・") : signLabel;
  return template.includes("{sign}")
    ? template.replace("{sign}", keyPhrase)
    : `${keyPhrase}${template}`;
}

function _normalizeKw(word) {
  const w = String(word || "").trim();
  if (!w) return "";
  // 動詞ぽい語尾は名詞化して違和感を減らす
  if (/[くぐすむぶぬるつう]$/.test(w) && !/こと$/.test(w)) return `${w}こと`;
  // 形容詞は名詞化（例: 熱い→熱さ）
  if (w === "いい") return "良さ";
  if (/[い]$/.test(w) && !/さ$/.test(w)) return `${w.slice(0, -1)}さ`;
  return w;
}

function _smoothTension(text) {
  let t = String(text || "");
  if (!t) return t;
  t = t.replace(/への(衝動|迷い|ためらい|反発|引き|勢い|揺らぎ|決めきれなさ)/g, "");
  t = t.replace(/への気持ち/g, "");
  t = t.replace(/の(差|ズレ|間|余白|行き来|境目|切り替わり|揺れ幅|摩擦感|張り|圧|衝突点|引っかかり|尖り|流れ|和らぎ|馴染み|広がり|整い|滑らかさ|重なり|濃度|一体化|混ざり|結合|強調|調整|微差|補正|試行|磨き|工夫|探り|再設計|組み替え)/g, "のあいだ");
  t = t.replace(/と([^。]+)で/g, "のあいだで");
  t = t.replace(/で(詰まり|滞り)/g, "のあいだで$1");
  if (t.includes("や") && !/あいだ/.test(t)) {
    t = t.replace(/(.+?)や(.+?)$/g, "$1と$2のあいだ");
  }
  t = t.replace(/と、/g, "と");
  t = t.replace(/熱いさや/g, "熱さや");
  t = t.replace(/熱いや/g, "熱さや");
  t = t.replace(/熱いさ/g, "熱さ");
  t = t.replace(/熱い/g, "熱さ");
  // 「熱さや張りに揺れやすい」→「熱さと張りのあいだで揺れやすい」
  t = t.replace(/熱さや張りに揺れやすい/g, "熱さと張りのあいだで揺れやすい");
  t = t.replace(/引っかかりで/g, "引っかかりのあいだで");
  t = t.replace(/硬い/g, "硬さ");
  t = t.replace(/鋭い/g, "鋭さ");
  t = t.replace(/重い/g, "重さ");
  t = t.replace(/\s+/g, " ").trim();
  return t.trim();
}

function _fixDupPhrases(s) {
  let t = String(s || "");
  t = t.replace(/調整が微調整が/g, "調整が");
  t = t.replace(/微調整が調整が/g, "微調整が");
  t = t.replace(/折り合いで折り合いが/g, "折り合いが");
  t = t.replace(/が小さな引っかかりが/g, "に小さな引っかかりが");
  t = t.replace(/が調整点が/g, "に調整点が");
  t = t.replace(/印象が印象/g, "印象");
  t = t.replace(/価値観が価値観/g, "価値観");
  t = t.replace(/距離感が距離感/g, "距離感");
  t = t.replace(/反応が反応/g, "反応");
  t = t.replace(/感覚が感覚/g, "感覚");
  t = t.replace(/言葉が言葉/g, "言葉");
  t = t.replace(/揺れが出やすい。?揺れが出やすい。?/g, "揺れが出やすい。");
  return t;
}

function _kwToBetween(kwPhrase) {
  const s = String(kwPhrase || "").trim();
  if (!s) return "";
  const m = s.match(/^(.+?)や(.+)$/);
  if (m) return `${m[1]}と${m[2]}のあいだで`;
  return `${s}に`;
}

function _getRole(dict, signKey, planetKey) {
  const { by } = _getSignFlavor(dict, signKey, planetKey);
  const role = by?.role || by?.core || "";
  if (role) return role;
  const pointKey = _lowerKey(planetKey);
  const point = dict?.POINTS_V1?.points?.[pointKey] || null;
  if (point?.core) return String(point.core).replace(/・/g, "と");
  const p = dict?.PLANETS_V2?.bodies?.[_lowerKey(planetKey)] || null;
  return p?.role || p?.core || "";
}

function _getFallbackKeywords(dict, signKey, planetKey) {
  const sKey = _lowerKey(signKey);
  const pKey = _lowerKey(planetKey);
  const sign = dict?.SIGNS_V2?.signs?.[sKey] || null;
  const planet = dict?.PLANETS_V2?.bodies?.[pKey] || null;
  const pool = [
    ...(Array.isArray(planet?.action_noun_ja) ? planet.action_noun_ja : []),
    ...(Array.isArray(sign?.texture) ? sign.texture : []),
    ...(Array.isArray(sign?.keywords) ? sign.keywords : []),
  ].filter(Boolean);
  return pool;
}

function _dedupeRelation(relation, dynamics) {
  if (!relation || !dynamics) return relation || "";
  const roots = ["噛み合", "重な", "交差", "摩擦", "循環", "映し", "向かい", "鏡"];
  for (const r of roots) {
    if (relation.includes(r) && dynamics.includes(r)) return "";
  }
  return relation;
}

function _cleanClause(s) {
  return safeStr(s)
    .replace(/^[、\s]+/g, "")
    .replace(/^が\s*/g, "")
    .replace(/[、\s]+$/g, "")
    .replace(/。+$/g, "")
    .trim();
}

function _subjectify(core) {
  const c = _cleanClause(core);
  if (!c) return "";
  return c;
}

function _normAspectKey(raw) {
  const x = String(raw || "").toLowerCase().trim();
  if (!x) return "";
  const numStr = x.replace(/[^\d.]/g, "");
  if (numStr && /^\d+(\.\d+)?$/.test(numStr)) {
    const deg = Math.round(Number(numStr));
    const mapDeg = {
      0: "conjunction",
      30: "semi_sextile_30",
      36: "decile_36",
      40: "novile_40",
      45: "semi_square_45",
      60: "sextile",
      72: "quintile_72",
      80: "binovile_80",
      90: "square",
      108: "tridecile_108",
      120: "trine",
      135: "sesqui_square_135",
      144: "biquintile_144",
      150: "quincunx_150",
      160: "quadranovile_160",
      180: "opposition",
    };
    if (mapDeg[deg]) return mapDeg[deg];
  }
  if (x.startsWith("opposition")) return "opposition";
  if (x.startsWith("square")) return "square";
  if (x.startsWith("trine")) return "trine";
  if (x.startsWith("sextile")) return "sextile";
  if (x.startsWith("conjunction")) return "conjunction";
  if (x.startsWith("quincunx")) return "quincunx_150";
  if (x.startsWith("inconjunct")) return "quincunx_150";
  if (x.startsWith("quintile")) return "quintile_72";
  if (x.startsWith("biquintile")) return "biquintile_144";
  if (x.startsWith("semi_square")) return "semi_square_45";
  if (x.startsWith("semisquare")) return "semi_square_45";
  if (x.startsWith("sesqui_square")) return "sesqui_square_135";
  if (x.startsWith("sesquisquare")) return "sesqui_square_135";
  if (x.startsWith("semi_sextile")) return "semi_sextile_30";
  if (x.startsWith("semisextile")) return "semi_sextile_30";
  if (x.includes("スクエア")) return "square";
  if (x.includes("オポジション")) return "opposition";
  if (x.includes("トライン")) return "trine";
  if (x.includes("セクスタイル")) return "sextile";
  if (x.includes("コンジャンクション")) return "conjunction";
  if (x.includes("インコンジャンクト")) return "quincunx_150";
  if (x.includes("クインタイル")) return "quintile_72";
  if (x.includes("バイクインタイル")) return "biquintile_144";
  if (x.includes("セスキスクエア")) return "sesqui_square_135";
  if (x.includes("セミスクエア")) return "semi_square_45";
  if (x.includes("セミセクスタイル")) return "semi_sextile_30";
  const map = {
    "スクエア": "square",
    "オポジション": "opposition",
    "トライン": "trine",
    "セクスタイル": "sextile",
    "コンジャンクション": "conjunction",
    "インコンジャンクト": "quincunx_150",
    "クインタイル": "quintile_72",
    "バイクインタイル": "biquintile_144",
    "セミスクエア": "semi_square_45",
    "セスキスクエア": "sesqui_square_135",
    "セミセクスタイル": "semi_sextile_30",
    semisquare: "semi_square_45",
    semi_square: "semi_square_45",
    sesquisquare: "sesqui_square_135",
    sesqui_square: "sesqui_square_135",
    semisextile: "semi_sextile_30",
    semi_sextile: "semi_sextile_30",
    quincunx: "quincunx_150",
    inconjunct: "quincunx_150",
    quintile: "quintile_72",
    biquintile: "biquintile_144",
  };
  return map[x] || x;
}

function _pickOne(pool, seed) {
  const arr = Array.isArray(pool) ? pool.filter(Boolean) : [];
  if (!arr.length) return "";
  return _pickMany(arr, `${seed}|one`, 1)[0];
}

function _subjectNoun(dict, planetKey, seed) {
  const k = _lowerKey(planetKey);
  const pool = SUBJECT_NOUNS[k] || [];
  if (pool.length) return _pickMany(pool, `${seed}|subj|${k}`, 1)[0];
  const p = dict?.PLANETS_V2?.bodies?.[k] || null;
  return p?.role || p?.core || "意志";
}

function _signModifier(dict, signKey, planetKey, seed) {
  const k = _lowerKey(planetKey);
  const template = SIGN_MOD_TEMPLATES[k] || "に寄りやすい";
  const { sign } = _getSignFlavor(dict, signKey, planetKey);
  const kw =
    (Array.isArray(sign?.base?.keywords) ? sign.base.keywords : null) ||
    (Array.isArray(sign?.keywords) ? sign.keywords : null) ||
    [];
  const picked = _pickMany(kw, `${seed}|kw|${k}|${signKey}`, 2);
  const signLabel =
    sign?.label_ja ||
    dict?.SIGNS_V2?.signs?.[_lowerKey(signKey)]?.label_ja ||
    signKey;
  const keyPhrase = picked.length ? picked.join("・") : (sign?.base?.short || sign?.base?.flavor || signLabel);
  return `${keyPhrase}${template}`;
}

function _ensureGa(clause) {
  const s = String(clause || "").trim();
  if (!s) return s;
  if (/(やすい|にくい)$/.test(s)) return s;
  if (/が/.test(s)) return s;
  if (/(し、|し\s|し$)/.test(s)) return s;
  if (/(起き|出|残|現れ|生まれ|強調|熟成|整い|広がり|伸び|浮かび)/.test(s)) {
    return s.replace(/^([^\s、]+)(\s*)/, "$1が$2");
  }
  return s;
}

function _simplifyDynamics(s) {
  let t = String(s || "");
  t = t.replace(/噛み合いにくさが調整として出やすい/g, "調整として出やすい");
  t = t.replace(/噛み合いにくさが出やすい/g, "噛み合いにくい");
  t = t.replace(/噛み合いにくさ/g, "噛み合いにくい");
  t = t.replace(/重なって強調されやすい/g, "強調されやすい");
  t = t.replace(/反復で熟成し、整い続けやすい/g, "整いやすい");
  t = t.replace(/整い続けやすい/g, "整いやすい");
  t = t.replace(/やすいが/g, "やすい");
  t = t.replace(/が$/g, "");
  return t;
}

function _fixDoubleGa(s) {
  const t = String(s || "");
  return t.replace(/が、([^。]*?)が/g, "は、$1が");
}
function normalizePersonalForFlavor(item = {}) {
  const pick = (...xs) => xs.find((v) => v !== undefined && v !== null && String(v).trim() !== "") || "";
  const a = pick(item.transit_body_or_point, item.transit_body, item.a, item.aPlanetKey);
  const b = pick(item.natal_body_or_point, item.natal_body, item.b, item.bPlanetKey);
  const aSign = pick(item.transit_sign_key, item.a_sign_key, item.aSignKey, item.a_sign);
  const bSign = pick(item.natal_sign_key, item.b_sign_key, item.bSignKey, item.b_sign);

  const aspectLabelJa = pick(item.aspect?.label_ja, item.aspect_label_ja, item.aspectLabelJa, item.aspect?.ja);
  const aspectType = pick(item.aspect?.type, item.type, item.aspectType, item.aspect_key);
  const aspectAngle = pick(item.aspect?.deg, item.aspect?.angle, item.aspect_deg, item.aspectDegree);

  return {
    a: safeStr(a).toLowerCase(),
    b: safeStr(b).toLowerCase(),
    a_sign_key: safeStr(aSign).toLowerCase(),
    b_sign_key: safeStr(bSign).toLowerCase(),
    aspectLabelJa: safeStr(aspectLabelJa),
    aspectType: safeStr(aspectType),
    aspectAngle: safeStr(aspectAngle),
  };
}

function buildFlavorBlockPersonal({ story, item, deps }) {
  const dict = deps?.dict || require("../../dict");
  const blend = require("../../dict/blend.v2");
  const n = normalizePersonalForFlavor(item);

  const { by } = _getSignFlavor(dict, n.b_sign_key, n.b);
  const roleA = _getRole(dict, n.a_sign_key, n.a);
  const roleB = _getRole(dict, n.b_sign_key, n.b);
  const role = roleA && roleB ? `${roleA} × ${roleB}` : (roleA || roleB || "");
  const core = by?.core || "";

  const seed = `${story?.meta?.date_local || ""}|${n.b}|${n.b_sign_key}|${n.aspectType || n.aspectLabelJa}`;
  const keywordsA = by?.fusion?.A || [];
  const keywordsB = by?.fusion?.B || [];
  const aspectKey = _normAspectKey(n.aspectType || n.aspectLabelJa || n.aspectAngle);
  const profile = _aspectKeywordProfile(aspectKey);

  let A = _pickMany(keywordsA, `${seed}|A`, profile.a);
  let B = _pickMany(keywordsB, `${seed}|B`, profile.b);
  const fb = _getFallbackKeywords(dict, n.b_sign_key, n.b);
  if (!A.length && !B.length) {
    A = _pickMany(fb, `${seed}|FB`, 5);
    B = [];
  } else if (!A.length) {
    A = _pickMany(keywordsB, `${seed}|AB`, profile.a);
    B = _pickMany(keywordsB, `${seed}|AB2`, profile.b);
  } else if (!B.length) {
    B = _pickMany(keywordsA, `${seed}|BA`, Math.max(1, profile.b));
  }

  const relationRaw = blend.resolveAspectRelationJa(dict, n.aspectLabelJa, `${seed}|rel`, n.aspectType) || "";
  const dynamicsRaw = blend.resolveAspectDynamicsJa(dict, n.aspectType || n.aspectLabelJa) || "触れやすい";
  const relation = _dedupeRelation(relationRaw, dynamicsRaw);
  const dyn = _cleanClause(dynamicsRaw);
  const rel = _cleanClause(relation);
  const clause = _ensureGa(_simplifyDynamics(dyn || rel || "触れやすい"));

  // personal template v1 (from SOAR_STYLE_V1)
  const style = _getSoarStyle(dict);
  const depth = "light";

  const state1 = _stateFromStyleDistinct(style, aspectKey, depth, `${seed}|state1`, []);

  const modifier = _signModifierFromStyle(style, n.b_sign_key, n.b, seed, dict);
  const avoid = _avoidTokensFromModifier(modifier);
  const subject = _subjectFromStyle(style, n.b, seed, avoid);
  const modeAvoid = Array.from(new Set([subject, ...avoid].filter(Boolean)));
  const mode = _modeFromStyle(style, n.b, seed, modeAvoid);

  const tensionRaw = by?.tension || "";
  const tensionFilled = _fillDynamicSlots(tensionRaw, dict, seed, aspectKey);
  const avoidState = _stateAvoidFromTension(tensionFilled);
  const state2 = _stateFromStyleDistinct(style, aspectKey, depth, `${seed}|state2`, [state1, ...avoidState]) || state1;

  const avoidKw = Array.from(
    new Set([subject, mode, ...avoid].filter(Boolean))
  );
  const tone = _pickAspectToneWords(dict, aspectKey, seed, profile.tone);
  const rawKw = [...tone, ...A, ...B].filter(Boolean).filter((k) => {
    const t = String(k || "");
    return !avoidKw.some((a) => a && t.includes(a));
  });
  const kwBase = _uniq(rawKw.length ? rawKw : [...tone, ...A, ...B]);
  const keywordAll = kwBase.length > 5 ? _pickMany(kwBase, `${seed}|KW`, 5) : kwBase;
  const kw1 = _normalizeKw(keywordAll[0] || "");
  const kw2 = _normalizeKw(keywordAll[1] || "");
  const kwPhrase = [kw1, kw2].filter(Boolean).join("や");

  const s1 = _fixDoubleGa(`${modifier}${subject}が、${state1}。`);
  const modePrefix = _dedupeModePrefix(mode, subject);
  const s2 = _fixDoubleGa(
    tensionFilled
      ? `${modePrefix}${_smoothTension(tensionFilled)}で${state2}。`
      : kwPhrase
        ? `${modePrefix}${_kwToBetween(kwPhrase)}${state2}。`
        : `${modePrefix}${state2}。`
  );

  const s2Fixed = _fixDupPhrases(s2);
  const shortState = _shortStateFromTone(style, aspectKey, seed, [state1, state2, ...avoidState]) || state2;
  const s2Short = _fixDoubleGa(`${modePrefix}${shortState}。`);
  const useShort = s2Fixed.length > 44 || /微調整が微調整|調整が微調整|折り合いで折り合い|小さな引っかかりが出やすい|調整点が浮かびやすい/.test(s2Fixed);
  const s2Final = useShort ? s2Short : s2Fixed;

  const keywordLine = keywordAll.length ? `KeyWord: ${keywordAll.join(" / ")}` : "";

  const lines = [];
  if (role) lines.push(`【${role}】`);
  if (s1) lines.push(`→ ${s1}`);
  if (s2Final) lines.push(`→ ${s2Final}`);
  if (keywordLine) lines.push(keywordLine);

  return lines.length ? lines.join("\n") : "";
}

function buildFlavorBlockSky({ story, item, deps }) {
  const dict = deps?.dict || require("../../dict");
  const blend = require("../../dict/blend.v2");
  const a = safeStr(item?.a || item?.aPlanetKey || "").toLowerCase();
  const aSign = safeStr(item?.a_sign_key || item?.aSignKey || "").toLowerCase();
  const aspectLabelJa = safeStr(item?.aspect?.label_ja || item?.aspect_label_ja || "");
  const aspectType = safeStr(item?.type || item?.aspectType || "");

  const { by } = _getSignFlavor(dict, aSign, a);
  const roleA = _getRole(dict, aSign, a);
  const roleB = _getRole(dict, item?.b_sign_key || item?.bSignKey || "", item?.b || item?.bPlanetKey || "");
  const role = roleA && roleB ? `${roleA} × ${roleB}` : (roleA || roleB || "");
  const core = by?.core || "";

  const seed = `${story?.meta?.date_local || ""}|${a}|${aSign}|${aspectType || aspectLabelJa}`;
  const keywordsA = by?.fusion?.A || [];
  const keywordsB = by?.fusion?.B || [];
  const aspectKey = _normAspectKey(aspectType || aspectLabelJa);
  const profile = _aspectKeywordProfile(aspectKey);

  let A = _pickMany(keywordsA, `${seed}|A`, profile.a);
  let B = _pickMany(keywordsB, `${seed}|B`, profile.b);
  const fb = _getFallbackKeywords(dict, aSign, a);
  if (!A.length && !B.length) {
    A = _pickMany(fb, `${seed}|FB`, 5);
    B = [];
  } else if (!A.length) {
    A = _pickMany(keywordsB, `${seed}|AB`, profile.a);
    B = _pickMany(keywordsB, `${seed}|AB2`, profile.b);
  } else if (!B.length) {
    B = _pickMany(keywordsA, `${seed}|BA`, Math.max(1, profile.b));
  }

  const relationRaw = blend.resolveAspectRelationJa(dict, aspectLabelJa, `${seed}|rel`, aspectType) || "";
  const dynamicsRaw = blend.resolveAspectDynamicsJa(dict, aspectType || aspectLabelJa) || "触れやすい";
  const relation = _dedupeRelation(relationRaw, dynamicsRaw);
  const dyn = _cleanClause(dynamicsRaw);
  const rel = _cleanClause(relation);
  const clause = _ensureGa(_simplifyDynamics(dyn || rel || "触れやすい"));

  const subject = _subjectNoun(dict, a, seed);
  const modifier = _signModifier(dict, aSign, a, seed);
  const s1 = `${modifier}${subject}が、${clause}。`;

  const tone = _pickAspectToneWords(dict, aspectKey, seed, profile.tone);
  const kwBase = _uniq([...A, ...B, ...tone].filter(Boolean));
  const keywordAll = kwBase.length > 5 ? _pickMany(kwBase, `${seed}|KW`, 5) : kwBase;
  const keywordLine = keywordAll.length ? `KeyWord: ${keywordAll.join(" / ")}` : "";

  const lines = [];
  if (role) lines.push(`【${role}】`);
  if (s1) lines.push(`→ ${s1}`);
  if (keywordLine) lines.push(keywordLine);

  return lines.length ? lines.join("\n") : "";
}

/* =========================
 * fusion wrapper（既存フォーマット + fusion 1文を付ける）
 * ========================= */
function formatWithFusion({
  story,
  item,
  prefix,
  deps,
  baseFormatter,
  fusionTemplate = "aline",
  fusionMode = "personal", // "personal" | "sky"
} = {}) {
  const line = typeof baseFormatter === "function" ? baseFormatter(story, item, prefix, deps) : "";
  if (!String(line || "").trim()) return "";

  const buildFusionSentence = deps?.buildFusionSentence;
  if (typeof buildFusionSentence !== "function") return line;

  // ✅ normalized を必ず作る（personal / public 両対応）
  let normalized = item;

  if (fusionMode === "sky") {
    const publicSignKey = deps?.publicSignKey;
    const aSign = typeof publicSignKey === "function" ? publicSignKey(story, item?.a) : "";
    const bSign = typeof publicSignKey === "function" ? publicSignKey(story, item?.b) : "";

    normalized = {
      kind: "sky",
      a: item?.a,
      b: item?.b,
      type: item?.type,
      orb_deg: Number.isFinite(Number(item?.orb_deg)) ? Number(item.orb_deg) : null,
      a_sign_key: aSign,
      b_sign_key: bSign,
      _raw: item,
    };
  }

  let fusion = "";
  try {
    fusion = String(
      buildFusionSentence(normalized, {
        template: fusionTemplate,
        mode: fusionMode,
        style: "sentence",
      }) || ""
    ).trim();
  } catch (_) {
    fusion = "";
  }

  if (!fusion) return line;
  if (String(line).includes(fusion)) return line;

  return `${line}\n${fusion}`.trim();
}

function formatWithFlavor({
  story,
  item,
  prefix,
  deps,
  baseFormatter,
  flavorMode = "personal",
} = {}) {
  const line = typeof baseFormatter === "function" ? baseFormatter(story, item, prefix, deps) : "";
  if (!String(line || "").trim()) return "";

  const flavor =
    flavorMode === "sky"
      ? buildFlavorBlockSky({ story, item, deps })
      : buildFlavorBlockPersonal({ story, item, deps });

  if (flavor && String(flavor).trim()) return `${line}\n${flavor}`.trim();

  // fallback to old fusion sentence if flavor not built
  return formatWithFusion({
    story,
    item,
    prefix,
    deps,
    baseFormatter,
    fusionTemplate: flavorMode === "sky" ? "sky_aline" : "aline",
    fusionMode: flavorMode,
  });
}

/* =========================
 * main
 * ========================= */
function renderLine(story, deps = {}) {
  const {
    tpKey,
    getSkyLayers,
    pickCenterPublicContact,
    pickSecretPublicContact,
    buildNoContactLine,
    buildYoinLine,
    buildNowModernPlanetCounts,
    buildPersonalTPCounts,
    buildDistLinesFromcounts,
    RENDER_COPY,
  } = deps || {};

  const { fmtPersonalTPLine, fmtPersonalTPBlock, fmtPublicSkyLine, fmtPublicSkyBlock } =
    resolveFormatters(deps);

  // ✅ 「もとに」寄せる：LINE用は基本 “Line formatter” を使う（Blockは保険）
  const fmtTP = fmtPersonalTPLine || fmtPersonalTPBlock;
  const fmtSky = fmtPublicSkyLine || fmtPublicSkyBlock;

  const dateLabel = String(story?.meta?.date_local || "").replace(/-/g, ".");
  const layers = typeof getSkyLayers === "function" ? getSkyLayers(story) : null;
  const hasPersonal = !!layers;

  const HEAD_LAYERS = RENDER_COPY?.HEAD_LAYERS || {
    THEME: "【今日の中心（触れやすい場所）】",
    TOUCH: "【引っかかりやすい接点】",
    HIDDEN: "【ひそかな接点】",
  };
  const CIRCLES = RENDER_COPY?.CIRCLES || ["①", "②", "③"];

  const parts = [];
  const used = new Set();
  const tpsShown = [];

  // --------------------
  // personal first
  // --------------------
  if (hasPersonal && typeof fmtTP === "function") {
    const theme0 = layers.theme?.[0] || null;
    const touch = Array.isArray(layers.touch) ? layers.touch : [];
    const hidden0 = layers.hidden?.[0] || null;

    if (theme0) {
      used.add(typeof tpKey === "function" ? tpKey(theme0) : String(theme0));
      tpsShown.push(theme0);
      const line = formatWithFlavor({
        story,
        item: theme0,
        prefix: `${CIRCLES[0]} `,
        deps,
        baseFormatter: fmtTP,
        flavorMode: "personal",
      });
      parts.push(HEAD_LAYERS.THEME ? `${HEAD_LAYERS.THEME}\n${line}` : line);
    }

    if (touch[0]) {
      used.add(typeof tpKey === "function" ? tpKey(touch[0]) : String(touch[0]));
      tpsShown.push(touch[0]);
      const line = formatWithFlavor({
        story,
        item: touch[0],
        prefix: `${CIRCLES[1]} `,
        deps,
        baseFormatter: fmtTP,
        flavorMode: "personal",
      });
      parts.push(HEAD_LAYERS.TOUCH ? `${HEAD_LAYERS.TOUCH}\n${line}` : line);
    }

    if (touch[1]) {
      used.add(typeof tpKey === "function" ? tpKey(touch[1]) : String(touch[1]));
      tpsShown.push(touch[1]);
      const line = formatWithFlavor({
        story,
        item: touch[1],
        prefix: `${CIRCLES[2]} `,
        deps,
        baseFormatter: fmtTP,
        flavorMode: "personal",
      });
      parts.push(line);
    }

    const hidden =
      hidden0 && !used.has(typeof tpKey === "function" ? tpKey(hidden0) : String(hidden0))
        ? hidden0
        : null;

    if (hidden) {
      used.add(typeof tpKey === "function" ? tpKey(hidden) : String(hidden));
      tpsShown.push(hidden);
      const line = formatWithFlavor({
        story,
        item: hidden,
        prefix: "・",
        deps,
        baseFormatter: fmtTP,
        flavorMode: "personal",
      });
      parts.push(HEAD_LAYERS.HIDDEN ? `${HEAD_LAYERS.HIDDEN}\n${line}` : line);
    }

    if (!parts.length && typeof buildNoContactLine === "function") {
      parts.push(buildNoContactLine(story));
    }
  }

  // --------------------
  // public fallback（✅ここが重要：fmtSky を使う）
  // --------------------
  if (!parts.length) {
    const skyTop = Array.isArray(story?.public?.sky_top) ? story.public.sky_top : [];
    const center =
      skyTop?.[0] || (typeof pickCenterPublicContact === "function" ? pickCenterPublicContact(story) : null);
    const t1 = skyTop?.[1] || null;
    const t2 = skyTop?.[2] || null;

    if (center && typeof fmtSky === "function") {
      const line = formatWithFlavor({
        story,
        item: center,
        prefix: `${CIRCLES[0]} `,
        deps,
        baseFormatter: fmtSky,
        flavorMode: "sky",
      });
      parts.push(HEAD_LAYERS.THEME ? `${HEAD_LAYERS.THEME}\n${line}` : line);
    }

    if (t1 && typeof fmtSky === "function") {
      const line = formatWithFlavor({
        story,
        item: t1,
        prefix: `${CIRCLES[1]} `,
        deps,
        baseFormatter: fmtSky,
        flavorMode: "sky",
      });
      parts.push(HEAD_LAYERS.TOUCH ? `${HEAD_LAYERS.TOUCH}\n${line}` : line);
    }

    if (t2 && typeof fmtSky === "function") {
      const line = formatWithFlavor({
        story,
        item: t2,
        prefix: `${CIRCLES[2]} `,
        deps,
        baseFormatter: fmtSky,
        flavorMode: "sky",
      });
      parts.push(line);
    }

    const secret = typeof pickSecretPublicContact === "function" ? pickSecretPublicContact(story) : null;
    if (secret && typeof fmtSky === "function") {
      const line = formatWithFlavor({
        story,
        item: secret,
        prefix: "・",
        deps,
        baseFormatter: fmtSky,
        flavorMode: "sky",
      });
      parts.push(HEAD_LAYERS.HIDDEN ? `${HEAD_LAYERS.HIDDEN}\n${line}` : line);
    }

    if (!parts.length && typeof buildNoContactLine === "function") {
      parts.push(buildNoContactLine(story));
    }
  }

  // --------------------
  // yoin
  // --------------------
  const yoinRaw =
    typeof buildYoinLine === "function"
      ? hasPersonal
        ? buildYoinLine(story, { kind: "personal", statsScope: "all" })
        : buildYoinLine(story, { kind: "public", statsScope: "top" })
      : "";

  const yoin = clampYoin2(yoinRaw);

  // --------------------
  // dist
  // --------------------
  const distCounts =
    hasPersonal && typeof buildPersonalTPCounts === "function"
      ? buildPersonalTPCounts(tpsShown)
      : typeof buildNowModernPlanetCounts === "function"
        ? buildNowModernPlanetCounts(story)
        : null;

  const distLines =
    typeof buildDistLinesFromcounts === "function"
      ? buildDistLinesFromcounts(distCounts, { forX: false })
      : "";

  // --------------------
  // template hook
  // --------------------
  const tpl = RENDER_COPY?.TPL?.LINE?.buildMain;
  if (typeof tpl === "function") {
    return tpl({
      dateLabel,
      parts: parts.join("\n\n"),
      distLines,
      kusouYoin: yoin,
      footerLines: RENDER_COPY?.FOOTER_LINE,
      cta: RENDER_COPY?.LINE_MAIN_CTA,
    });
  }

  return buildLineMainFallback({
    dateLabel,
    parts: parts.join("\n\n"),
    distLines,
    kusouYoin: yoin,
    footerLines: RENDER_COPY?.FOOTER_LINE,
    cta: RENDER_COPY?.LINE_MAIN_CTA,
  });
}

module.exports = { renderLine, renderSoraUraSilentPersonalLine };
