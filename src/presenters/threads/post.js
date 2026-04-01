"use strict";

/**
 * channels/threads/post.js
 * - Threadsアプリ向け（長文可）: 空の配置(最大5) + dist + close
 *
 * deps:
 * - getUserId, pickStable
 * - buildNowModernPlanetCounts/buildDistLinesFromcounts
 * - formatPublicSkyLine
 * - pickCloseLines
 * - RENDER_COPY
 */

function renderThreads(story, deps = {}) {
    const {
        getUserId,
        pickStable,
        buildNowModernPlanetCounts,
        buildDistLinesFromcounts,
        formatPublicSkyLine,
        pickCloseLines,
        RENDER_COPY,
        dict,
    } = deps || {};
    const { formatDateLabel, getMoonSignJa, joinAndTrimLines } = require("../format/format/channel_common");
    const { formatJstYmd } = require("../../utils/time");
    const { glyphForBody, signJa } = require("../format/format/common");
    const { findRetrogradeWindow } = require("../../domain/astro_compute");

    const dateLabel = formatDateLabel(story);
    const moonSignJa = getMoonSignJa(story);
    const asOfISO = story?.meta?.as_of || new Date().toISOString();
    const dictResolved = dict || require("../../content/dict");

    const retroKeys = [
        "mercury",
        "venus",
        "mars",
        "jupiter",
        "saturn",
        "uranus",
        "neptune",
        "pluto",
        "chiron",
        "lilith",
    ];

    const formatJstYmdSafe = (d) => formatJstYmd(d, { fallback: "-" });

    const transitSigns = story?.public?.transit_signs || {};
    const retroRows = retroKeys
        .map((key) => {
            const win = findRetrogradeWindow(key, asOfISO, 500);
            if (!win?.start || !win?.end) return null;
            const label =
                dictResolved?.PLANETS_V2?.bodies?.[key]?.label_ja ||
                dictResolved?.POINTS_V1?.points?.[key]?.label_ja ||
                key;
            const signKey = transitSigns?.[key]?.sign_key || "";
            const signLabel = transitSigns?.[key]?.sign_ja || (signKey ? signJa(dictResolved, signKey) : "");
            const glyph = glyphForBody(key);
            return { key, label, glyph, signLabel, start: win.start, end: win.end };
        })
        .filter(Boolean);

    const retroLines = (() => {
        if (!retroRows.length) return [];
        const lines = ["🪐 逆行"];
        const tags = ["#惑星逆行"];
        const seenTags = new Set(tags);
        retroRows.forEach((row, idx) => {
            if (idx > 0) lines.push("");
            const head = `${row.glyph ? `${row.glyph} ` : ""}${row.label}${row.signLabel ? `（${row.signLabel}）` : ""}`.trim();
            lines.push(head);
            lines.push(`📅 ${formatJstYmdSafe(row.start)} ~ ${formatJstYmdSafe(row.end)}`);

            const bodyTag = `#${row.label}逆行`;
            const signTag = row.signLabel ? `#${row.signLabel}` : "";
            if (bodyTag && !seenTags.has(bodyTag)) {
                seenTags.add(bodyTag);
                tags.push(bodyTag);
            }
            if (signTag && !seenTags.has(signTag)) {
                seenTags.add(signTag);
                tags.push(signTag);
            }
        });
        if (tags.length) {
            lines.push("");
            lines.push(tags.join(" "));
        }
        return lines;
    })();

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
    if (retroLines.length) {
        lines.push("");
        lines.push(...retroLines);
    }

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


    if (closeArr.length) {
        lines.push("");
        lines.push(...closeArr);
    }

    lines.push("");
    lines.push(footer);

    return joinAndTrimLines(lines);
}

module.exports = { renderThreads };
