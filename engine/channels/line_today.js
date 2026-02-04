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

  const l1 = lines[0] || "";
  let l2 = lines[1] || "";

  if (l2.length > 34) {
    const m = l2.match(/^(.{1,60}?。)/);
    if (m) l2 = m[1];
  }
  return [l1, l2].filter(Boolean).slice(0, 2).join("\n");
}

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

/* =========================
 * main
 * ========================= */
function renderLine(story, deps = {}) {
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

  const parts = [];
  const used = new Set();
  const tpsShown = [];

  // --------------------
  // personal first
  // --------------------
  if (hasPersonal && typeof fmtTP === "function") {
    const theme0 = layers.theme?.[0] || null;
    const touch = Array.isArray(layers.touch) ? layers.touch : [];
    const hidden0 = layers.hidden?.[0] || null;

    if (theme0) {
      used.add(typeof tpKey === "function" ? tpKey(theme0) : String(theme0));
      tpsShown.push(theme0);
      parts.push(
        `${HEAD_LAYERS.THEME}\n` +
          formatWithFusion({
            story,
            item: theme0,
            prefix: `${CIRCLES[0]} `,
            deps,
            baseFormatter: fmtTP,
            fusionTemplate: "aline",
            fusionMode: "personal",
          })
      );
    }

    if (touch[0]) {
      used.add(typeof tpKey === "function" ? tpKey(touch[0]) : String(touch[0]));
      tpsShown.push(touch[0]);
      parts.push(
        `${HEAD_LAYERS.TOUCH}\n` +
          formatWithFusion({
            story,
            item: touch[0],
            prefix: `${CIRCLES[1]} `,
            deps,
            baseFormatter: fmtTP,
            fusionTemplate: "aline",
            fusionMode: "personal",
          })
      );
    }

    if (touch[1]) {
      used.add(typeof tpKey === "function" ? tpKey(touch[1]) : String(touch[1]));
      tpsShown.push(touch[1]);
      parts.push(
        formatWithFusion({
          story,
          item: touch[1],
          prefix: `${CIRCLES[2]} `,
          deps,
          baseFormatter: fmtTP,
          fusionTemplate: "aline",
          fusionMode: "personal",
        })
      );
    }

    const hidden =
      hidden0 && !used.has(typeof tpKey === "function" ? tpKey(hidden0) : String(hidden0))
        ? hidden0
        : null;

    if (hidden) {
      used.add(typeof tpKey === "function" ? tpKey(hidden) : String(hidden));
      tpsShown.push(hidden);
      parts.push(
        `${HEAD_LAYERS.HIDDEN}\n` +
          formatWithFusion({
            story,
            item: hidden,
            prefix: "・",
            deps,
            baseFormatter: fmtTP,
            fusionTemplate: "aline",
            fusionMode: "personal",
          })
      );
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
      parts.push(
        `${HEAD_LAYERS.THEME}\n` +
          formatWithFusion({
            story,
            item: center,
            prefix: `${CIRCLES[0]} `,
            deps,
            baseFormatter: fmtSky,
            fusionTemplate: "sky_aline",
            fusionMode: "sky",
          })
      );
    }

    if (t1 && typeof fmtSky === "function") {
      parts.push(
        `${HEAD_LAYERS.TOUCH}\n` +
          formatWithFusion({
            story,
            item: t1,
            prefix: `${CIRCLES[1]} `,
            deps,
            baseFormatter: fmtSky,
            fusionTemplate: "sky_aline",
            fusionMode: "sky",
          })
      );
    }

    if (t2 && typeof fmtSky === "function") {
      parts.push(
        formatWithFusion({
          story,
          item: t2,
          prefix: `${CIRCLES[2]} `,
          deps,
          baseFormatter: fmtSky,
          fusionTemplate: "sky_aline",
          fusionMode: "sky",
        })
      );
    }

    const secret = typeof pickSecretPublicContact === "function" ? pickSecretPublicContact(story) : null;
    if (secret && typeof fmtSky === "function") {
      parts.push(
        `${HEAD_LAYERS.HIDDEN}\n` +
          formatWithFusion({
            story,
            item: secret,
            prefix: "・",
            deps,
            baseFormatter: fmtSky,
            fusionTemplate: "sky_aline",
            fusionMode: "sky",
          })
      );
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
      parts: parts.join("\n\n"),
      distLines,
      kusouYoin: yoin,
      footerLines: RENDER_COPY?.FOOTER_LINE,
      cta: RENDER_COPY?.LINE_MAIN_CTA,
    });
  }

  return buildLineMainFallback({
    dateLabel,
    parts: parts.join("\n\n"),
    distLines,
    kusouYoin: yoin,
    footerLines: RENDER_COPY?.FOOTER_LINE,
    cta: RENDER_COPY?.LINE_MAIN_CTA,
  });
}

module.exports = { renderLine };
