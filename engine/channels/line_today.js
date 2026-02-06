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

function boolishEnv(v) {
  const s = String(v || "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function _fmtDeg(deg) {
  const n = Number(deg);
  if (!Number.isFinite(n)) return "";
  return `${Math.round(n)}°`;
}

function _extractJsonBlock(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (s.startsWith("{") && s.endsWith("}")) return s;
  const m = s.match(/\{[\s\S]*\}/);
  return m ? m[0] : "";
}

function _safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

const LINE_AI_SYSTEM_PROMPT = [
  "あなたは「ソラのこえ。」LINE配信用の生成エンジンです。",
  "これは占いではない。未来断定・助言・指示・結論・吉凶判断は禁止。",
  "主語は「星・配置・接点」。読者を主語にしない。",
  "日本語のみ。英語・ローマ字は禁止。",
  "出力はJSONのみ。本文の装飾や余計な文は書かない。",
  "文体は静かで簡潔。説明しすぎない。観測的に「置く」。",
  "",
  "【KeyWordルール】",
  "- 必ず5語",
  "- 固有名詞（惑星/星座/アスペクト/共鳴/影響/エネルギー/運勢/吉凶/開運/ラッキー）禁止",
  "- 近い意味の連打は禁止（多様性最優先）",
  "- アスペクト由来1語＋惑星由来1語＋星座由来1語を必ず含める",
  "- 残り2語は当日の配置全体から補助的に抽出",
  "- 同語根/類語が連続したら必ず差し替える",
].join("\n");

const LINE_AI_USER_GUIDE = [
  "以下の入力データを使って、JSONのみを返してください。",
  "出力フォーマット（厳守）:",
  "{",
  '  "public": [',
  '    { "s1": "本文1行（〜しやすい/残りやすい等）", "keywords": ["5語"] },',
  "    ...",
  "  ],",
  '  "personal": {',
  '    "inner": { "s1": "1行目", "s2": "2行目", "keywords": ["5語"] },',
  '    "outer": { "s1": "1行目", "s2": "2行目", "keywords": ["5語"] },',
  '    "flow": { "s1": "1行目", "s2": "2行目", "keywords": ["5語"], "is_rare": false }',
  "  },",
  '  "sky_layer": { "line1": "空層1行目", "line2": "空層2行目" },',
  '  "personal_layer": { "line1": "個人空層1行目", "line2": "個人空層2行目" }',
  "}",
  "",
  "条件:",
  "- s1/s2は2行以内。断定/指示/助言なし。",
  "- 英語は禁止。日本語のみ。",
  "- keywordsは5語。固有名詞（惑星/星座/アスペクト/共鳴/影響/エネルギー/運勢/吉凶/開運/ラッキー）禁止。",
  "- keywordsは意味の近い語の連打を避ける（多様性）。",
  "- keywordsにはアスペクト/惑星/星座の意味を必ず含める。",
  "- 空層は「状態を置く」2行（決めない）。空層は必ず2行を返す。",
  "- personal_layer も必ず2行を返す。",
  "- レア共鳴がある場合は flow.is_rare=true にする。",
  "",
  "personal出力のニュアンス指定:",
  "- inner.s1/s2: 内側で起きやすい構造（「〜しやすい」「〜が残りやすい」）",
  "- outer.s1/s2: 外に出やすい反応（刺激/動き/反応として描写）",
  "- flow.s1/s2: 自然に流れるところ（「無理なく」「自然に」など）",
].join("\n");


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

function _planetJa(dict, planetKey) {
  const k = _lowerKey(planetKey);
  return dict?.PLANETS_V2?.bodies?.[k]?.label_ja || dict?.PLANETS_V1?.[k]?.label_ja || planetKey || "";
}

function _signJa(dict, signKey) {
  const k = _lowerKey(signKey);
  return dict?.SIGNS_V2?.signs?.[k]?.label_ja || dict?.SIGNS_V1?.[k]?.label_ja || signKey || "";
}

function _aspectInfo(dict, rawType) {
  const k = _normAspectKey(rawType);
  const a = dict?.ASPECTS_V2?.aspects?.[k] || dict?.ASPECTS_V1?.aspects?.[k] || null;
  return {
    key: k,
    label_ja: a?.label_ja || "",
    deg: Number.isFinite(Number(a?.deg)) ? Number(a.deg) : null,
    core: a?.core || "",
    tone: a?.tendency_key || "",
  };
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
  if (x.includes("ノヴィル")) return "novile_40";
  if (x.includes("バイノヴィル")) return "binovile_80";
  if (x.includes("クアドラノヴィル")) return "quadranovile_160";
  if (x.includes("デシル")) return "decile_36";
  if (x.includes("トリデシル")) return "tridecile_108";
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
    "ノヴィル": "novile_40",
    "バイノヴィル": "binovile_80",
    "クアドラノヴィル": "quadranovile_160",
    "デシル": "decile_36",
    "トリデシル": "tridecile_108",
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
    novile: "novile_40",
    binovile: "binovile_80",
    quadranovile: "quadranovile_160",
    decile: "decile_36",
    tridecile: "tridecile_108",
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
  const rawKw = [...tone, ...A, ...B, ...fb].filter(Boolean).filter((k) => {
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

  const keywordLine = keywordAll.length ? `KeyWord\n${keywordAll.join(" / ")}` : "";

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
  const kwBase = _uniq([...A, ...B, ...tone, ...fb].filter(Boolean));
  const keywordAll = kwBase.length > 5 ? _pickMany(kwBase, `${seed}|KW`, 5) : kwBase;
  const keywordLine = keywordAll.length ? `KeyWord\n${keywordAll.join(" / ")}` : "";

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
 * AI render (LINE)
 * ========================= */
const INNER_BODIES = ["moon", "ic", "neptune", "saturn", "pluto", "lilith", "chiron"];
const OUTER_BODIES = ["sun", "asc", "mc", "mars", "uranus", "jupiter", "mercury", "venus"];
const FLOW_BODIES = ["venus", "jupiter", "moon", "neptune"];
const FLOW_ASPECTS = [
  "trine",
  "sextile",
  "conjunction",
  "quintile_72",
  "biquintile_144",
];
const RARE_ASPECTS = [
  "quintile_72",
  "biquintile_144",
  "septile",
  "biseptile",
  "triseptile",
  "novile_40",
  "binovile_80",
  "quadranovile_160",
  "decile_36",
  "tridecile_108",
];

function _bodyMatch(item, keys) {
  const a = _lowerKey(item?.a);
  const b = _lowerKey(item?.b);
  return keys.includes(a) || keys.includes(b);
}

function _aspectKey(item) {
  return _normAspectKey(item?.type || item?.asp || item?.aspT || item?.aspect || "");
}

function _orb(item) {
  const v = Number(item?.orb_deg);
  return Number.isFinite(v) ? v : 999;
}

function _uniqueByTpKey(list, tpKeyFn) {
  const out = [];
  const seen = new Set();
  for (const item of list) {
    if (!item) continue;
    const k = tpKeyFn(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function _pickPersonalBlocks(layers, tpKeyFn) {
  const src = _uniqueByTpKey(
    [
      ...(Array.isArray(layers?.theme) ? layers.theme : []),
      ...(Array.isArray(layers?.touch) ? layers.touch : []),
      ...(Array.isArray(layers?.hidden) ? layers.hidden : []),
    ],
    tpKeyFn
  );

  const byOrb = (a, b) => _orb(a) - _orb(b);
  const inner = src.filter((i) => _bodyMatch(i, INNER_BODIES)).sort(byOrb)[0] || null;
  const outer = src.filter((i) => _bodyMatch(i, OUTER_BODIES)).sort(byOrb)[0] || null;

  const used = new Set([inner, outer].filter(Boolean).map((i) => tpKeyFn(i)));
  const remaining = src.filter((i) => !used.has(tpKeyFn(i)));

  const flowPool = remaining.filter((i) => {
    const k = _aspectKey(i);
    return FLOW_ASPECTS.includes(k) || _bodyMatch(i, FLOW_BODIES);
  });
  let flow = flowPool.sort(byOrb)[0] || null;

  let rare = null;
  for (const i of remaining.sort(byOrb)) {
    const k = _aspectKey(i);
    const isRare = RARE_ASPECTS.includes(k) || _orb(i) <= 0.2;
    if (isRare) {
      rare = i;
      break;
    }
  }

  if (rare && (!flow || tpKeyFn(rare) !== tpKeyFn(flow))) {
    flow = rare;
    flow._is_rare = true;
  }

  return { inner, outer, flow };
}

function _aiKeywordList(arr, fallback = []) {
  const xs = Array.isArray(arr) ? arr.map((s) => String(s || "").trim()).filter(Boolean) : [];
  const fb = Array.isArray(fallback) ? fallback.map((s) => String(s || "").trim()).filter(Boolean) : [];
  const merged = _uniq([...xs, ...fb]);
  return merged.slice(0, 5);
}

const _KW_BANNED = [
  "太陽", "月", "水星", "金星", "火星", "木星", "土星", "天王星", "海王星", "冥王星",
  "ASC", "MC", "IC", "DSC", "キロン", "リリス", "ノード",
  "牡羊座", "牡牛座", "双子座", "蟹座", "獅子座", "乙女座",
  "天秤座", "蠍座", "射手座", "山羊座", "水瓶座", "魚座",
  "コンジャンクション", "セミセクスタイル", "セミスクエア", "セクスタイル",
  "スクエア", "トライン", "インコンジャンクト", "クインカンクス", "オポジション",
  "セスキスクエア", "クインタイル", "バイクインタイル", "セプタイル",
  "ノヴィル", "デシル",
  "共鳴", "影響", "エネルギー", "運勢", "吉", "凶", "開運", "ラッキー",
];

const _KW_SAFE_POOL = [
  "余白", "間", "輪郭", "密度", "距離", "手触り", "温度差", "配分", "境目",
  "微差", "流れ", "層", "奥行", "摩擦", "調整", "揺れ", "滞り", "反射",
  "保ち", "置き方", "明度", "暗度", "空気", "静けさ", "にじみ", "濃度",
];

function _isBannedKw(w) {
  const s = String(w || "").trim();
  if (!s) return true;
  if (/[0-9°]/.test(s)) return true;
  if (s.includes("座")) return true;
  for (const t of _KW_BANNED) {
    if (s.includes(t)) return true;
  }
  return false;
}

function _sanitizeKeywords(list, fallback) {
  const out = [];
  const add = (w) => {
    const s = String(w || "").trim();
    if (!s) return;
    if (_isBannedKw(s)) return;
    if (out.some((x) => _isSimilarKw(x, s))) return;
    out.push(s);
  };
  (Array.isArray(list) ? list : []).forEach(add);
  if (out.length < 5) {
    (Array.isArray(fallback) ? fallback : []).forEach(add);
  }
  if (out.length < 5) {
    _KW_SAFE_POOL.forEach(add);
  }
  return out.slice(0, 5);
}

function _formatKeywordsLine(list, fallback) {
  const xs = _sanitizeKeywords(list, fallback);
  return xs.length ? `KeyWord\n${xs.join(" / ")}` : "";
}

function _isSimilarKw(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  if (a.length >= 2 && b.length >= 2 && a.slice(0, 2) === b.slice(0, 2)) return true;
  return false;
}

function _pickDistinct(pool, seed, want = 1, avoid = []) {
  const picked = [];
  const arr = _pickMany(pool, seed, Math.max(want * 3, 6));
  for (const w of arr) {
    if (!w) continue;
    if (avoid.some((a) => _isSimilarKw(a, w))) continue;
    picked.push(w);
    avoid.push(w);
    if (picked.length >= want) break;
  }
  return picked;
}

function _composeKeywords({ aspectPool, planetPool, signPool, extraPool, seed }) {
  const avoid = [];
  const out = [];
  if (aspectPool?.length) out.push(..._pickDistinct(aspectPool, `${seed}|aspect`, 1, avoid));
  if (planetPool?.length) out.push(..._pickDistinct(planetPool, `${seed}|planet`, 1, avoid));
  if (signPool?.length) out.push(..._pickDistinct(signPool, `${seed}|sign`, 1, avoid));
  const rest = _pickDistinct(extraPool || [], `${seed}|extra`, 5, avoid);
  out.push(...rest);
  return _uniq(out).slice(0, 5);
}

function _planetKwPool(dict, planetKey) {
  const p = dict?.PLANETS_V2?.bodies?.[_lowerKey(planetKey)] || null;
  const pool = [
    ...(Array.isArray(p?.action_noun_ja) ? p.action_noun_ja : []),
    ...(Array.isArray(p?.action_verb_ja) ? p.action_verb_ja.map((v) => _normalizeKw(v)) : []),
  ].filter(Boolean);
  return _uniq(pool);
}

function _signKwPool(dict, signKey) {
  const s = dict?.SIGNS_V2?.signs?.[_lowerKey(signKey)] || null;
  const pool = [
    ...(Array.isArray(s?.texture) ? s.texture : []),
    ...(Array.isArray(s?.keywords) ? s.keywords : []),
  ].filter(Boolean);
  return _uniq(pool);
}

function _fallbackKwPublic(dict, item, seed = "") {
  const a = _lowerKey(item?.a || item?.aPlanetKey);
  const aSign = _lowerKey(item?.aS || item?.a_sign_key || item?.aSignKey);
  const aspectKey = _normAspectKey(item?.type || item?.aspectType || item?.aspect?.type || item?.aspect_label_ja);
  const tone = _pickAspectToneWords(dict, aspectKey, `${seed}|tone`, 3);
  const planetPool = _planetKwPool(dict, a);
  const signPool = _signKwPool(dict, aSign);
  const extra = _uniq([...tone, ...planetPool, ...signPool]);
  return _composeKeywords({
    aspectPool: tone,
    planetPool,
    signPool,
    extraPool: extra,
    seed: `${seed}|pub`,
  });
}

function _fallbackKwPersonal(dict, item, seed = "") {
  const a = _lowerKey(item?.natal_body_or_point || item?.natal_body || item?.a);
  const b = _lowerKey(item?.transit_body || item?.b);
  const aSign = _lowerKey(item?.natal_sign_key || item?.natal_sign || item?.a_sign_key);
  const bSign = _lowerKey(item?.transit_sign_key || item?.transit_sign || item?.b_sign_key);
  const aspectKey = _normAspectKey(item?.aspect || item?.type || item?.aspectType || item?.aspect_label_ja);
  const tone = _pickAspectToneWords(dict, aspectKey, `${seed}|tone`, 3);
  const planetPool = _uniq([..._planetKwPool(dict, a), ..._planetKwPool(dict, b)]);
  const signPool = _uniq([..._signKwPool(dict, aSign), ..._signKwPool(dict, bSign)]);
  const extra = _uniq([...tone, ...planetPool, ...signPool]);
  return _composeKeywords({
    aspectPool: tone,
    planetPool,
    signPool,
    extraPool: extra,
    seed: `${seed}|per`,
  });
}

async function renderLineAI(story, deps = {}) {
  const { createChatCompletion } = require("../blog/openai_client");
  const {
    getSkyLayers,
    buildNowModernPlanetCounts,
    buildPersonalTPCounts,
    buildDistLinesFromcounts,
    RENDER_COPY,
  } = deps || {};

  const dict = deps?.dict || require("../../dict");
  const dateLabel = String(story?.meta?.date_local || "").replace(/-/g, ".");
  const tpKeyFn = typeof deps?.tpKey === "function" ? deps.tpKey : (x) => String(x);
  const layers = typeof getSkyLayers === "function" ? getSkyLayers(story) : null;

  const publicTop = Array.isArray(story?.public?.sky_top)
    ? story.public.sky_top.slice(0, 5)
    : Array.isArray(story?.public?.sky_all)
      ? story.public.sky_all.slice(0, 5)
      : [];

  const personalPick = _pickPersonalBlocks(layers || {}, tpKeyFn);

  const aspectLabel = (item) => {
    const info = _aspectInfo(dict, item?.type || item?.aspT || item?.aspect);
    return info.label_ja || "";
  };
  const aspectDeg = (item) => {
    const info = _aspectInfo(dict, item?.type || item?.aspT || item?.aspect);
    return _fmtDeg(info.deg);
  };

  const publicInput = publicTop.map((it) => ({
    a: _planetJa(dict, it?.a),
    b: _planetJa(dict, it?.b),
    a_sign: _signJa(dict, it?.aS || it?.a_sign_key),
    b_sign: _signJa(dict, it?.bS || it?.b_sign_key),
    aspect: aspectLabel(it),
    degree: aspectDeg(it),
    orb: Number(it?.orb_deg ?? it?.orb ?? 0).toFixed(1),
    role_a: _getRole(dict, it?.aS || it?.a_sign_key, it?.a),
    role_b: _getRole(dict, it?.bS || it?.b_sign_key, it?.b),
  }));

  const personalInput = {
    inner: personalPick.inner
      ? {
          a: _planetJa(dict, personalPick.inner?.a),
          b: _planetJa(dict, personalPick.inner?.b),
          a_sign: _signJa(dict, personalPick.inner?.aS || personalPick.inner?.a_sign_key),
          b_sign: _signJa(dict, personalPick.inner?.bS || personalPick.inner?.b_sign_key),
          aspect: aspectLabel(personalPick.inner),
          degree: aspectDeg(personalPick.inner),
          orb: Number(personalPick.inner?.orb_deg ?? personalPick.inner?.orb ?? 0).toFixed(1),
          role_a: _getRole(dict, personalPick.inner?.aS || personalPick.inner?.a_sign_key, personalPick.inner?.a),
          role_b: _getRole(dict, personalPick.inner?.bS || personalPick.inner?.b_sign_key, personalPick.inner?.b),
        }
      : null,
    outer: personalPick.outer
      ? {
          a: _planetJa(dict, personalPick.outer?.a),
          b: _planetJa(dict, personalPick.outer?.b),
          a_sign: _signJa(dict, personalPick.outer?.aS || personalPick.outer?.a_sign_key),
          b_sign: _signJa(dict, personalPick.outer?.bS || personalPick.outer?.b_sign_key),
          aspect: aspectLabel(personalPick.outer),
          degree: aspectDeg(personalPick.outer),
          orb: Number(personalPick.outer?.orb_deg ?? personalPick.outer?.orb ?? 0).toFixed(1),
          role_a: _getRole(dict, personalPick.outer?.aS || personalPick.outer?.a_sign_key, personalPick.outer?.a),
          role_b: _getRole(dict, personalPick.outer?.bS || personalPick.outer?.b_sign_key, personalPick.outer?.b),
        }
      : null,
    flow: personalPick.flow
      ? {
          a: _planetJa(dict, personalPick.flow?.a),
          b: _planetJa(dict, personalPick.flow?.b),
          a_sign: _signJa(dict, personalPick.flow?.aS || personalPick.flow?.a_sign_key),
          b_sign: _signJa(dict, personalPick.flow?.bS || personalPick.flow?.b_sign_key),
          aspect: aspectLabel(personalPick.flow),
          degree: aspectDeg(personalPick.flow),
          orb: Number(personalPick.flow?.orb_deg ?? personalPick.flow?.orb ?? 0).toFixed(1),
          role_a: _getRole(dict, personalPick.flow?.aS || personalPick.flow?.a_sign_key, personalPick.flow?.a),
          role_b: _getRole(dict, personalPick.flow?.bS || personalPick.flow?.b_sign_key, personalPick.flow?.b),
          is_rare: !!personalPick.flow?._is_rare,
        }
      : null,
  };

  const distCounts =
    layers && typeof buildPersonalTPCounts === "function"
      ? buildPersonalTPCounts(
          [personalPick.inner, personalPick.outer, personalPick.flow].filter(Boolean)
        )
      : typeof buildNowModernPlanetCounts === "function"
        ? buildNowModernPlanetCounts(story)
        : null;

  const distLines =
    typeof buildDistLinesFromcounts === "function"
      ? buildDistLinesFromcounts(distCounts, { forX: false })
      : "";

  const inputPayload = {
    date: dateLabel,
    public: publicInput,
    personal: personalInput,
    dist: distLines,
    meta: {
      moon: _signJa(dict, story?.public?.moon_sign),
      element_modality: story?.public?.element_modality || "",
    },
  };

  const apiKey = process.env.OPENAI_API_KEY || "";
  const model = process.env.OPENAI_MODEL || process.env.LINE_AI_MODEL || "gpt-4o";
  const baseUrl = process.env.OPENAI_BASE_URL || "";

  const raw = await createChatCompletion({
    apiKey,
    baseUrl,
    model,
    temperature: 0.5,
    maxTokens: 1200,
    messages: [
      { role: "system", content: LINE_AI_SYSTEM_PROMPT },
      { role: "user", content: `${LINE_AI_USER_GUIDE}\n\nINPUT:\n${JSON.stringify(inputPayload)}` },
    ],
  });

  const jsonText = _extractJsonBlock(raw);
  const parsed = _safeJsonParse(jsonText || raw);
  if (!parsed || typeof parsed !== "object") throw new Error("LINE AI: invalid JSON");

  const aiPublic = Array.isArray(parsed.public) ? parsed.public : [];
  const aiPersonal = parsed.personal || {};
  const aiSkyLayer = parsed.sky_layer || {};
  const aiPersonalLayer = parsed.personal_layer || {};

  const SEP = RENDER_COPY?.LINE_SEP || "────────────────";
  const parts = [];

  // ---------- public (top 5)
  if (publicTop.length) {
    parts.push(`🌌 今日のソラ｜そら｜${dateLabel}`);
    parts.push("");
    parts.push("【今日のソラの配置｜上位5共鳴（orb≤6°）】");
    parts.push("");
    parts.push(SEP);
    for (let i = 0; i < publicTop.length; i++) {
      const item = publicTop[i];
      const ai = aiPublic[i] || {};
      const fmtSky =
        resolveFormatters(deps).fmtPublicSkyLine || resolveFormatters(deps).fmtPublicSkyBlock;
      const header = typeof fmtSky === "function"
        ? fmtSky(story, item, `${RENDER_COPY?.CIRCLES?.[i] || ["①", "②", "③", "④", "⑤"][i]} `, deps)
        : "";
      const roles = `【${_getRole(dict, item?.aS || item?.a_sign_key, item?.a)} × ${_getRole(
        dict,
        item?.bS || item?.b_sign_key,
        item?.b
      )}】`;
      const kwFallback = _fallbackKwPublic(dict, item, `${dateLabel}|public|${i}`);
      parts.push(
        [
          header,
          roles,
          ai.s1 ? `→ ${ai.s1}` : "",
          _formatKeywordsLine(ai.keywords, kwFallback),
        ]
          .filter(Boolean)
          .join("\n")
      );
      if (i < publicTop.length - 1) parts.push(SEP);
    }

    const moonLine = story?.public?.moon_sign
      ? `🌙月：${_signJa(dict, story.public.moon_sign)}`
      : "";
    if (moonLine) parts.push("", moonLine);

    if (distLines) parts.push("", distLines);

    if (aiSkyLayer?.line1 || aiSkyLayer?.line2) {
      parts.push("");
      parts.push(`【空層】${story?.public?.element_modality?.label || story?.public?.element_modality || ""}`.trim());
      if (aiSkyLayer.line1) parts.push(aiSkyLayer.line1);
      if (aiSkyLayer.line2) parts.push(aiSkyLayer.line2);
    }

    parts.push("");
    parts.push(RENDER_COPY?.FOOTER_LINE || "解釈は、あなたのもの。");
    parts.push(RENDER_COPY?.SOAR_END || "星は語る。決めるのは、人。");
    parts.push(RENDER_COPY?.SOAR_BY || "そらとして、眺めてみてね。🌌");
  }

  // ---------- personal
  if (personalInput.inner || personalInput.outer || personalInput.flow) {
    parts.push("");
    parts.push(`🌌 今日のソラのこえ。｜${dateLabel}`);
    parts.push("");
    parts.push("【あなたの星 × きょうのそら】");
    parts.push("");
    parts.push(SEP);

    let personalIndex = 1;
    const block = (label, emoji, item, ai) => {
      if (!item) return;
      parts.push(`${personalIndex} ${emoji} ${label}`);
      const fmtTP =
        resolveFormatters(deps).fmtPersonalTPLine || resolveFormatters(deps).fmtPersonalTPBlock;
      const header = typeof fmtTP === "function" ? fmtTP(story, item, "", deps) : "";
      const roles = `【${_getRole(dict, item?.aS || item?.a_sign_key, item?.a)} × ${_getRole(
        dict,
        item?.bS || item?.b_sign_key,
        item?.b
      )}】`;
      const kwFallback = _fallbackKwPersonal(dict, item, `${dateLabel}|personal|${personalIndex}`);
      parts.push(
        [
          header,
          roles,
          ai?.s1 ? `→ ${ai.s1}` : "",
          ai?.s2 ? `→ ${ai.s2}` : "",
          _formatKeywordsLine(ai?.keywords, kwFallback),
        ]
          .filter(Boolean)
          .join("\n")
      );
      parts.push(SEP);
      personalIndex += 1;
    };

    block("🌗 内側の反応点", "", personalPick.inner, aiPersonal.inner);
    block("☀️ 外に出やすい反応", "", personalPick.outer, aiPersonal.outer);

    let flowItem = personalPick.flow;
    if (!flowItem) {
      const pool = [personalPick.inner, personalPick.outer].filter(Boolean);
      if (pool.length) {
        // fallback: pick the next best (orb) as flow to keep 3 blocks
        flowItem = pool.sort((a, b) => _orb(a) - _orb(b))[0];
      }
    }
    if (flowItem) {
      block("🌿 自然に流れる接点", "", flowItem, aiPersonal.flow);
    }

    const pLayer1 = aiPersonalLayer?.line1 || aiSkyLayer?.line1 || "";
    const pLayer2 = aiPersonalLayer?.line2 || aiSkyLayer?.line2 || "";
    if (pLayer1 || pLayer2) {
      parts.push(`【空層】${story?.public?.element_modality?.label || story?.public?.element_modality || ""}`.trim());
      if (pLayer1) parts.push(pLayer1);
      if (pLayer2) parts.push(pLayer2);
      parts.push("");
    }

    parts.push(RENDER_COPY?.FOOTER_LINE || "解釈は、あなたのもの。");
    parts.push(RENDER_COPY?.SOAR_END || "星は語る。決めるのは、人。🌎️🛸✨️");
    parts.push("");
    parts.push("──");
    parts.push("");
    parts.push("必要な人は、次に");
    parts.push("「そら」");
    parts.push("と送ってみてね。");
    parts.push("今日のソラの配置一覧が出るよ🌌");
  }

  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* =========================
 * main
 * ========================= */
function renderLineDict(story, deps = {}) {
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
  const SEP = RENDER_COPY?.LINE_SEP || "────────────────";

  const parts = [];
  const used = new Set();
  const tpsShown = [];
  const tpKeyFn = typeof tpKey === "function" ? tpKey : (x) => String(x);
  const pickFirstUnused = (list) => {
    const arr = Array.isArray(list) ? list : [];
    for (const item of arr) {
      if (!item) continue;
      const k = tpKeyFn(item);
      if (used.has(k)) continue;
      return item;
    }
    return null;
  };

  // --------------------
  // personal first
  // --------------------
  if (hasPersonal && typeof fmtTP === "function") {
    const theme0 = layers.theme?.[0] || null;
    const touch = Array.isArray(layers.touch) ? layers.touch : [];
    const hidden0 = layers.hidden?.[0] || null;

    if (theme0) {
      used.add(tpKeyFn(theme0));
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
      used.add(tpKeyFn(touch[0]));
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

    const thirdCandidate =
      pickFirstUnused([touch[1], hidden0]) ||
      pickFirstUnused(touch.slice(2)) ||
      pickFirstUnused(layers.hidden) ||
      pickFirstUnused(layers.theme);

    if (thirdCandidate) {
      used.add(tpKeyFn(thirdCandidate));
      tpsShown.push(thirdCandidate);
      const line = formatWithFlavor({
        story,
        item: thirdCandidate,
        prefix: `${CIRCLES[2]} `,
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

    const secret = typeof pickSecretPublicContact === "function" ? pickSecretPublicContact(story) : null;
    const thirdSky = t2 || secret || null;
    if (thirdSky && typeof fmtSky === "function") {
      const line = formatWithFlavor({
        story,
        item: thirdSky,
        prefix: `${CIRCLES[2]} `,
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
      parts: parts.join(`\n\n${SEP}\n\n`),
      distLines,
      kusouYoin: yoin,
      footerLines: RENDER_COPY?.FOOTER_LINE,
      cta: RENDER_COPY?.LINE_MAIN_CTA,
    });
  }

  return buildLineMainFallback({
    dateLabel,
    parts: parts.join(`\n\n${SEP}\n\n`),
    distLines,
    kusouYoin: yoin,
    footerLines: RENDER_COPY?.FOOTER_LINE,
    cta: RENDER_COPY?.LINE_MAIN_CTA,
  });
}

async function renderLine(story, deps = {}) {
  const aiEnabled = boolishEnv(process.env.LINE_AI_ENABLED);
  if (aiEnabled && process.env.OPENAI_API_KEY) {
    try {
      return await renderLineAI(story, deps);
    } catch (e) {
      // fallback to dict-based render
      return renderLineDict(story, deps);
    }
  }
  return renderLineDict(story, deps);
}

module.exports = { renderLine, renderLineDict, renderSoraUraSilentPersonalLine };
