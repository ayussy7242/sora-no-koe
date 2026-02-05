"use strict";

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
    const keywordAll = kwBase.length > 5 ? _pickMany(kwBase, `${seed}|KW`, 5) : kwBase;
    const keywordLine = keywordAll.length ? `KeyWord: ${keywordAll.join(" / ")}` : "";

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
                .map((s) =>
                    formatEssayFromSameItem({
                        story,
                        item: s,
                        deps,
                        fallbackFormatter: fmtSoraSkyLine,
                        prefix: "・",
                        fusionTemplate,
                    })
                )
                .filter(Boolean)
                .join("\n")
            : list
                .map((s) =>
                    formatListWithOptionalFusion({
                        story,
                        item: s,
                        prefix: "・",
                        deps,
                        baseFormatter: fmtSoraSkyLine,
                        fusionTemplate,
                    })
                )
                .filter(Boolean)
                .join("\n\n"))
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
    return renderSoraBase(story, { limit: 5, listTitle: title, style: "list" }, deps);
}

function renderSoraAllLine(story, deps = {}) {
    const title = deps?.RENDER_COPY?.HEAD_SORA_SKY_ALL || "【空の配置（すべて）】";
    return renderSoraBase(story, { limit: Infinity, listTitle: title, style: "list" }, deps);
}

function renderSoraLineEssay(story, deps = {}) {
    const title = deps?.RENDER_COPY?.HEAD_SORA_SKY_TOP5 || "【今日のソラの配置 上位5共鳴（orb≤6°）】";
    return renderSoraBase(story, { limit: 5, listTitle: title, style: "essay" }, deps);
}

function renderSoraAllLineEssay(story, deps = {}) {
    const title = deps?.RENDER_COPY?.HEAD_SORA_SKY_ALL || "【空の配置（すべて）】";
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

    const lines = list.length
        ? list
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
            .join("\n\n")
        : "……★*";

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

    const lines = list.length
        ? list
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
            .join("\n\n")
        : "（該当なし）";

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

    const lines = list.length
        ? list
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
            .join("\n\n")
        : "（該当なし）";

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
