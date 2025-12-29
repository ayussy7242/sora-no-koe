// engine/story.js
"use strict";

function createStoryService({
  db,
  admin,
  swisseph,

  // ✅ SIGNS_JA(配列)ではなく SIGNS_V1(辞書)を受け取る
  SIGNS_V1,

  ASPECTS,
  DEFAULT_TZ,
  PROJECT,
  SCHEMA_VERSION,
  buildResonanceBullets,
}) {
  // -------- utils --------
  function nowIso() { return new Date().toISOString(); }
  function norm360(deg) { let x = deg % 360; if (x < 0) x += 360; return x; }
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

  // -------- Sign helpers（完全版：key + ja） --------
  function signKeyFromLon(lonDeg) {
    const idx = Math.floor(norm360(lonDeg) / 30);
    const key = SIGNS_V1?.order?.[idx] ?? null; // "Aries" など
    return key;
  }

  function signJaFromKey(signKey) {
    return SIGNS_V1?.signs?.[signKey]?.label_ja ?? null; // "牡羊座"
  }

  function signFromLon(lonDeg) {
    const sign_key = signKeyFromLon(lonDeg);
    return {
      sign_key,
      sign_ja: signJaFromKey(sign_key),
    };
  }

  function pickTopByOrb(items, n = 3) {
    return [...items]
      .sort((x, y) => (x.orb_deg ?? 999) - (y.orb_deg ?? 999))
      .slice(0, n);
  }

  // -------- Swiss Ephemeris --------
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

  function sweLonDeg(bodyName, jdUt) {
    const MAP = {
      Sun: swisseph.SE_SUN,
      Moon: swisseph.SE_MOON,
      Mercury: swisseph.SE_MERCURY,
      Venus: swisseph.SE_VENUS,
      Mars: swisseph.SE_MARS,
    };
    const id = MAP[bodyName];
    if (id === undefined) throw new Error(`unsupported body: ${bodyName}`);

    const flags = swisseph.SEFLG_SWIEPH;
    const out = swisseph.swe_calc_ut(jdUt, id, flags);
    if (!out || out.error) throw new Error(`swe_calc_ut failed: ${out?.error || "unknown"}`);

    const lon = (typeof out.longitude === "number") ? out.longitude : out.data?.[0];
    if (!Number.isFinite(lon)) throw new Error("invalid lon from swe_calc_ut");

    return norm360(lon);
  }

  function computeTransitsSwiss(asOfISO, precisionDeg = 0.01) {
    const jdUt = jdUtFromIso(asOfISO);
    const bodies = {};
    const targets = ["Sun", "Moon", "Mercury", "Venus", "Mars"];

    for (const body of targets) {
      const lon = sweLonDeg(body, jdUt);
      bodies[body] = toFixedPrecision(lon, precisionDeg);
    }

    const moonLon = bodies.Moon;
    const moonSign = signFromLon(moonLon);

    return {
      bodies,
      moon: {
        lon_deg: moonLon,
        sign_key: moonSign.sign_key,
        sign_ja: moonSign.sign_ja,
      },
    };
  }

  // -------- story parts --------
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

        let best = null;
        for (const a of ASPECTS) {
          const delta = Math.abs(dist - a.deg);
          if (!best || delta < best.delta) best = { type: a.type, aspect_deg: a.deg, delta };
        }

        if (!best) continue;
        if (!rules.aspects_used.includes(best.type)) continue;
        if (best.delta > rules.orb_max_deg) continue;

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

  function buildPublicSkyTop(transitMap) {
    const moonLon = transitMap?.Moon;
    if (typeof moonLon !== "number") return [];

    const preferred = ["Sun", "Venus", "Mars", "Mercury"];
    const out = [];

    for (const b of preferred) {
      const lon = transitMap[b];
      if (typeof lon !== "number") continue;

      const dist = absAngularDistance(moonLon, lon);

      let best = null;
      for (const a of ASPECTS) {
        const delta = Math.abs(dist - a.deg);
        if (!best || delta < best.delta) best = { type: a.type, aspect_deg: a.deg, delta };
      }

      if (best && best.delta <= 6) {
        out.push({
          a: "Moon",
          b,
          type: best.type,
          aspect_deg: best.aspect_deg,
          orb_deg: Number(best.delta.toFixed(2)),
        });
      }
    }

    return out.sort((x, y) => x.orb_deg - y.orb_deg).slice(0, 3);
  }

  async function loadNatalFromCache(appUserId) {
    const snap = await db.collection("natal_cache").doc(appUserId).get();
    if (!snap.exists) return null;
    return snap.data();
  }

  // ✅ 絶対落とさない natal longitude extractor（新旧/複数形式を拾う）
  function extractNatalLongitudes(natalCacheDoc) {
    const d = natalCacheDoc || {};
    const out = {};

    // helper: add lon if valid
    const put = (key, lon) => {
      if (typeof lon === "number" && Number.isFinite(lon)) out[key] = lon;
    };

    // 1) 最優先：あなたのログに出てる形式（bodies / points）
    // 例: { bodies: { Sun:{lon_deg}... }, points:{ ASC:{lon_deg} } }
    if (d.bodies && typeof d.bodies === "object") {
      for (const [k, v] of Object.entries(d.bodies)) {
        if (typeof v === "number") put(k, v);
        else if (v && typeof v === "object") {
          put(k, v.lon_deg);
          put(k, v.lon);
        }
      }
    }
    if (d.points && typeof d.points === "object") {
      for (const p of ["ASC", "MC", "Vertex"]) {
        const v = d.points?.[p];
        if (typeof v === "number") put(p, v);
        else if (v && typeof v === "object") {
          put(p, v.lon_deg);
          put(p, v.lon);
        }
      }
    }

    // 2) いま貼ってくれた想定：natal_positions.bodies
    const bodiesMap = d?.natal_positions?.bodies;
    if (bodiesMap && typeof bodiesMap === "object") {
      for (const [k, v] of Object.entries(bodiesMap)) {
        if (typeof v === "number") put(k, v);
        else if (v && typeof v === "object") {
          put(k, v.lon_deg);
          put(k, v.lon);
        }
      }
    }

    // 3) 旧形式：natal_positions.sun/moon/asc など
    put("Sun", d?.natal_positions?.sun?.lon_deg);
    put("Moon", d?.natal_positions?.moon?.lon_deg);
    put("ASC", d?.natal_positions?.asc?.lon_deg);

    // 4) houses angles
    put("ASC", d?.houses?.angles?.ASC);
    put("MC", d?.houses?.angles?.MC);
    put("Vertex", d?.houses?.angles?.Vertex);

    // 5) さらに古い/別名候補（保険）
    // min/bodies_min/natal_bodies 等
    const legacySrc =
      (d.min && d.min.bodies) ||
      d.bodies_min ||
      d.natal_bodies ||
      null;

    if (legacySrc && typeof legacySrc === "object") {
      for (const [k, v] of Object.entries(legacySrc)) {
        if (typeof v === "number") put(k, v);
        else if (v && typeof v === "object") {
          put(k, v.lon_deg);
          put(k, v.lon);
        }
      }
    }

    const ok = Object.keys(out).length > 0;
    return { ok, longitudes: out };
  }

  function storyJsonV11({ appUserId, displayName, dateLocal, asOfISO, transitInfo, touchPointsAll, rules, engineMeta }) {
    const touchTop3 = pickTopByOrb(touchPointsAll, 3);
    const skyTop = buildPublicSkyTop(transitInfo.bodies);

    const story = {
      meta: {
        schema_version: SCHEMA_VERSION,
        project: PROJECT,
        timezone: DEFAULT_TZ,
        date_local: dateLocal,
        as_of: asOfISO,
        generated_at_utc: nowIso(),
        engine: engineMeta ?? { ephemeris_source: "swisseph", precision_deg: 0.01 },
        rules,
      },
      public: {
        date_local: dateLocal,
        moon: {
          lon_deg: transitInfo?.moon?.lon_deg ?? null,
          sign_key: transitInfo?.moon?.sign_key ?? null,
          sign_ja: transitInfo?.moon?.sign_ja ?? null,
        },
        sky_top: skyTop,
        tone_hints: { resonance_bullets: [] },
      },
      personal: {
        user_id: appUserId,
        user: { display_name: displayName ?? null },
        privacy: { contains_personal_data: true, allowed_channels: ["line"] },
        touch_points_top3: touchTop3,
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

    // ✅ resonance は付加要素：落とさない
    const allowPersonal = !!story?.personal?.privacy?.contains_personal_data;
    try {
      const reso = buildResonanceBullets(story, { max: 4, allowPersonal, debug: true });
      story.public.tone_hints.resonance_bullets = Array.isArray(reso?.bullets) ? reso.bullets : [];
    } catch (_e) {
      story.public.tone_hints.resonance_bullets = [];
    }

    return story;
  }

  function buildPublicOnlyStory({ appUserId, displayName, dateLocal, asOfISO, transitInfo, rules, precisionDeg }) {
    const story = {
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
        sky_top: buildPublicSkyTop(transitInfo.bodies),
        tone_hints: { resonance_bullets: [] },
      },
      personal: {
        user_id: appUserId,
        user: { display_name: displayName ?? null },
        privacy: { contains_personal_data: false, allowed_channels: ["line"] },
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

    try {
      const reso = buildResonanceBullets(story, { max: 4, allowPersonal: false });
      story.public.tone_hints.resonance_bullets = Array.isArray(reso?.bullets) ? reso.bullets : [];
    } catch (_e) {
      story.public.tone_hints.resonance_bullets = [];
    }

    return story;
  }

  async function buildStoryForUser({ appUserId, dateLocal, asOfISO, orbMaxDeg = 6, precisionDeg = 0.01 }) {
    if (!isYYYYMMDD(dateLocal)) throw new Error("dateLocal must be YYYY-MM-DD");

    let displayName = null;
    try {
      const u = await db.collection("users").doc(appUserId).get();
      if (u.exists) {
        const ud = u.data() || {};
        displayName = ud.display_name ?? ud?.profile?.display_name ?? null; // ✅両対応
      }
    } catch (_e) { /* noop */ }

    const natalCache = await loadNatalFromCache(appUserId);
    const transitInfo = computeTransitsSwiss(asOfISO, precisionDeg);

    const rules = {
      aspects_used: ASPECTS.map((a) => a.type),
      orb_max_deg: orbMaxDeg,
      sort: "orb_asc",
    };

    // ✅ natal_cache が無いなら public-only
    if (!natalCache) {
      return buildPublicOnlyStory({ appUserId, displayName, dateLocal, asOfISO, transitInfo, rules, precisionDeg });
    }

    // ✅ natal_cache があっても「取り出せない」ケースがある → 絶対落とさず public-only
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
      engineMeta: { ephemeris_source: "swisseph", precision_deg: precisionDeg },
    });
  }

  return { buildStoryForUser, computeTransitsSwiss };
}

module.exports = { createStoryService };
