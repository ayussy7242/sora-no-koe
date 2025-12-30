// engine/story.js — Unified STABLE (v2025.12+)
"use strict";

function createStoryService({
  db,
  admin,
  swisseph,

  // dict
  SIGNS_V1,

  // aspects list: [{type, deg}, ...]
  ASPECTS,

  DEFAULT_TZ,
  PROJECT,
  SCHEMA_VERSION,

  // optional
  buildResonanceBullets,
}) {
  // ------------------------
  // utils
  // ------------------------
  function nowIso() {
    return new Date().toISOString();
  }

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

  // ------------------------
  // Sign helpers
  // ------------------------
  function signKeyFromLon(lonDeg) {
    const idx = Math.floor(norm360(lonDeg) / 30);
    const key = SIGNS_V1?.order?.[idx] ?? null;
    return key;
  }

  function signJaFromKey(signKey) {
    return SIGNS_V1?.signs?.[signKey]?.label_ja ?? null;
    }

  function signFromLon(lonDeg) {
    const sign_key = signKeyFromLon(lonDeg);
    return { sign_key, sign_ja: signJaFromKey(sign_key) };
  }

  function pickTopByOrb(items, n = 3) {
    return [...(items || [])]
      .sort((x, y) => (x?.orb_deg ?? 999) - (y?.orb_deg ?? 999))
      .slice(0, n);
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
    for (const body of TRANSIT_TARGETS) {
      const lon = sweLonDeg(body, jdUt);
      bodies[body] = toFixedPrecision(lon, precisionDeg);
    }

    const moonLon = bodies.Moon;
    const moonSign =
      typeof moonLon === "number" ? signFromLon(moonLon) : { sign_key: null, sign_ja: null };

    return {
      bodies,
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
  function bestAspectForDistance(distDeg) {
    let best = null;
    for (const a of ASPECTS || []) {
      const delta = Math.abs(distDeg - a.deg);
      if (!best || delta < best.delta) best = { type: a.type, aspect_deg: a.deg, delta };
    }
    return best;
  }

  // ------------------------
  // story parts
  // ------------------------
  function buildTouchPoints({ transitBodies, natalBodies, rules }) {
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
        const best = bestAspectForDistance(dist);
        if (!best) continue;

        if (Array.isArray(rules?.aspects_used) && !rules.aspects_used.includes(best.type)) continue;
        if (best.delta > (rules?.orb_max_deg ?? 6)) continue;

        results.push({
          transit_body: t,
          natal_body_or_point: n,
          aspect: best.type,
          aspect_deg: best.aspect_deg,
          orb_deg: Number(best.delta.toFixed(2)),
          house_focus: null,
          keywords: [],
        });
      }
    }

    return results.sort((x, y) => x.orb_deg - y.orb_deg);
  }

  function buildPublicSkyTopAll(transitBodies, { orbMaxDeg = 6, max = 3 } = {}) {
    const keys = Object.keys(transitBodies || {}).filter((k) => typeof transitBodies[k] === "number");
    if (keys.length < 2) return [];

    const out = [];
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = keys[i];
        const b = keys[j];

        const dist = absAngularDistance(transitBodies[a], transitBodies[b]);
        const best = bestAspectForDistance(dist);
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

  async function loadNatalFromCache(appUserId) {
    const snap = await db.collection("natal_cache").doc(appUserId).get();
    if (!snap.exists) return null;
    return snap.data();
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

    if (d.bodies && typeof d.bodies === "object") {
      for (const [k, v] of Object.entries(d.bodies)) putFromObj(k, v);
    }
    if (d.points && typeof d.points === "object") {
      for (const p of ["ASC", "MC", "Vertex", "asc", "mc", "vertex"]) {
        if (p in d.points) putFromObj(p, d.points[p]);
      }
    }

    const bodiesMap = d?.natal_positions?.bodies;
    if (bodiesMap && typeof bodiesMap === "object") {
      for (const [k, v] of Object.entries(bodiesMap)) putFromObj(k, v);
    }

    put("Sun", d?.natal_positions?.sun?.lon_deg);
    put("Moon", d?.natal_positions?.moon?.lon_deg);
    put("ASC", d?.natal_positions?.asc?.lon_deg);

    put("ASC", d?.engine?.houses?.asc_deg);
    put("MC", d?.engine?.houses?.mc_deg);

    put("ASC", d?.houses?.angles?.ASC);
    put("MC", d?.houses?.angles?.MC);
    put("Vertex", d?.houses?.angles?.Vertex);

    put("ASC", d?.min?.angles?.asc_deg ?? d?.min?.angles?.ASC ?? d?.min?.asc_deg);
    put("MC", d?.min?.angles?.mc_deg ?? d?.min?.angles?.MC ?? d?.min?.mc_deg);
    put("ASC", d?.angles?.asc_deg ?? d?.angles?.ASC);
    put("MC", d?.angles?.mc_deg ?? d?.angles?.MC);
    put("ASC", d?.ascmc?.asc_deg ?? d?.ascmc?.ASC);
    put("MC", d?.ascmc?.mc_deg ?? d?.ascmc?.MC);

    const legacySrc = (d.min && d.min.bodies) || d.bodies_min || d.natal_bodies || null;
    if (legacySrc && typeof legacySrc === "object") {
      for (const [k, v] of Object.entries(legacySrc)) putFromObj(k, v);
    }

    const ok = Object.keys(out).length > 0;
    return { ok, longitudes: out };
  }

  function baseStory({
    appUserId,
    displayName,
    dateLocal,
    asOfISO,
    transitInfo,
    rules,
    precisionDeg,
    containsPersonalData,
  }) {
    return {
      meta: {
        schema_version: SCHEMA_VERSION,
        project: PROJECT,
        timezone: DEFAULT_TZ,
        date_local: dateLocal,
        as_of: asOfISO,
        generated_at_utc: nowIso(),
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
        sky_top: buildPublicSkyTopAll(transitInfo?.bodies, {
          orbMaxDeg: rules?.orb_max_deg ?? 6,
          max: 3,
        }),
        tone_hints: { resonance_bullets: [] },
      },
      personal: {
        user_id: appUserId,
        user: { display_name: displayName ?? null },
        privacy: { contains_personal_data: !!containsPersonalData, allowed_channels: ["line"] },
        touch_points_top3: [],
      },
      guardrails: {
        no_prediction: true,
        no_good_bad: true,
        no_should: true,
        no_personality_label: true,
        no_salvation: true,
        sovereignty_returned: true,
      },
    };
  }

  function storyJsonV11({ appUserId, displayName, dateLocal, asOfISO, transitInfo, touchPointsAll, rules, precisionDeg }) {
    const story = baseStory({
      appUserId,
      displayName,
      dateLocal,
      asOfISO,
      transitInfo,
      rules,
      precisionDeg,
      containsPersonalData: true,
    });

    story.personal.touch_points_top3 = pickTopByOrb(touchPointsAll, 3);

    const allowPersonal = !!story?.personal?.privacy?.contains_personal_data;
    try {
      if (typeof buildResonanceBullets === "function") {
        const reso = buildResonanceBullets(story, { max: 4, allowPersonal, debug: true });
        story.public.tone_hints.resonance_bullets = Array.isArray(reso?.bullets) ? reso.bullets : [];
      }
    } catch (_e) {
      story.public.tone_hints.resonance_bullets = [];
    }

    return story;
  }

  // ✅ public-only: personalを完全に削除（混入ゼロ）
  function buildPublicOnlyStory({ appUserId, displayName, dateLocal, asOfISO, transitInfo, rules, precisionDeg }) {
    const story = baseStory({
      appUserId,
      displayName,
      dateLocal,
      asOfISO,
      transitInfo,
      rules,
      precisionDeg,
      containsPersonalData: false,
    });

    try {
      if (typeof buildResonanceBullets === "function") {
        const reso = buildResonanceBullets(story, { max: 4, allowPersonal: false });
        story.public.tone_hints.resonance_bullets = Array.isArray(reso?.bullets) ? reso.bullets : [];
      }
    } catch (_e) {
      story.public.tone_hints.resonance_bullets = [];
    }

    // ✅ ここが修正点：publicでは personal を返さない
    delete story.personal;

    return story;
  }

  /**
   * buildStoryForUser
   * mode:
   *  - "public" -> public-only を強制（natalがあってもpersonal作らない）
   *  - default  -> personal（natalがあれば）/ なければpublic-only
   */
  async function buildStoryForUser({ appUserId, dateLocal, asOfISO, mode = null, orbMaxDeg = 6, precisionDeg = 0.01 }) {
    if (!isYYYYMMDD(dateLocal)) throw new Error("dateLocal must be YYYY-MM-DD");

    let displayName = null;
    try {
      const u = await db.collection("users").doc(appUserId).get();
      if (u.exists) {
        const ud = u.data() || {};
        displayName = ud.display_name ?? ud?.profile?.display_name ?? null;
      }
    } catch (_e) {}

    const transitInfo = computeTransitsSwiss(asOfISO, precisionDeg);

    const rules = {
      aspects_used: (ASPECTS || []).map((a) => a.type),
      orb_max_deg: orbMaxDeg,
      sort: "orb_asc",
    };

    // ✅ ここが最大の修正点：publicモードは問答無用でpublic-only
    if (String(mode || "").toLowerCase() === "public") {
      return buildPublicOnlyStory({ appUserId, displayName, dateLocal, asOfISO, transitInfo, rules, precisionDeg });
    }

    const natalCache = await loadNatalFromCache(appUserId);

    if (!natalCache) {
      return buildPublicOnlyStory({ appUserId, displayName, dateLocal, asOfISO, transitInfo, rules, precisionDeg });
    }

    const extracted = extractNatalLongitudes(natalCache);
    if (!extracted.ok) {
      return buildPublicOnlyStory({ appUserId, displayName, dateLocal, asOfISO, transitInfo, rules, precisionDeg });
    }

    const natalLonMap = extracted.longitudes;

    const touchAll = buildTouchPoints({
      transitBodies: transitInfo.bodies,
      natalBodies: natalLonMap,
      rules,
    });

    return storyJsonV11({
      appUserId,
      displayName,
      dateLocal,
      asOfISO,
      transitInfo,
      touchPointsAll: touchAll,
      rules,
      precisionDeg,
    });
  }

  return { buildStoryForUser, computeTransitsSwiss };
}

module.exports = { createStoryService };
