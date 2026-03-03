"use strict";

/**
 * engine/render.js (STABLE / Composition Root) — Unified v3.3.8 (SSOT)
 *
 * ✅ Goal
 * - dict/copy/memo/formatters をここで集約して channels に DI 注入
 * - render.js は “配線だけ” (判断しない / 占い化しない)
 * - normalize/seed/fusion-postprocess を SSOT としてここに固定
 *
 * ✅ Important
 * - "きょう(personal)" の既存フォーマットは channels が守る（render.js は壊さない）
 * - "そら/そらぜんぶ" の文章変更は channels/line_sora 側（render.js は材料供給のみ）
 */

const makeSignHelpers = require("../format/data/signs");
const { buildRenderCtx } = require("../format/utils/ctx");
const { createJaFormatters } = require("../format/utils/fmt_ja");
const { createMemo } = require("../format/data/memo");

const fmt = require("../format/format");
const dist = require("../format/data/dist");
const pickersPublic = require("../format/data/pickers_public");
const { pickStable, getUserId } = require("../format/utils/seed");

// channels
const chLineToday = require("../channels/line/today");
const chLineSora = require("../channels/line/sora");
const chLineDistribution = require("../channels/line/distribution");
const chIG = require("../channels/ig");
const chX = require("../channels/x");
const chXThread = require("../channels/x_thread");
const chThreads = require("../channels/threads");

// SSOT: export名ズレ吸収 + 日本語postfix
const { resolveFn, postFixFusionJa } = require("../format/utils/text_postfix_ja");

// ✅ ここが抜けてた（必須）
const blendV2 = require("../../content/dict/blend.v2");

// natal_list (揺れ吸収)
let chNatalList = null;
try {
  chNatalList = require("../channels/natal_list");
} catch (_) {
  chNatalList = require("../channels/natal_list");
}

function safeStr(v) {
  return v === null || v === undefined ? "" : String(v);
}
function normalizeAspectType(raw) {
  const x = safeStr(raw).toLowerCase().trim();
  if (!x) return "";

  // すでに辞書キーならそのまま（deep_space含む）
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

  // 角度サフィックスを落としてベースに寄せる
  const base = x.replace(/_\d+$/, "");

  const map = {
    // inconjunct / quincunx 系 → quincunx_150
    inconjunct: "quincunx_150",
    quincunx: "quincunx_150",

    // semisquare 系 → semi_square_45
    semisquare: "semi_square_45",
    semi_square: "semi_square_45",

    // sesquisquare 系 → sesqui_square_135
    sesquisquare: "sesqui_square_135",
    sesqui_square: "sesqui_square_135",
  };

  return map[base] || base; // majorはここでそのまま帰る
}


// ============================================================
// Fusion text post-process (SSOT) — stop bleeding for sora outputs
// ============================================================
function _fixGaToJa(text) {
  return String(text || "")
    .replace(/がと/g, "と")
    .replace(/がとは/g, "とは");
}

function _dedupeSentencesJa(text) {
  const raw = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/。\s+/g, "。")
    .trim();
  if (!raw) return raw;

  const parts = raw
    .split("。")
    .map((s) => s.trim())
    .filter(Boolean);

  const out = [];
  for (const s of parts) {
    if (!out.length || out[out.length - 1] !== s) out.push(s);
  }
  return out.join("。") + "。";
}

function _compressRepeatsJa(text) {
  return String(text || "")
    .replace(/反復[^。]*反復/g, "反復") // 雑だけど効く
    .replace(/(\S+?)で\1が/g, "$1で")  // 「〜で〜が」重なり圧縮の一例
    ;
}
function postProcessFusionJa(text) {
  let s = String(text || "").trim();
  if (!s) return s;
  s = _fixGaToJa(s);
  s = _dedupeSentencesJa(s);
  s = _compressRepeatsJa(s);
  return s.replace(/。+$/g, "。").trim();
}
// ============
// ================================================
// extract body key (public sky: a/b may be object)
// ============================================================
function extractBodyKey(x) {
  if (!x) return "";
  if (typeof x === "string") return x;
  if (typeof x === "number") return String(x);

  return safeStr(
    x.key ||
    x.body_key ||
    x.planet_key ||
    x.point_key ||
    x.body ||
    x.planet ||
    x.point ||
    x.id ||
    ""
  ).trim();
}

// ============================================================
// Fusion normalize + seed (SSOT)
// ============================================================
function normalizeForFusion(item) {
  if (!item || typeof item !== "object") return item;

  // personal TP shape
  if (item.transit_body && item.natal_body_or_point && (item.aspect || item.type)) {
    return {
      kind: "personal",
      a: safeStr(item.transit_body),
      b: safeStr(item.natal_body_or_point),
      type: safeStr(item.aspect || item.type),
      orb_deg: Number.isFinite(Number(item.orb_deg)) ? Number(item.orb_deg) : null,

      a_sign_key: safeStr(
        item.a_sign_key || item.aSignKey || item.a_sign || item.aS || item.as || item.a_signKey || ""
      ),
      b_sign_key: safeStr(
        item.b_sign_key || item.bSignKey || item.b_sign || item.bS || item.bs || item.b_signKey || ""
      ),
      
      a_sign_ja: safeStr(item.transit_sign_ja || item.a_sign_ja || ""),
      b_sign_ja: safeStr(item.natal_sign_ja || item.b_sign_ja || ""),

      _raw: item,
    };
  }

  // public sky shape
  if ((item.a || item.a_key) && (item.b || item.b_key) && (item.type || item.aspect)) {
    const aKey = extractBodyKey(item.a) || extractBodyKey(item.a_key) || safeStr(item.a);
    const bKey = extractBodyKey(item.b) || extractBodyKey(item.b_key) || safeStr(item.b);

    return {
      kind: "sky",
      a: aKey,
      b: bKey,
      type: safeStr(item.type || item.aspect),
      orb_deg: Number.isFinite(Number(item.orb_deg)) ? Number(item.orb_deg) : null,

      a_sign_key: safeStr(item.a_sign_key || item.aSignKey || item.a_sign || item.aS || item.as || ""),
      b_sign_key: safeStr(item.b_sign_key || item.bSignKey || item.b_sign || item.bS || item.bs || ""),

      a_sign_ja: safeStr(item.a_sign_ja || ""),
      b_sign_ja: safeStr(item.b_sign_ja || ""),

      _raw: item,
    };
  }

  // already normalized
  if (item.kind && item.a && item.b && item.type) return item;

  return item;
}

/**
 * item単位で seed を安定化
 * - normalized item 前提：{ kind, a, b, type, a_sign_key, b_sign_key }
 */
function seedForFusion(story, deps, normalizedItem, opts = {}) {
  const date = safeStr(story?.meta?.date_local);
  const uid = safeStr(deps?.getUserId ? deps.getUserId(story) : getUserId(story));

  const template = safeStr(opts.template || "");
  const mode = safeStr(opts.mode || "");

  const it = normalizeForFusion(normalizedItem) || {};
  const kind = safeStr(it.kind);
  const a = safeStr(it.a);
  const b = safeStr(it.b);
  const type = safeStr(it.type);
  const aSign = safeStr(it.a_sign_key);
  const bSign = safeStr(it.b_sign_key);

  const key = `${kind}|${a}|${aSign}|${b}|${bSign}|${type}`;
  return `${uid}|${date}|${mode}|${template}|${key}`;
}

// ============================================================
// createRenderers
// ============================================================
function createRenderers({ BODY_JA = {}, POINT_JA = {}, ASPECT_JA = {}, dict = null } = {}) {
  // --------------------
  // COPY (SSOT)
  // --------------------
  const { RENDER_COPY } = require("../../content/copy/render");

  // --------------------
  // DICT
  // --------------------
  const D = dict || require("../../content/dict");
  const SIGNS = D?.SIGNS || D?.SIGNS_V2 || D?.SIGNS_V1 || D?.signs_v2 || D?.signs_v1 || null;

  const ASPECTS_V1 = D?.ASPECTS_V1 || D?.aspects_v1 || null;
  const ASPECTS_V2 = D?.ASPECTS_V2 || D?.aspects_v2 || null;

  // --------------------
  // ctx.js: META + FUSION_CTX（story依存なし）
  // --------------------
  const ctx0 = buildRenderCtx({ dict: D });
  const META = ctx0?.META || { ASPECTS_META: {}, PLANETS_META: {}, POINTS_META: {} };
  const FUSION_CTX = ctx0?.FUSION_CTX || {};
  const ASPECTS_META = META?.ASPECTS_META || {};

  // --------------------
  // SIGN helpers
  // --------------------
  const { signMeta, signJaFromIndex, signKeyFromIndex, publicSignJa, publicSignKey } = makeSignHelpers(SIGNS);

  // --------------------
  // Memo / formatters
  // --------------------
  const _memo = createMemo();

  const fmtJa = createJaFormatters({
    BODY_JA,
    POINT_JA,
    ASPECT_JA,
    ASPECTS_V2,
    META,
    normalizeAspectType,
  });

  // --------------------
  // Channel functions (export揺れ吸収)
  // --------------------
  const fnLineToday = resolveFn(chLineToday, ["renderLine"], "channels/line/today");
  const fnSoraLine = resolveFn(chLineSora, ["renderSoraLine"], "channels/line/sora");
  const fnDistributionLine = resolveFn(chLineDistribution, ["renderDistributionLine"], "channels/line/distribution");
  const fnIG = resolveFn(chIG, ["renderIG"], "channels/ig");
  const fnX = resolveFn(chX, ["renderX"], "channels/x");
  const fnXThread = resolveFn(chXThread, ["renderXThread"], "channels/x_thread");
  const fnThreads = resolveFn(chThreads, ["renderThreads"], "channels/threads");

  // --------------------
  // natal_list
  // --------------------
  const createNatal = resolveFn(chNatalList, ["createNatalListRenderer"], "channels/natal_list");
  const natalRenderer = createNatal({
    signJaFromIndex,
    fmtBodyJa: fmtJa.fmtBodyJa,
    fmtPointJa: fmtJa.fmtPointJa,
    RENDER_COPY,
  });

  const getSkyLayers = (story) => story?.personal?.sky_layers || null;

  const buildNoContactLine = (story) => {
    const nc = RENDER_COPY?.YOIN?.NO_CONTACT;
    if (typeof nc === "function") return nc({ story });
    if (typeof nc === "string") return nc;
    return "空層：no_contact";
  };

  // ============================================================
  // deps(ctx) builder — 全チャンネル共通SSOT
  // ============================================================
  function ctxFor(story) {
    const deps = {};

    // core objects
    deps.dict = D;
    deps.META = META;
    deps.FUSION_CTX = FUSION_CTX;
    deps.RENDER_COPY = RENDER_COPY;

    // memo / seed
    deps.memo = _memo;
    deps.pickStable = pickStable;
    deps.getUserId = getUserId;

    // signs
    deps.signMeta = signMeta;
    deps.signJaFromIndex = signJaFromIndex;
    deps.signKeyFromIndex = signKeyFromIndex;
    deps.publicSignJa = publicSignJa;
    deps.publicSignKey = publicSignKey;

    // formatters
    deps.fmtAspectJa = fmtJa.fmtAspectJa;
    deps.normalizeAspectType = normalizeAspectType;
    deps.fmtBodyJa = fmtJa.fmtBodyJa;
    deps.fmtPointJa = fmtJa.fmtPointJa;
    deps.fmtAnyJa = fmtJa.fmtAnyJa;
    deps.fmtDeg = fmtJa.fmtDeg;
    deps.aspectCore = fmtJa.aspectCore;

    // fmt module
    deps.fmt = fmt;

    // common format fns
    deps.formatPublicSkyLine = resolveFn(fmt, ["formatPublicSkyLine"], "render_parts/format");
    deps.formatSoraSkyLine = fmt.formatSoraSkyLine;
    deps.formatPersonalTPLine = fmt.formatPersonalTPLine;
    deps.formatSkyLineX = fmt.formatSkyLineX;

    // blocks
    deps.formatPublicSkyBlock = fmt.formatPublicSkyBlock;
    deps.formatPersonalTPBlock = fmt.formatPersonalTPBlock;

    // pickers
    deps.pickCenterPublicContact = pickersPublic.pickCenterPublicContact;
    deps.pickSecretPublicContact = pickersPublic.pickSecretPublicContact;

    // yoin (removed) / no-contact still used
    deps.getSkyLayers = getSkyLayers;
    deps.hasPersonal = !!getSkyLayers(story);
    deps.buildNoContactLine = buildNoContactLine;

    // dist
    deps.buildNowModernPlanetCounts = dist.buildNowModernPlanetCounts;
    deps.buildDistLinesFromcounts = dist.buildDistLinesFromcounts;
    deps.buildPersonalTPCounts = dist.buildPersonalTPCounts || null;

    // tpKey（ctx.jsにあるなら採用）
    deps.tpKey = typeof ctx0?.tpKey === "function" ? ctx0.tpKey : null;

    // ============================================================
    // fusion builders (SSOT)
    // ============================================================
    deps.buildFusionSentence = (item, opts = {}) => {
      const normalized = normalizeForFusion(item) || {};
      const t = normalizeAspectType(normalized?.type);

      const labelFromMeta =
        safeStr(ASPECTS_META?.[t]?.label_ja) ||
        safeStr(ASPECTS_META?.[t]?.labelJa) ||
        "";

      // aspect label 最低保証（あれば上書きしない）
      if (!normalized.aspect) normalized.aspect = {};
      if (!normalized.aspect.label_ja) normalized.aspect.label_ja = labelFromMeta;

      const seed = seedForFusion(story, deps, normalized, opts);

      let raw = "";

      if (normalized.kind === "sky") {
        console.log("[FUSION sky args]", {
          a: normalized.a,
          b: normalized.b,
          aS: normalized.a_sign_key,
          bS: normalized.b_sign_key,
          type: normalized.type,
          label: normalized.aspect?.label_ja,
          template: opts.template,
        });
        // --- SKY A-line (blendV2) ---
        raw = String(
          blendV2.buildAlineSkyFusionJa({
            dict: D,
            seed,
            aSignKey: normalized.a_sign_key,
            bSignKey: normalized.b_sign_key,
            aPlanetKey: normalized.a,
            bPlanetKey: normalized.b,
            aspectType: normalized.type,
            aspectLabelJa: normalized.aspect?.label_ja || "",
            tendencyDepth: safeStr(opts.tendencyDepth || "light"),
            template: safeStr(opts.template || "sky_aline"), // ✅追加（互換）
          }) || ""
        ).trim();
      } else {
        raw = String(
          blendV2.buildAlineFusionJa({
            dict: D,
            seed,
            natalSignKey: normalized.b_sign_key,
            transitSignKey: normalized.a_sign_key,
            natalPlanetKey: normalized.b,
            transitPlanetKey: normalized.a,
            aspectType: normalized.type,
            aspectLabelJa: normalized.aspect?.label_ja || "",
            tendencyDepth: safeStr(opts.tendencyDepth || "light"),
          }) || ""
        ).trim();
      }

      // ✅ 1回だけ postProcess → postfix
      const cleaned = postProcessFusionJa(raw);
      return postFixFusionJa(cleaned, { style: opts?.style || "poem" });
    };

    // A-line personal (compat)
    deps.buildAlineFusionJa = (args = {}) => {
      const natalPlanetKey = safeStr(args.natalPlanetKey || args.natal_body_or_point || args.b);
      const transitPlanetKey = safeStr(args.transitPlanetKey || args.transit_body || args.a);

      const natalSignKey = safeStr(args.natalSignKey || args.b_sign_key);
      const transitSignKey = safeStr(args.transitSignKey || args.a_sign_key);

      const aspectLabelJa = safeStr(args.aspectLabelJa || args.aspect_label_ja || "");
      const aspectType = safeStr(args.aspectType || args.type || args.aspect || "");

      const item = {
        kind: "personal",
        a: transitPlanetKey,
        b: natalPlanetKey,
        type: normalizeAspectType(aspectType || aspectLabelJa),
        orb_deg: Number.isFinite(Number(args.orb_deg)) ? Number(args.orb_deg) : null,
        a_sign_key: transitSignKey,
        b_sign_key: natalSignKey,
        aspect: {
          type: normalizeAspectType(aspectType || aspectLabelJa),
          label_ja: aspectLabelJa,
        },
      };

      return deps.buildFusionSentence(item, {
        template: "aline",
        mode: "personal",
        tendencyDepth: safeStr(args.tendencyDepth || args.opts?.tendencyDepth || "light"),
        ...(args.opts || {}),
      });
    };

    // A-line sky (compat)
    deps.buildAlineSkyFusionJa = (args = {}) => {
      const aPlanetKey = safeStr(args.aPlanetKey || args.a);
      const bPlanetKey = safeStr(args.bPlanetKey || args.b);

      const aSignKey = safeStr(args.aSignKey || args.a_sign_key);
      const bSignKey = safeStr(args.bSignKey || args.b_sign_key);

      const aspectLabelJa = safeStr(args.aspectLabelJa || "");
      const aspectType = safeStr(args.aspectType || args.type || "");

      const item = {
        kind: "sky",
        a: aPlanetKey,
        b: bPlanetKey,
        type: normalizeAspectType(aspectType || aspectLabelJa),
        orb_deg: Number.isFinite(Number(args.orb_deg)) ? Number(args.orb_deg) : null,
        a_sign_key: aSignKey,
        b_sign_key: bSignKey,
        aspect: {
          type: normalizeAspectType(aspectType || aspectLabelJa),
          label_ja: aspectLabelJa,
        },
      };

      return deps.buildFusionSentence(item, {
        template: "sky_aline",
        mode: "sky",
        tendencyDepth: safeStr(args.tendencyDepth || args.opts?.tendencyDepth || "light"),
        ...(args.opts || {}),
      });
    };

    return deps;
  }

  // --------------------
  // Public API (call channels)
  // --------------------
  async function renderLine(story) {
    return await fnLineToday(story, ctxFor(story));
  }
  function renderSoraLine(story) {
    return fnSoraLine(story, ctxFor(story));
  }
  function renderDistributionLine(story) {
    return fnDistributionLine(story, ctxFor(story));
  }
  function renderX(story) {
    return fnX(story, ctxFor(story));
  }
  function renderXThread(story) {
    return fnXThread(story, ctxFor(story));
  }
  function renderThreads(story) {
    return fnThreads(story, ctxFor(story));
  }
  function renderIG(story) {
    return fnIG(story, ctxFor(story));
  }

  function renderNatalListFromcache(natalCacheDoc) {
    return natalRenderer.renderNatalListFromcache(natalCacheDoc);
  }

  return {
    // channels
    renderLine,
    renderSoraLine,
    renderDistributionLine,
    renderX,
    renderXThread,
    renderIG,
    renderThreads,

    // compat
    fmtAspectJa: fmtJa.fmtAspectJa,
    fmtBodyJa: fmtJa.fmtBodyJa,
    fmtPointJa: fmtJa.fmtPointJa,

    // natal list
    renderNatalListFromcache,

  };
}

module.exports = { createRenderers };
