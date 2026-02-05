"use strict";

/**
 * yoin.js (DI factory)
 * - YOIN v3.3.6: public-first global + override 対応
 * - center は personal(theme0) 優先、なければ public center、なければ no_contact
 * - global は contactsOverride があればそれを母集団にして集計（sora/top/allで使う）
 * - “占い化” しないため、辞書のcore/ラベルを使って “空層の記録” を作るだけ
 *
 * ✅ PATCH: mixed×mixed 対策（本命）
 * - story.meta.sky_strata.top_element / top_modality を最優先で採用（mixed/unknown は採用しない）
 */

function createYoin(deps = {}) {
  const {
    // ---- required functions
    getSkyLayers,
    pickCenterPublicContact,
    buildNoContactLine,
    publicSignKey,
    memoSignMeta,
    normalizeAspectType,
    aspectCore,
    pickStable,
    getUserId,

    // ---- required objects
    ASPECTS_META,
    RENDER_COPY,

    // ---- optional
    ASPECTS_V1,
  } = deps || {};

  // ============================================================
  // hard guards（曖昧にしない）
  // ============================================================
  const reqFn = {
    getSkyLayers,
    pickCenterPublicContact,
    buildNoContactLine,
    publicSignKey,
    memoSignMeta,
    normalizeAspectType,
    aspectCore,
    pickStable,
    getUserId,
  };
  for (const [k, v] of Object.entries(reqFn)) {
    if (typeof v !== "function") throw new Error(`yoin.createYoin: ${k} is required`);
  }
  if (!ASPECTS_META || typeof ASPECTS_META !== "object") {
    throw new Error("yoin.createYoin: ASPECTS_META is required");
  }
  if (!RENDER_COPY || typeof RENDER_COPY !== "object") {
    throw new Error("yoin.createYoin: RENDER_COPY is required");
  }

  const ASPECTS_V1_SAFE =
    ASPECTS_V1 && typeof ASPECTS_V1 === "object"
      ? ASPECTS_V1
      : { major: {}, deep_space: {} };


  // --- existing ---
  // function formatGlobalStrataLine(global) { ... }

  // ✅ RENDER_COPY.YOIN_GLOBAL.BUILD_SHORT を使って日本語化 + tail も出す
  function formatGlobalStrataLine(global, story) {
    if (!global) return "";
    if (typeof global === "string") return global;

    const topElement = global.element || "mixed";
    const topModality = global.modality || "mixed";

    const seedBase = [
      typeof getUserId === "function" ? getUserId(story) : "",
      story?.meta?.date_local || "",
      "yoin_global",
    ]
      .filter(Boolean)
      .join("|");

    const buildShort = RENDER_COPY?.YOIN_GLOBAL?.BUILD_SHORT;
    if (typeof buildShort === "function") {
      return buildShort({
        topElement,
        topModality,
        seedBase,
        pickStable, // depsにあるやつ
      });
    }

    // 最終フォールバック（“空層：”は付けない）
    return `${topElement}×${topModality}。`;
  }

  // ============================================================
  // meta.sky_strata override（mixed×mixed 対策の本丸）
  // - mixed/unknown/空 は採用しない（計算結果へフォールバック）
  // ============================================================
  function getSkyStrataOverride(story) {
    const strata =
      story?.meta?.sky_strata ||
      story?.meta?.skyStrata ||
      story?.public?.sky_strata ||     // ✅ 追加
      story?.public?.skyStrata ||      // ✅ 追加
      null;

    const validElement = new Set(["fire", "earth", "air", "water"]);
    const validModality = new Set(["cardinal", "fixed", "mutable"]);

    const metaTopElement = String(
      strata?.top_element ?? strata?.topElement ?? strata?.top?.element ?? ""
    ).toLowerCase().trim();

    const metaTopModality = String(
      strata?.top_modality ?? strata?.topModality ?? strata?.top?.modality ?? ""
    ).toLowerCase().trim();

    return {
      topElement: validElement.has(metaTopElement) ? metaTopElement : "",
      topModality: validModality.has(metaTopModality) ? metaTopModality : "",
    };
  }

  // ============================================================
  // yoin helpers (global scoring)
  // ============================================================
  function orbMaxFromStory(story, fallback = 6) {
    const orbMax = Number(story?.meta?.rules?.orb_max_deg);
    return Number.isFinite(orbMax) && orbMax > 0 ? orbMax : fallback;
  }

  function weightFromOrb(orb, orbMax) {
    const o = Number(orb);
    const m = Number(orbMax);
    if (!Number.isFinite(o) || !Number.isFinite(m) || m <= 0) return 0;
    const w = 1 - Math.min(Math.max(o, 0), m) / m;
    return Math.max(0.15, w);
  }

  function topKey(obj) {
    const entries = Object.entries(obj).filter(([k, v]) => v > 0 && k !== "unknown");
    if (!entries.length) return null;
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0][0];
  }

  // bodyKey を確実に string 化（[object Object]事故を潰す）
  function bodyKeyOf(x) {
    if (!x) return "";
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
      ""
    );
  }

  // ============================================================
  // YOIN v3.3.6 — center
  // ============================================================
  function buildYoinCenter(story, opts = {}) {
    const { kind = "public" } = opts || {};

    const layers = getSkyLayers(story);
    const hasPersonal = !!layers;
    const resolvedKind = kind === "auto" ? (hasPersonal ? "personal" : "public") : kind;

    const theme0 = resolvedKind === "personal" ? layers?.theme?.[0] ?? null : null;
    const center = pickCenterPublicContact(story);

    let signKeyA = null;
    let signKeyB = null;
    let aspectType = null;

    if (theme0) {
      signKeyA = String(theme0.natal_sign_key || theme0.natal_sign_en || "").toLowerCase() || null;
      signKeyB = String(theme0.transit_sign_key || theme0.transit_sign_en || "").toLowerCase() || null;
      aspectType = theme0.aspect || theme0.type;
    } else if (center) {
      signKeyA = publicSignKey(story, center.a);
      signKeyB = publicSignKey(story, center.b);
      aspectType = center.type;
    } else {
      return buildNoContactLine(story);
    }

    const aMeta = memoSignMeta(signKeyA);
    const bMeta = memoSignMeta(signKeyB);

    const eA = aMeta?.element || null;
    const eB = bMeta?.element || null;
    const mA = aMeta?.modality || null;
    const mB = bMeta?.modality || null;

    // --- computed from center pair ---
    let topElement = eA && eB ? (eA === eB ? eA : "mixed") : (eA || eB) || "mixed";
    let topModality = mA && mB ? (mA === mB ? mA : "mixed") : (mA || mB) || "mixed";

    // --- override from story.meta.sky_strata (authoritative) ---
    const over = getSkyStrataOverride(story);
    if (over.topElement) topElement = over.topElement;
    if (over.topModality) topModality = over.topModality;

    const aspectTypeNorm = normalizeAspectType(aspectType);

    const ASPECTS_V2 =
      (deps?.ASPECTS && typeof deps.ASPECTS === "object" ? deps.ASPECTS : null) ||
      (deps?.dict?.ASPECTS && typeof deps.dict.ASPECTS === "object" ? deps.dict.ASPECTS : null) ||
      null;

    const aspectCoreText =
      (ASPECTS_V2?.[aspectTypeNorm]?.core || null) ||
      aspectCore(aspectTypeNorm) ||
      null;

    if (typeof RENDER_COPY?.YOIN?.BUILD === "function") {
      const seedBase = [
        typeof getUserId === "function" ? getUserId(story) : "",
        story?.meta?.date_local || "",
        "yoin_center",
        aspectTypeNorm,
      ]
        .filter(Boolean)
        .join("|");

      return RENDER_COPY.YOIN.BUILD({
        topElement,
        topModality,
        aspectLabel: aspectCoreText || null,
        seedBase,
        pickStable,
      });
    }

    return `空層：${topElement}×${topModality}${aspectCoreText ? `｜${aspectCoreText}` : ""}`;
  }

  // ============================================================
  // YOIN v3.3.6 — global
  // - statsScope="top": 上位 maxContacts の母集団で元素/モードを取る（きょう向け）
  // - statsScope="all": scored 全体で元素/モードを取る（そらぜんぶ向け）
  // ============================================================
  function buildYoinGlobal(story, opts = {}) {
    // ✅ meta/public 両方から top を拾う（mixed/unknown は排除済み）
    const over = getSkyStrataOverride(story);

    if (over.topElement && over.topModality) {
      return {
        element: over.topElement,
        modality: over.topModality,
        source: "meta_or_public",
      };
    }

    // 最終フォールバック（本当の最後）
    return {
      element: "mixed",
      modality: "mixed",
      source: "fallback",
    };
  }

  function buildYoinLine(story, opts = {}) {
    const {
      kind = "public",
      contactsForGlobal = null,
      maxContacts = 10,
      minWeight = 0.12,
      includeDeep = true,
      compact = true,
      statsScope = "top",
    } = opts || {};

    const globalObjOrStr = buildYoinGlobal(story, {
      kind,
      contactsOverride: contactsForGlobal,
      maxContacts,
      minWeight,
      includeDeep,
      compact,
      statsScope,
    });

    const centerStr = buildYoinCenter(story, { kind });

    // ✅ ここで必ず文字列にする
    const globalStr = formatGlobalStrataLine(globalObjOrStr, story);

    // If center already includes the layer block, skip global line to avoid duplication.
    if (String(centerStr || "").includes("【空層】")) return String(centerStr || "").trim();

    const glue = RENDER_COPY?.YOIN?.GLUE;
    if (typeof glue === "function") return glue(globalStr, centerStr);

    return [globalStr, centerStr].filter(Boolean).join("\n");
  }

  return {
    buildYoinCenter,
    buildYoinGlobal,
    buildYoinLine,
    buildNoContactLine,
  };
}

module.exports = { createYoin };
