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
        x === "septile_family"
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
    const fusion = trimStr(
        callBuildFusionSentence(deps, normalized, {
            template: fusionTemplate,
            mode: "sky",
            style: "sentence",
        })
    );

    // --- DEBUG (TEMP) ---
    const debug = [
        `tpl=${fusionTemplate}`,
        `a=${normalized.a}`,
        `b=${normalized.b}`,
        `aS=${normalized.a_sign_key}`,
        `bS=${normalized.b_sign_key}`,
        `aspT=${normalized.aspect?.type || ""}`,
        `aspJa=${normalized.aspect?.label_ja || ""}`,
    ].join(" ");
    // --- DEBUG (TEMP) ---

    if (!fusion) return `${line}\n[${debug}]`;     // fusion空＝呼べてない/参照できない
    return `${line}\n${fusion}\n[${debug}]`.trim(); // fusion同じ＝fallbackの可能性大

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

    const fusion = trimStr(
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
    const distLines = isFn(buildDistLinesFromcounts)
        ? buildDistLinesFromcounts(nowCounts, { forX: false })
        : "";

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

module.exports = {
    renderSoraLine,
    renderSoraAllLine,
    renderSoraBase,
    renderSoraLineEssay,
    renderSoraAllLineEssay,
};
