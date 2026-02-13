"use strict";

/**
 * engine/story.js — Unified STABLE (v2026.01 unified)
 *
 * ✅ Source of truth: story JSON generation is ONLY here.
 * ✅ mode: "public" | "auto"  (personal is NOT a mode)
 *   - public: public-only story (no personal field at all)
 *   - auto  : if natal exists -> personal story, else public-only
 *
 * ✅ always includes:
 * - public.moon (sign_key, sign_ja, lon_deg)
 * - public.transit_signs (each body: sign_key, sign_ja, lon_deg)
 * - public.sky_top (top 3 transit-transit aspects)
 * - guardrails
 *
 * ✅ personal story includes:
 * - personal.touch_points_top3 (top 3 natal×transit by orb asc)
 */

const {
  norm360,
  absAngularDistance,
  toFixedPrecision,
  isYYYYMMDD,
  safeNumber,
  clamp,
} = require("./story_math");
const { createSignHelpers } = require("./story_signs");
const { createTransitsService } = require("./story_transits");
const { createNatalService } = require("./story_natal");
const { createSkyService } = require("./story_sky");

function createStoryService({
  db,
  admin,
  swisseph,

  // dict
  SIGNS_V1,

  // aspects list: [{ type, deg }, ...]
  ASPECTS,

  // ✅ add: deep aspects (optional)
  ASPECTS_DEEP = [],

  // env/meta
  DEFAULT_TZ = "Asia/Tokyo",
  PROJECT = "sora-no-koe",
  SCHEMA_VERSION = "1.0.0",

  // optional
  buildResonanceBullets,

  // ✅ 追加：地層用の伝統重み（外天体0.3）
  PLANET_WEIGHT = {
    sun: 1.0,
    moon: 1.0,
    mercury: 1.0,
    venus: 1.0,
    mars: 1.0,
    jupiter: 0.8,
    saturn: 0.8,
    uranus: 0.3,
    neptune: 0.3,
    pluto: 0.3,
  },
}) {
  if (!db) throw new Error("createStoryService: db required");
  if (!swisseph) throw new Error("createStoryService: swisseph required");
  if (!SIGNS_V1) throw new Error("createStoryService: SIGNS_V1 required");
  if (!Array.isArray(ASPECTS) || ASPECTS.length === 0) throw new Error("createStoryService: ASPECTS required");

  // ------------------------
  // utils
  // ------------------------
  const nowIso = () => new Date().toISOString();



  // ------------------------
  // aspects lists
  // ------------------------
  const ASPECTS_MAJOR = Array.isArray(ASPECTS) ? ASPECTS : [];
  const ASPECTS_DEEP_LIST = Array.isArray(ASPECTS_DEEP) ? ASPECTS_DEEP : [];
  const ASPECTS_ALL = [...ASPECTS_MAJOR, ...ASPECTS_DEEP_LIST];

  // ------------------------
  // sign/transit/sky services
  // ------------------------
  const { signFromLon, getSignMetaByKey } = createSignHelpers({ SIGNS_V1, norm360 });
  const { computeTransitsSwiss } = createTransitsService({
    swisseph,
    signFromLon,
    toFixedPrecision,
    norm360,
    safeNumber,
  });
  const { loadNatalFromcache, extractNatalLongitudes } = createNatalService({ db, norm360 });
  const {
    attachSignsToSkyList,
    computeSkyStrataFromTransits,
    buildPublicSkyAll,
    buildPublicSkyTopAll,
    buildTouchPoints,
    pickTopByOrb,
    buildSkyLayersFromTouchPoints,
  } = createSkyService({
    ASPECTS_ALL,
    PLANET_WEIGHT,
    signFromLon,
    getSignMetaByKey,
    absAngularDistance,
    toFixedPrecision,
  });

  // ------------------------
  // story builders
  // ------------------------
  function baseStory({ appUserId, displayName, dateLocal, asOfISO, transitInfo, rules, precisionDeg }) {

    // ✅ まず public を組み立てて変数に持つ
    const publicObj = {
      date_local: dateLocal,
      moon: {
        lon_deg: transitInfo?.moon?.lon_deg ?? null,
        sign_key: transitInfo?.moon?.sign_key ?? null,
        sign_ja: transitInfo?.moon?.sign_ja ?? null,
      },
      transit_signs: transitInfo?.bodies_signs || {},
      sky_strata: computeSkyStrataFromTransits(transitInfo?.bodies_signs),

      sky_all: buildPublicSkyAll(
        transitInfo?.bodies,
        ASPECTS_ALL,
        { orbMaxDeg: rules?.orb_max_deg ?? 6 }
      ),

      // 互換維持：従来どおりメジャーだけで top3
      sky_top: buildPublicSkyTopAll(
        transitInfo?.bodies,
        ASPECTS_MAJOR,
        { orbMaxDeg: rules?.orb_max_deg ?? 6, max: 3 }
      ),

      tone_hints: { resonance_bullets: [] },
    };

    // ✅ sky_all / sky_top の各行に a/b のサイン情報を埋める
    attachSignsToSkyList(publicObj.sky_all, publicObj.transit_signs);
    attachSignsToSkyList(publicObj.sky_top, publicObj.transit_signs);

    // ✅ 最後に story を返す
    return {
      meta: {
        schema_version: SCHEMA_VERSION,
        project: PROJECT,
        timezone: DEFAULT_TZ,
        date_local: dateLocal,
        as_of: asOfISO,
        generated_at_utc: nowIso(),
        user_id: appUserId,
        app_user_id: appUserId, // ✅ 互換（renderのseed用）
        engine: { ephemeris_source: "swisseph", precision_deg: precisionDeg },
        rules,
        sky_strata: publicObj.sky_strata,
      },

      public: publicObj,

      guardrails: {
        no_prediction: true,
        no_good_bad: true,
        no_should: true,
        no_personality_label: true,
        no_salvation: true,
        sovereignty_returned: true,
      },
      // personal is optional (only for personal story)
    };
  }


  function attachResonanceBullets(story, { allowPersonal }) {
    if (typeof buildResonanceBullets !== "function") return;

    // public safe
    const pub = buildResonanceBullets(story, { max: 4, allowPersonal: false });
    story.public.tone_hints.resonance_bullets = Array.isArray(pub?.bullets) ? pub.bullets : [];

    // personal add-on (optional)
    if (allowPersonal && story.personal) {
      const per = buildResonanceBullets(story, { max: 4, allowPersonal: true });
      story.personal.tone_hints ||= {};
      story.personal.tone_hints.resonance_bullets = Array.isArray(per?.bullets) ? per.bullets : [];
    }
  }

  function buildPublicOnlyStory({ appUserId, displayName, dateLocal, asOfISO, transitInfo, rules, precisionDeg }) {
    const story = baseStory({ appUserId, displayName, dateLocal, asOfISO, transitInfo, rules, precisionDeg });
    attachResonanceBullets(story, { allowPersonal: false });
    return story; // no personal at all
  }


  function buildPersonalStory({ appUserId, displayName, dateLocal, asOfISO, transitInfo, rules, precisionDeg, touchPointsAll }) {
    const story = baseStory({ appUserId, displayName, dateLocal, asOfISO, transitInfo, rules, precisionDeg });

    // ✅ 三層にするには Top3 じゃなく候補も必要
    const touch_points_all = pickTopByOrb(touchPointsAll, 18); // 12〜20でOK
    const sky_layers = buildSkyLayersFromTouchPoints(touch_points_all);

    story.personal = {
      user_id: appUserId,
      user: { display_name: displayName ?? null },
      privacy: { contains_personal_data: true, allowed_channels: ["line"] },

      // ✅ 元データ（候補）
      touch_points_all,

      // ✅ 従来互換（今のrenderがTop3参照してても壊れない）
      touch_points_top3: touch_points_all.slice(0, 3),

      // ✅ 三層
      sky_layers,
    };

    attachResonanceBullets(story, { allowPersonal: true });
    return story;
  }

  // ------------------------
  // main entry
  // ------------------------
  async function buildStoryForUser({
    appUserId,
    dateLocal,
    asOfISO,
    mode = "auto", // "public" | "auto" のみ
    orbMaxDeg = 6,
    precisionDeg = 0.01,
  }) {
    if (!appUserId) throw new Error("appUserId required");
    if (!isYYYYMMDD(dateLocal)) throw new Error("dateLocal must be YYYY-MM-DD");
    if (!asOfISO) throw new Error("asOfISO required");

    const m = String(mode || "auto").trim().toLowerCase();

    // 🔒 hard guard
    if (m !== "public" && m !== "auto") {
      throw new Error(`invalid mode: ${mode} (allowed: public | auto)`);
    }

    const orb = clamp(Number(orbMaxDeg ?? 6), 0.1, 12);
    const prec = clamp(Number(precisionDeg ?? 0.01), 0.001, 1);

    let displayName = null;
    try {
      const u = await db.collection("users").doc(appUserId).get();
      if (u.exists) {
        const ud = u.data() || {};
        displayName =
          ud.display_name ??
          ud?.profile?.display_name ??
          ud?.channels?.line?.profile?.display_name ??
          null;
      }
    } catch (_) { }

    const transitInfo = computeTransitsSwiss(asOfISO, prec);

    const rules = {
      aspects_used_major: ASPECTS_MAJOR.map((a) => a.type),
      aspects_used_all: ASPECTS_ALL.map((a) => a.type),
      orb_max_deg: orb,
      sort: "orb_asc",
    };

    // --- public only
    if (m === "public") {
      return buildPublicOnlyStory({
        appUserId,
        displayName,
        dateLocal,
        asOfISO,
        transitInfo,
        rules,
        precisionDeg: prec,
      });
    }

    // --- auto
    const natalCache = await loadNatalFromcache(appUserId);
    if (!natalCache) {
      return buildPublicOnlyStory({
        appUserId,
        displayName,
        dateLocal,
        asOfISO,
        transitInfo,
        rules,
        precisionDeg: prec,
      });
    }

    const extracted = extractNatalLongitudes(natalCache);
    if (!extracted.ok) {
      return buildPublicOnlyStory({
        appUserId,
        displayName,
        dateLocal,
        asOfISO,
        transitInfo,
        rules,
        precisionDeg: prec,
      });
    }

    const touchAll = buildTouchPoints({
      transitBodies: transitInfo.bodies,
      natalBodies: extracted.longitudes,
      rules,
      withSigns: true,
    });

    return buildPersonalStory({
      appUserId,
      displayName,
      dateLocal,
      asOfISO,
      transitInfo,
      rules,
      precisionDeg: prec,
      touchPointsAll: touchAll,
    });
  }

  return { buildStoryForUser, computeTransitsSwiss };
}

module.exports = { createStoryService };
