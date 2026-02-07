"use strict";

const { fmtDeg, planetJa } = require("../render_parts/line_ai_utils");
const _fmtDeg = fmtDeg;
const _planetJa = planetJa;

/**
 * channels/line_sora.js — FULL INTEGRATED SSOT (v2026.01) — FLAVOR FIXED
 *
 * LINE「そら」「そらぜんぶ」
 *
 * ✅ 絶対に変えないもの
 * - 星の構成（母集団= story.public.sky_all、orb昇順、limit=TopN or Infinity）
 *
 * ✅ FIX方針（flavorが全部同じ問題）
 * - buildFusionSentence が辞書参照できるように
 *   normalizeSkyForFusion で a/b を “キー” に寄せる（可能なら story から逆引き）
 * - a_sign_key / b_sign_key を story からも補完（publicSignKey が無くても落ちない）
 * - fusionTemplate は sora/そらぜんぶ共に "sky_micro" or "sky_aline" に統一（未定義テンプレで汎用fallbackに落ちるのを防ぐ）
 *
 * deps:
 * - formatSoraSkyLine（既存行フォーマット）
 * - publicSignKey（任意）
 * - buildNowModernPlanetCounts, buildDistLinesFromcounts
 * - buildYoinGlobal
 * - buildFusionSentence（任意）
 * - RENDER_COPY
 */

/* =========================
 * safe utils
 * ========================= */
function safeStr(v) {
    return v === null || v === undefined ? "" : String(v);
}
function trimStr(v) {
    return safeStr(v).trim();
}
function isFn(f) {
    return typeof f === "function";
}
function isFiniteNum(n) {
    return Number.isFinite(Number(n));
}
function toDotDate(s) {
    return safeStr(s).replace(/-/g, ".");
}
function joinLines(...xs) {
    return xs
        .flat()
        .filter((x) => trimStr(x))
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function boolishEnv(v) {
    const s = String(v || "").toLowerCase().trim();
    return s === "1" || s === "true" || s === "yes" || s === "on";
}

function _hash32(str) {
    let h = 2166136261;
    for (let i = 0; i < String(str || "").length; i++) {
        h ^= String(str).charCodeAt(i);
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
        const idx = _hash32(`${seed}|${i}`) % arr.length;
        out.push(arr.splice(idx, 1)[0]);
    }
    return out;
}

function _lowerKey(x) {
    return safeStr(x).toLowerCase().trim();
}

function _avoidTokensFromModifier(modifier) {
    const s = String(modifier || "");
    const tokens = [];
    if (s.includes("価値")) tokens.push("価値観", "価値");
    if (s.includes("基準")) tokens.push("基準", "起点");
    if (s.includes("安心")) tokens.push("安心");
    if (s.includes("印象")) tokens.push("印象");
    if (s.includes("距離")) tokens.push("距離感", "距離");
    if (s.includes("反応")) tokens.push("反応");
    if (s.includes("感覚")) tokens.push("感覚");
    if (s.includes("意志")) tokens.push("意志");
    return Array.from(new Set(tokens));
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

function _pickOne(pool, seed) {
    const arr = Array.isArray(pool) ? pool.filter(Boolean) : [];
    if (!arr.length) return "";
    return _pickMany(arr, `${seed}|one`, 1)[0];
}

function _normAspectKey(raw) {
    const x = String(raw || "").toLowerCase().trim();
    if (!x) return "";
    const map = {
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

function _aspectToneCategory(aspectKey) {
    const k = _normAspectKey(aspectKey);
    if (["square", "opposition"].includes(k)) return "tense";
    if (["quincunx_150", "semi_square_45", "sesqui_square_135", "semi_sextile_30"].includes(k)) return "adjust";
    if (["trine", "sextile"].includes(k)) return "smooth";
    if (["conjunction"].includes(k)) return "blend";
    if (["quintile_72", "biquintile_144"].includes(k)) return "craft";
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

function _getRole(dict, signKey, planetKey) {
    const { by } = _getSignFlavor(dict, signKey, planetKey);
    const role = by?.role || by?.core || "";
    if (role) return role;
    const p = dict?.PLANETS_V2?.bodies?.[_lowerKey(planetKey)] || null;
    return p?.role || p?.core || "";
}

function _signJa(dict, signKey) {
    const k = _lowerKey(signKey);
    return dict?.SIGNS_V2?.signs?.[k]?.label_ja || dict?.SIGNS_V1?.[k]?.label_ja || signKey || "";
}

function _planetMeta(dict, planetKey) {
    const k = _lowerKey(planetKey);
    const p = dict?.PLANETS_V2?.bodies?.[k] || dict?.PLANETS_V1?.[k] || null;
    const point = dict?.POINTS_V1?.points?.[k] || null;
    return {
        role: p?.role || p?.core || point?.core || "",
        core: p?.core || point?.core || "",
        texture: Array.isArray(p?.texture) ? p.texture.slice(0, 3) : [],
    };
}

function _signMeta(dict, signKey) {
    const k = _lowerKey(signKey);
    const s = dict?.SIGNS_V2?.signs?.[k] || dict?.SIGNS_V1?.[k] || null;
    return {
        label_ja: s?.label_ja || signKey || "",
        texture: Array.isArray(s?.texture) ? s.texture.slice(0, 3) : [],
        keywords: Array.isArray(s?.keywords) ? s.keywords.slice(0, 3) : [],
    };
}

function _signFlavor(dict, signKey) {
    const k = _lowerKey(signKey);
    const flavor = dict?.SIGN_FLAVOR_V1?.signs?.[k]?.flavor || "";
    if (!flavor) return "";
    const first = String(flavor).split("。")[0];
    return String(first || flavor).trim();
}

const _ASPECT_JA_FALLBACK = {
    conjunction: "コンジャンクション",
    sextile: "セクスタイル",
    square: "スクエア",
    trine: "トライン",
    opposition: "オポジション",
    quincunx_150: "インコンジャンクト",
    semi_square_45: "セミスクエア",
    sesqui_square_135: "セスキスクエア",
    semi_sextile_30: "セミセクスタイル",
    quintile_72: "クインタイル",
    biquintile_144: "バイクインタイル",
    septile: "セプタイル",
    novile_40: "ノヴィル",
    binovile_80: "バイノヴィル",
    trinovile_120: "トリノヴィル",
    quadranovile_160: "クアドラノヴィル",
    decile_36: "デシル",
    tridecile_108: "トリデシル",
};

function _aspectMetaFromDict(dict, k) {
    if (!k) return null;
    const v2 = dict?.ASPECTS_V2 || {};
    const v1 = dict?.ASPECTS_V1 || {};
    const pools = [v2.major, v2.deep_space, v2.craft_space, v1.major, v1.deep_space];
    for (const p of pools) {
        if (p && p[k]) return p[k];
    }
    return null;
}

function _aspectInfo(dict, rawType) {
    const k = _normAspectKey(rawType);
    const a = _aspectMetaFromDict(dict, k);
    let deg = Number.isFinite(Number(a?.deg)) ? Number(a.deg) : null;
    if (deg == null) {
        const m = String(k || "").match(/_(\d+)/);
        if (m) deg = Number(m[1]);
    }
    return {
        key: k,
        label_ja: a?.label_ja || _ASPECT_JA_FALLBACK[k] || "",
        deg,
        core: a?.core || "",
        tone: a?.tendency_key || "",
        relation: a?.relation || "",
        clause: a?.clause || "",
        feel: Array.isArray(a?.feel) ? a.feel : [],
        adverbs: Array.isArray(a?.adverbs) ? a.adverbs : [],
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

function _normalizeKwToken(s) {
    return String(s || "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "")
        .trim();
}

const _KW_GROUP_RULES = [
    { key: "adjust", re: /(調整|補正|修正|是正|整合|調律|整え|整う|整える|微調整|補う)/ },
    { key: "boundary", re: /(境界|境目|境|輪郭|区切り|端|縁)/ },
    { key: "distance", re: /(距離|間合|間|隔たり|離れ)/ },
    { key: "space", re: /(余白|空間|空気|隙間|隙)/ },
    { key: "temperature", re: /(温度|温か|暖|冷|冷え|熱)/ },
    { key: "speed", re: /(速度|速さ|スピード|テンポ|リズム|加速|減速)/ },
    { key: "density", re: /(密度|濃度|濃淡|厚み|重さ|軽さ)/ },
    { key: "flow", re: /(流れ|循環|巡り|滞り|移ろい|動き)/ },
    { key: "texture", re: /(手触り|触感|感触|質感|摩擦)/ },
    { key: "layer", re: /(層|重なり|重ね|奥行)/ },
    { key: "balance", re: /(配分|配合|配慮|均衡|バランス|割り振り|置き方)/ },
    { key: "stability", re: /(保ち|維持|持続|継続|安定|定着)/ },
    { key: "tension", re: /(緊張|張り|引っかかり)/ },
    { key: "fluctuation", re: /(揺れ|ゆらぎ|揺らぎ|震え|滲み|にじみ)/ },
    { key: "direction", re: /(指向|向き|方向|焦点)/ },
    { key: "language", re: /(言葉|語|発話|対話|会話|表現)/ },
    { key: "body", re: /(身体|からだ|体感|感覚)/ },
    { key: "update", re: /(更新|刷新|切替|切り替え|置き換え|再構成)/ },
];

function _kwGroup(s) {
    const t = String(s || "");
    if (!t) return "";
    const flat = _normalizeKwToken(t);
    for (const rule of _KW_GROUP_RULES) {
        if (rule.re.test(t) || (flat && rule.re.test(flat))) return rule.key;
    }
    return "";
}

function _isSimilarKw(a, b) {
    const sa = _normalizeKwToken(a);
    const sb = _normalizeKwToken(b);
    if (!sa || !sb) return false;
    if (sa === sb) return true;
    if (sa.includes(sb) || sb.includes(sa)) return true;
    if (sa.length >= 2 && sb.length >= 2 && sa.slice(0, 2) === sb.slice(0, 2)) return true;
    const ga = _kwGroup(sa);
    const gb = _kwGroup(sb);
    if (ga && ga === gb) return true;
    return false;
}

function _pickDistinct(pool, seed, count = 1, avoid = []) {
    const src = (Array.isArray(pool) ? pool.filter(Boolean) : []).slice();
    const out = [];
    const av = (Array.isArray(avoid) ? avoid : []).filter(Boolean);
    for (let i = 0; i < count && src.length; i++) {
        let picked = "";
        for (let j = 0; j < src.length; j++) {
            const idx = _hash32(`${seed}|${i}|${j}`) % src.length;
            const cand = src[idx];
            if (av.some((x) => _isSimilarKw(x, cand))) {
                src.splice(idx, 1);
                continue;
            }
            picked = cand;
            src.splice(idx, 1);
            break;
        }
        if (picked) {
            out.push(picked);
            av.push(picked);
        }
    }
    return out;
}

function _splitKwString(val) {
    const raw = String(val || "");
    return raw
        .split(/[\/、,\|\n]+/g)
        .map((s) => String(s || "").trim())
        .filter(Boolean);
}

function _normalizeKeywords(list) {
    const out = [];
    const src = Array.isArray(list)
        ? list.flatMap((w) => _splitKwString(w))
        : _splitKwString(list);
    src.forEach((w) => {
        const s = String(w || "").trim();
        if (!s) return;
        if (out.some((x) => _isSimilarKw(x, s))) return;
        out.push(s);
    });
    return out;
}

const _KW_BANNED = new Set(
    [
        "太陽","月","水星","金星","火星","木星","土星","天王星","海王星","冥王星",
        "sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto",
        "サン","ムーン","マーキュリー","ヴィーナス","ビーナス","マーズ","ジュピター","サターン","ウラヌス","ネプチューン","プルート","プルト",
        "ASC","MC","IC","DSC","キロン","リリス","ノード","アセンダント","ディセンダント","ミディアムコエリ",
        "aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces",
        "牡羊座","牡牛座","双子座","蟹座","獅子座","乙女座","天秤座","蠍座","射手座","山羊座","水瓶座","魚座",
        "コンジャンクション","セミセクスタイル","セミスクエア","セクスタイル",
        "スクエア","トライン","インコンジャンクト","クインカンクス","オポジション",
        "セスキスクエア","クインタイル","バイクインタイル","セプタイル","ノヴィル","デシル",
        "conjunction","semi_sextile","semi_square","sextile","square","trine","quincunx","opposition","sesqui_square","quintile","biquintile","septile","novile","decile",
        "共鳴","共鳴的","影響","影響的","エネルギー","エネルギー的","運勢","運気","運","吉","凶","開運",
        "ラッキー","アンラッキー","ハッピー","幸運","不運","占い","占星術","運命","導き","救い","正解",
        "吉兆","凶兆","スピ","ヒーリング","セラピー","メッセージ",
        "内側","外側","反応","出やすい","内面","外面","きょう","今日",
    ].map((s) => String(s || "").toLowerCase().trim()).filter(Boolean)
);

const _KW_SAFE_POOL = [
    "輪郭","余白","距離","境目","揺れ","張り","密度","速度","温度差","配分","微差","折り合い",
    "重なり","行き来","にじみ","滞り","静けさ","耐久","持続","継続","呼吸","手触り",
    "間合い","保ち","置き方","粒度","奥行","明度","暗度","層","流れ","温度","緊張",
    "ほどけ","ひっかかり","詰まり","ゆらぎ","配慮","調律","沈み","浮き","切り替え",
    "収まり","広がり","指向","向き","揃い","離れ","滲み","たわみ","留まり",
];

function _isBannedKw(s) {
    const raw = String(s || "").trim();
    if (!raw) return true;
    if (/[0-9°]/.test(raw)) return true;
    if (raw.includes("座")) return true;
    const t = raw.toLowerCase();
    const flat = t.replace(/[^\p{L}\p{N}]+/gu, "");
    if (_KW_BANNED.has(t) || (flat && _KW_BANNED.has(flat))) return true;
    for (const b of _KW_BANNED) {
        if (!b) continue;
        if (t.includes(b) || flat.includes(b)) return true;
    }
    return false;
}

function _sanitizeKeywords(primary, fallback) {
    const candidates = _normalizeKeywords(primary).concat(_normalizeKeywords(fallback));
    const out = [];
    const usedGroups = new Set();
    const tryAdd = (w) => {
        if (_isBannedKw(w)) return;
        if (out.some((x) => _isSimilarKw(x, w))) return;
        const g = _kwGroup(w);
        if (g && usedGroups.has(g)) return;
        out.push(w);
        if (g) usedGroups.add(g);
    };
    for (const w of candidates) {
        tryAdd(w);
        if (out.length >= 5) break;
    }
    if (out.length < 5) {
        for (const w of _KW_SAFE_POOL) {
            tryAdd(w);
            if (out.length >= 5) break;
        }
    }
    return out.slice(0, 5);
}

function _formatKeywordsLine(keywords, fallback) {
    const final = _sanitizeKeywords(keywords, fallback);
    if (!final.length) return "";
    return `KeyWord ${final.join(" / ")}`;
}

function _fallbackKwPublic(dict, item, seed) {
    const aspectKey = item?.type || item?.aspT || item?.aspect || "";
    const tone = _pickAspectToneWords(dict, aspectKey, `${seed}|tone`, 1);
    const a = _getFallbackKeywords(dict, item?.aS || item?.a_sign_key, item?.a);
    const b = _getFallbackKeywords(dict, item?.bS || item?.b_sign_key, item?.b);
    const profile = _aspectKeywordProfile(aspectKey);
    const aPick = _pickDistinct(a, `${seed}|a`, profile.a, tone);
    const bPick = _pickDistinct(b, `${seed}|b`, profile.b, tone.concat(aPick));
    const tPick = _pickDistinct(tone, `${seed}|t`, profile.tone, aPick.concat(bPick));
    const base = _normalizeKeywords([...tPick, ...aPick, ...bPick]);
    if (base.length >= 5) return base.slice(0, 5);
    const extra = _pickDistinct(
        [...a, ...b, ...tone],
        `${seed}|x`,
        5 - base.length,
        base
    );
    return _normalizeKeywords([...base, ...extra]).slice(0, 5);
}

function _extractJsonBlock(s) {
    const str = String(s || "");
    const fence = str.match(/```json([\s\S]*?)```/i);
    if (fence) return fence[1].trim();
    const fence2 = str.match(/```([\s\S]*?)```/i);
    if (fence2) return fence2[1].trim();
    return str.trim();
}

function _safeJsonParse(s) {
    try {
        return JSON.parse(String(s || ""));
    } catch {
        return null;
    }
}

const LINE_SORA_AI_SYSTEM_PROMPT = `
あなたは「ソラのこえ。」LINE配信用の生成エンジン。
占いではない。未来断定・助言・指示・結論・吉凶判断は禁止。
主語は「星・配置・接点」。読者を主語にしない。
日本語のみ。英語・ローマ字は禁止。
出力はJSONのみ。本文の装飾や余計な文は書かない。
構造を静かに置く。説明しすぎない。
構造語彙（役割/触れ方/質感）を本文に必ず含める。

【KeyWordルール（候補出力）】
- keywords は8〜12語の候補を出す（後処理で5語に絞る）
- 固有名詞（惑星/星座/アスペクト/共鳴/影響/エネルギー/運勢/吉凶/開運/ラッキー等）禁止
- 近い意味の連打は禁止（多様性最優先）
`.trim();

const LINE_SORA_AI_USER_GUIDE = `
以下のINPUTから、LINE用の本文パーツを生成する。
items は top5 と同じ長さで返すこと。
候補は入力データにあるもののみを使う（自由解釈しない）。
INPUTキー: date, title, top5, sky_layer_hints

出力JSONスキーマ:
{
  "items":[{"s1":"...","s2":"...","keywords":["..."]}],
  "sky_layer":{"line1":"...","line2":"..."}
}

条件:
- s1/s2は合計2行以内。断定/指示/助言なし。
- 英語禁止。日本語のみ。
- keywords は8〜12語の候補（多様性優先）。
- sky_layer は2行。状態を「置く」だけ。
- 各itemの structure を必ず参照し、構造語彙を入れる。
- s1/s2は「惑星A/Bの役割」「アスペクトの触れ方」「サイン質感」から最低2要素を含める（汎用語だけで完結しない）。
- structure内の語を優先し、言い換えても意味を外さない。
`.trim();

function _dominantKey(counts, order = []) {
    const entries = order.length
        ? order.map((k) => [k, Number(counts?.[k] || 0)])
        : Object.entries(counts || {}).map(([k, v]) => [k, Number(v || 0)]);
    if (!entries.length) return "";
    let bestKey = "";
    let bestVal = -1;
    entries.forEach(([k, v]) => {
        if (v > bestVal) {
            bestVal = v;
            bestKey = k;
        }
    });
    return bestVal > 0 ? bestKey : "";
}

function _elementJa(dict, key) {
    return dict?.ELEMENTS_V1?.elements?.[key]?.label_ja || "";
}

function _modalityJa(dict, key) {
    return dict?.MODALITIES_V1?.modalities?.[key]?.label_ja || "";
}

function _buildLayerHints(counts, dict) {
    const element = counts?.element || {};
    const modality = counts?.modality || {};
    const domElementKey = _dominantKey(element, ["fire", "earth", "air", "water"]);
    const domModalityKey = _dominantKey(modality, ["cardinal", "fixed", "mutable"]);
    return {
        dominant_element: {
            key: domElementKey,
            label_ja: _elementJa(dict, domElementKey),
            count: Number(element?.[domElementKey] || 0),
        },
        dominant_modality: {
            key: domModalityKey,
            label_ja: _modalityJa(dict, domModalityKey),
            count: Number(modality?.[domModalityKey] || 0),
        },
        element_counts: element,
        modality_counts: modality,
    };
}

function _formatDistLines(counts) {
    const e = counts?.element || {};
    const m = counts?.modality || {};
    if (!Object.keys(e).length && !Object.keys(m).length) return [];
    return [
        `【惑星属性】 🔥 火${Number(e.fire || 0)}　🪨 地${Number(e.earth || 0)}　💨 風${Number(e.air || 0)}　💧 水${Number(e.water || 0)}`,
        `【三区分】 🏃 活動${Number(m.cardinal || 0)}　🧱 不動${Number(m.fixed || 0)}　🌿 柔軟${Number(m.mutable || 0)}`,
    ];
}

function _formatStructureLine(s1, s2) {
    const line1 = trimStr(s1);
    const line2 = trimStr(s2);
    if (!line1 && !line2) return "";
    if (line1 && line2) return `→ ${line1}\n${line2}`;
    return `→ ${line1 || line2}`;
}

function _formatPublicAspectLine(dict, item, prefix = "") {
    if (!item) return "";
    const a = _planetJa(dict, item?.a);
    const b = _planetJa(dict, item?.b);
    const aSign = _signJa(dict, item?.aS || item?.a_sign_key);
    const bSign = _signJa(dict, item?.bS || item?.b_sign_key);
    const info = _aspectInfo(dict, item?.type || item?.aspT || item?.aspect);
    const aspectLabel = info.label_ja || String(item?.type || item?.aspT || item?.aspect || "");
    const deg = _fmtDeg(info.deg);
    const orb = Number(item?.orb_deg ?? item?.orb ?? 0).toFixed(1);
    const head = `${prefix}${a}${aSign ? `（${aSign}）` : ""} × ${b}${bSign ? `（${bSign}）` : ""}`;
    const aspectText = deg ? `${aspectLabel} ${deg}` : aspectLabel;
    return `${head} ｜${aspectText}（orb ${orb}°）`;
}

function _fallbackDomLabel(story) {
    const raw = story?.public?.element_modality?.label || story?.public?.element_modality || "";
    const parts = String(raw || "").split(/[×x]/).map((s) => s.trim()).filter(Boolean);
    return {
        element: parts[0] || "",
        modality: parts[1] || "",
    };
}

async function renderSoraBaseAI(story, opts = {}, deps = {}) {
    const { createChatCompletion } = require("../blog/openai_client");
    const { buildNowModernPlanetCounts } = deps || {};

    const dateLabel = toDotDate(story?.meta?.date_local);
    const listTitle = trimStr(opts.listTitle || "");
    const headerLine = trimStr(opts.headerLine || `🌌 今日のソラ｜そら｜${dateLabel}`);
    const includeMoon = opts.includeMoon !== false;
    const includeDist = opts.includeDist !== false;
    const includeSkyLayer = opts.includeSkyLayer !== false;
    const includeFooter = opts.includeFooter !== false;

    const sep = deps?.RENDER_COPY?.LINE_SEP || "────────────────";
    const circles = deps?.RENDER_COPY?.CIRCLES || ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

    const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
    const sorted = skyAll
        .filter((r) => isFiniteNum(r?.orb_deg))
        .sort((a, b) => Number(a.orb_deg) - Number(b.orb_deg));

    const baseList = Array.isArray(opts.items) ? opts.items : sorted;
    const limit =
        opts.limit === Infinity ? Infinity : (isFiniteNum(opts.limit) ? Number(opts.limit) : 15);
    const list = limit === Infinity ? baseList : baseList.slice(0, Math.max(1, limit));

    const dict = deps?.dict || require("../../dict");
    const inputItems = list.map((it) => {
        const aKey = it?.a;
        const bKey = it?.b;
        const aSignKey = it?.aS || it?.a_sign_key;
        const bSignKey = it?.bS || it?.b_sign_key;
        const roleA = _getRole(dict, aSignKey, aKey);
        const roleB = _getRole(dict, bSignKey, bKey);
        const info = _aspectInfo(dict, it?.type || it?.aspT || it?.aspect);
        const aMeta = _planetMeta(dict, aKey);
        const bMeta = _planetMeta(dict, bKey);
        const aSignMeta = _signMeta(dict, aSignKey);
        const bSignMeta = _signMeta(dict, bSignKey);
        return {
            a: _planetJa(dict, aKey),
            b: _planetJa(dict, bKey),
            a_sign: _signJa(dict, aSignKey),
            b_sign: _signJa(dict, bSignKey),
            aspect: info.label_ja || "",
            degree: _fmtDeg(info.deg),
            orb: Number(it?.orb_deg ?? it?.orb ?? 0).toFixed(1),
            axis: roleA && roleB ? `${roleA} × ${roleB}` : "",
            structure: {
                a_role: roleA || aMeta.role,
                b_role: roleB || bMeta.role,
                a_core: aMeta.core,
                b_core: bMeta.core,
                a_texture: aMeta.texture,
                b_texture: bMeta.texture,
                sign_a_texture: aSignMeta.texture,
                sign_b_texture: bSignMeta.texture,
                sign_a_flavor: _signFlavor(dict, aSignKey),
                sign_b_flavor: _signFlavor(dict, bSignKey),
                aspect_core: info.core || "",
                aspect_relation: info.relation || info.clause || "",
                aspect_feel: info.feel || [],
                aspect_adverbs: info.adverbs || [],
            },
        };
    });

    const distCounts = typeof buildNowModernPlanetCounts === "function" ? buildNowModernPlanetCounts(story) : null;
    const skyLayerHints = _buildLayerHints(distCounts, dict);

    const inputPayload = {
        date: dateLabel,
        title: listTitle,
        top5: inputItems,
        sky_layer_hints: skyLayerHints,
    };

    const apiKey = process.env.OPENAI_API_KEY || "";
    const model = process.env.OPENAI_MODEL || "gpt-4o";
    const baseUrl = process.env.OPENAI_BASE_URL || "";

    const raw = await createChatCompletion({
        apiKey,
        baseUrl,
        model,
        temperature: 0.5,
        maxTokens: 1200,
        messages: [
            { role: "system", content: LINE_SORA_AI_SYSTEM_PROMPT },
            { role: "user", content: `${LINE_SORA_AI_USER_GUIDE}\n\nINPUT:\n${JSON.stringify(inputPayload)}` },
        ],
    });

    const jsonText = _extractJsonBlock(raw);
    const parsed = _safeJsonParse(jsonText || raw);
    if (!parsed || typeof parsed !== "object") throw new Error("LINE SORA AI: invalid JSON");

    const aiItems = Array.isArray(parsed.items) ? parsed.items : [];
    const aiSky = parsed.sky_layer || {};

    const parts = [];
    parts.push(headerLine);
    if (listTitle) parts.push(listTitle);
    parts.push(sep);

    for (let i = 0; i < list.length; i++) {
        const it = list[i];
        const ai = aiItems[i] || {};
        const header = _formatPublicAspectLine(dict, it, `${circles[i] || `${i + 1}.`} `);
        const kwFallback = _fallbackKwPublic(dict, it, `${dateLabel}|sora|${i}`);
        parts.push(
            [
                header,
                _formatStructureLine(ai.s1, ai.s2),
                _formatKeywordsLine(ai.keywords, kwFallback),
            ]
                .filter(Boolean)
                .join("\n")
        );
        if (i < list.length - 1) parts.push(sep);
    }

    if (list.length) parts.push(sep);

    const moonLine = story?.public?.moon?.sign_ja || story?.public?.moon_sign
        ? `🌙 月：${story?.public?.moon?.sign_ja || _signJa(dict, story?.public?.moon_sign)}`
        : "";
    if (includeMoon && moonLine) parts.push(moonLine);

    const distLines = _formatDistLines(distCounts);
    if (includeDist && distLines.length) parts.push(...distLines);

    if (includeSkyLayer && (aiSky?.line1 || aiSky?.line2)) {
        const fallbackDom = _fallbackDomLabel(story);
        const domElement =
            skyLayerHints?.dominant_element?.label_ja ||
            fallbackDom.element ||
            "";
        const domModality =
            skyLayerHints?.dominant_modality?.label_ja ||
            fallbackDom.modality ||
            "";
        if (domElement || domModality) {
            parts.push(`【空層】${domElement}${domElement && domModality ? " × " : ""}${domModality}`.trim());
        } else {
            parts.push("【空層】");
        }
        if (aiSky.line1) parts.push(aiSky.line1);
        if (aiSky.line2) parts.push(aiSky.line2);
    }

    if (includeFooter) {
        parts.push("解釈は、あなたのもの。");
        parts.push("星は語る。決めるのは、人。");
        parts.push("そらとして、眺めてみてね。🌌");
    }

    return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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

function _subjectNoun(dict, planetKey, seed, avoidTokens = []) {
    const k = _lowerKey(planetKey);
    if (k === "neptune") {
        const pool = ["感覚", "体感", "余韻", "直感", "気配"];
        const filtered = pool.filter((s) => {
            const t = String(s || "");
            return !avoidTokens.some((a) => a && t.includes(a));
        });
        return _pickOne(filtered.length ? filtered : pool, `${seed}|subj|${k}`) || "感覚";
    }
    const style = _getSoarStyle(dict);
    const pool = style?.planets?.[k]?.subjects || [];
    if (pool.length) {
        const filtered = pool.filter((s) => {
            const t = String(s || "");
            return !avoidTokens.some((a) => a && t.includes(a));
        });
        return _pickOne(filtered.length ? filtered : pool, `${seed}|subj|${k}`);
    }
    const p = dict?.PLANETS_V2?.bodies?.[k] || null;
    return p?.role || p?.core || "意志";
}

function _signModifier(dict, signKey, planetKey, seed) {
    const k = _lowerKey(planetKey);
    const style = _getSoarStyle(dict);
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
    // 冗長パターンを圧縮
    t = t.replace(/噛み合いにくさが調整として出やすい/g, "調整として出やすい");
    t = t.replace(/噛み合いにくさが出やすい/g, "噛み合いにくい");
    t = t.replace(/噛み合いにくさ/g, "噛み合いにくい");
    t = t.replace(/重なって強調されやすい/g, "強調されやすい");
    t = t.replace(/反復で熟成し、整い続けやすい/g, "整いやすい");
    t = t.replace(/整い続けやすい/g, "整いやすい");
    t = t.replace(/やすいが/g, "やすい");
    t = t.replace(/調整として出やすい/g, "調整として出やすい"); // keep short form
    t = t.replace(/微調整が起きやすい/g, "微調整が起きやすい"); // keep explicit
    t = t.replace(/が$/g, "");
    return t;
}

function _fixDoubleGa(s) {
    const t = String(s || "");
    return t.replace(/が、([^。]*?)が/g, "は、$1が");
}

function buildFlavorBlockSky({ story, item, normalized, deps }) {
    const dict = deps?.dict || require("../../dict");
    const blend = require("../../dict/blend.v2");

    const aSignKey = normalized?.a_sign_key || normalized?.aSignKey || "";
    const aPlanetKey = normalized?.a || normalized?.aPlanetKey || "";
    const aspectLabelJa = normalized?.aspect?.label_ja || normalized?.aspect_label_ja || "";
    const aspectType = normalized?.type || normalized?.aspectType || "";

    const { by } = _getSignFlavor(dict, aSignKey, aPlanetKey);
    const roleA = _getRole(dict, aSignKey, aPlanetKey);
    const roleB = _getRole(dict, normalized?.b_sign_key || normalized?.bSignKey || "", normalized?.b || normalized?.bPlanetKey || "");
    const role = roleA && roleB ? `${roleA} × ${roleB}` : (roleA || roleB || "");
    const core = by?.core || "";

    const seed = `${story?.meta?.date_local || ""}|${aPlanetKey}|${aSignKey}|${aspectType || aspectLabelJa}`;
    const keywordsA = by?.fusion?.A || [];
    const keywordsB = by?.fusion?.B || [];
    const aspectKey = _normAspectKey(aspectType || aspectLabelJa);
    const profile = _aspectKeywordProfile(aspectKey);

    let A = _pickMany(keywordsA, `${seed}|A`, profile.a);
    let B = _pickMany(keywordsB, `${seed}|B`, profile.b);
    const fb = _getFallbackKeywords(dict, aSignKey, aPlanetKey);
    if (!A.length && !B.length) {
        // fallback only when A/B are missing
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

    const modifier = _signModifier(dict, aSignKey, aPlanetKey, seed);
    const avoid = _avoidTokensFromModifier(modifier);
    const subject = _subjectNoun(dict, aPlanetKey, seed, avoid);
    const s1 = _fixDoubleGa(`${modifier}${subject}が、${clause}。`);

    const tone = _pickAspectToneWords(dict, aspectKey, seed, profile.tone);
    const kwBase = _uniq([...tone, ...A, ...B].filter(Boolean));
    const keywordAll = _sanitizeKeywords(kwBase, fb);
    const keywordLine = keywordAll.length ? `KeyWord\n${keywordAll.join(" / ")}` : "";

    const lines = [];
    if (role) lines.push(`【${role}】`);
    if (s1) lines.push(`→ ${s1}`);
    if (keywordLine) lines.push(keywordLine);

    return lines.length ? lines.join("\n") : "";
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
        fmtSoraSkyLine:
            pickDep(deps, "fmt.formatSoraSkyLine") ||
            pickDep(deps, "formatSoraSkyLine") ||
            null,
    };
}

function buildLineSoraFallback({ dateLabel, listTitle, moonLine, mainLines, distLines, kusouYoin, footerLines }) {
    const lines = [];
    lines.push(`🌌 今日のソラ｜そら｜${dateLabel}`);
    if (moonLine) lines.push(moonLine);
    lines.push("");
    lines.push(listTitle || "【空の配置】");
    if (mainLines) lines.push(mainLines);

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
    return joinLines(lines);
}

/* =========================
 * fusion caller（署名揺れ吸収）
 * ========================= */
// engine/channels/line_sora.js

function callBuildFusionSentence(deps, normalizedItem, opts) {
    const fn = deps?.buildFusionSentence;
    if (!isFn(fn)) return "";

    // ★ まず (item, opts) を試す（render.js のラップ想定）
    try {
        const out = fn(normalizedItem, opts);
        if (trimStr(out)) return String(out);
    } catch (_) { }

    // 次に (deps, item, opts) を試す（生の blend.v2 直呼び想定）
    try {
        const out = fn(deps, normalizedItem, opts);
        if (trimStr(out)) return String(out);
    } catch (_) { }

    console.log("deps keys", Object.keys(deps || {}));
    console.log("has buildFusionSentence", typeof deps?.buildFusionSentence);
    console.log("has PLANETS_V1", !!deps?.PLANETS_V1, "has dict.PLANETS_V1", !!deps?.dict?.PLANETS_V1);
    console.log("has ASPECTS_V1", !!deps?.ASPECTS_V1, "has dict.ASPECTS_V1", !!deps?.dict?.ASPECTS_V1);
    console.log("template", opts?.template);

    return "";
}


/* =========================
 * story helpers（逆引き / SSOT）
 * ========================= */

/** null-safe string */
function s(v) { return v === null || v === undefined ? "" : String(v); }

/** normalize: trim */
function t(v) { return s(v).trim(); }

/** normalize: lower-case key (planet/point/aspect keys) */
function normalizeKey(k) {
    const x = t(k);
    return x ? x.toLowerCase() : "";
}

/** candidates getter */
function getPublicBodiesContainer(pub) {
    return pub?.bodies || pub?.body_map || pub?.bodies_map || null;
}

/**
 * story.public の bodies から jaName で bodyKey を逆引き
 * - 返すのは「元キー」(そのまま)  ※ここでは小文字化しない
 */
function bodyKeyFromStoryByJa(story, jaName) {
    if (!story || !jaName) return null;
    const pub = story.public || {};
    const bodies = getPublicBodiesContainer(pub);
    if (!bodies) return null;

    const target = t(jaName);
    if (!target) return null;

    for (const [k, v] of Object.entries(bodies)) {
        const nameJa = t(v?.name_ja || v?.ja || v?.label_ja || "");
        if (nameJa && nameJa === target) return k;
    }
    return null;
}

/**
 * 体のキー（天体/感受点）を抽出
 * - x が object でも拾う
 * - jaName しか無い場合は story から逆引き
 * - 返すのは「元キー」(そのまま)  ※ここでは小文字化しない
 */
function extractBodyKeyRaw(x, story) {
    if (!x) return null;

    if (typeof x === "string") return t(x) || null;
    if (typeof x === "number") return String(x);

    const k =
        x.key ||
        x.body_key ||
        x.planet_key ||
        x.point_key ||
        x.body ||
        x.planet ||
        x.point ||
        x.id ||
        x.bodyKey ||
        x.planetKey ||
        x.pointKey ||
        null;

    if (k) return t(k) || null;

    const ja =
        x.name_ja || x.ja || x.label_ja || x.nameJa || x.labelJa || null;

    return bodyKeyFromStoryByJa(story, ja) || null;
}

// 互換：旧名 extractBodyKey を残す（contactsForGlobal 等が呼ぶため）
function extractBodyKey(x, story) {
    return extractBodyKeyRaw(x, story);
}

/**
 * story 内の候補コンテナから bodyKey を探して sign_key を返す
 * ✅ “大文字/小文字どっちでも” 探す（ここが超重要）
 */
function getSignKeyFromStory(story, bodyKey) {
    if (!story || !bodyKey) return "";

    const pub = story.public || {};
    const containers = [
        pub.bodies,
        pub.body_map,
        pub.bodies_map,
        pub.positions,
        pub.pos,
        pub.now,
    ].filter(Boolean);

    const raw = t(bodyKey);
    if (!raw) return "";

    // 1) そのまま
    for (const c of containers) {
        const b = c?.[raw];
        if (!b) continue;

        const k =
            b.sign_key ||
            b.signKey ||
            b.sign?.key ||
            b.sign?.sign_key ||
            b.sign?.signKey ||
            b.sign;

        if (k) return t(k);
    }

    // 2) 小文字化して探す（story側が lower をキーにしてるケース）
    const lower = normalizeKey(raw);
    if (lower && lower !== raw) {
        for (const c of containers) {
            const b = c?.[lower];
            if (!b) continue;

            const k =
                b.sign_key ||
                b.signKey ||
                b.sign?.key ||
                b.sign?.sign_key ||
                b.sign?.signKey ||
                b.sign;

            if (k) return t(k);
        }
    }

    // 3) 大文字先頭(mercury)で持ってるケース（念のため）
    const cap = raw.charAt(0).toUpperCase() + raw.slice(1);
    if (cap && cap !== raw) {
        for (const c of containers) {
            const b = c?.[cap];
            if (!b) continue;

            const k =
                b.sign_key ||
                b.signKey ||
                b.sign?.key ||
                b.sign?.sign_key ||
                b.sign?.signKey ||
                b.sign;

            if (k) return t(k);
        }
    }

    return "";
}

/**
 * aspect type 正規化
 * - _45/_90/_150 を落とす
 * - 別名を辞書の期待キーへ寄せる
 */
/**
 * aspect type 正規化（✅辞書キーに寄せる）
 * - deep_space は「角度付きキー」がSSOT：semi_square_45 / sesqui_square_135 / quincunx_150
 * - major はそのまま：conjunction / sextile / square / trine / opposition
 * - 変な別名・短縮が来たら「辞書側の正式キー」に戻す
 */
function normalizeAspectType(raw) {
    const x = normalizeKey(raw);
    if (!x) return "";

    // すでに辞書キーっぽいならそのまま（deep_space含む）
    if (
        x === "conjunction" ||
        x === "sextile" ||
        x === "square" ||
        x === "trine" ||
        x === "opposition" ||
        x === "semi_sextile_30" ||
        x === "semi_square_45" ||
        x === "sesqui_square_135" ||
        x === "quincunx_150" ||
        x === "quintile_72" ||
        x === "biquintile_144" ||
        x === "septile_family" ||
        x === "novile_40" ||
        x === "binovile_80" ||
        x === "quadranovile_160" ||
        x === "decile_36" ||
        x === "tridecile_108"
    ) {
        return x;
    }

    // 角度サフィックスが付いてるなら、辞書の方言へ寄せる
    // 例：semi_square -> semi_square_45 / sesqui_square -> sesqui_square_135 / quincunx -> quincunx_150
    const base = x.replace(/_\d+$/, "");

    const map = {
        // inconjunct / quincunx 系 → quincunx_150
        inconjunct: "quincunx_150",
        quincunx: "quincunx_150",

        // semi-square 系 → semi_square_45
        semisquare: "semi_square_45",
        semi_square: "semi_square_45",

        // sesqui-square 系 → sesqui_square_135
        sesquisquare: "sesqui_square_135",
        sesqui_square: "sesqui_square_135",

        // novile / decile families
        novile: "novile_40",
        binovile: "binovile_80",
        quadranovile: "quadranovile_160",
        decile: "decile_36",
        tridecile: "tridecile_108",
    };

    return map[base] || base; // majorはここでそのまま帰る
}

/* =========================
 * normalize for sky fusion（✅flavorの鍵 / SSOT）
 * - buildFusionSentence が拾える “キー形式” に寄せる
 * - a/b は lower の planetKey に統一（辞書ヒット最優先）
 * - sign は story 逆引きで補完（raw/lower/cap 探索）
 * - aspect は label_ja/type を必ず持たせる
 * ========================= */
function normalizeSkyForFusion(story, item = {}, deps = {}) {
    // raw body keys (story lookup 用)
    const aRaw = extractBodyKeyRaw(item?.a, story) || extractBodyKeyRaw(item?.aPlanetKey, story) || "";
    const bRaw = extractBodyKeyRaw(item?.b, story) || extractBodyKeyRaw(item?.bPlanetKey, story) || "";

    // ✅ fusion/dict lookup 用は lower に統一
    const aKey = normalizeKey(aRaw);
    const bKey = normalizeKey(bRaw);

    // signKey を補完（publicSignKey があればそれ優先。ただし raw と lower 両方で試す）
    const publicSignKey = deps?.publicSignKey;

    const aSign =
        t(item?.a_sign_key) ||
        t(item?.aSignKey) ||
        t(item?.a_sign) ||
        (typeof publicSignKey === "function" ? t(publicSignKey(story, aRaw) || publicSignKey(story, aKey)) : "") ||
        t(getSignKeyFromStory(story, aRaw) || getSignKeyFromStory(story, aKey)) ||
        "";

    const bSign =
        t(item?.b_sign_key) ||
        t(item?.bSignKey) ||
        t(item?.b_sign) ||
        (typeof publicSignKey === "function" ? t(publicSignKey(story, bRaw) || publicSignKey(story, bKey)) : "") ||
        t(getSignKeyFromStory(story, bRaw) || getSignKeyFromStory(story, bKey)) ||
        "";

    // aspect label_ja / type
    const aspectLabelJa =
        t(item?.aspect?.label_ja) ||
        t(item?.aspect_label_ja) ||
        t(item?.aspectLabelJa) ||
        t(item?.aspect?.ja) ||
        t(item?.aspect?.labelJa) ||
        "";

    const aspectTypeRaw =
        t(item?.aspect?.type) ||
        t(item?.type) ||
        t(item?.aspect?.key) ||
        t(item?.aspectType) ||
        t(item?.aspect_key) ||
        "";

    const aspectType =
        (typeof deps?.normalizeAspectType === "function")
            ? deps.normalizeAspectType(aspectTypeRaw)
            : normalizeAspectType(aspectTypeRaw); // 保険（消すならこの行も消える）

    const aspectLabelJa2 =
        aspectLabelJa || (typeof deps?.fmtAspectJa === "function" ? deps.fmtAspectJa(aspectType) : "");

    // orb
    const orbDeg = item?.orb_deg ?? item?.orbDeg ?? item?.orb ?? null;

    return {
        kind: "sky",

        // ✅ dict/fusion 用（lower）
        a: aKey,
        b: bKey,

        type: aspectType, // ✅ これが必須（blendV2 に渡す本体キー）

        a_sign_key: aSign,
        b_sign_key: bSign,

        aspect: { label_ja: aspectLabelJa2, type: aspectType },

        orb_deg: Number.isFinite(Number(orbDeg)) ? Number(orbDeg) : null,

        // 保険：他のモジュールが raw を期待しても壊れないように
        aRaw,
        bRaw,
        aPlanetKey: aKey,
        bPlanetKey: bKey,
        aSignKey: aSign,
        bSignKey: bSign,
    };
}


/* =========================
 * list style: 既存行 + fusion追記
 * ========================= */
function formatListWithOptionalFusion({
    story,
    item,
    prefix,
    deps,
    baseFormatter,
    fusionTemplate,
} = {}) {
    const line = isFn(baseFormatter) ? baseFormatter(story, item, prefix, deps) : "";
    if (!trimStr(line)) return "";

    const normalized = normalizeSkyForFusion(story, item, deps);
    const flavor = trimStr(buildFlavorBlockSky({ story, item, normalized, deps }));

    const fusion = flavor
        ? flavor
        : trimStr(
            callBuildFusionSentence(deps, normalized, {
                template: fusionTemplate,
                mode: "sky",
                style: "sentence",
            })
        );

    if (!fusion) return `${line}`;     // fusion空＝呼べてない/参照できない
    return `${line}\n${fusion}`.trim();

}

/* =========================
 * essay style: fusion主役（同じ星を文章で並べる）
 * ========================= */
function formatEssayFromSameItem({
    story,
    item,
    deps,
    fallbackFormatter,
    prefix = "・",
    fusionTemplate,
} = {}) {
    const normalized = normalizeSkyForFusion(story, item, deps);

    const fusion = trimStr(buildFlavorBlockSky({ story, item, normalized, deps })) ||
        trimStr(
            callBuildFusionSentence(deps, normalized, {
                template: fusionTemplate,
                mode: "sky",
                style: "sentence",
            })
        );

    if (fusion) return `${prefix}${fusion}`;

    if (isFn(fallbackFormatter)) {
        const line = trimStr(fallbackFormatter(story, item, "・", deps));
        return line ? `${prefix}${line.replace(/^・\s?/, "")}` : "";
    }
    return "";
}

/* =========================
 * main renderer
 * ========================= */
function renderSoraBase(story, opts = {}, deps = {}) {
    const {
        buildNowModernPlanetCounts,
        buildDistLinesFromcounts,
        buildYoinGlobal,
        RENDER_COPY,
    } = deps || {};

    const { fmtSoraSkyLine } = resolveFormatters(deps);
    const sep = deps?.RENDER_COPY?.LINE_SEP || "────────────────";
    const circles = deps?.RENDER_COPY?.CIRCLES || ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

    const limit =
        opts.limit === Infinity ? Infinity : (isFiniteNum(opts.limit) ? Number(opts.limit) : 15);

    const style = safeStr(opts.style || "list"); // "list" | "essay"
    const dateLabel = toDotDate(story?.meta?.date_local);

    const moonLine = (() => {
        const moonJa = story?.public?.moon?.sign_ja || null;
        return moonJa ? `🌙月：${moonJa}` : "";
    })();

    // ✅ 星の構成は固定
    const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
    const sorted = skyAll
        .filter((r) => isFiniteNum(r?.orb_deg))
        .sort((a, b) => Number(a.orb_deg) - Number(b.orb_deg));

    const list = limit === Infinity ? sorted : sorted.slice(0, Math.max(1, limit));
    const isAll = limit === Infinity;

    // ✅ ここが flavor の根：テンプレ未定義で “同じ汎用文” に落ちるのを防ぐ
    // - top5は少し厚め（sky_aline）
    // - allは軽め（sky_micro）
    const fusionTemplate = isAll ? "sky_micro" : "sky_aline";

    const mainLines = list.length
        ? (style === "essay"
            ? list
                .map((s, i) =>
                    formatEssayFromSameItem({
                        story,
                        item: s,
                        deps,
                        fallbackFormatter: fmtSoraSkyLine,
                        prefix: `${circles[i] || `${i + 1}.`} `,
                        fusionTemplate,
                    })
                )
                .filter(Boolean)
                .join("\n")
            : list
                .map((s, i) =>
                    formatListWithOptionalFusion({
                        story,
                        item: s,
                        prefix: `${circles[i] || `${i + 1}.`} `,
                        deps,
                        baseFormatter: fmtSoraSkyLine,
                        fusionTemplate,
                    })
                )
                .filter(Boolean)
                .join(`\n\n${sep}\n\n`))
        : "";

    // dist
    const nowCounts = isFn(buildNowModernPlanetCounts) ? buildNowModernPlanetCounts(story) : null;
    let distLines = isFn(buildDistLinesFromcounts)
        ? buildDistLinesFromcounts(nowCounts, { forX: false })
        : "";

    const sumCounts = (c) =>
        Number(c?.element?.fire || 0) +
        Number(c?.element?.earth || 0) +
        Number(c?.element?.air || 0) +
        Number(c?.element?.water || 0);

    if (!trimStr(distLines) || sumCounts(nowCounts) === 0) {
        const dict = deps?.dict || require("../../dict");
        const signs = dict?.SIGNS_V2?.signs || dict?.SIGNS_V1?.signs || {};
        const publicSignKey = deps?.publicSignKey;

        const element = { fire: 0, earth: 0, air: 0, water: 0 };
        const modality = { cardinal: 0, fixed: 0, mutable: 0 };

        const BODIES = [
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
        ];

        const addSignKey = (signKey) => {
            const sKey = String(signKey || "").toLowerCase();
            if (!sKey) return;
            const s = signs?.[sKey] || null;
            const e = String(s?.element || "").toLowerCase();
            const m = String(s?.modality || "").toLowerCase();
            if (element[e] !== undefined) element[e] += 1;
            if (modality[m] !== undefined) modality[m] += 1;
        };

        if (typeof publicSignKey === "function") {
            BODIES.forEach((bodyKey) => addSignKey(publicSignKey(story, bodyKey)));
        }

        const containers = [
            story?.public?.bodies,
            story?.public?.body_map,
            story?.public?.bodies_map,
            story?.public?.positions,
            story?.public?.pos,
            story?.public?.now,
        ].filter(Boolean);

        if (sumCounts({ element }) === 0) {
            containers.forEach((c) => {
                Object.entries(c || {}).forEach(([k, v]) => {
                    const key = String(k || "").toLowerCase();
                    if (!BODIES.includes(key)) return;
                    if (typeof v === "string") return addSignKey(v);
                    if (!v || typeof v !== "object") return;
                    const sk =
                        v.sign_key ||
                        v.signKey ||
                        v.sign?.key ||
                        v.sign?.sign_key ||
                        v.sign?.signKey ||
                        v.sign;
                    if (sk) addSignKey(sk);
                });
            });
        }

        if (sumCounts({ element }) === 0) {
            const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
            const signMap = {};
            for (const r of skyAll) {
                const a = String(r?.a || "").toLowerCase();
                const b = String(r?.b || "").toLowerCase();
                if (a && !signMap[a]) signMap[a] = r?.a_sign_key || r?.aSignKey || r?.a_sign || "";
                if (b && !signMap[b]) signMap[b] = r?.b_sign_key || r?.bSignKey || r?.b_sign || "";
            }
            BODIES.forEach((bodyKey) => addSignKey(signMap[bodyKey]));
        }

        const elementOut = element;
        const modalityOut = modality;

        const el = RENDER_COPY?.DIST?.ELEMENT_LINE_EMOJI
            ? RENDER_COPY.DIST.ELEMENT_LINE_EMOJI(elementOut)
            : RENDER_COPY?.DIST?.ELEMENT_LINE
                ? RENDER_COPY.DIST.ELEMENT_LINE(elementOut)
                : "";
        const mo = RENDER_COPY?.DIST?.MODALITY_LINE_EMOJI
            ? RENDER_COPY.DIST.MODALITY_LINE_EMOJI(modalityOut)
            : RENDER_COPY?.DIST?.MODALITY_LINE
                ? RENDER_COPY.DIST.MODALITY_LINE(modalityOut)
                : "";
        distLines = [el, mo].filter(Boolean).join("\n").trim();
    }

    // yoin（空層余韻）
    const publicSignKey = deps?.publicSignKey;
    const contactsForGlobal = (isAll ? sorted : list).map((r) => {
        const n = normalizeSkyForFusion(story, r, deps); // ←SSOT

        return {
            kind: "public",
            a: n.a,                 // lower key（辞書向け）
            b: n.b,
            type: n.aspect?.type || r?.type || "", // normalizeAspectType 済み
            a_sign_key: n.a_sign_key,
            b_sign_key: n.b_sign_key,
            orb_deg: isFiniteNum(r?.orb_deg) ? Number(r.orb_deg) : null,
        };
    });

    const kusouText = trimStr(
        typeof deps?.buildYoinLine === "function"
            ? deps.buildYoinLine(story, {
                kind: "public",
                statsScope: isAll ? "all" : "top",
                contactsForGlobal,        // ← 既に作ってるそれを渡す
                maxContacts: 10,
                minWeight: 0.12,
                includeDeep: true,
                compact: true,
            })
            : ""
    );
    
    // template hook
    const tpl = RENDER_COPY?.TPL?.LINE?.buildSora;
    if (isFn(tpl)) {
        const footerLines = RENDER_COPY?.FOOTER_SORA_LINE;
        const footer = Array.isArray(footerLines) ? footerLines.join("\n") : trimStr(footerLines);

        return trimStr(
            tpl({
                dateLabel,
                mainLines,
                moonLine,
                distLines,
                kusouYoin: kusouText,
                footerLines: footer,
                listTitle: opts.listTitle,
            })
        );
    }

    return buildLineSoraFallback({
        dateLabel,
        listTitle: opts.listTitle,
        moonLine,
        mainLines,
        distLines,
        kusouYoin: kusouText,
        footerLines: RENDER_COPY?.FOOTER_SORA_LINE,
    });
}

/* =========================
 * public API
 * ========================= */
function renderSoraLine(story, deps = {}) {
    const title = deps?.RENDER_COPY?.HEAD_SORA_SKY_TOP5 || "【今日のソラの配置 上位5共鳴（orb≤6°）】";
    if (boolishEnv(process.env.LINE_AI_ENABLED)) {
        try {
            return renderSoraBaseAI(story, { limit: 5, listTitle: title }, deps);
        } catch (_) {
            return renderSoraBase(story, { limit: 5, listTitle: title, style: "list" }, deps);
        }
    }
    return renderSoraBase(story, { limit: 5, listTitle: title, style: "list" }, deps);
}

function renderSoraAllLine(story, deps = {}) {
    const title = deps?.RENDER_COPY?.HEAD_SORA_SKY_ALL || "【今日のソラの配置 全部（orb≤6°）】";
    if (boolishEnv(process.env.LINE_AI_ENABLED)) {
        try {
            return renderSoraBaseAI(story, { limit: Infinity, listTitle: title }, deps);
        } catch (_) {
            return renderSoraBase(story, { limit: Infinity, listTitle: title, style: "list" }, deps);
        }
    }
    return renderSoraBase(story, { limit: Infinity, listTitle: title, style: "list" }, deps);
}

function renderSoraLineEssay(story, deps = {}) {
    const title = deps?.RENDER_COPY?.HEAD_SORA_SKY_TOP5 || "【今日のソラの配置 上位5共鳴（orb≤6°）】";
    if (boolishEnv(process.env.LINE_AI_ENABLED)) {
        try {
            return renderSoraBaseAI(story, { limit: 5, listTitle: title }, deps);
        } catch (_) {
            return renderSoraBase(story, { limit: 5, listTitle: title, style: "essay" }, deps);
        }
    }
    return renderSoraBase(story, { limit: 5, listTitle: title, style: "essay" }, deps);
}

function renderSoraAllLineEssay(story, deps = {}) {
    const title = deps?.RENDER_COPY?.HEAD_SORA_SKY_ALL || "【今日のソラの配置 全部（orb≤6°）】";
    if (boolishEnv(process.env.LINE_AI_ENABLED)) {
        try {
            return renderSoraBaseAI(story, { limit: Infinity, listTitle: title }, deps);
        } catch (_) {
            return renderSoraBase(story, { limit: Infinity, listTitle: title, style: "essay" }, deps);
        }
    }
    return renderSoraBase(story, { limit: Infinity, listTitle: title, style: "essay" }, deps);
}

function renderSoraUraLine(story, deps = {}) {
    const dateLabel = toDotDate(story?.meta?.date_local);
    const parts = [
        `🌒 ソラのうら｜${dateLabel}`,
        "・沈黙のほし",
        "・裏共鳴",
        "・調和層",
        "",
        "「沈黙のほし」「裏共鳴」「調和層」",
        "送ってね🪐",
    ];
    return parts.join("\n").trim();
}

function renderSoraUraSilentLine(story, deps = {}) {
    const { fmtSoraSkyLine } = resolveFormatters(deps);
    const dateLabel = toDotDate(story?.meta?.date_local);
    const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
    const sorted = skyAll
        .filter((r) => isFiniteNum(r?.orb_deg))
        .sort((a, b) => Number(a.orb_deg) - Number(b.orb_deg));

    const list = sorted
        .map((r) => ({ raw: r, norm: normalizeSkyForFusion(story, r, deps) }))
        .filter((x) => {
            const a = String(x.norm?.a || "").toLowerCase();
            const b = String(x.norm?.b || "").toLowerCase();
            return a === "chiron" || b === "chiron" || a === "lilith" || b === "lilith";
        })
        .slice(0, 5)
        .map((x) => x.raw);

    if (!list.length) {
        return [`🌒 沈黙のほし｜${dateLabel}`, "今日は沈黙。"].join("\n").trim();
    }

    if (boolishEnv(process.env.LINE_AI_ENABLED)) {
        return renderSoraBaseAI(
            { ...story, public: { ...story?.public, sky_all: list } },
            {
                limit: Math.min(5, list.length),
                listTitle: "",
                headerLine: `🌒 沈黙のほし｜${dateLabel}`,
                includeMoon: false,
                includeDist: false,
                includeSkyLayer: false,
                includeFooter: false,
            },
            deps
        );
    }

    const lines = list
        .map((s) =>
            formatListWithOptionalFusion({
                story,
                item: s,
                prefix: "・",
                deps,
                baseFormatter: fmtSoraSkyLine,
                fusionTemplate: "sky_micro",
            })
        )
        .filter(Boolean)
        .join("\n\n");

    return [`🌒 沈黙のほし｜${dateLabel}`, lines].join("\n").trim();
}

function renderSoraUraRareLine(story, deps = {}) {
    const { fmtSoraSkyLine } = resolveFormatters(deps);
    const dateLabel = toDotDate(story?.meta?.date_local);
    const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
    const sorted = skyAll
        .filter((r) => isFiniteNum(r?.orb_deg))
        .sort((a, b) => Number(a.orb_deg) - Number(b.orb_deg));

    const rareAspects = new Set([
        "quintile_72",
        "biquintile_144",
        "septile_family",
        "semi_square_45",
        "sesqui_square_135",
        "semi_sextile_30",
        "novile_40",
        "binovile_80",
        "quadranovile_160",
        "decile_36",
        "tridecile_108",
    ]);

    function skyKey(norm) {
        const a = String(norm?.a || "").toLowerCase();
        const b = String(norm?.b || "").toLowerCase();
        const t = String(norm?.aspect?.type || norm?.type || "").toLowerCase();
        const pair = [a, b].sort().join("|");
        return `${pair}|${t}`;
    }

    const topKeySet = new Set(
        sorted
            .slice(0, 5)
            .map((r) => normalizeSkyForFusion(story, r, deps))
            .map((n) => skyKey(n))
            .filter(Boolean)
    );

    const candidates = sorted
        .map((r) => ({ raw: r, norm: normalizeSkyForFusion(story, r, deps) }))
        .filter((x) => !topKeySet.has(skyKey(x.norm)));

    const rareList = candidates.filter((x) =>
        rareAspects.has(String(x.norm?.aspect?.type || x.norm?.type || "").toLowerCase())
    );

    const list = (rareList.length ? rareList : candidates)
        .slice(0, 5)
        .map((x) => x.raw);

    if (!list.length) {
        return [`🌒 裏共鳴｜${dateLabel}`, "（該当なし）"].join("\n").trim();
    }

    if (boolishEnv(process.env.LINE_AI_ENABLED)) {
        return renderSoraBaseAI(
            { ...story, public: { ...story?.public, sky_all: list } },
            {
                limit: Math.min(5, list.length),
                listTitle: "",
                headerLine: `🌒 裏共鳴｜${dateLabel}`,
                includeMoon: false,
                includeDist: false,
                includeSkyLayer: false,
                includeFooter: false,
            },
            deps
        );
    }

    const lines = list
        .map((s) =>
            formatListWithOptionalFusion({
                story,
                item: s,
                prefix: "・",
                deps,
                baseFormatter: fmtSoraSkyLine,
                fusionTemplate: "sky_micro",
            })
        )
        .filter(Boolean)
        .join("\n\n");

    return [`🌒 裏共鳴｜${dateLabel}`, lines].join("\n").trim();
}

function renderSoraUraHarmonyLine(story, deps = {}) {
    const { fmtSoraSkyLine } = resolveFormatters(deps);
    const dateLabel = toDotDate(story?.meta?.date_local);
    const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
    const sorted = skyAll
        .filter((r) => isFiniteNum(r?.orb_deg))
        .sort((a, b) => Number(a.orb_deg) - Number(b.orb_deg));

    function skyKey(norm) {
        const a = String(norm?.a || "").toLowerCase();
        const b = String(norm?.b || "").toLowerCase();
        const t = String(norm?.aspect?.type || norm?.type || "").toLowerCase();
        const pair = [a, b].sort().join("|");
        return `${pair}|${t}`;
    }

    const topKeySet = new Set(
        sorted
            .slice(0, 5)
            .map((r) => normalizeSkyForFusion(story, r, deps))
            .map((n) => skyKey(n))
            .filter(Boolean)
    );

    const list = sorted
        .map((r) => ({ raw: r, norm: normalizeSkyForFusion(story, r, deps) }))
        .filter((x) => {
            const t = String(x.norm?.aspect?.type || x.norm?.type || "").toLowerCase();
            return t === "trine" || t === "sextile";
        })
        .filter((x) => !topKeySet.has(skyKey(x.norm)))
        .map((x) => x.raw);

    if (!list.length) {
        return [`🌓 調和層｜${dateLabel}`, "（該当なし）"].join("\n").trim();
    }

    if (boolishEnv(process.env.LINE_AI_ENABLED)) {
        return renderSoraBaseAI(
            { ...story, public: { ...story?.public, sky_all: list } },
            {
                limit: Math.min(5, list.length),
                listTitle: "",
                headerLine: `🌓 調和層｜${dateLabel}`,
                includeMoon: false,
                includeDist: false,
                includeSkyLayer: false,
                includeFooter: false,
            },
            deps
        );
    }

    const lines = list
        .map((s) =>
            formatListWithOptionalFusion({
                story,
                item: s,
                prefix: "・",
                deps,
                baseFormatter: fmtSoraSkyLine,
                fusionTemplate: "sky_micro",
            })
        )
        .filter(Boolean)
        .join("\n\n");

    return [`🌓 調和層｜${dateLabel}`, lines].join("\n").trim();
}

module.exports = {
    renderSoraLine,
    renderSoraAllLine,
    renderSoraBase,
    renderSoraLineEssay,
    renderSoraAllLineEssay,
    renderSoraUraLine,
    renderSoraUraSilentLine,
    renderSoraUraRareLine,
    renderSoraUraHarmonyLine,
};
