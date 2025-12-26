const functions = require("@google-cloud/functions-framework");
const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();

// Firestore (multi DB)
const db = admin.firestore();
db.settings({ databaseId: "sora-no-koe-db" });

/* =====================
   helpers
===================== */
function toFixedPrecision(n, precisionDeg = 0.01) {
  const p = 1 / precisionDeg;
  return Math.round(n * p) / p;
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

function aspectDelta(distanceDeg, aspectDeg) {
  return Math.abs(distanceDeg - aspectDeg);
}

const ASPECTS = [
  { type: "conjunction", deg: 0 },
  { type: "sextile", deg: 60 },
  { type: "square", deg: 90 },
  { type: "trine", deg: 120 },
  { type: "opposition", deg: 180 },
];

function getAspectTypeAndOrb(distanceDeg, orbMaxDeg) {
  let best = null;
  for (const a of ASPECTS) {
    const orb = aspectDelta(distanceDeg, a.deg);
    if (orb <= orbMaxDeg) {
      if (!best || orb < best.orb_deg) best = { aspect: a.type, orb_deg: orb };
    }
  }
  return best;
}

function jstTodayYYYYMMDD() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function isYYYYMMDD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function asNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* =====================
   transit calculator (internal)
===================== */
function calcTransitMoonLon(dateLocal) {
  const base = new Date("2025-01-01T00:00:00Z");
  const target = new Date(`${dateLocal}T00:00:00+09:00`);
  const days = Math.floor((target - base) / (24 * 60 * 60 * 1000));

  const moonLon = norm360(toFixedPrecision((days * 13.176) % 360, 0.01));

  return {
    moon: { lon_deg: moonLon },
    engine: {
      ephemeris_source: "approx",
      precision: { deg: 0.01 },
      notes: "placeholder transit moon (daily changing)",
    },
  };
}

/* =====================
   buildStoryHttp handler
===================== */
async function buildStoryHttpHandler(req, res) {
  const requestId =
    String(req.header("x-request-id") || req.header("x-cloud-trace-context") || "")
      .slice(0, 100) || null;

  try {
    const userId = String(req.query.user_id || "u_me_yxhONE59qsE8hdpcdsGZ").trim();
    const dateLocal = String(req.query.date_local || jstTodayYYYYMMDD()).trim();

    if (!isYYYYMMDD(dateLocal)) {
      return res.status(400).json({ ok: false, error: "date_local must be YYYY-MM-DD" });
    }

    const precisionDeg = 0.01;
    const orbMaxDeg = 15;

    const userSnap = await db.collection("users").doc(userId).get();
    if (!userSnap.exists) return res.status(404).json({ ok: false, error: "users doc not found" });
    const user = userSnap.data();

    const cacheSnap = await db.collection("natal_cache").doc(userId).get();
    if (!cacheSnap.exists) return res.status(404).json({ ok: false, error: "natal_cache doc not found" });
    const cache = cacheSnap.data();

    const natalLon = {
      Sun: asNumber(cache?.natal_positions?.sun?.lon_deg),
      Moon: asNumber(cache?.natal_positions?.moon?.lon_deg),
      ASC: asNumber(cache?.natal_positions?.asc?.lon_deg),
    };

    for (const k of Object.keys(natalLon)) {
      if (natalLon[k] === null) {
        return res.status(400).json({ ok: false, error: `natal_positions.${k} lon_deg invalid` });
      }
    }

    const transit = calcTransitMoonLon(dateLocal);
    const transitMoonLon = transit.moon.lon_deg;

    const moonToNatal = [];
    for (const natalPoint of ["Sun", "Moon", "ASC"]) {
      const dist = absAngularDistance(transitMoonLon, natalLon[natalPoint]);
      const best = getAspectTypeAndOrb(dist, orbMaxDeg);
      if (best) {
        moonToNatal.push({
          transit_body: "Moon",
          natal_point: natalPoint,
          aspect: best.aspect,
          orb_deg: toFixedPrecision(best.orb_deg, precisionDeg),
        });
      }
    }
    moonToNatal.sort((a, b) => a.orb_deg - b.orb_deg);

    const story = {
      meta: {
        schema_version: "1.0.1",
        project: "sora-no-koe",
        timezone: user.timezone || "Asia/Tokyo",
        date_local: dateLocal,
        generated_at_utc: new Date().toISOString(),
        engine: {
          ephemeris_source: "approx",
          precision: { deg: precisionDeg },
          request_id: requestId,
        },
      },
      user: { id: userId, display_name: user.display_name || "unknown" },
      natal: {
        sun: { lon_deg: natalLon.Sun },
        moon: { lon_deg: natalLon.Moon },
        asc: { lon_deg: natalLon.ASC },
      },
      transit: { moon: { lon_deg: transitMoonLon } },
      resonance: {
        rules: {
          aspects_used: ASPECTS.map((a) => a.type),
          orb_max_deg: orbMaxDeg,
          sort: "orb_asc",
        },
        moon_to_natal: moonToNatal,
      },
    };

    const storyDocId = `${userId}-${dateLocal}`;
    await db.collection("stories").doc(storyDocId).set(
      {
        user_id: userId,
        date_local: dateLocal,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        story,
      },
      { merge: true }
    );

    return res.json({ ok: true, saved: true, doc_id: storyDocId, story });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}

/* =====================
   transitHttp handler
===================== */
async function transitHttpHandler(req, res) {
  try {
    const dateLocal = String(req.query.date_local || jstTodayYYYYMMDD()).trim();
    if (!isYYYYMMDD(dateLocal)) {
      return res.status(400).json({ ok: false, error: "date_local must be YYYY-MM-DD" });
    }
    const transit = calcTransitMoonLon(dateLocal);
    return res.json({ ok: true, date_local: dateLocal, transit });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}

/* =====================
   buildResonancePostHttp handler
===================== */
async function buildResonancePostHttpHandler(req, res) {
  try {
    const userId = String(req.query.user_id || "u_me_yxhONE59qsE8hdpcdsGZ").trim();
    const dateLocal = String(req.query.date_local || jstTodayYYYYMMDD()).trim();

    if (!isYYYYMMDD(dateLocal)) {
      return res.status(400).json({ ok: false, error: "date_local must be YYYY-MM-DD" });
    }

    const storyDocId = `${userId}-${dateLocal}`;
    const snap = await db.collection("stories").doc(storyDocId).get();

    if (!snap.exists) {
      return res.status(404).json({
        ok: false,
        error: "story not found. Call /buildStoryHttp first for this date.",
        hint: { url: `/buildStoryHttp?user_id=${encodeURIComponent(userId)}&date_local=${encodeURIComponent(dateLocal)}` },
      });
    }

    const story = snap.data()?.story;
    const top = story?.resonance?.moon_to_natal?.[0];

    if (!top) {
      return res.status(400).json({ ok: false, error: "no resonance candidates found" });
    }

    const BODY_JA = { Moon: "月" };
    const POINT_JA = { Sun: "太陽", Moon: "月", ASC: "ASC" };
    const ASPECT_JA = {
      conjunction: "コンジャンクション",
      sextile: "セクスタイル",
      square: "スクエア",
      trine: "トライン",
      opposition: "オポジション",
    };

    const headline = `${BODY_JA[top.transit_body] || top.transit_body}と${POINT_JA[top.natal_point] || top.natal_point}が${ASPECT_JA[top.aspect] || top.aspect}`;

    const TENDENCY_MAP = {
      square: ["感情が先に動きやすい", "言語化が少し遅れやすい"],
      trine: ["流れが自然につながりやすい", "安心が育ちやすい"],
      sextile: ["工夫が効きやすい", "会話の糸口が見つかりやすい"],
      conjunction: ["ひとつのテーマに集中しやすい", "反応が強まりやすい"],
      opposition: ["内と外のズレを感じやすい", "距離感が動きやすい"],
    };
    const tendencies = TENDENCY_MAP[top.aspect] || [];
    const dateLabel = dateLocal.replaceAll("-", ".");

    const xPost =
`🌌 ソラのこえ。
［${dateLabel}｜今日の星の配置］

今日は、
${headline}の配置。

今日は、
${tendencies.map((t) => `・${t}`).join("\n")}
そんな流れが起きやすい。

解釈は、あなたのもの。
今日も宇宙は、ちゃんと動いています🌌`;

    return res.json({
      ok: true,
      date_local: dateLocal,
      x_post: xPost,
      used: { top_resonance: top, headline, tendencies },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}

/* =====================
   Router（target=app）
===================== */
functions.http("app", async (req, res) => {
  const path = (req.path || "/").toLowerCase();

  if (path === "/" || path === "/health") {
    return res.json({
      ok: true,
      service: "sora-no-koe",
      routes: ["/buildStoryHttp", "/transitHttp", "/buildResonancePostHttp"],
    });
  }

  if (path === "/buildstoryhttp") return buildStoryHttpHandler(req, res);
  if (path === "/transithttp") return transitHttpHandler(req, res);
  if (path === "/buildresonanceposthttp") return buildResonancePostHttpHandler(req, res);

  return res.status(404).json({ ok: false, error: "not found", path });
});
