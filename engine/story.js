// engine/story.js
"use strict";

function createStoryService({
    db,
    admin,
    swisseph,

    // dict
    SIGNS_V1,

    // aspects list: [{type, deg}, ...]  (major_list 推奨)
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
    // Sign helpers (key + ja)
    // ------------------------
    function signKeyFromLon(lonDeg) {
        const idx = Math.floor(norm360(lonDeg) / 30);
        const key = SIGNS_V1?.order?.[idx] ?? null; // "Aries" など
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

    function sweLonDeg(bodyName, jdUt) {
        const MAP = {
            Sun: swisseph.SE_SUN,
            Moon: swisseph.SE_MOON,
            Mercury: swisseph.SE_MERCURY,
            Venus: swisseph.SE_VENUS,
            Mars: swisseph.SE_MARS,
            // 将来拡張したい場合ここに追加
        };

        const id = MAP[bodyName];
        if (id === undefined) throw new Error(`unsupported body: ${bodyName}`);

        const flags = swisseph.SEFLG_SWIEPH;
        const out = swisseph.swe_calc_ut(jdUt, id, flags);
        if (!out || out.error) throw new Error(`swe_calc_ut failed: ${out?.error || "unknown"}`);

        const lon = typeof out.longitude === "number" ? out.longitude : out.data?.[0];
        if (!Number.isFinite(lon)) throw new Error("invalid lon from swe_calc_ut");

        return norm360(lon);
    }

    // ✅ transits
    function computeTransitsSwiss(asOfISO, precisionDeg = 0.01) {
        const jdUt = jdUtFromIso(asOfISO);

        const bodies = {};
        const targets = ["Sun", "Moon", "Mercury", "Venus", "Mars"];
        for (const body of targets) {
            const lon = sweLonDeg(body, jdUt);
            bodies[body] = toFixedPrecision(lon, precisionDeg);
        }

        const moonLon = bodies.Moon;
        const moonSign =
            typeof moonLon === "number"
                ? signFromLon(moonLon)
                : { sign_key: null, sign_ja: null };

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

    /**
     * ✅ public.sky_top（空の構造）: 全ペアから上位
     */
    function buildPublicSkyTopAll(transitBodies, { orbMaxDeg = 6, max = 3 } = {}) {
        const keys = Object.keys(transitBodies || {}).filter(
            (k) => typeof transitBodies[k] === "number"
        );
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

        // ✅ 安定ソート（同点でも順序がブレない）
        out.sort((x, y) => (x.orb_deg - y.orb_deg) || (x.a + x.b).localeCompare(y.a + y.b));

        return out.slice(0, max);
    }

    async function loadNatalFromCache(appUserId) {
        const snap = await db.collection("natal_cache").doc(appUserId).get();
        if (!snap.exists) return null;
        return snap.data();
    }

    // ✅ 絶対落とさない natal longitude extractor（新旧/複数形式/別名を拾う）
    function extractNatalLongitudes(natalCacheDoc) {
        const d = natalCacheDoc || {};
        const out = {};

        const ALIASES = {
            // points
            asc: "ASC",
            Asc: "ASC",
            ASC: "ASC",
            mc: "MC",
            Mc: "MC",
            MC: "MC",
            vertex: "Vertex",
            Vertex: "Vertex",
            // planets lowercase
            sun: "Sun",
            moon: "Moon",
            mercury: "Mercury",
            venus: "Venus",
            mars: "Mars",
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
            // たまに data[0] 系
            if (Array.isArray(v.data) && typeof v.data[0] === "number") put(key, v.data[0]);
        };

        // 1) bodies / points (あなたのログ形式)
        if (d.bodies && typeof d.bodies === "object") {
            for (const [k, v] of Object.entries(d.bodies)) putFromObj(k, v);
        }
        if (d.points && typeof d.points === "object") {
            for (const p of ["ASC", "MC", "Vertex", "asc", "mc", "vertex"]) {
                if (p in d.points) putFromObj(p, d.points[p]);
            }
        }

        // 2) natal_positions.bodies
        const bodiesMap = d?.natal_positions?.bodies;
        if (bodiesMap && typeof bodiesMap === "object") {
            for (const [k, v] of Object.entries(bodiesMap)) putFromObj(k, v);
        }

        // 3) old: natal_positions.sun/moon/asc
        put("Sun", d?.natal_positions?.sun?.lon_deg);
        put("Moon", d?.natal_positions?.moon?.lon_deg);
        put("ASC", d?.natal_positions?.asc?.lon_deg);

        // 4) houses angles
        put("ASC", d?.houses?.angles?.ASC);
        put("MC", d?.houses?.angles?.MC);
        put("Vertex", d?.houses?.angles?.Vertex);

        // 5) legacy backups
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
                // ✅ 月固定やめて全体から抽出
                sky_top: buildPublicSkyTopAll(transitInfo?.bodies, { orbMaxDeg: rules?.orb_max_deg ?? 6, max: 3 }),
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

        // ✅ resonance は付加：落ちない
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

        // ✅ resonance は付加：落ちない
        try {
            if (typeof buildResonanceBullets === "function") {
                const reso = buildResonanceBullets(story, { max: 4, allowPersonal: false });
                story.public.tone_hints.resonance_bullets = Array.isArray(reso?.bullets) ? reso.bullets : [];
            }
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
                displayName = ud.display_name ?? ud?.profile?.display_name ?? null;
            }
        } catch (_e) { }

        const transitInfo = computeTransitsSwiss(asOfISO, precisionDeg);

        const rules = {
            aspects_used: (ASPECTS || []).map((a) => a.type),
            orb_max_deg: orbMaxDeg,
            sort: "orb_asc",
        };

        const natalCache = await loadNatalFromCache(appUserId);

        // ✅ natal_cache が無い → public-only
        if (!natalCache) {
            return buildPublicOnlyStory({ appUserId, displayName, dateLocal, asOfISO, transitInfo, rules, precisionDeg });
        }

        // ✅ natal_cache があっても抽出できない → public-only（絶対落とさない）
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
