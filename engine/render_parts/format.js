"use strict";

/**
 * format.js — output formatting utilities (v3.3.3)
 * - “整形だけ” に徹する（判定/解釈は render.js 側）
 * - buildYoinBlocks は DI（buildYoinLine/buildYoinGlobal/RENDER_COPY/pickStable 必須）
 */

// --------------------
// yoin helpers
// --------------------
function stripQualityPhrase(s) {
    let out = String(s || "");

    // 「質感は「〜」寄り。」 / 「質感は 〜 寄り。」の両方を削除
    out = out.replace(/[,、]?\s*質感は\s*「[^」]+」\s*寄り。?/g, "");
    out = out.replace(/[,、]?\s*質感は\s*[^。]+?\s*寄り。?/g, "");

    // 句読点の崩れ補正
    out = out.replace(/[,、]\s*。/g, "。");
    out = out.replace(/[,、]\s*$/g, "");

    // 文末「。」ごとに改行（見やすさ）
    out = out.replace(/。\s+/g, "。\n");

    // 空白の潰し
    out = out.replace(/\s{2,}/g, " ").trim();

    // 末尾句点を保証（空でなければ）
    if (out && !out.endsWith("。")) out += "。";

    return out;
}

function splitYoinForLine(yoinSummaryRaw) {
    const s = String(yoinSummaryRaw || "").trim();
    if (!s) return { globalLine: "", centerLine: "" };

    const isLayer = s.startsWith("空層：") || s.startsWith("空層：");
    if (!isLayer) {
        return { globalLine: "", centerLine: stripQualityPhrase(s) };
    }

    const idx = s.indexOf("。");
    if (idx < 0) return { globalLine: s, centerLine: "" };

    const globalLine = s.slice(0, idx + 1).trim();
    const rest = s.slice(idx + 1).trim();

    const centerLine = stripQualityPhrase(rest).replace(/｜/g, "\n");
    return { globalLine, centerLine };
}


// null/undefined だけ落とす（"" は保持したいので落とさない）
function filterKeepBlanks(arr) {
    return (Array.isArray(arr) ? arr : []).filter((v) => v !== null && v !== undefined);
}

// --------------------
// build yoin blocks (DI)
// --------------------
function buildYoinBlocks(
    story,
    { channel, seedBase } = {},
    { buildYoinLine, buildYoinGlobal, RENDER_COPY, pickStable } = {}
) {
    if (typeof buildYoinLine !== "function")
        throw new Error("format.buildYoinBlocks: buildYoinLine is required");
    if (typeof buildYoinGlobal !== "function")
        throw new Error("format.buildYoinBlocks: buildYoinGlobal is required");
    if (!RENDER_COPY) throw new Error("format.buildYoinBlocks: RENDER_COPY is required");
    if (typeof pickStable !== "function")
        throw new Error("format.buildYoinBlocks: pickStable is required");

    const base = String(seedBase || "seed");

    // tail pools（存在すれば安定抽選）
    const poolA = Array.isArray(RENDER_COPY?.YOIN?.TAIL_POOL_1) ? RENDER_COPY.YOIN.TAIL_POOL_1 : [];
    const poolB = Array.isArray(RENDER_COPY?.YOIN?.TAIL_POOL_2) ? RENDER_COPY.YOIN.TAIL_POOL_2 : [];

    const tail1 = poolA.length ? pickStable(poolA, base + "|a") : "";
    const tail2 = poolB.length ? pickStable(poolB, base + "|b") : "";

    // X は “空層の余韻だけ” を短く出す（中心文は入れない）
    if (channel === "x") {
        const layerLine = String(
            buildYoinGlobal(story, {
                maxContacts: 10,
                minWeight: 0.12,
                includeDeep: true,
                compact: true,
            }) || ""
        ).trim();

        return {
            xYoinLine: layerLine || RENDER_COPY?.YOIN?.FALLBACK || "",
            lineGlobal: "",
            lineCenter: "",
            lineTail1: tail1,
            lineTail2: tail2,
        };
    }

    // LINE は buildYoinLine から split して、global / center を分ける
    const yoinSummaryRaw = buildYoinLine(story);
    const { globalLine, centerLine } = splitYoinForLine(yoinSummaryRaw);

    return {
        xYoinLine: "",
        lineGlobal: globalLine,
        lineCenter: centerLine,
        lineTail1: tail1,
        lineTail2: tail2,
    };
}

// --------------------
// X helpers (minimal format) (DI)
// --------------------
function formatSkyLineX(story, s, emoji, { fmtAnyJa, publicSignJa, fmtAspectJa, fmtDeg } = {}) {
    if (!s) return "";

    if (typeof fmtAnyJa !== "function") throw new Error("format.formatSkyLineX: fmtAnyJa is required");
    if (typeof publicSignJa !== "function") throw new Error("format.formatSkyLineX: publicSignJa is required");
    if (typeof fmtAspectJa !== "function") throw new Error("format.formatSkyLineX: fmtAspectJa is required");
    if (typeof fmtDeg !== "function") throw new Error("format.formatSkyLineX: fmtDeg is required");

    const aKey = s.a;
    const bKey = s.b;

    const aLabel = fmtAnyJa(aKey);
    const bLabel = fmtAnyJa(bKey);

    const aSignJa = s.a_sign_ja || publicSignJa(story, aKey);
    const bSignJa = s.b_sign_ja || publicSignJa(story, bKey);

    const aspectJa = fmtAspectJa(s.type);
    const orb = fmtDeg(s.orb_deg);

    return `${emoji}${aLabel} ${aSignJa} × ${bLabel} ${bSignJa}｜${aspectJa} ${orb}°`;
}

function formatYoinForX(yoinLineRaw) {
    const s0 = String(yoinLineRaw || "").trim();
    if (!s0) return "";

    const parts = s0
        .split("｜")
        .map((x) => String(x || "").trim())
        .filter(Boolean);

    if (parts.length && (parts[0].startsWith("空層：") || parts[0].startsWith("空層："))) {
        parts[0] = parts[0].replace("。", "。\n");
    }

    return parts.join("\n");
}

module.exports = {
    stripQualityPhrase,
    splitYoinForLine,
    buildYoinBlocks,
    filterKeepBlanks,
    formatSkyLineX,
    formatYoinForX,
};
