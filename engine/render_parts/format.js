"use strict";

/**
 * format.js — output formatting utilities (v3.3.6+)
 * - “整形だけ” に徹する（判定/解釈は render.js / channels 側）
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

    const isLayer = s.startsWith("地層：") || s.startsWith("空層：");
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
// Public / Sora helpers (line format)
// --------------------
function _emojiForBody(key) {
    const k = String(key || "").toLowerCase();
    const map = {
        sun: "☀️",
        moon: "🌙",
        mercury: "☿️",
        venus: "♀️",
        mars: "♂️",
        jupiter: "♃",
        saturn: "♄",
        uranus: "♅",
        neptune: "♆",
        pluto: "♇",
        chiron: "⚷",
    };
    return map[k] || "";
}

function _aspectDegFromMeta(aspectType, deps) {
    const k = String(aspectType || "").trim().toLowerCase();
    if (!k) return null;
    const meta = deps?.META?.ASPECTS_META?.[k];
    if (Number.isFinite(meta?.deg)) return Number(meta.deg);

    const d = deps?.dict?.ASPECTS_V2;
    const v =
        d?.major?.[k]?.deg ??
        d?.deep_space?.[k]?.deg ??
        d?.craft_space?.[k]?.deg ??
        d?.minor?.[k]?.deg ??
        null;
    return Number.isFinite(v) ? Number(v) : null;
}

function formatPublicSkyLine(story, s, prefixOrDeps, maybeDeps) {
    if (!s) return "";

    // ✅ 互換：第3引数が prefix の場合がある
    const prefix = typeof prefixOrDeps === "string" ? prefixOrDeps : "・";
    const deps = (typeof prefixOrDeps === "object" && prefixOrDeps) ? prefixOrDeps : (maybeDeps || {});

    const { fmtAnyJa, publicSignJa, fmtAspectJa, fmtDeg } = deps || {};

    if (typeof fmtAnyJa !== "function") throw new Error("format.formatPublicSkyLine: fmtAnyJa is required");
    if (typeof publicSignJa !== "function") throw new Error("format.formatPublicSkyLine: publicSignJa is required");
    if (typeof fmtAspectJa !== "function") throw new Error("format.formatPublicSkyLine: fmtAspectJa is required");
    if (typeof fmtDeg !== "function") throw new Error("format.formatPublicSkyLine: fmtDeg is required");

    const aKey = s.a;
    const bKey = s.b;

    const aLabel = fmtAnyJa(aKey);
    const bLabel = fmtAnyJa(bKey);
    const aEmoji = _emojiForBody(aKey);
    const bEmoji = _emojiForBody(bKey);

    const aSignJa = s.a_sign_ja || publicSignJa(story, aKey);
    const bSignJa = s.b_sign_ja || publicSignJa(story, bKey);

    const aspectJa = fmtAspectJa(s.type);
    const orb = fmtDeg(s.orb_deg);
    const deg = _aspectDegFromMeta(s.type, deps);
    const degStr = Number.isFinite(deg) ? `${fmtDeg(deg, 0)}°` : "";

    const head = `${prefix}${aEmoji ? `${aEmoji} ` : ""}${aLabel}（${aSignJa}）× ${bEmoji ? `${bEmoji} ` : ""}${bLabel}（${bSignJa}）`;
    const tail = degStr ? `｜${aspectJa} ${degStr}（orb ${orb}°）` : `｜${aspectJa}（orb ${orb}°）`;
    return `${head}\n${tail}`;
}

// Soraも同じで良いなら alias でOK（将来差分出すなら別実装に）
function formatSoraSkyLine(story, s, prefixOrDeps, maybeDeps) {
    return formatPublicSkyLine(story, s, prefixOrDeps, maybeDeps);
}

// --------------------
// Personal TP helpers
// --------------------
function formatPersonalTPLine(storyOrTp, tpOrPrefix, prefixOrDeps, maybeDeps) {
    // ✅ 互換：旧）(tp, deps) / 新）(story, tp, prefix, deps)
    let tp = null;
    let prefix = "";
    let deps = {};

    // 呼び出しパターン判定
    if (tpOrPrefix && typeof tpOrPrefix === "object") {
        // (story, tp, prefix, deps)
        tp = tpOrPrefix;
        prefix = typeof prefixOrDeps === "string" ? prefixOrDeps : "";
        deps = maybeDeps || (typeof prefixOrDeps === "object" ? prefixOrDeps : {});
    } else {
        // (tp, deps) 形式で来た
        tp = storyOrTp;
        prefix = "";
        deps = (typeof tpOrPrefix === "object" && tpOrPrefix) ? tpOrPrefix : {};
    }

    if (!tp) return "";

    const { fmtAnyJa, fmtAspectJa, fmtDeg } = deps || {};

    if (typeof fmtAnyJa !== "function") throw new Error("format.formatPersonalTPLine: fmtAnyJa is required");
    if (typeof fmtAspectJa !== "function") throw new Error("format.formatPersonalTPLine: fmtAspectJa is required");
    if (typeof fmtDeg !== "function") throw new Error("format.formatPersonalTPLine: fmtDeg is required");

    const aKey = tp.natal_body_or_point;
    const bKey = tp.transit_body;
    const type = tp.aspect || tp.type;

    const aLabel = fmtAnyJa(aKey);
    const bLabel = fmtAnyJa(bKey);
    const aEmoji = _emojiForBody(aKey);
    const bEmoji = _emojiForBody(bKey);

    const aSignJa = tp.natal_sign_ja || tp.natal_sign_label_ja || tp.natal_sign || tp.natal_sign_en || "";
    const bSignJa = tp.transit_sign_ja || tp.transit_sign_label_ja || tp.transit_sign || tp.transit_sign_en || "";

    const aspectJa = fmtAspectJa(type);
    const orb = fmtDeg(tp.orb_deg);
    const deg = _aspectDegFromMeta(type, deps);
    const degStr = Number.isFinite(deg) ? `${fmtDeg(deg, 0)}°` : "";

    const head = `${prefix}${aEmoji ? `${aEmoji} ` : ""}${aLabel}${aSignJa ? `（${aSignJa}）` : ""} × ${bEmoji ? `${bEmoji} ` : ""}${bLabel}${bSignJa ? `（${bSignJa}）` : ""}`;
    const tail = degStr ? `｜${aspectJa} ${degStr}（orb ${orb}°）` : `｜${aspectJa}（orb ${orb}°）`;
    return `${head}\n${tail}`;
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

    // X は “地層の余韻だけ” を短く出す（中心文は入れない）
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
function formatSkyLineX(story, s, emoji, deps = {}) {
    if (!s) return "";

    const { fmtAnyJa, publicSignJa, fmtAspectJa, fmtDeg } = deps;

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

    if (parts.length && (parts[0].startsWith("地層：") || parts[0].startsWith("空層："))) {
        parts[0] = parts[0].replace("。", "。\n");
    }

    return parts.join("\n");
}

// --------------------
// Blocks (header + aline)
// --------------------

// A) そら系（sky）の「ヘッダ + sky Aline」
function formatPublicSkyBlock(story, s, prefixOrDeps, maybeDeps) {
    if (!s) return "";

    const prefix = typeof prefixOrDeps === "string" ? prefixOrDeps : "・";
    const deps = (typeof prefixOrDeps === "object" && prefixOrDeps) ? prefixOrDeps : (maybeDeps || {});

    const head = formatPublicSkyLine(story, s, prefix, deps);

    // ✅ 本命：render.js で注入した buildFusionSentence を使う
    const buildFusionSentence = deps?.buildFusionSentence;

    let body = "";
    if (typeof buildFusionSentence === "function") {
        body = String(
            // 🔧 deps を dictOrDeps として渡す / s を item として渡す / opts を第3引数へ
            buildFusionSentence(s, { template: "sky_aline", mode: "sky" }))
            .trim();
    }

    // ✅ fallback（古いDIでも落ちない）
    if (!body) {
        const { dict, buildAlineSkyFusionJa, fmtAspectJa } = deps || {};
        if (dict && typeof buildAlineSkyFusionJa === "function" && typeof fmtAspectJa === "function") {
            const aspectType = s.type;
            const aspectLabelJa = fmtAspectJa(aspectType);
            const aSignKey = s.a_sign_key || s.a_sign || "";
            const bSignKey = s.b_sign_key || s.b_sign || "";

            body = String(buildAlineSkyFusionJa({
                dict,
                aSignKey,
                bSignKey,
                aPlanetKey: s.a,
                bPlanetKey: s.b,
                aspectLabelJa,
                aspectType,
                orb_deg: s.orb_deg,
                tendencyDepth: "light",
            }) || "").trim();
        }
    }

    return body ? `${head}\n${body}`.trim() : head.trim();
}


// B) きょう（personal）の「ヘッダ + personal Aline」
function formatPersonalTPBlock(story, tp, prefixOrDeps, maybeDeps) {
    if (!tp) return "";

    const prefix = typeof prefixOrDeps === "string" ? prefixOrDeps : "";
    const deps = (typeof prefixOrDeps === "object" && prefixOrDeps) ? prefixOrDeps : (maybeDeps || {});

    const head = formatPersonalTPLine(story, tp, prefix, deps);

    const buildFusionSentence = deps?.buildFusionSentence;

    let body = "";
    if (typeof buildFusionSentence === "function") {
        body = String(
            // 🔧 deps, tp, opts の順
            buildFusionSentence(tp, { template: "aline", mode: "personal" })
        ).trim();
    }

    // ✅ fallback（古いDIでも落ちない）
    if (!body) {
        const { dict, buildAlineFusionJa, fmtAspectJa } = deps || {};
        if (dict && typeof buildAlineFusionJa === "function" && typeof fmtAspectJa === "function") {
            const aspectType = tp.aspect || tp.type;
            const aspectLabelJa = fmtAspectJa(aspectType);

            const natalSignKey = tp.natal_sign_key || tp.natal_sign_en || tp.natal_sign || "";
            const transitSignKey = tp.transit_sign_key || tp.transit_sign_en || tp.transit_sign || "";

            body = String(buildAlineFusionJa({
                dict,
                natalSignKey,
                transitSignKey,
                natalPlanetKey: tp.natal_body_or_point,
                transitPlanetKey: tp.transit_body,
                aspectLabelJa,
                aspectType,
                orb_deg: tp.orb_deg,
                tendencyDepth: "light",
            }) || "").trim();
        }
    }

    return body ? `${head}\n${body}`.trim() : head.trim();
}

module.exports = {
    stripQualityPhrase,
    splitYoinForLine,
    buildYoinBlocks,
    filterKeepBlanks,

    formatPublicSkyLine,
    formatSoraSkyLine,
    formatPersonalTPLine,

    formatSkyLineX,
    formatYoinForX,

    // ✅ blocks
    formatPublicSkyBlock,
    formatPersonalTPBlock,
};
