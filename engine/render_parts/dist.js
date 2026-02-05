/**
 * dist.js
 * - v3.3.6 の “分布母集団をチャンネル別に分離” の核
 * - now_planets: sun..pluto を publicSignKey で集計
 * - personal_tp_endpoints: 表示したTPの natal/transit サイン両端を集計
 * - 出力は copy.DIST があればそれを優先し、無ければ安全フォールバック
 */


// ============================================================
// Distribution / Counts (v3.3.6)
// ============================================================
function buildNowModernPlanetCounts(story) {
    const element = { fire: 0, earth: 0, air: 0, water: 0, unknown: 0 };
    const modality = { cardinal: 0, fixed: 0, mutable: 0, unknown: 0 };

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

    for (const bodyKey of BODIES) {
        const signKey = publicSignKey(story, bodyKey);
        const s = memoSignMeta(signKey);

        const e = normElement(s?.element);
        const m = normModality(s?.modality);

        element[e] += 1;
        modality[m] += 1;
    }

    return { element, modality, total: BODIES.length, scope: "now_planets" };
}

function buildPersonalTPCounts(tps = []) {
    const element = { fire: 0, earth: 0, air: 0, water: 0, unknown: 0 };
    const modality = { cardinal: 0, fixed: 0, mutable: 0, unknown: 0 };

    function addSignKey(signKey) {
        const s = memoSignMeta(signKey);
        const e = normElement(s?.element);
        const m = normModality(s?.modality);
        element[e] += 1;
        modality[m] += 1;
    }

    const list = Array.isArray(tps) ? tps : [];
    for (const tp of list) {
        const aKey = String(tp?.natal_sign_key || tp?.natal_sign_en || "").toLowerCase() || null;
        const bKey = String(tp?.transit_sign_key || tp?.transit_sign_en || "").toLowerCase() || null;
        if (aKey) addSignKey(aKey);
        if (bKey) addSignKey(bKey);
    }

    return { element, modality, total: list.length * 2, scope: "personal_tp_endpoints" };
}

function buildDistLinesFromcounts(counts, { forX = false } = {}) {
    const c = counts || {};
    const element = c.element || {};
    const modality = c.modality || {};

    if (!forX && RENDER_COPY?.DIST?.ELEMENT_LINE && RENDER_COPY?.DIST?.MODALITY_LINE) {
        const el = RENDER_COPY.DIST.ELEMENT_LINE_EMOJI
            ? RENDER_COPY.DIST.ELEMENT_LINE_EMOJI(element)
            : RENDER_COPY.DIST.ELEMENT_LINE(element);
        const mo = RENDER_COPY.DIST.MODALITY_LINE_EMOJI
            ? RENDER_COPY.DIST.MODALITY_LINE_EMOJI(modality)
            : RENDER_COPY.DIST.MODALITY_LINE(modality);
        return [el, mo]
            .filter(Boolean)
            .join("\n")
            .trim();
    }

    const f = Number(element.fire || 0);
    const e = Number(element.earth || 0);
    const a = Number(element.air || 0);
    const w = Number(element.water || 0);
    const uE = Number(element.unknown || 0);

    const ca = Number(modality.cardinal || 0);
    const fi = Number(modality.fixed || 0);
    const mu = Number(modality.mutable || 0);
    const uM = Number(modality.unknown || 0);

    const el = `要素: 火${f} 地${e} 風${a} 水${w}${uE ? ` ?${uE}` : ""}`;
    const mo = `区分: 活${ca} 不${fi} 柔${mu}${uM ? ` ?${uM}` : ""}`;

    return forX ? `${el}｜${mo}` : `${el}\n${mo}`;
}
