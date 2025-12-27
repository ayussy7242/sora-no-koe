/**
 * sora-no-koe (Cloud Run / Functions Framework)
 * - LINE Webhook (raw-body signature verify)
 * - Firestore multi DB (databaseId: sora-no-koe-db)
 * - Story build (minimal resonance top3)
 * - Daily LINE message builder
 * - PushMe (owner test)
 * - Jobs worker (enqueue natal calc)
 *
 * Env required:
 *   LINE_CHANNEL_SECRET
 *   LINE_CHANNEL_ACCESS_TOKEN
 *   OWNER_LINE_USER_ID (optional for /push)
 *   GOOGLE_MAPS_API_KEY (optional if geocoding)
 *   FIRESTORE_DATABASE_ID (optional, default sora-no-koe-db)
 *
 * Runtime:
 *   Node >= 18 recommended (fetch available)
 */

const functions = require("@google-cloud/functions-framework");
const admin = require("firebase-admin");
const crypto = require("crypto");
const express = require("express");
const bodyParser = require("body-parser");

// --------------------
// bootstrap
// --------------------
if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
db.settings({ databaseId: process.env.FIRESTORE_DATABASE_ID || "sora-no-koe-db" });

// --------------------
// constants / config
// --------------------
const PROJECT = "sora-no-koe";
const SCHEMA_VERSION = "1.0.3";
const DEFAULT_TZ = "Asia/Tokyo";

const ASPECTS = [
  { type: "conjunction", deg: 0 },
  { type: "sextile", deg: 60 },
  { type: "square", deg: 90 },
  { type: "trine", deg: 120 },
  { type: "opposition", deg: 180 },
];

// NOTE: いまは “近似 speed” 計算（既存挙動維持）
// 将来: SwissEphemerisなど本計算に差し替え想定
const TRANSIT_SPEED = {
  Sun: 0.9856,
  Moon: 13.176,
  Mercury: 1.2,
  Venus: 1.18,
  Mars: 0.524,
};

const BODY_JA = { Sun: "太陽", Moon: "月", Mercury: "水星", Venus: "金星", Mars: "火星" };
const POINT_JA = { Sun: "太陽", Moon: "月", ASC: "ASC" };
const ASPECT_JA = {
  conjunction: "コンジャンクション",
  sextile: "セクスタイル",
  square: "スクエア",
  trine: "トライン",
  opposition: "オポジション",
};

// --------------------
// helpers
// --------------------
function nowIso() {
  return new Date().toISOString();
}

function getRequestId(req) {
  return (
    String(req.header("x-request-id") || req.header("x-cloud-trace-context") || "")
      .slice(0, 100) || null
  );
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

function calcTransitPlanetLonApprox(dateLocal, speedPerDay, precisionDeg = 0.01) {
  const base = new Date("2025-01-01T00:00:00Z");
  const target = new Date(`${dateLocal}T00:00:00+09:00`);
  const days = Math.floor((target - base) / (24 * 60 * 60 * 1000));
  return norm360(toFixedPrecision((days * speedPerDay) % 360, precisionDeg));
}

function metaBase({ dateLocal, timezone, requestId, engine = {} }) {
  return {
    schema_version: SCHEMA_VERSION,
    project: PROJECT,
    timezone: timezone || DEFAULT_TZ,
    date_local: dateLocal,
    generated_at_utc: nowIso(),
    engine: {
      ...engine,
      request_id: requestId,
    },
  };
}

function ok(res, payload) {
  return res.status(200).json({ ok: true, ...payload });
}

function bad(res, code, message, extra = {}) {
  return res.status(code).json({ ok: false, error: message, ...extra });
}

// --------------------
// LINE signature verify (raw body)
// --------------------
function verifyLineSignatureRaw(rawBodyBuf, signature, secret) {
  if (!secret) return { ok: false, reason: "LINE_CHANNEL_SECRET is missing" };
  if (!signature) return { ok: false, reason: "x-line-signature missing" };
  const hmac = crypto.createHmac("sha256", secret).update(rawBodyBuf).digest("base64");
  return { ok: hmac === signature, reason: hmac === signature ? "ok" : "signature mismatch" };
}

// --------------------
// Firestore: line_users upsert / normalize
// --------------------
function makeAppUserId(prefix = "u") {
  return `${prefix}_${crypto.randomBytes(12).toString("base64url")}`;
}

/**
 * status rule:
 * - core profile 揃う + consent.profile===true => ready
 * - core profile 揃う だけ => pending_consent
 * - それ以外 => pending_profile/pending_xxx のまま
 */
function computeStatusFromProfile({ profile, currentStatus = "pending_profile", consentProfile = false }) {
  const hasCore =
    !!profile?.birth_date &&
    !!profile?.birth_time &&
    !!profile?.birth_place &&
    Number.isFinite(profile?.lat) &&
    Number.isFinite(profile?.lon);

  if (hasCore && consentProfile === true) return "ready";
  if (hasCore) return "pending_consent";
  return currentStatus || "pending_profile";
}

async function ensureUserGraphFromLine({ lineUserId, profilePatch = {}, force = {} }) {
  const lineRef = db.collection("line_users").doc(lineUserId);
  const now = admin.firestore.FieldValue.serverTimestamp();

  return await db.runTransaction(async (tx) => {
    const lineSnap = await tx.get(lineRef);
    const lineData = lineSnap.exists ? lineSnap.data() : null;

    const appUserId = force.app_user_id || lineData?.app_user_id || makeAppUserId("u");

    const existingConsent = lineData?.consent || { profile: false, saved_at: null };
    const mergedProfile = { ...(lineData?.profile || {}), ...profilePatch };

    const status = computeStatusFromProfile({
      profile: mergedProfile,
      currentStatus: lineData?.status || "pending_profile",
      consentProfile: !!existingConsent?.profile,
    });

    if (!lineSnap.exists) {
      tx.set(lineRef, {
        line_user_id: lineUserId,
        app_user_id: appUserId,
        status,
        consent: existingConsent,
        profile: mergedProfile,
        created_at: now,
        updated_at: now,
      });
    } else {
      tx.set(
        lineRef,
        {
          app_user_id: appUserId,
          status,
          profile: mergedProfile,
          updated_at: now,
        },
        { merge: true }
      );
    }

    const userRef = db.collection("users").doc(appUserId);
    const userSnap = await tx.get(userRef);

    if (!userSnap.exists) {
      tx.set(userRef, {
        display_name: force.display_name || "unknown",
        timezone: mergedProfile.timezone || DEFAULT_TZ,
        created_at: now,
        updated_at: now,
      });
    } else {
      tx.set(
        userRef,
        {
          timezone: mergedProfile.timezone || DEFAULT_TZ,
          updated_at: now,
        },
        { merge: true }
      );
    }

    return { lineUserId, appUserId, status };
  });
}

// --------------------
// Jobs (B: 拡張性◎：ジョブキュー)
// --------------------
async function enqueueNatalCalc({ appUserId, lineUserId, reason = "consent_granted" }) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const ref = db.collection("jobs_natal_calc").doc();
  await ref.set({
    type: "natal_calc",
    status: "queued",
    app_user_id: appUserId,
    line_user_id: lineUserId,
    reason,
    attempts: 0,
    last_error: null,
    created_at: now,
    updated_at: now,
  });
  return { job_id: ref.id };
}

async function handleJobsWorker(req, res) {
  // 1回に1件（安全運用）
  const q = await db
    .collection("jobs_natal_calc")
    .where("status", "==", "queued")
    .orderBy("created_at", "asc")
    .limit(1)
    .get();

  if (q.empty) return ok(res, { ran: true, processed: 0 });

  const doc = q.docs[0];
  const job = doc.data();

  await doc.ref.set(
    {
      status: "running",
      attempts: (job.attempts || 0) + 1,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  try {
    // TODO: ここに本計算（swisseph等）を接続
    // 今は「natal_cache 作成/更新ダミー」で回路だけ通す
    await db.collection("natal_cache").doc(job.app_user_id).set(
      {
        computed_at: admin.firestore.FieldValue.serverTimestamp(),
        engine: { ephemeris_source: "swisseph" },
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // readyに上げたいなら line_users のstatus再計算して上げる
    const lineRef = db.collection("line_users").doc(job.line_user_id);
    const lineSnap = await lineRef.get();
    if (lineSnap.exists) {
      const d = lineSnap.data() || {};
      const status = computeStatusFromProfile({
        profile: d.profile || {},
        currentStatus: d.status || "pending_profile",
        consentProfile: !!d?.consent?.profile,
      });
      await lineRef.set(
        { status, updated_at: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
    }

    await doc.ref.set(
      {
        status: "done",
        last_error: null,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return ok(res, {
      ran: true,
      processed: 1,
      job_id: doc.id,
      app_user_id: job.app_user_id,
    });
  } catch (e) {
    await doc.ref.set(
      {
        status: "failed",
        last_error: String(e),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return bad(res, 500, "job failed", { job_id: doc.id, error: String(e) });
  }
}

// --------------------
// Transit / resonance core
// --------------------
function buildTransitPlanetsApprox(dateLocal, precisionDeg = 0.01) {
  return Object.entries(TRANSIT_SPEED).map(([body, speed]) => ({
    body,
    lon_deg: calcTransitPlanetLonApprox(dateLocal, speed, precisionDeg),
  }));
}

function extractNatalLonFromCache(cache) {
  const natalLon = {
    Sun: asNumber(cache?.natal_positions?.sun?.lon_deg),
    Moon: asNumber(cache?.natal_positions?.moon?.lon_deg),
    ASC: asNumber(cache?.natal_positions?.asc?.lon_deg),
  };
  for (const k of Object.keys(natalLon)) {
    if (natalLon[k] === null) throw new Error(`natal_positions.${k} lon_deg invalid`);
  }
  return natalLon;
}

function calcResonanceTop({ transitPlanets, natalLon, orbMaxDeg = 15, precisionDeg = 0.01, topN = 3 }) {
  const hits = [];
  for (const t of transitPlanets) {
    for (const natalPoint of ["Sun", "Moon", "ASC"]) {
      const dist = absAngularDistance(t.lon_deg, natalLon[natalPoint]);
      const best = getAspectTypeAndOrb(dist, orbMaxDeg);
      if (best) {
        hits.push({
          transit_body: t.body,
          natal_point: natalPoint,
          aspect: best.aspect,
          orb_deg: toFixedPrecision(best.orb_deg, precisionDeg),
        });
      }
    }
  }
  hits.sort((a, b) => a.orb_deg - b.orb_deg);
  return hits.slice(0, topN);
}

function formatTopLines(top) {
  return top.map((r, i) => {
    const b = BODY_JA[r.transit_body] || r.transit_body;
    const p = POINT_JA[r.natal_point] || r.natal_point;
    const a = ASPECT_JA[r.aspect] || r.aspect;
    return `${i + 1}) ${b} × ${p}｜${a}（orb ${r.orb_deg}°）`;
  });
}

function buildXPost({ dateLocal, top }) {
  const dateLabel = String(dateLocal).replaceAll("-", ".");
  const lines = formatTopLines(top).join("\n");

  return `🌌 ソラのこえ。
［${dateLabel}｜今日の星の配置］

今日、強く触れている配置：

${lines}

解釈は、あなたのもの。`;
}

// --------------------
// optional: geocoding
// --------------------
async function geocodePlace(place, apiKey) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    place
  )}&key=${apiKey}&language=ja`;
  const res = await fetch(url);
  const json = await res.json();

  if (json.status !== "OK" || !json.results?.length) {
    return { ok: false, status: json.status, candidates: json.results?.slice(0, 3) ?? [] };
  }
  const top = json.results[0];
  return {
    ok: true,
    lat: top.geometry.location.lat,
    lon: top.geometry.location.lng,
    formatted: top.formatted_address,
    place_id: top.place_id,
  };
}

// --------------------
// LINE reply helper
// --------------------
async function lineReply(replyToken, text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN missing");

  const payload = { replyToken, messages: [{ type: "text", text }] };

  const r = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const body = await r.text();
    throw new Error(`LINE reply failed: ${r.status} ${body}`);
  }
}

// --------------------
// Registration parsing
// --------------------
function parseBirthDate(text) {
  const s = String(text || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
function parseBirthTime(text) {
  const s = String(text || "").trim();
  if (s === "不明" || s.toLowerCase() === "unknown") return "unknown";
  return /^\d{2}:\d{2}$/.test(s) ? s : null;
}
function parseYesNo(text) {
  const s = String(text || "").trim();
  if (["はい", "yes", "YES", "ok", "OK", "了解"].includes(s)) return true;
  if (["いいえ", "no", "NO", "やめる", "拒否"].includes(s)) return false;
  return null;
}

// --------------------
// Registration flow (LINE chat)
// --------------------
async function handleRegistrationFlow({ lineUserId, appUserId, replyToken, userText }) {
  const ref = db.collection("line_users").doc(lineUserId);

  // 取りこぼし防止（基本は ensure が先に走ってる想定）
  const snap0 = await ref.get();
  if (!snap0.exists) {
    const ensured = await ensureUserGraphFromLine({ lineUserId, profilePatch: { timezone: DEFAULT_TZ } });
    appUserId = ensured.appUserId; // eslint-disable-line no-param-reassign
  }

  const fresh = await ref.get();
  const data = fresh.data() || {};
  let status = data.status || "pending_profile";

  // 初期誘導
  if (!data.profile?.birth_date && status === "pending_profile") {
    await ref.set({ status: "pending_birth_date" }, { merge: true });
    status = "pending_birth_date";
  }

  // 状態別
  if (status === "pending_birth_date") {
    const v = parseBirthDate(userText);
    if (!v) {
      await lineReply(
        replyToken,
        "🌌 ソラのこえ。\n生年月日を YYYY-MM-DD で受け取ります。\n例：1990-07-24"
      );
      return;
    }
    await ref.set(
      {
        profile: { ...(data.profile || {}), birth_date: v },
        status: "pending_birth_time",
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await lineReply(replyToken, "受け取りました。\n次に、出生時刻です（例：12:18）\n不明なら「不明」でOK。");
    return;
  }

  if (status === "pending_birth_time") {
    const v = parseBirthTime(userText);
    if (!v) {
      await lineReply(
        replyToken,
        "出生時刻は HH:MM で受け取ります。\n例：12:18\nわからない場合は「不明」と返してください。"
      );
      return;
    }
    await ref.set(
      {
        profile: { ...(data.profile || {}), birth_time: v },
        status: "pending_birth_place",
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await lineReply(replyToken, "ありがとう。\n次に、出生地（市区町村まで）を教えてください。\n例：北海道帯広市");
    return;
  }

  if (status === "pending_birth_place") {
    const place = String(userText || "").trim();
    if (!place) {
      await lineReply(replyToken, "出生地（市区町村まで）を文字で受け取ります。\n例：北海道帯広市");
      return;
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    let lat = null,
      lon = null;

    if (apiKey) {
      const g = await geocodePlace(place, apiKey);
      if (!g.ok) {
        await lineReply(
          replyToken,
          "出生地の候補が特定できませんでした。\nもう少し詳しく（例：北海道 帯広市）で送ってください。"
        );
        return;
      }
      lat = g.lat;
      lon = g.lon;
    }

    await ref.set(
      {
        profile: {
          ...(data.profile || {}),
          birth_place: place,
          ...(lat != null && lon != null ? { lat, lon } : {}),
          timezone: data.profile?.timezone || DEFAULT_TZ,
        },
        status: "pending_consent",
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await lineReply(
      replyToken,
      "受け取りました。\nこの情報を保存して、星の計算に使っても大丈夫ですか？\n「はい / いいえ」で返してください。"
    );
    return;
  }

  if (status === "pending_consent") {
    const yn = parseYesNo(userText);
    if (yn === null) {
      await lineReply(replyToken, "「はい / いいえ」で返してください。");
      return;
    }

    if (yn === false) {
      await ref.set(
        {
          consent: { profile: false, saved_at: null },
          status: "pending_profile",
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      await lineReply(replyToken, "了解です。\n保存はしません。\nまたいつでも再開できます。");
      return;
    }

    // yn === true
    await ref.set(
      {
        consent: { profile: true, saved_at: admin.firestore.FieldValue.serverTimestamp() },
        status: "ready", // とりあえずready（workerがnatal_cache入れてく）
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // ★ B案: natal_cache 計算ジョブを積む（拡張性◎）
    // app_user_id は line_users にあるはずなので念のため拾う
    const latest = await ref.get();
    const latestData = latest.data() || {};
    const ensuredAppUserId = latestData.app_user_id || appUserId;
    if (ensuredAppUserId) {
      await enqueueNatalCalc({ appUserId: ensuredAppUserId, lineUserId });
    }

    await lineReply(replyToken, "保存しました。\n星の配置は数値として置きます。\n解釈は、あなたのもの。");
    return;
  }

  // ready / other
  await lineReply(replyToken, "🌌 ソラのこえ。\n受け取りは完了しています。");
}

// --------------------
// HTTP handlers
// --------------------
async function handleTransit(req, res) {
  const requestId = getRequestId(req);
  const dateLocal = String(req.query.date_local || jstTodayYYYYMMDD()).trim();
  if (!isYYYYMMDD(dateLocal)) return bad(res, 400, "date_local must be YYYY-MM-DD");

  const precisionDeg = 0.01;
  const planets = buildTransitPlanetsApprox(dateLocal, precisionDeg);

  return ok(res, {
    meta: metaBase({
      dateLocal,
      timezone: DEFAULT_TZ,
      requestId,
      engine: { ephemeris_source: "approx", precision: { deg: precisionDeg } },
    }),
    transit: { planets },
  });
}

async function handleBuildStory(req, res) {
  const requestId = getRequestId(req);
  const userId = String(req.query.user_id || "").trim();
  const dateLocal = String(req.query.date_local || jstTodayYYYYMMDD()).trim();

  if (!userId) return bad(res, 400, "user_id is required");
  if (!isYYYYMMDD(dateLocal)) return bad(res, 400, "date_local must be YYYY-MM-DD");

  const precisionDeg = 0.01;
  const orbMaxDeg = 15;

  const userSnap = await db.collection("users").doc(userId).get();
  if (!userSnap.exists) return bad(res, 404, "users doc not found");
  const user = userSnap.data();

  const cacheSnap = await db.collection("natal_cache").doc(userId).get();
  if (!cacheSnap.exists) return bad(res, 404, "natal_cache doc not found");
  const cache = cacheSnap.data();

  const natalLon = extractNatalLonFromCache(cache);
  const transitPlanets = buildTransitPlanetsApprox(dateLocal, precisionDeg);
  const topResonances = calcResonanceTop({
    transitPlanets,
    natalLon,
    orbMaxDeg,
    precisionDeg,
    topN: 3,
  });

  const story = {
    meta: metaBase({
      dateLocal,
      timezone: user.timezone || DEFAULT_TZ,
      requestId,
      engine: { ephemeris_source: "approx", precision: { deg: precisionDeg } },
    }),
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
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      story,
    },
    { merge: true }
  );

  return ok(res, { saved: true, doc_id: storyDocId, story });
}

async function handleBuildXPost(req, res) {
  const userId = String(req.query.user_id || "").trim();
  const dateLocal = String(req.query.date_local || jstTodayYYYYMMDD()).trim();
  if (!userId) return bad(res, 400, "user_id is required");
  if (!isYYYYMMDD(dateLocal)) return bad(res, 400, "date_local must be YYYY-MM-DD");

  const storyDocId = `${userId}-${dateLocal}`;
  const snap = await db.collection("stories").doc(storyDocId).get();
  if (!snap.exists) {
    return bad(res, 404, "story not found. Call /stories/build first for this date.", {
      hint: { url: `/stories/build?user_id=${encodeURIComponent(userId)}&date_local=${encodeURIComponent(dateLocal)}` },
    });
  }

  const story = snap.data()?.story;
  const top = (story?.resonance?.top_resonances || []).slice(0, 3);
  if (!top.length) return bad(res, 400, "no resonance candidates found");

  const xPost = buildXPost({ dateLocal, top });
  return ok(res, { date_local: dateLocal, x_post: xPost, used: { top_resonances: top } });
}

async function handleBuildLineDaily(req, res) {
  const userId = String(req.query.user_id || "").trim();
  const dateLocal = String(req.query.date_local || jstTodayYYYYMMDD()).trim();
  if (!userId) return bad(res, 400, "user_id is required");
  if (!isYYYYMMDD(dateLocal)) return bad(res, 400, "date_local must be YYYY-MM-DD");

  const storyDocId = `${userId}-${dateLocal}`;
  const snap = await db.collection("stories").doc(storyDocId).get();
  if (!snap.exists) {
    return bad(res, 404, "story not found", {
      hint: `/stories/build?user_id=${encodeURIComponent(userId)}&date_local=${encodeURIComponent(dateLocal)}`,
    });
  }

  const story = snap.data()?.story;
  const top = (story?.resonance?.top_resonances || []).slice(0, 3);
  if (!top.length) return bad(res, 400, "no resonance candidates found");

  const text = buildXPost({ dateLocal, top });
  return ok(res, { date_local: dateLocal, line_message: text });
}

async function handlePushMe(req, res) {
  const text = String(req.query.text || "🌌 ソラのこえ。").trim();

  const userId = process.env.OWNER_LINE_USER_ID;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!userId || !token) return bad(res, 500, "LINE env vars missing");

  const payload = {
    to: userId,
    messages: [{ type: "text", text }],
  };

  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });

  const body = await r.text();
  return ok(res, { pushed: r.ok, status: r.status, response: body });
}

// --------------------
// LINE webhook handler (raw body)
// --------------------
async function handleLineWebhook(req, res) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  const signature = req.header("x-line-signature") || "";
  const raw = req.body; // Buffer

  const verify = verifyLineSignatureRaw(raw, signature, secret);
  if (!verify.ok) {
    console.log("LINE signature verify failed:", verify.reason);
    return bad(res, 401, verify.reason);
  }

  let json;
  try {
    json = JSON.parse(raw.toString("utf8") || "{}");
  } catch {
    return bad(res, 400, "invalid JSON body");
  }

  const ev = json?.events?.[0];
  const lineUserId = ev?.source?.userId;
  if (!lineUserId) return ok(res, { received: true });

  // ① line_users + users を最低限保証
  const { appUserId } = await ensureUserGraphFromLine({
    lineUserId,
    profilePatch: { timezone: DEFAULT_TZ },
  });

  // ② テキストメッセージなら登録フローへ
  const replyToken = ev?.replyToken;
  const msgText = ev?.message?.type === "text" ? ev.message.text : null;

  if (replyToken && msgText != null) {
    await handleRegistrationFlow({
      lineUserId,
      appUserId,
      replyToken,
      userText: msgText,
    });
  }

  return ok(res, { received: true, line_user_id: lineUserId });
}

// --------------------
// Express app / router
// --------------------
const app = express();

app.use((req, res, next) => {
  if (req.path !== "/health") console.log(`[${nowIso()}] ${req.method} ${req.path}`);
  next();
});

app.get("/", (req, res) =>
  ok(res, {
    service: PROJECT,
    routes: ["/health", "/transit", "/stories/build", "/posts/x", "/line/daily", "/line/webhook", "/push", "/jobs/worker"],
  })
);

app.get("/health", (req, res) => ok(res, { service: PROJECT, ok: true }));

// GET endpoints
app.get("/transit", (req, res) => handleTransit(req, res));
app.get("/stories/build", (req, res) => handleBuildStory(req, res));
app.get("/posts/x", (req, res) => handleBuildXPost(req, res));
app.get("/line/daily", (req, res) => handleBuildLineDaily(req, res));
app.get("/push", (req, res) => handlePushMe(req, res));
app.get("/debug/resetRegistration", (req, res) => {
  handleDebugResetRegistration(req, res).catch((err) => bad(res, 500, String(err)));
});

// Jobs worker (json body)
app.post("/jobs/worker", bodyParser.json(), (req, res) => {
  handleJobsWorker(req, res).catch((err) => {
    console.error(err);
    return bad(res, 500, String(err));
  });
});

// LINE webhook (raw body only!)
app.post("/line/webhook", bodyParser.raw({ type: "*/*" }), (req, res) => {
  handleLineWebhook(req, res).catch((err) => {
    console.error(err);
    return bad(res, 500, String(err));
  });
});

// fallback
app.use((req, res) => bad(res, 404, "not found", { path: req.path }));

// Functions Framework entry
functions.http("app", app);


// ====================
// DEBUG: reset registration
// ====================
// Env:
//   DEBUG_TOKEN=... (必須。適当な長い文字列にして Cloud Run の env に入れる)
//
// Usage:
//   GET /debug/resetRegistration?line_user_id=Uxxxx&token=DEBUG_TOKEN
//   (optional) &keep_app_user_id=true|false
//
async function handleDebugResetRegistration(req, res) {
  try {
    const token = String(req.query.token || "");
    const need = process.env.DEBUG_TOKEN;

    if (!need) return bad(res, 500, "DEBUG_TOKEN is missing in env");
    if (!token || token !== need) return bad(res, 403, "forbidden");

    const lineUserId = String(req.query.line_user_id || "").trim();
    if (!lineUserId) return bad(res, 400, "line_user_id is required");

    const keepAppUserId = String(req.query.keep_app_user_id || "true").toLowerCase() !== "false";

    const ref = db.collection("line_users").doc(lineUserId);
    const snap = await ref.get();
    if (!snap.exists) return bad(res, 404, "line_users doc not found");

    const data = snap.data() || {};
    const now = admin.firestore.FieldValue.serverTimestamp();

    const patch = {
      status: "pending_birth_date",
      consent: {
        profile: false,
        saved_at: null,
      },
      profile: {
        timezone: data?.profile?.timezone || DEFAULT_TZ,
      },
      updated_at: now,
    };

    // app_user_id を消すと次回 webhook で新規発行される可能性がある
    // → テスト時は keep 推奨
    if (!keepAppUserId) {
      patch.app_user_id = admin.firestore.FieldValue.delete();
    }

    await ref.set(patch, { merge: true });

    return ok(res, {
      reset: true,
      line_user_id: lineUserId,
      keep_app_user_id: keepAppUserId,
      next_status: "pending_birth_date",
    });
  } catch (err) {
    console.error(err);
    return bad(res, 500, String(err));
  }
}
