"use strict";

/**
 * channels/threads.js
 * - Threads（長文可）: 空の配置(最大5) + dist + 余韻 + close
 *
 * deps:
 * - getUserId, pickStable
 * - buildYoinLine/buildYoinGlobal
 * - buildNowModernPlanetCounts/buildDistLinesFromcounts
 * - formatPublicSkyLine
 * - pickCloseLines
 * - RENDER_COPY
 * - fmt(formatYoinForX/buildYoinBlocks)
 */

function renderThreads(story, deps = {}) {
    const {
        getUserId,
        pickStable,
        buildYoinLine,
        buildYoinGlobal,
        buildNowModernPlanetCounts,
        buildDistLinesFromcounts,
        formatPublicSkyLine,
        pickCloseLines,
        RENDER_COPY,
        fmt,
    } = deps || {};
    const { formatDateLabel, getMoonSignJa, joinAndTrimLines } = require("../render_parts/channel_common");

    const dateLabel = formatDateLabel(story);
    const moonSignJa = getMoonSignJa(story);

    const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
    const sorted = skyAll
        .filter((r) => Number.isFinite(Number(r?.orb_deg)))
        .sort((a, b) => Number(a.orb_deg) - Number(b.orb_deg));

    function isFastBody(k) {
        return ["moon", "mercury", "venus", "mars"].includes(String(k || "").toLowerCase());
    }
    function contactHasFast(c) {
        return isFastBody(c?.a) || isFastBody(c?.b);
    }

    // まずfast絡みを2つ、その後残りで5つまで
    const picked = [];
    for (const c of sorted) {
        if (picked.length >= 2) break;
        if (contactHasFast(c)) picked.push(c);
    }
    for (const c of sorted) {
        if (picked.length >= 5) break;
        if (picked.includes(c)) continue;
        picked.push(c);
    }
    const top5 = picked.slice().sort((a, b) => Number(a?.orb_deg) - Number(b?.orb_deg));

    const aspectLines = top5
        .map((c, i) => {
            const icon = ["☄️", "🪐", "✨", "🌓", "☀️", "🌌", "🌟", "⭐️", "💫"][i] || "・";
            return typeof formatPublicSkyLine === "function"
                ? formatPublicSkyLine(story, c, `${icon}`, deps)
                : "";
        })
        .filter(Boolean);

    const userSeed = typeof getUserId === "function" ? getUserId(story) : "u_unknown";
    const seedBase = `${story?.meta?.date_local || dateLabel}|${userSeed}`;

    const yoinPack =
        typeof fmt?.buildYoinBlocks === "function"
            ? fmt.buildYoinBlocks(
                story,
                { channel: "threads", seedBase: `${seedBase}|yoin` },
                { buildYoinLine, buildYoinGlobal, RENDER_COPY, pickStable }
            )
            : { xYoinLine: typeof buildYoinLine === "function" ? buildYoinLine(story) : "" };

    const yoin = typeof fmt?.formatYoinForX === "function"
        ? fmt.formatYoinForX(yoinPack?.xYoinLine)
        : String(yoinPack?.xYoinLine || "");

    const distShort =
        typeof buildDistLinesFromcounts === "function" && typeof buildNowModernPlanetCounts === "function"
            ? buildDistLinesFromcounts(buildNowModernPlanetCounts(story), { forX: true })
            : "";

    const closeLines = typeof pickCloseLines === "function"
        ? pickCloseLines(RENDER_COPY, story, { seedBase, pickStable })
        : [];

    const footer = String(RENDER_COPY?.FOOTER_X || "星は語る。🌎🛸").trim();
    const closeArr = (Array.isArray(closeLines) ? closeLines : [String(closeLines || "")])
        .map((l) => String(l || "").trim())
        .filter(Boolean)
        .filter((l) => l !== footer);

    const lines = [];
    lines.push(`🌌 ${dateLabel}｜空の配置`);
    lines.push("");
    if (moonSignJa) lines.push(`🌙月：${moonSignJa}`);

    if (aspectLines.length) {
        lines.push("");
        aspectLines.forEach((l, idx) => {
            if (idx) lines.push("");
            lines.push(l);
        });
    }

    if (distShort) {
        lines.push("");
        lines.push(distShort);
    }

    if (yoin) {
        lines.push("");
        yoin.split("\n").forEach((l) => lines.push(l));
    }

    if (closeArr.length) {
        lines.push("");
        lines.push(...closeArr);
    }

    lines.push("");
    lines.push(footer);

    return joinAndTrimLines(lines);
}

module.exports = { renderThreads };
