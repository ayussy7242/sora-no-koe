const functions = require("@google-cloud/functions-framework");
const admin = require("firebase-admin");
const crypto = require("crypto");


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

const resonanceHits = [];

// ① まずトランジットを1回だけ計算して配列にする
const transitPlanets = Object.entries(TRANSIT_SPEED).map(([body, speed]) => ({
  body,
  lon_deg: calcTransitPlanetLon(dateLocal, speed),
}));

// ② その配列を使って共鳴計算（再計算しない）
for (const t of transitPlanets) {
  for (const natalPoint of ["Sun", "Moon", "ASC"]) {
    const dist = absAngularDistance(t.lon_deg, natalLon[natalPoint]);
    const best = getAspectTypeAndOrb(dist, orbMaxDeg);

    if (best) {
      resonanceHits.push({
        transit_body: t.body,
        natal_point: natalPoint,
        aspect: best.aspect,
        orb_deg: toFixedPrecision(best.orb_deg, precisionDeg),
      });
    }
  }
}


        resonanceHits.sort((a, b) => a.orb_deg - b.orb_deg);
        const topResonances = resonanceHits.slice(0, 3);

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
            transit: { planets: transitPlanets },
            resonance: {
                rules: {
                    aspects_used: ASPECTS.map((a) => a.type),
                    orb_max_deg: orbMaxDeg,
                    sort: "orb_asc",
                },
                top_resonances: topResonances,
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
  const requestId =
    String(req.header("x-request-id") || req.header("x-cloud-trace-context") || "")
      .slice(0, 100) || null;

  try {
    const dateLocal = String(req.query.date_local || jstTodayYYYYMMDD()).trim();
    if (!isYYYYMMDD(dateLocal)) {
      return res.status(400).json({ ok: false, error: "date_local must be YYYY-MM-DD" });
    }

    const precisionDeg = 0.01;

    const planets = Object.entries(TRANSIT_SPEED).map(([body, speed]) => ({
      body,
      lon_deg: calcTransitPlanetLon(dateLocal, speed),
    }));

    return res.json({
      ok: true,
      meta: {
        schema_version: "1.0.1",
        project: "sora-no-koe",
        timezone: "Asia/Tokyo",
        date_local: dateLocal,
        generated_at_utc: new Date().toISOString(),
        engine: {
          ephemeris_source: "approx",
          precision: { deg: precisionDeg },
          request_id: requestId,
        },
      },
      transit: { planets },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}


/* =====================
   buildResonancePostHttp handler（top3対応）
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
        hint: {
          url: `/buildStoryHttp?user_id=${encodeURIComponent(userId)}&date_local=${encodeURIComponent(dateLocal)}`,
        },
      });
    }

    const story = snap.data()?.story;
    const tops = story?.resonance?.top_resonances || [];
    const top3 = tops.slice(0, 3);

    if (!top3.length) {
      return res.status(400).json({ ok: false, error: "no resonance candidates found" });
    }

    // 表記（太陽〜火星）
    const BODY_JA = { Sun: "太陽", Moon: "月", Mercury: "水星", Venus: "金星", Mars: "火星" };
    const POINT_JA = { Sun: "太陽", Moon: "月", ASC: "ASC" };
    const ASPECT_JA = {
      conjunction: "コンジャンクション",
      sextile: "セクスタイル",
      square: "スクエア",
      trine: "トライン",
      opposition: "オポジション",
    };

    // 1行フォーマット（置くだけ）
    function formatHit(hit, index) {
      const b = BODY_JA[hit.transit_body] || hit.transit_body;
      const p = POINT_JA[hit.natal_point] || hit.natal_point;
      const a = ASPECT_JA[hit.aspect] || hit.aspect;
      const orb = hit.orb_deg;
      return `${index + 1}) ${b} × ${p}｜${a}（orb ${orb}°）`;
    }

    const dateLabel = dateLocal.replaceAll("-", ".");
    const lines = top3.map(formatHit).join("\n");

    // X文面（哲学は最小、指示・断定なし、配置を置く）
    const xPost =
`🌌 ソラのこえ。
［${dateLabel}｜今日の星の配置］

今日、強く触れている配置：

${lines}

解釈は、あなたのもの。`;

    return res.json({
      ok: true,
      date_local: dateLocal,
      x_post: xPost,
      used: { top_resonances: top3 },
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
      routes: ["/buildStoryHttp", "/transitHttp", "/buildResonancePostHttp", "/buildLineDailyHttp", "/lineWebhook"],
    });
  }

  // ✅ LINE Webhook（まずは200返すだけ）
    if (path === "/linewebhook") {
    console.log("LINE webhook hit");
    console.log(JSON.stringify(req.body));
    return res.status(200).json({ ok: true });
    }


  if (path === "/buildstoryhttp") return buildStoryHttpHandler(req, res);
  if (path === "/transithttp") return transitHttpHandler(req, res);
  if (path === "/buildresonanceposthttp") return buildResonancePostHttpHandler(req, res);
  if (path === "/buildlinedailyhttp") return buildLineDailyHttpHandler(req, res);

  return res.status(404).json({ ok: false, error: "not found", path });
});


// トランジットの計算設定
function calcTransitPlanetLon(dateLocal, speedPerDay) {
    const base = new Date("2025-01-01T00:00:00Z");
    const target = new Date(`${dateLocal}T00:00:00+09:00`);
    const days = Math.floor((target - base) / (24 * 60 * 60 * 1000));
    return norm360(toFixedPrecision((days * speedPerDay) % 360, 0.01));
}

const TRANSIT_SPEED = {
    Sun: 0.9856,
    Moon: 13.176,
    Mercury: 1.2,
    Venus: 1.18,
    Mars: 0.524,
};


// LINE配信DAILY
async function buildLineDailyHttpHandler(req, res) {
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
        error: "story not found",
        hint: `/buildStoryHttp?user_id=${userId}&date_local=${dateLocal}`,
      });
    }

    const story = snap.data().story;
    const top = story.resonance.top_resonances || [];

    const BODY_JA = { Sun:"太陽", Moon:"月", Mercury:"水星", Venus:"金星", Mars:"火星" };
    const POINT_JA = { Sun:"太陽", Moon:"月", ASC:"ASC" };
    const ASPECT_JA = {
      conjunction:"コンジャンクション",
      sextile:"セクスタイル",
      square:"スクエア",
      trine:"トライン",
      opposition:"オポジション",
    };

    const lines = top.map((r, i) =>
      `${i+1}) ${BODY_JA[r.transit_body]} × ${POINT_JA[r.natal_point]}｜${ASPECT_JA[r.aspect]}（orb ${r.orb_deg}°）`
    );

    const dateLabel = dateLocal.replaceAll("-", ".");

    const text =
`🌌 ソラのこえ。
［${dateLabel}｜今日の星の配置］

今日、強く触れている配置：

${lines.join("\n")}

解釈は、あなたのもの。`;

    return res.json({
      ok: true,
      date_local: dateLocal,
      line_message: text,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}



// raw body を取れない環境があるので、まずは JSON stringify で一致させる簡易版。
// （後で本式にする。まず動かす）
function verifyLineSignature(req) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) return { ok: false, reason: "LINE_CHANNEL_SECRET is missing" };

  const signature = req.header("x-line-signature") || "";
  if (!signature) return { ok: false, reason: "x-line-signature missing" };

  // LINEは生のボディ文字列でHMACする。ここは“簡易”なので、まず通らない可能性あり。
  // 通らなかったら rawBody 取れる構成に切り替える（下に書く）。
  const bodyStr = JSON.stringify(req.body ?? {});
  const hmac = crypto.createHmac("sha256", secret).update(bodyStr).digest("base64");

  return { ok: hmac === signature, reason: hmac === signature ? "ok" : "signature mismatch" };
}