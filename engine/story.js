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

  // ✅ 追加：空層用の伝統重み（外天体0.3）
  PLANET_WEIGHT = {
    Sun: 1.0,
    Moon: 1.0,
    Mercury: 1.0,
    Venus: 1.0,
    Mars: 1.0,
    Jupiter: 0.8,
    Saturn: 0.8,
    Uranus: 0.3,
    Neptune: 0.3,
    Pluto: 0.3,
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

  function norm360(deg) {
    let x = deg % 360;
    if (x < 0) x += 360;
    return x;
  }

  function absAngularDistance(a, b) {
    const d = Math.abs(norm360(a) - norm360(b));
    return Math.min(d, 360 - d);
  }

  function toFixedPrecision(n, precisionDeg = 0.01) {
    const p = 1 / precisionDeg;
    return Math.round(n * p) / p;
  }

  function isYYYYMMDD(s) {
    return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  }

  function safeNumber(x) {
    return typeof x === "number" && Number.isFinite(x) ? x : null;
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  // ------------------------
  // aspects lists
  // ------------------------
  const ASPECTS_MAJOR = Array.isArray(ASPECTS) ? ASPECTS : [];
  const ASPECTS_DEEP_LIST = Array.isArray(ASPECTS_DEEP) ? ASPECTS_DEEP : [];
  const ASPECTS_ALL = [...ASPECTS_MAJOR, ...ASPECTS_DEEP_LIST];

  // ------------------------
  // sign helpers
  // ------------------------
  function signKeyFromLon(lonDeg) {
    const idx = Math.floor(norm360(lonDeg) / 30);

    const fallbackOrder = [
      "aries", "taurus", "gemini", "cancer", "leo", "virgo",
      "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"
    ];

    return SIGNS_V1?.order?.[idx] ?? fallbackOrder[idx] ?? null;
  }


  function signJaFromKey(signKey) {
    return SIGNS_V1?.signs?.[signKey]?.label_ja ?? null;
  }

  function signFromLon(lonDeg) {
    const sign_key = signKeyFromLon(lonDeg);
    return { sign_key, sign_ja: signJaFromKey(sign_key) };
  }

  // ------------------------
  // Swiss Ephemeris
  // ------------------------
  function jdUtFromIso(asOfISO) {
    const d = new Date(asOfISO);
    if (Number.isNaN(d.getTime())) throw new Error(`invalid as_of ISO: ${asOfISO}`);

    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const hour =
      d.getUTCHours() +
      d.getUTCMinutes() / 60 +
      d.getUTCSeconds() / 3600 +
      d.getUTCMilliseconds() / 3600000;

    return swisseph.swe_julday(y, m, day, hour, swisseph.SE_GREG_CAL);
  }

  const BODY_MAP = {
    Sun: swisseph.SE_SUN,
    Moon: swisseph.SE_MOON,
    Mercury: swisseph.SE_MERCURY,
    Venus: swisseph.SE_VENUS,
    Mars: swisseph.SE_MARS,
    Jupiter: swisseph.SE_JUPITER,
    Saturn: swisseph.SE_SATURN,
    Uranus: swisseph.SE_URANUS,
    Neptune: swisseph.SE_NEPTUNE,
    Pluto: swisseph.SE_PLUTO,
  };

  const TRANSIT_TARGETS = Object.keys(BODY_MAP);

  function sweLonDeg(bodyName, jdUt) {
    const id = BODY_MAP[bodyName];
    if (id === undefined) throw new Error(`unsupported body: ${bodyName}`);

    const flags = swisseph.SEFLG_SWIEPH;
    const out = swisseph.swe_calc_ut(jdUt, id, flags);
    if (!out || out.error) throw new Error(`swe_calc_ut failed: ${out?.error || "unknown"}`);

    const lon = typeof out.longitude === "number" ? out.longitude : out.data?.[0];
    if (!Number.isFinite(lon)) throw new Error("invalid lon from swe_calc_ut");

    return norm360(lon);
  }

  function computeTransitsSwiss(asOfISO, precisionDeg = 0.01) {
    const jdUt = jdUtFromIso(asOfISO);

    const bodies = {};
    const bodies_signs = {};

    for (const body of TRANSIT_TARGETS) {
      const lon = sweLonDeg(body, jdUt);
      const lonFixed = toFixedPrecision(lon, precisionDeg);
      bodies[body] = lonFixed;

      const s = signFromLon(lonFixed);
      bodies_signs[body] = { ...s, lon_deg: lonFixed };
    }

    const moonLon = bodies.Moon;
    const moonSign = typeof moonLon === "number" ? signFromLon(moonLon) : { sign_key: null, sign_ja: null };

    return {
      bodies,
      bodies_signs,
      moon: {
        lon_deg: safeNumber(moonLon),
        sign_key: moonSign.sign_key,
        sign_ja: moonSign.sign_ja,
      },
    };
  }

  // ------------------------
  // aspect finder
  // ------------------------
  function bestAspectForDistance(distDeg, aspectsList) {
    let best = null;
    const list = Array.isArray(aspectsList) ? aspectsList : [];
    for (const a of list) {
      const delta = Math.abs(distDeg - a.deg);
      if (!best || delta < best.delta) best = { type: a.type, aspect_deg: a.deg, delta };
    }
    return best;
  }

  function pickTopByOrb(items, n = 3) {
    return [...(items || [])]
      .sort((x, y) => (x?.orb_deg ?? 999) - (y?.orb_deg ?? 999))
      .slice(0, n);
  }

  //
  // 空層計算
  //

  function getSignMetaByKey(signKeyRaw) {
    const key = String(signKeyRaw || "");
    if (!key) return null;

    // 1) exact
    if (SIGNS_V1?.signs?.[key]) return SIGNS_V1.signs[key];

    // 2) lowercase hit
    const low = key.toLowerCase();
    if (SIGNS_V1?.signs?.[low]) return SIGNS_V1.signs[low];

    // 3) case-insensitive search (safe)
    const signs = SIGNS_V1?.signs || {};
    const hit = Object.keys(signs).find(k => k.toLowerCase() === low);
    return hit ? signs[hit] : null;
  }

  function computeSkyStrataFromTransits(transitSigns, weights) {
    const E = { fire: 0, earth: 0, air: 0, water: 0, unknown: 0 };
    const M = { cardinal: 0, fixed: 0, mutable: 0, unknown: 0 };

    for (const [body, info] of Object.entries(transitSigns || {})) {
      const signKey = String(info?.sign_key || "");
      if (!signKey) continue;

      const w = Number(weights?.[body] ?? 1.0);
      if (!Number.isFinite(w) || w <= 0) continue;

      const meta = getSignMetaByKey(signKey);
      const e = meta?.element || "unknown";
      const m = meta?.modality || "unknown";

      if (E[e] === undefined) E.unknown += w;
      else E[e] += w;

      if (M[m] === undefined) M.unknown += w;
      else M[m] += w;
    }

    const topKey = (obj) => {
      const entries = Object.entries(obj).filter(([k, v]) => k !== "unknown" && v > 0);
      if (!entries.length) return "mixed";
      entries.sort((a, b) => b[1] - a[1]);
      // 同点なら mixed にしたいならここ入れる
      // if (entries[1] && entries[0][1] === entries[1][1]) return "mixed";
      return entries[0][0];
    };

    return {
      element_weighted: E,
      modality_weighted: M,
      top_element: topKey(E),
      top_modality: topKey(M),
    };
  }


  // ------------------------
  // natal cache loader + extractor
  // ------------------------
  async function loadNatalFromCache(appUserId) {
    const snap = await db.collection("natal_cache").doc(appUserId).get();
    return snap.exists ? snap.data() : null;
  }

  function extractNatalLongitudes(natalCacheDoc) {
    const d = natalCacheDoc || {};
    const out = {};

    const ALIASES = {
      asc: "ASC",
      Asc: "ASC",
      ASC: "ASC",
      mc: "MC",
      Mc: "MC",
      MC: "MC",
      vertex: "Vertex",
      Vertex: "Vertex",

      sun: "Sun",
      moon: "Moon",
      mercury: "Mercury",
      venus: "Venus",
      mars: "Mars",
      jupiter: "Jupiter",
      saturn: "Saturn",
      uranus: "Uranus",
      neptune: "Neptune",
      pluto: "Pluto",
    };

    const normalizeKey = (k) => ALIASES[k] || k;

    const put = (key, lon) => {
      const nk = normalizeKey(key);
      if (typeof lon === "number" && Number.isFinite(lon)) out[nk] = norm360(lon);
    };

    const putFromObj = (key, v) => {
      if (typeof v === "number") return put(key, v);
      if (!v || typeof v !== "object") return;
      put(key, v.lon_deg);
      put(key, v.lon);
      put(key, v.longitude);
      if (Array.isArray(v.data) && typeof v.data[0] === "number") put(key, v.data[0]);
    };

    // common shapes
    if (d.bodies && typeof d.bodies === "object") for (const [k, v] of Object.entries(d.bodies)) putFromObj(k, v);
    if (d.points && typeof d.points === "object") for (const p of ["ASC", "MC", "Vertex", "asc", "mc", "vertex"]) if (p in d.points) putFromObj(p, d.points[p]);

    // your current min route
    const bodiesMap =
      d?.min?.bodies ||
      d?.min?.natal_positions ||
      d?.natal_positions ||
      d?.positions ||
      null;
    if (bodiesMap && typeof bodiesMap === "object") for (const [k, v] of Object.entries(bodiesMap)) putFromObj(k, v);

    // angles
    put("ASC", d?.engine?.houses?.asc_deg);
    put("MC", d?.engine?.houses?.mc_deg);
    put("ASC", d?.houses?.angles?.ASC);
    put("MC", d?.houses?.angles?.MC);
    put("Vertex", d?.houses?.angles?.Vertex);
    put("ASC", d?.min?.angles?.asc_deg ?? d?.min?.angles?.ASC ?? d?.min?.asc_deg);
    put("MC", d?.min?.angles?.mc_deg ?? d?.min?.angles?.MC ?? d?.min?.mc_deg);

    // legacy fallback
    const legacySrc = (d.min && d.min.bodies) || d.bodies_min || d.natal_bodies || null;
    if (legacySrc && typeof legacySrc === "object") for (const [k, v] of Object.entries(legacySrc)) putFromObj(k, v);

    const ok = Object.keys(out).length > 0;
    return { ok, longitudes: out };
  }

  // ------------------------
  // touch points / sky top
  // ------------------------
  function buildTouchPoints({ transitBodies, natalBodies, rules, withSigns = true }) {
    const results = [];
    const transitKeys = Object.keys(transitBodies || {});
    const natalKeys = Object.keys(natalBodies || {});

    for (const t of transitKeys) {
      const tLon = transitBodies[t];
      if (typeof tLon !== "number") continue;

      for (const n of natalKeys) {
        const nLon = natalBodies[n];
        if (typeof nLon !== "number") continue;

        const dist = absAngularDistance(tLon, nLon);
        const best = bestAspectForDistance(dist, ASPECTS_ALL);

        if (!best) continue;

        const allow = rules?.aspects_used_all;
        if (Array.isArray(allow) && !allow.includes(best.type)) continue;
        if (best.delta > (rules?.orb_max_deg ?? 6)) continue;

        const base = {
          transit_body: t,
          natal_body_or_point: n,
          aspect: best.type,
          aspect_deg: best.aspect_deg,
          orb_deg: Number(best.delta.toFixed(2)),
          house_focus: null,
          keywords: [],
        };

        if (withSigns) {
          const ts = signFromLon(tLon);
          const ns = signFromLon(nLon);
          base.transit_lon_deg = toFixedPrecision(tLon, 0.01);
          base.natal_lon_deg = toFixedPrecision(nLon, 0.01);
          base.transit_sign_key = ts.sign_key;
          base.transit_sign_ja = ts.sign_ja;
          base.natal_sign_key = ns.sign_key;
          base.natal_sign_ja = ns.sign_ja;
        }

        results.push(base);
      }
    }

    return results.sort((x, y) => x.orb_deg - y.orb_deg);
  }

  function buildPublicSkyAll(transitBodies, aspectsList, { orbMaxDeg = 6 } = {}) {
    const keys = Object.keys(transitBodies || {}).filter((k) => typeof transitBodies[k] === "number");
    if (keys.length < 2) return [];

    const out = [];
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = keys[i];
        const b = keys[j];

        const dist = absAngularDistance(transitBodies[a], transitBodies[b]);
        const best = bestAspectForDistance(dist, aspectsList);
        if (!best) continue;

        if (best.delta <= orbMaxDeg) {
          out.push({
            a,
            b,
            type: best.type,
            aspect_deg: best.aspect_deg,
            orb_deg: Number(best.delta.toFixed(2)),
          });
        }
      }
    }

    out.sort((x, y) => (x.orb_deg - y.orb_deg) || (x.a + x.b).localeCompare(y.a + y.b));
    return out;
  }


  function buildPublicSkyTopAll(transitBodies, aspectsList, { orbMaxDeg = 6, max = 3 } = {}) {
    const keys = Object.keys(transitBodies || {}).filter((k) => typeof transitBodies[k] === "number");
    if (keys.length < 2) return [];

    const out = [];
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = keys[i];
        const b = keys[j];

        const dist = absAngularDistance(transitBodies[a], transitBodies[b]);
        const best = bestAspectForDistance(dist, aspectsList);

        if (!best) continue;

        if (best.delta <= orbMaxDeg) {
          out.push({
            a,
            b,
            type: best.type,
            aspect_deg: best.aspect_deg,
            orb_deg: Number(best.delta.toFixed(2)),
          });
        }
      }
    }

    out.sort((x, y) => (x.orb_deg - y.orb_deg) || (x.a + x.b).localeCompare(y.a + y.b));
    return out.slice(0, max);
  }

  // ------------------------
  // story builders
  // ------------------------
  function baseStory({ appUserId, displayName, dateLocal, asOfISO, transitInfo, rules, precisionDeg }) {
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
      },
      public: {
        date_local: dateLocal,
        moon: {
          lon_deg: transitInfo?.moon?.lon_deg ?? null,
          sign_key: transitInfo?.moon?.sign_key ?? null,
          sign_ja: transitInfo?.moon?.sign_ja ?? null,
        },
        transit_signs: transitInfo?.bodies_signs || {},
        sky_strata: computeSkyStrataFromTransits(transitInfo?.bodies_signs, PLANET_WEIGHT),
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
      },

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


  function buildSkyLayersFromTouchPoints(tps = []) {
    const sorted = [...tps].sort((a, b) => (a.orb_deg ?? 99) - (b.orb_deg ?? 99));

    const slow = new Set(["Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]);
    const lum = new Set(["Sun", "Moon"]);

    // theme：遅い天体が絡む & orb小 を最優先。なければ最小orb
    const themeOne =
      sorted.find(x => slow.has(x.transit_body) || slow.has(x.natal_body_or_point)) ??
      sorted[0] ??
      null;

    // touch：今日ひっかかりやすい＝orb小 +（個人座標に触れやすい点を少し優遇）
    // 例：ASC/MC/太陽/月あたりを優遇（好みで調整）
    const importantNatal = new Set(["ASC", "MC", "Sun", "Moon", "Mercury", "Venus", "Mars"]);
    const touchPool = sorted
      .filter(x => x !== themeOne)
      .sort((a, b) => {
        const ai = importantNatal.has(a.natal_body_or_point) ? -0.15 : 0;
        const bi = importantNatal.has(b.natal_body_or_point) ? -0.15 : 0;
        return (a.orb_deg ?? 99) + ai - ((b.orb_deg ?? 99) + bi);
      });

    const touch = touchPool.slice(0, 2);

    // hidden：超タイト(<=0.3)があればそれ。なければ「遅い×そこそこタイト」
    const hiddenOne =
      sorted.find(x => x !== themeOne && (x.orb_deg ?? 99) <= 0.3) ??
      sorted.find(x =>
        x !== themeOne &&
        (slow.has(x.transit_body) || slow.has(x.natal_body_or_point)) &&
        (x.orb_deg ?? 99) <= 1.2
      ) ??
      null;

    const hidden = hiddenOne ? [hiddenOne] : [];

    return { theme: themeOne ? [themeOne] : [], touch, hidden };
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
    mode = "auto", // "public" | "auto"
    orbMaxDeg = 6,
    precisionDeg = 0.01,
  }) {
    if (!appUserId) throw new Error("appUserId required");
    if (!isYYYYMMDD(dateLocal)) throw new Error("dateLocal must be YYYY-MM-DD");
    if (!asOfISO) throw new Error("asOfISO required");

    const m = String(mode || "auto").trim().toLowerCase();
    const orb = clamp(Number(orbMaxDeg ?? 6), 0.1, 12);
    const prec = clamp(Number(precisionDeg ?? 0.01), 0.001, 1);

    // displayName (best-effort)
    let displayName = null;
    try {
      const u = await db.collection("users").doc(appUserId).get();
      if (u.exists) {
        const ud = u.data() || {};
        displayName = ud.display_name ?? ud?.profile?.display_name ?? ud?.channels?.line?.profile?.display_name ?? null;
      }
    } catch (_e) { }

    const transitInfo = computeTransitsSwiss(asOfISO, prec);

    const rules = {
      aspects_used_major: ASPECTS_MAJOR.map((a) => a.type),
      aspects_used_all: ASPECTS_ALL.map((a) => a.type),
      orb_max_deg: orb,
      sort: "orb_asc",
    };

    // public forced
    if (m === "public") {
      return buildPublicOnlyStory({ appUserId, displayName, dateLocal, asOfISO, transitInfo, rules, precisionDeg: prec });
    }

    // auto: natal exists -> personal, else public-only
    const natalCache = await loadNatalFromCache(appUserId);
    if (!natalCache) {
      return buildPublicOnlyStory({ appUserId, displayName, dateLocal, asOfISO, transitInfo, rules, precisionDeg: prec });
    }

    const extracted = extractNatalLongitudes(natalCache);
    if (!extracted.ok) {
      return buildPublicOnlyStory({ appUserId, displayName, dateLocal, asOfISO, transitInfo, rules, precisionDeg: prec });
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
