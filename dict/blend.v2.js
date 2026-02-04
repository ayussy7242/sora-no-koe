"use strict";

/**
 * blend.v2 (SSOT / FULL INTEGRATED + A-line final) — 2026.02 (SKY policy patched)
 *
 * ✅ POLICY (2026.02.04)
 * - sky_aline は relation を基本使わない（A/B 主語が既にあるので dynamics だけで自然）
 *   -> 「触れ。」「噛み合い。」等の二重化を根絶
 * - personal A-line は relation を使ってOK（ただし relation 抽出は SSOT 衛生化）
 *
 * ✅ FIX
 * - buildFusionSentence が personal を空文字で返さない（A-line を返す）
 * - extractBodyKey を内蔵（依存解消）
 * - resolveAspectRelationJa は「先頭が」除去＆「末尾読点」統一（SSOT）
 * - sky は relation を捨てるため「触れ、」「が重なり、」等の事故が出ない
 */

const BLEND_V2 = Object.freeze({
    version: "blend.v2",
    locale: "ja",

    style: Object.freeze({
        block_gap: "\n\n",
        line_break: "\n",
        bullet: "・",
        arrow: "→",
        x: "×",
        dash: "｜",
        quote_open: "「",
        quote_close: "」",
    }),

    limits: Object.freeze({
        max_line_chars: 34,
        max_block_chars: 340,
        max_total_chars: 1800,
    }),

    legacy: Object.freeze({
        aspect_sentence_by_label_ja: Object.freeze({
            コンジャンクション: "同じ領域で重なり、性質が強く表れやすい配置。",
            セクスタイル: "噛み合う通路ができ、協力や選択肢が開きやすい配置。",
            スクエア: "進行方向の違いが交差し、摩擦や調整点が表に出やすい配置。",
            トライン: "自然に循環しやすく、無理なく機能しやすい配置。",
            オポジション: "外側（関係/出来事）に映りやすく、鏡として見えやすい配置。",
            セミセクスタイル: "気配レベルの接点として現れやすく、意識の外で反応しやすい配置。",
            セミスクエア: "小さな引っかかりとして出やすく、微調整のサインになりやすい配置。",
            セスキスクエア: "積み重なった圧が表に出やすく、転換点の摩擦として現れやすい配置。",
            インコンジャンクト: "自然に噛み合いにくく、合わせにいく調整圧が出やすい配置。",
            クインタイル: "独自の工夫が生まれやすく、創造の回路として現れやすい配置。",
            バイクインタイル: "反復と試行錯誤で熟成し、表現が整い続けやすい配置。",
        }),
    }),

    vertical: Object.freeze({
        planet_in_sign: Object.freeze({
            pattern_ja: "{sign}の{planet}：{sign_core}の領域で、{planet_core}",

            planet_core_override_ja: Object.freeze({
                sun: "中心／意志／生の火",
                moon: "感情／反応／安心",
                mercury: "思考／言葉／接続",
                venus: "好み／関係／価値",
                mars: "行動／衝動／境界",
                jupiter: "拡大／寛容／追い風",
                saturn: "枠組み／責任／鍛錬",
                uranus: "刷新／解放／突然性",
                neptune: "溶解／夢／境界の薄さ",
                pluto: "変容／極点／再生",
                chiron: "傷と癒し／学びの入口",
                asc: "入口／印象／身体感覚",
            }),

            sign_core_override_ja: Object.freeze({
                aries: "始まり／衝動／直線",
                taurus: "身体／感覚／定着",
                gemini: "情報／交換／軽さ",
                cancer: "居場所／保護／親密",
                leo: "表現／中心／誇り",
                virgo: "整える／分析／微調整",
                libra: "関係／バランス／美意識",
                scorpio: "深層／境界／変容",
                sagittarius: "拡張／探求／視野",
                capricorn: "構造／責任／積み上げ",
                aquarius: "刷新／観測／自由",
                pisces: "溶解／共鳴／余韻",
            }),
        }),

        aspect_sentence_by_label_ja: Object.freeze({}),
    }),

    fusion: Object.freeze({
        sign_field_ja: Object.freeze({
            aries: "始まりの端",
            taurus: "定着の地層",
            gemini: "行き来の風",
            cancer: "内側の水辺",
            leo: "中心の灯",
            virgo: "整える手元",
            libra: "調律の場",
            scorpio: "境界の深部",
            sagittarius: "視野の外縁",
            capricorn: "現実の骨格",
            aquarius: "更新の視点",
            pisces: "溶解の場",
        }),

        planet_action_ja: Object.freeze({
            sun: "中心",
            moon: "反応",
            mercury: "言葉",
            venus: "価値",
            mars: "境界",
            jupiter: "拡大",
            saturn: "枠",
            uranus: "更新",
            neptune: "溶解",
            pluto: "圧",
            chiron: "傷の入口",
            asc: "入口",
        }),

        aspect_dynamics_ja: Object.freeze({
            コンジャンクション: "性質が重なって強調されやすい",
            セクスタイル: "噛み合う余白が生まれやすい",
            スクエア: "摩擦や調整点が表に出やすい",
            トライン: "自然に循環しやすい",
            オポジション: "外側に映りやすく、鏡として見えやすい",
            セミセクスタイル: "気配レベルの接点として現れやすい",
            セミスクエア: "微調整が起きやすい",
            セスキスクエア: "積み重なった圧が摩擦として表に出やすい",
            インコンジャンクト: "噛み合いにくさが調整として出やすい",
            クインタイル: "工夫や創造の回路が立ち上がりやすい",
            バイクインタイル: "反復で熟成し、整い続けやすい",
        }),

        orb_hint_ja: Object.freeze([
            { max: 0.3, text: "" },
            { max: 1.0, text: "" },
            { max: 3.0, text: "" },
        ]),

        // NOTE: templates are here for legacy usage; SKY policy is enforced in buildAlineSkyFusionJa/buildFusionSentence.
        template_ja: "{field_natal}で{action_natal}が動き、{field_transit}で{action_transit}がにじみ、{dynamics}{orb_hint}。",
        template_mini_ja: "{field_natal}と{field_transit}の間で、{dynamics}{orb_hint}。",
        template_micro_ja: "{dynamics}{orb_hint}。",

        template_sky_ja: "{field_natal}で{action_natal}が動き、{field_transit}で{action_transit}が重なり、{dynamics}{orb_hint}。",
        template_sky_mini_ja: "{field_natal}と{field_transit}の間で、{dynamics}{orb_hint}。",
        template_sky_micro_ja: "{dynamics}{orb_hint}。",
    }),

    blocks: Object.freeze({
        legacy: Object.freeze({ body_lines_ja: ["{arrow} {aspect_sentence}"] }),
        vertical: Object.freeze({ body_lines_ja: ["{natal_blend}", "{transit_blend}", "{arrow} {aspect_sentence}"] }),
        fusion: Object.freeze({ body_lines_ja: ["{fusion_sentence}"] }),
        sky_fusion: Object.freeze({ body_lines_ja: ["{fusion_sentence}"] }),
    }),

    headers: Object.freeze({
        personal_aspect_ja: "{idx}ネイタル：{natal} × トランジット：{transit}｜{aspect}（{angle}°｜orb {orb}°）",
        sky_aspect_ja: "{idx}{a} × {b}｜{aspect}（{angle}°｜orb {orb}°）",
    }),
});

// ----------------------------
// Optional imports (safe)
// ----------------------------
let LOCAL_SIGN_FLAVOR_V1 = null;
let LOCAL_GRAMmars_V1 = null;

function _safeRequire(path) {
    try {
        return require(path);
    } catch (_) {
        return null;
    }
}

{
    const mod =
        _safeRequire("../dict/sign_flavor.v1") ||
        _safeRequire("../dict/sign_flavor.v1.js") ||
        _safeRequire("../dict/sign_flavor_v1") ||
        _safeRequire("../dict/sign_flavor_v1.js") ||
        _safeRequire("./sign_flavor.v1") ||
        _safeRequire("./sign_flavor.v1.js") ||
        _safeRequire("./sign_flavor_v1") ||
        _safeRequire("./sign_flavor_v1.js");
    LOCAL_SIGN_FLAVOR_V1 = mod?.SIGN_FLAVOR_V1 || null;
}

{
    const mod =
        _safeRequire("../dict/grammars.v1") ||
        _safeRequire("../dict/grammars.v1.js") ||
        _safeRequire("./grammars.v1") ||
        _safeRequire("./grammars.v1.js");
    LOCAL_GRAMmars_V1 = mod?.GRAMmars_V1 || null;
}

// ----------------------------
// Helpers
// ----------------------------
function extractBodyKey(x) {
    if (!x) return null;
    if (typeof x === "string") return x;
    if (typeof x === "number") return String(x);
    return (
        x.key ||
        x.body_key ||
        x.planet_key ||
        x.point_key ||
        x.body ||
        x.planet ||
        x.point ||
        x.id ||
        null
    );
}

function _asStr(x, fb = "") {
    return typeof x === "string" ? x : fb;
}
function _trim(x, fb = "") {
    const s = _asStr(x, fb);
    return s ? s.trim() : fb;
}
function _normSignKey(k) {
    return String(k || "").toLowerCase().trim();
}
function _normPlanetKey(k) {
    return String(k || "").toLowerCase().trim();
}
function _normAspectLabelJa(k) {
    return String(k || "").trim();
}

function _hash32(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
function _pick(pool, seedStr, fallback) {
    if (!Array.isArray(pool) || pool.length === 0) return fallback;
    const h = _hash32(String(seedStr || ""));
    return pool[h % pool.length] ?? fallback;
}

function joinJa(parts, sep = "、") {
    return (parts || [])
        .map((v) => (v == null ? "" : String(v)).trim())
        .map((v) => v.replace(/[、,]+$/g, "")) // 句の末尾読点を吸収（「、。」事故防止）
        .filter(Boolean)
        .join(sep);
}

function _cleanFieldJa(s) {
    const t = String(s || "").trim();
    return t.replace(/[。．\.！!？?\s]+$/g, "");
}

// ============================================================
// JP sentence hygiene (SSOT)
// ============================================================

// 素材の「句」を整える：句点→読点、連続読点を圧縮、素材末尾の読点は落とす
function _jaClauseify(s) {
    let t = String(s || "").trim();
    if (!t) return "";

    // 句点系 → 読点（「触れ。 微調整…」を潰す）
    t = t.replace(/[。．\.]+/g, "、");

    // カンマ/読点/空白の混在を「、」へ寄せて圧縮
    t = t.replace(/[、,\s]+/g, "、");

    // 先頭/末尾の読点は素材としては不要なので落とす
    t = t.replace(/^、+/g, "").replace(/、+$/g, "");

    return t.trim();
}

// relation は“接続句”なので末尾を必ず「、」に固定する
function _relationNoGaHead(s) {
    let u = _jaClauseify(s);

    // 先頭「が」除去
    u = u.replace(/^\s*が+/g, "").replace(/^[、,\s]+/g, "").trim();

    return u ? `${u}、` : "";
}

function _jaToken(s) {
    return _jaClauseify(s);
}

function _finalizeAlineJa(s) {
    return String(s || "")
        // 「。 + 空白 + 次の文字」→「、」へ
        .replace(/。\s+(?=[^\n。])/g, "、")
        // 連続読点を圧縮
        .replace(/(、)\s*(、)+/g, "、")
        // 先頭の句読点を除去
        .replace(/^[、\s]+/g, "")
        // 「、、。」や「、 。」系を整える
        .replace(/、\s*。/g, "。")
        .replace(/[、,\s]+。/g, "。")
        // 句点が二重になったら1つに
        .replace(/。{2,}/g, "。")
        // 「がが」圧縮（最後にやる）
        .replace(/がが+/g, "が")
        // 空白整形
        .replace(/\s+/g, " ")
        .trim();
}

// ============================================================
// aspect key（英語/内部キー）→ 日本語ラベルへ寄せる
// ============================================================
function _normalizeAspectTypeKey(t) {
    const k = String(t || "").toLowerCase().trim();
    if (!k) return "";
    const map = {
        conjunction: "コンジャンクション",
        opposition: "オポジション",
        square: "スクエア",
        trine: "トライン",
        sextile: "セクスタイル",
        quincunx: "インコンジャンクト",
        semisextile: "セミセクスタイル",
        semisquare: "セミスクエア",
        sesquisquare: "セスキスクエア",
        quintile: "クインタイル",
        biquintile: "バイクインタイル",

        // underscored variants
        semi_square_45: "セミスクエア",
        sesqui_square_135: "セスキスクエア",
        semi_sextile_30: "セミセクスタイル",
        biquintile_144: "バイクインタイル",
        quintile_72: "クインタイル",
        quincunx_150: "インコンジャンクト",
    };
    return map[k] || t;
}

function _getSignFlavor(dict) {
    return dict?.SIGN_FLAVOR_V1 || dict?.sign_flavor || LOCAL_SIGN_FLAVOR_V1 || null;
}
function _getGrammars(dict) {
    return dict?.GRAMmars_V1 || dict?.grammars || LOCAL_GRAMmars_V1 || null;
}

// ----------------------------
// V1 sign flavor (fallback) helpers
// ----------------------------
function _getSignEntry(flavor, signKey) {
    const k = _normSignKey(signKey);
    if (!flavor) return null;
    if (flavor.signs && flavor.signs[k]) return flavor.signs[k];
    if (flavor[k]) return flavor[k];
    return null;
}
function _getByBodyEntry(signEntry, planetKey) {
    if (!signEntry) return null;
    const p = _normPlanetKey(planetKey);
    return signEntry.by_body?.[p] || null;
}

// ----------------------------
// V2 dict accessors
// ----------------------------
function _getPlanetsV2(dict) {
    return dict?.PLANETS_V2 || dict?.PLANETS || null;
}
function _getSignsV2(dict) {
    return dict?.SIGNS_V2 || dict?.SIGNS || null;
}
function _getAspectsV2(dict) {
    return dict?.ASPECTS_V2 || dict?.ASPECTS || null;
}

function _getPlanetV2(dict, planetKey) {
    const P = _getPlanetsV2(dict);
    const k = _normPlanetKey(planetKey);
    return P?.bodies?.[k] || null;
}
function _getSignV2(dict, signKey) {
    const S = _getSignsV2(dict);
    const k = _normSignKey(signKey);
    return S?.signs?.[k] || S?.[k] || null;
}

function _planetSignMaterialV2(dict, planetKey, signKey) {
    const p = _getPlanetV2(dict, planetKey);
    const s = _getSignV2(dict, signKey);

    const pRole = _trim(p?.role, _trim(p?.core, String(planetKey || "")));
    const pCore = _trim(p?.core, pRole);

    const sFlavor = _trim(s?.flavor, _trim(s?.tone, _trim(s?.core, String(signKey || ""))));
    const sCore = _trim(s?.core, sFlavor);

    const pTexture = Array.isArray(p?.texture) ? p.texture.filter(Boolean) : [];
    const sTexture = Array.isArray(s?.texture) ? s.texture.filter(Boolean) : [];

    const pVerbs = Array.isArray(p?.verbs) ? p.verbs.filter(Boolean) : [];
    const sVerbs = Array.isArray(s?.verbs) ? s.verbs.filter(Boolean) : [];

    return { p, s, pRole, pCore, sFlavor, sCore, pTexture, sTexture, pVerbs, sVerbs };
}

// ----------------------------
// resolveSignPlanet (V1 fallback API)
// ----------------------------
function resolveSignPlanet(dict, signKey, planetKey) {
    const flavor = _getSignFlavor(dict);
    const sign = _getSignEntry(flavor, signKey);
    const by = _getByBodyEntry(sign, planetKey);
    return { sign, by };
}

function _getSignFlavorPack(dict, signKey, planetKey) {
    const flavor = _getSignFlavor(dict);
    const sign = _getSignEntry(flavor, signKey);
    const by = _getByBodyEntry(sign, planetKey);
    const base = sign?.base || null;
    const fusion = by?.fusion || null;
    const defaults = by?.defaults || null;

    const arr = (x) => (Array.isArray(x) ? x.filter(Boolean) : []);
    return {
        sign,
        by,
        base,
        fusion,
        defaults,
        A_words: arr(fusion?.A),
        B_words: arr(fusion?.B),
        expr_words: arr(fusion?.expression),
        proc_words: arr(fusion?.process),
        clar_words: arr(fusion?.clarity),
        tend_words: arr(fusion?.tendency),
        coreText: _trim(by?.core, ""),
        tensionText: _trim(by?.tension, ""),
        baseFlavor: _trim(base?.flavor, ""),
        baseShort: _trim(base?.short, ""),
    };
}

function resolveFusionFieldLabel(dict, signKey) {
    const k = _normSignKey(signKey);

    const v2 = _getSignV2(dict, k);
    const v2ShortRaw =
        _trim(v2?.sora_short, "") ||
        _trim(v2?.short, "") ||
        _trim(v2?.label_ja, "") ||
        _trim(v2?.name_ja, "") ||
        _trim(v2?.label, "") ||
        "";

    const v2Short = _cleanFieldJa(v2ShortRaw);
    if (v2Short) return _cleanFieldJa(_jaToken(v2Short));

    const flavor = _getSignFlavor(dict);
    const entry = _getSignEntry(flavor, k);

    const v1ShortRaw =
        _trim(entry?.sora_short, "") ||
        _trim(entry?.short, "") ||
        _trim(entry?.tone_short, "") ||
        _trim(entry?.tone, "") ||
        "";

    const v1Short = _cleanFieldJa(v1ShortRaw);
    if (v1Short) return _cleanFieldJa(_jaToken(v1Short));

    const fb = BLEND_V2?.fusion?.sign_field_ja?.[k];
    if (fb) return _cleanFieldJa(_jaToken(fb));

    return signKey ? `${k}の領域` : "ある領域";
}

// ----------------------------
// aspect relation / dynamics (SSOT)
// ----------------------------
const ASPECT_RELATION_V1 = Object.freeze({
    コンジャンクション: ["が重なり、", "が同じ場で重なり、", "が重なって、"],
    セクスタイル: ["が噛み合い、", "が噛み合って、", "が通路を作り、"],
    スクエア: ["が摩擦として触れ、", "がぶつかり、", "が交差し、"],
    トライン: ["が自然に流れ、", "が無理なく巡り、", "が循環し、"],
    オポジション: ["が映し合い、", "が向かい合い、", "が鏡になり、"],
    セミセクスタイル: ["が気配として触れ、", "が小さく接点を持ち、", "がかすかに噛み合い、"],
    セミスクエア: ["が小さく引っかかり、", "が微調整として触れ、", "が引っかかりになり、"],
    セスキスクエア: ["が積み重なった摩擦として触れ、", "が圧として表に出て、", "が摩擦として前に出て、"],
    インコンジャンクト: ["が噛み合いにくく、", "が合わなさとして触れ、", "が調整として現れ、"],
    クインタイル: ["が工夫の回路になり、", "が創造として噛み合い、", "が独自の回路を作り、"],
    バイクインタイル: ["が反復で整い、", "が熟成として進み、", "が整い続け、"],
});

const ASPECT_FALLBACK_DYNAMICS_JA = Object.freeze({
    conjunction: "重なりやすい",
    opposition: "向かい合いやすい",
    square: "摩擦として残りやすい",
    trine: "流れとして通りやすい",
    sextile: "噛み合いとして使われやすい",
    quincunx: "ズレとして気づかれやすい",
    semisextile: "気配の接点として触れやすい",
    semisquare: "小さな引っかかりとして残りやすい",
    sesquisquare: "蓄積された摩擦として出やすい",
    quintile: "工夫の回路として現れやすい",
    biquintile: "技巧の回路として伸びやすい",
});
function fallbackDynamicsByAspectJa(aspectKey) {
    const k = String(aspectKey || "").toLowerCase().trim();
    return ASPECT_FALLBACK_DYNAMICS_JA[k] || "触れやすい";
}

// 「dynamicsっぽい語」を含むなら relation としては長すぎ/混入の疑い
const _DYNAMICS_MARKERS = /(やすい|起きやすい|生まれやすい|出やすい|見えやすい|残りやすい|表れやすい|浮かびやすい|強調|摩擦|循環|拡大|調整|工夫|反復|熟成)/;

// 句から「最初の接続句だけ」抜く（長文混入を切る）
function _extractRelationOnly(raw) {
    let t = _jaClauseify(raw);
    if (!t) return "";

    const first = t.split("、")[0] || "";
    let u = first.trim();

    // 先頭「が」除去
    u = u.replace(/^\s*が+/g, "").replace(/^[、,\s]+/g, "").trim();

    // dynamics ワード混入なら relation として不適
    if (_DYNAMICS_MARKERS.test(u)) return "";

    // 接続句として弱すぎる断片は捨てる（最後に「、」付けるのは _relationNoGaHead が担当）
    if (!/(触れ|重なり|噛み合い|交差し|流れ|巡り|映し合い|向かい合い|鏡になり)$/.test(u)) {
        // ただの名詞で終わるなら捨てる
        if (!/(し|して|となり|になり|として|で|ながら|つつ)$/.test(u)) return "";
    }

    return _relationNoGaHead(u);
}

// dynamics 側に「接続句っぽい前置き」が混じったら剥がす
function _stripRelationPrefixFromDynamics(raw) {
    let t = _jaClauseify(raw);
    if (!t) return "";
    // 例: "が反復で熟成し、整い続けやすい" -> "整い続けやすい"
    t = t.replace(/^(が[^、]+(し|して|となり|になり|として|で|ながら|つつ))、/g, "");
    return t.trim();
}

function _findAspectEntryByLabelJa(dict, aspectLabelJa) {
    const A = _getAspectsV2(dict);
    if (!A) return null;

    const pools = [A.major, A.deep_space].filter(Boolean);
    for (const pool of pools) {
        for (const k of Object.keys(pool || {})) {
            const ent = pool[k];
            if (ent?.label_ja && _normAspectLabelJa(ent.label_ja) === _normAspectLabelJa(aspectLabelJa)) return ent;
        }
    }
    return null;
}

function _findAspectEntryByKeyOrLabel(dict, aspectTypeOrLabel) {
    const A = _getAspectsV2(dict);
    if (!A) return null;

    const k = String(aspectTypeOrLabel || "").trim();
    if (A.major && A.major[k]) return A.major[k];
    if (A.deep_space && A.deep_space[k]) return A.deep_space[k];

    for (const pool of [A.major, A.deep_space]) {
        for (const kk of Object.keys(pool || {})) {
            const ent = pool[kk];
            if (ent?.label_ja && String(ent.label_ja).trim() === k) return ent;
        }
    }
    return null;
}

/**
 * ✅ resolveAspectRelationJa (PERSONAL only usage recommended)
 * - V2 clause/relation → _extractRelationOnly
 * - V1 pool → _extractRelationOnly
 * - fallback も SSOT で「触れ、」
 */
function resolveAspectRelationJa(dict, aspectLabelJa, seedStr, aspectType) {
    if (aspectType) {
        const ent0 = _findAspectEntryByKeyOrLabel(dict, aspectType);

        const clause0 = _trim(ent0?.clause, "");
        const r0 = _extractRelationOnly(clause0);
        if (r0) return r0;

        const rel0 = _trim(ent0?.relation, "");
        const r1 = _extractRelationOnly(rel0);
        if (r1) return r1;
    }

    const ent = _findAspectEntryByLabelJa(dict, aspectLabelJa);

    const clause = _trim(ent?.clause, "");
    const r2 = _extractRelationOnly(clause);
    if (r2) return r2;

    const rel = _trim(ent?.relation, "");
    const r3 = _extractRelationOnly(rel);
    if (r3) return r3;

    const poolRaw = ASPECT_RELATION_V1[_trim(aspectLabelJa)] || [];
    const pool = poolRaw.map(_extractRelationOnly).filter(Boolean);

    const picked = _pick(pool, seedStr, "触れ、");
    return picked || "触れ、";
}

function resolveAspectDynamicsJa(dict, aspectTypeOrLabelJa) {
    const key = String(aspectTypeOrLabelJa || "").trim();
    const keyNorm = _normalizeAspectTypeKey(key);

    const ent = _findAspectEntryByKeyOrLabel(dict, key) || _findAspectEntryByKeyOrLabel(dict, keyNorm);
    const labelJa = _trim(ent?.label_ja, "");

    const m = BLEND_V2?.fusion?.aspect_dynamics_ja || {};
    const hit = _trim(m[labelJa], "") || _trim(m[keyNorm], "") || _trim(m[key], "");
    if (hit) return _jaToken(_stripRelationPrefixFromDynamics(hit));

    const prose = _trim(ent?.prose_ja?.result, "");
    if (prose) return _jaToken(_stripRelationPrefixFromDynamics(prose));

    const v2sora = _trim(ent?.sora, "");
    if (v2sora) return _jaToken(_stripRelationPrefixFromDynamics(v2sora));

    const v2core = _trim(ent?.core, "");
    if (v2core) return _jaToken(_stripRelationPrefixFromDynamics(v2core));

    return _jaToken(_stripRelationPrefixFromDynamics(fallbackDynamicsByAspectJa(keyNorm || key)));
}

function resolvePlanetActionJa(planetKey) {
    const m = BLEND_V2?.fusion?.planet_action_ja || {};
    return m[String(planetKey || "")] || "";
}

function resolveAspectSentenceJa(params = {}) {
    const { aspectLabelJa, useVerticalOverride = true } = params;
    const label = _trim(aspectLabelJa);

    if (useVerticalOverride) {
        const v = BLEND_V2?.vertical?.aspect_sentence_by_label_ja?.[label];
        if (v) return v;
    }
    const l = BLEND_V2?.legacy?.aspect_sentence_by_label_ja?.[label];
    if (l) return l;

    return "";
}

function buildPlanetInSignLineJa(params = {}) {
    const { signKey, planetKey } = params;

    const pat = BLEND_V2.vertical.planet_in_sign.pattern_ja;

    const signCore =
        BLEND_V2.vertical.planet_in_sign.sign_core_override_ja?.[String(signKey || "")] || String(signKey || "");
    const planetCore =
        BLEND_V2.vertical.planet_in_sign.planet_core_override_ja?.[String(planetKey || "")] || String(planetKey || "");

    const signLabel = String(signKey || "");
    const planetLabel = String(planetKey || "");

    return pat
        .replace("{sign}", signLabel)
        .replace("{planet}", planetLabel)
        .replace("{sign_core}", signCore)
        .replace("{planet_core}", planetCore);
}

// ============================================================
// fusion sentence (simple) — keeps relation (generic), sky policy is enforced elsewhere
// ============================================================
function _pickVerb(dict, planetKey, signKey, seedStr, fallback) {
    const mat = _planetSignMaterialV2(dict, planetKey, signKey);
    const pool = [...mat.pVerbs, ...mat.sVerbs].filter(Boolean);
    const v = _pick(pool, seedStr, "");
    return _trim(_jaToken(v), _jaToken(fallback));
}

function buildFusionSentenceJa(params = {}) {
    const {
        dict,
        seed = "",
        natalSignKey,
        transitSignKey,
        natalPlanetKey,
        transitPlanetKey,
        aspectLabelJa,
        aspectType,
    } = params;

    const A_field = _jaToken(resolveFusionFieldLabel(dict, natalSignKey));
    const B_field = _jaToken(resolveFusionFieldLabel(dict, transitSignKey));

    const A_act = _jaToken(resolvePlanetActionJa(natalPlanetKey) || "");
    const B_act = _jaToken(resolvePlanetActionJa(transitPlanetKey) || "");

    const A_verb = _pickVerb(
        dict,
        natalPlanetKey,
        natalSignKey,
        `${seed}|verb|A|${natalPlanetKey}|${natalSignKey}|${aspectType || aspectLabelJa}`,
        "動き"
    );

    const B_verb = _pickVerb(
        dict,
        transitPlanetKey,
        transitSignKey,
        `${seed}|verb|B|${transitPlanetKey}|${transitSignKey}|${aspectType || aspectLabelJa}`,
        "触れ"
    );

    const relation = resolveAspectRelationJa(
        dict,
        aspectLabelJa,
        `${seed}|rel|${aspectLabelJa}|${natalPlanetKey}|${natalSignKey}|${transitPlanetKey}|${transitSignKey}`,
        aspectType
    );

    const dynamics = _jaToken(resolveAspectDynamicsJa(dict, aspectType || aspectLabelJa) || fallbackDynamicsByAspectJa(aspectType));

    const mid = joinJa(
        [
            `${A_field}で${A_act}が${A_verb}`,
            `${B_field}で${B_act}が${B_verb}`,
            `${relation}${dynamics}`,
        ],
        "、"
    );

    return mid ? _finalizeAlineJa(`${mid}。`) : "";
}

// ============================================================
// ✅ A-line (personal) — uses relation (SSOT hygiened)
// ============================================================
function buildAlineFusionJa(params = {}) {
    const {
        dict,
        seed = "",
        natalSignKey,
        transitSignKey,
        natalPlanetKey,
        transitPlanetKey,
        aspectLabelJa,
        aspectType,
        tendencyDepth = "light",
    } = params;

    const grammars = _getGrammars(dict);

    const A = _planetSignMaterialV2(dict, natalPlanetKey, natalSignKey);
    const B = _planetSignMaterialV2(dict, transitPlanetKey, transitSignKey);

    const SF_A = _getSignFlavorPack(dict, natalSignKey, natalPlanetKey);
    const SF_B = _getSignFlavorPack(dict, transitSignKey, transitPlanetKey);

    const A_sign = resolveFusionFieldLabel(dict, natalSignKey);
    const B_sign = resolveFusionFieldLabel(dict, transitSignKey);

    function _trim3(a, b, c, fb = "") {
        return _trim(a, _trim(b, _trim(c, fb)));
    }

    const A_core = _trim3(A.pRole, SF_A.coreText, A_sign);

    const B_side_pool = [
        ...B.pTexture,
        ...B.sTexture,
        B.sFlavor,
        ...SF_B.B_words,
        SF_B.tensionText,
    ].filter(Boolean);

    const B_tension = _pick(
        B_side_pool,
        `${seed}|bside|${transitPlanetKey}|${transitSignKey}|${aspectLabelJa}`,
        _trim(B.sFlavor, B_sign)
    );

    const outputKey =
        _trim(SF_A.defaults?.outputKey, "") ||
        _trim(A.p?.outputKey, "") ||
        (String(natalPlanetKey) === "moon"
            ? "reaction"
            : String(natalPlanetKey) === "mercury"
                ? "language"
                : "expression");

    const relation = resolveAspectRelationJa(
        dict,
        aspectLabelJa,
        `${seed}|rel|${aspectLabelJa}|${natalPlanetKey}|${natalSignKey}|${transitPlanetKey}|${transitSignKey}`,
        aspectType
    );

    const expressionPool = [
        ...(grammars?.categories?.[outputKey] || grammars?.categories?.expression || ["表現", "反応", "振る舞い"]),
        ...SF_A.expr_words,
    ].filter(Boolean);

    const processPool = [
        ...(grammars?.categories?.process || ["試行錯誤", "調整", "反復", "組み替え"]),
        ...SF_A.proc_words,
    ].filter(Boolean);

    const clarityPool = [
        ...(grammars?.categories?.clarity || ["輪郭", "形", "手応え", "まとまり"]),
        ...SF_A.clar_words,
    ].filter(Boolean);

    const expression = _pick(expressionPool, `${seed}|expr|${outputKey}|${A_core}|${B_tension}`, "表現");
    const process = _pick(processPool, `${seed}|proc|${A_core}|${B_tension}`, "調整");
    const clarity = _pick(clarityPool, `${seed}|clar|${A_core}|${B_tension}`, "輪郭");

    const tPool =
        grammars?.categories?.tendency?.[tendencyDepth] ||
        grammars?.categories?.tendency?.light ||
        [{ suffix: "しやすい" }, { suffix: "になりやすい" }, { suffix: "として現れやすい" }];

    const tPicked = _pick(
        tPool,
        `${seed}|tend|${tendencyDepth}|${A_core}|${B_tension}|${aspectLabelJa}`,
        { suffix: "しやすい" }
    );

    const tendPhrase = _pick(
        SF_A.tend_words,
        `${seed}|tphrase|${tendencyDepth}|${A_core}|${B_tension}|${aspectLabelJa}`,
        ""
    );

    const tendency = (tPicked && typeof tPicked === "object" ? tPicked.suffix : null) || "しやすい";

    const main = `${A_core}と${B_tension}${relation}${expression}は${process}の中で${clarity}を持つ`;
    if (tendPhrase) return _finalizeAlineJa(`${main}${tendPhrase}。`);
    return _finalizeAlineJa(`${main}${tendency}。`);
}

// ============================================================
// ✅ SKY A-line — POLICY: NO relation (dynamics only)
// ============================================================
function buildAlineSkyFusionJa(params = {}) {
    const {
        dict,
        seed = "",
        aSignKey,
        bSignKey,
        aPlanetKey,
        bPlanetKey,
        aspectType,
        aspectLabelJa,
        tendencyDepth = "light",
    } = params;

    const grammars = _getGrammars(dict);

    const A_field = resolveFusionFieldLabel(dict, aSignKey);
    const B_field = resolveFusionFieldLabel(dict, bSignKey);

    const aAct = resolvePlanetActionJa(aPlanetKey) || "";
    const bAct = resolvePlanetActionJa(bPlanetKey) || "";

    // ✅ SKY = dynamics only（relation は捨てる）
    const dynamicsRaw =
        resolveAspectDynamicsJa(dict, aspectType || aspectLabelJa) || fallbackDynamicsByAspectJa(aspectType);

    // dynamics の前後句読点・不可視文字を殺す（先頭「。」事故の根絶）
    const dynamics = String(dynamicsRaw || "")
        .replace(/[\uFEFF\u200B-\u200D\u2060]/g, "")       // 不可視
        .replace(/^[。．\.、,\s]+/g, "")                   // 先頭句読点
        .replace(/[。．\.\s]+$/g, "")                      // 末尾句点
        .trim();

    const dyn = dynamics || "触れやすい";

    const tPool =
        grammars?.categories?.tendency?.[tendencyDepth] ||
        grammars?.categories?.tendency?.light ||
        [{ suffix: "しやすい" }, { suffix: "になりやすい" }, { suffix: "として現れやすい" }];

    const tPicked = _pick(
        tPool,
        `${seed}|tend|${tendencyDepth}|${A_field}|${B_field}|${aspectLabelJa}`,
        { suffix: "しやすい" }
    );
    const tendency = (tPicked && typeof tPicked === "object" ? tPicked.suffix : null) || "しやすい";

    const hasEasy = /やすい|浮かびやすい|出やすい|見えやすい|残りやすい|表れやすい|起きやすい|生まれやすい/.test(dynamics);
    const tail = hasEasy ? "。" : `${tendency}。`;

    const sameField = A_field && B_field && A_field === B_field;

    // ✅ "…が{dynamics}" をやめて "…は、{dynamics}" に固定（「がが」事故を構造で根絶）
    const head = sameField
        ? `${A_field}の中で、${aAct}と${bAct}は、`
        : `${A_field}の${aAct}と${B_field}の${bAct}は、`;

    return _finalizeAlineJa(`${head}${dyn}${tail}`);
}

/**
 * ✅ SSOT ENTRY: buildFusionSentence (V2)
 * - personal/sky 両対応
 * - 受け取り揺れ吸収
 * - 絶対に空文字を返さない（最低でもA-line or fallback）
 */
function buildFusionSentence(dictOrDeps, item, opts = {}) {
    const dict = dictOrDeps?.dict || dictOrDeps || {};
    const template = String(opts.template || "");
    const mode = String(opts.mode || item?.kind || "personal");

    const wantsSky =
        mode === "sky" ||
        template.startsWith("sky_") ||
        template.includes("sora") ||
        template.includes("sky") ||
        item?.kind === "sky" ||
        // bodies
        item?.a || item?.b || item?.A || item?.B ||
        item?.left || item?.right ||
        item?.aPlanetKey || item?.bPlanetKey ||
        // signs
        item?.aS || item?.bS || item?.as || item?.bs ||
        item?.a_sign_key || item?.b_sign_key ||
        item?.aSignKey || item?.bSignKey ||
        item?.a_sign || item?.b_sign ||
        item?.a_signKey || item?.b_signKey;

    const pick = (...xs) => xs.find(v => v !== undefined && v !== null && String(v).trim() !== "") ?? "";

    const aspectLabelJa = pick(item?.aspect_label_ja, item?.aspectLabelJa, item?.label_ja, item?.aspect?.label_ja, "");
    const aspectType = pick(item?.type, item?.aspectType, item?.aspect_key, item?.aspT, "");

    const seed = pick(
        opts.seed,
        item?.seed,
        [
            pick(item?.natal_body_or_point, item?.natalPlanetKey, item?.natal?.body, ""),
            pick(item?.transit_body_or_point, item?.transitPlanetKey, item?.transit?.body, ""),
            pick(item?.a, item?.aPlanetKey, ""),
            pick(item?.b, item?.bPlanetKey, ""),
            String(aspectType || aspectLabelJa || ""),
            pick(item?.natal_sign_key, item?.natalSignKey, item?.natal?.sign, ""),
            pick(item?.transit_sign_key, item?.transitSignKey, item?.transit?.sign, ""),
            pick(item?.a_sign_key, item?.aSignKey, ""),
            pick(item?.b_sign_key, item?.bSignKey, ""),
            String(item?.orb_deg ?? item?.orb ?? ""),
            template,
            mode,
        ].join("|")
    );

    // ============================
    // SKY
    // ============================
    if (wantsSky) {
        const aPlanetKey = _normPlanetKey(pick(item?.a, item?.aPlanetKey, item?.a_key, item?.left, item?.A, ""));
        const bPlanetKey = _normPlanetKey(pick(item?.b, item?.bPlanetKey, item?.b_key, item?.right, item?.B, ""));

        const aSignKeySky = pick(
            item?.a_sign_key, item?.aSignKey, item?.a_sign,
            item?.aS, item?.as, item?.a_signKey,
            ""
        ).toLowerCase();

        const bSignKeySky = pick(
            item?.b_sign_key, item?.bSignKey, item?.b_sign,
            item?.bS, item?.bs, item?.b_signKey,
            ""
        ).toLowerCase();

        const aspectLabelJaSky = pick(
            item?.aspect_label_ja,
            item?.aspectLabelJa,
            item?.label_ja,
            item?.aspect?.label_ja,
            item?.aspect, // 文字列なら拾う
            item?.aspJa,
            aspectLabelJa,
            ""
        );

        const aspectTypeSky = pick(
            item?.type, item?.aspectType, item?.aspect_key,
            item?.aspT,
            aspectType,
            ""
        );

        // ✅ sky_aline 優先（policy: relation無し）
        const out = buildAlineSkyFusionJa({
            dict,
            seed,
            aSignKey: aSignKeySky,
            bSignKey: bSignKeySky,
            aPlanetKey,
            bPlanetKey,
            aspectType: aspectTypeSky,
            aspectLabelJa: aspectLabelJaSky,
            tendencyDepth: String(opts.tendencyDepth || "light"),
        });
        if (String(out || "").trim()) return out;

        // fallback（最低1文）: ここも policy に合わせて relation を入れない
        const dynamics = resolveAspectDynamicsJa(dict, aspectTypeSky || aspectLabelJaSky) || "触れやすい";
        const A_field = resolveFusionFieldLabel(dict, aSignKeySky);
        const B_field = resolveFusionFieldLabel(dict, bSignKeySky);
        const aAct = resolvePlanetActionJa(aPlanetKey) || "作用";
        const bAct = resolvePlanetActionJa(bPlanetKey) || "作用";

        return _finalizeAlineJa(`${A_field}の${aAct}と${B_field}の${bAct}は、${dynamics}。`);
    }

    // ============================
    // PERSONAL
    // ============================
    const natalPlanetKey = pick(item?.natal_body_or_point, item?.natalPlanetKey, item?.natal?.body, item?.natalBody, "");
    const transitPlanetKey = pick(item?.transit_body_or_point, item?.transitPlanetKey, item?.transit?.body, item?.transitBody, "");
    const natalSignKey = pick(item?.natal_sign_key, item?.natalSignKey, item?.natal?.sign, "");
    const transitSignKey = pick(item?.transit_sign_key, item?.transitSignKey, item?.transit?.sign, "");

    // ✅ personal は A-line 最優先（relation衛生化済）
    const out = buildAlineFusionJa({
        dict,
        seed,
        natalSignKey,
        transitSignKey,
        natalPlanetKey,
        transitPlanetKey,
        aspectType,
        aspectLabelJa,
        tendencyDepth: String(opts.tendencyDepth || "light"),
    });
    if (String(out || "").trim()) return out;

    // fallback（最低1文）
    const relation = resolveAspectRelationJa(
        dict,
        aspectLabelJa,
        `${seed}|rel|${aspectLabelJa}|${natalPlanetKey}|${natalSignKey}|${transitPlanetKey}|${transitSignKey}`,
        aspectType
    );
    const dynamics = resolveAspectDynamicsJa(dict, aspectType || aspectLabelJa) || "触れやすい";
    const A_field = resolveFusionFieldLabel(dict, natalSignKey);
    const B_field = resolveFusionFieldLabel(dict, transitSignKey);
    const aAct = resolvePlanetActionJa(natalPlanetKey) || "作用";
    const bAct = resolvePlanetActionJa(transitPlanetKey) || "作用";

    return _finalizeAlineJa(`${A_field}の${aAct}と${B_field}の${bAct}が${relation}${dynamics}。`);
}

// --------------------------------------------------
// exports
// --------------------------------------------------
module.exports = {
    BLEND_V2,

    extractBodyKey,

    _getSignFlavor,
    _getGrammars,

    resolveFusionFieldLabel,
    resolvePlanetActionJa,
    resolveAspectDynamicsJa,
    resolveAspectRelationJa,

    resolveAspectSentenceJa,
    buildPlanetInSignLineJa,

    buildFusionSentenceJa,
    buildAlineFusionJa,
    buildAlineSkyFusionJa,
    buildFusionSentence, // ✅ SSOT
};
