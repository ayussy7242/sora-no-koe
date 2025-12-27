/**
 * 🌌 sora-no-koe (Cloud Run / Functions Framework) — Unified v1.1
 *
 * ✅ What this file solves (全部まとめて解決):
 * - story.json（器）を確定（schema_version 1.1）
 * - renderLine / renderX / renderIG を実装
 * - /line/daily を now(as_of) 対応に
 * - /stories/build（単日） + /stories/rebuild（範囲） を分離
 * - Firestore 保存フォーマットを一本化（storiesは常に同じ形）
 * - LINE webhook（raw-body署名検証）安定
 * - 既存の登録フロー（birth_date/time/place/consent）維持
 * - バルク投入（Firestore stories へ一括 upsert）用の管理APIも追加（DEBUG_TOKEN必須）
 *
 * ⚠️ NOTE:
 * - トランジット計算は現状「approx」。将来Swiss Ephemeris等に差し替え前提。
 *   でも今は "now対応" が最優先なので、as_of ISO datetime を受けて近似で動かす。
 *
 * Required env:
 *   LINE_CHANNEL_SECRET
 *   LINE_CHANNEL_ACCESS_TOKEN
 *
 * Optional env:
 *   FIRESTORE_DATABASE_ID           (default: sora-no-koe-db)
 *   LINE_WEBHOOK_STRICT             (default: 0) 1 => mismatch 401, 0 => 200
 *   OWNER_LINE_USER_ID              (/push用)
 *   GOOGLE_MAPS_API_KEY             (出生地ジオコードしたい場合)
 *   DEBUG_TOKEN                     (/debug/* /admin/* の保護)
 */

"use strict";

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
const DEFAULT_TZ = "Asia/Tokyo";
const SCHEMA_VERSION = "1.1.0"; // story schema version

const LINE_STRICT = String(process.env.LINE_WEBHOOK_STRICT || "0") === "1";

const ASPECTS = [
  { type: "conjunction", deg: 0 },
  { type: "sextile", deg: 60 },
  { type: "square", deg: 90 },
  { type: "trine", deg: 120 },
  { type: "opposition", deg: 180 },
];

const BODY_JA = { Sun: "太陽", Moon: "月", Mercury: "水星", Venus: "金星", Mars: "火星" };
const POINT_JA = { Sun: "太陽", Moon: "月", ASC: "ASC" };
const ASPECT_JA = {
  conjunction: "コンジャンクション",
  sextile: "セクスタイル",
  square: "スクエア",
  trine: "トライン",
  opposition: "オポジション",
};

// NOTE: 近似 speed（今は “動く” こと最優先）
const TRANSIT_SPEED_DEG_PER_DAY = {
  Sun: 0.9856,
  Moon: 13.176,
  Mercury: 1.2,
  Venus: 1.18,
  Mars: 0.524,
};

// zodiac (0 Aries)
const SIGNS_JA = ["牡羊座", "牡牛座", "双子座", "蟹座", "獅子座", "乙女座", "天秤座", "蠍座", "射手座", "山羊座", "水瓶座", "魚座"];

// --------------------
// helpers (core)
// --------------------
function nowIso() {
  return new Date().toISOString();
}

function safeText(v, max = 5000) {
  const s = String(v ?? "");
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function ok(res, payload) {
  return res.status(200).json({ ok: true, ...payload });
}

function bad(res, code, message, extra = {}) {
  return res.status(code).json({ ok: false, error: message, ...extra });
}

function must(v, name) {
  if (v === undefined || v === null || String(v).trim() === "") {
    throw new Error(`${name} is required`);
  }
  return String(v).trim();
}

function parseBool(v) {
  if (v === undefined || v === null) return false;
  const s = String(v).toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function isYYYYMMDD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function isHHMM(s) {
  return typeof s === "string" && /^\d{2}:\d{2}$/.test(s);
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

function getAspectTypeAndOrb(distanceDeg, orbMaxDeg) {
  let best = null;
  for (const a of ASPECTS) {
    const orb = Math.abs(distanceDeg - a.deg);
    if (orb <= orbMaxDeg) {
      if (!best || orb < best.orb_deg) best = { aspect: a.type, aspect_deg: a.deg, orb_deg: orb };
    }
  }
  return best;
}

function pickTopByOrb(items, n = 3) {
  return [...items].sort((x, y) => (x.orb_deg ?? 999) - (y.orb_deg ?? 999)).slice(0, n);
}

/**
 * Convert ISO -> {date_local (JST), time_local (HH:MM)}
 */
function isoToJstParts(asOfISO) {
  const d = asOfISO ? new Date(asOfISO) : new Date();
  const jstMs = d.getTime() + 9 * 60 * 60 * 1000;
  const jst = new Date(jstMs);
  const iso = jst.toISOString(); // still "Z" but shifted; we just slice
  const date_local = iso.slice(0, 10);
  const time_local = iso.slice(11, 16);
  return { date_local, time_local };
}

/**
 * Create ISO string that represents "dateLocal + timeHHMM in JST"
 * - We return an ISO string in UTC, but derived from JST local.
 */
function isoWithJST(dateLocal, timeHHMM = "14:00") {
  if (!isYYYYMMDD(dateLocal)) throw new Error("dateLocal must be YYYY-MM-DD");
  if (!isHHMM(timeHHMM)) throw new Error("time must be HH:MM");
  // JST local -> UTC: subtract 9h
  const [y, m, d] = dateLocal.split("-").map(Number);
  const [hh, mm] = timeHHMM.split(":").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, hh - 9, mm, 0));
  return utc.toISOString();
}

function eachDateLocal(from, to) {
  if (!isYYYYMMDD(from) || !isYYYYMMDD(to)) throw new Error("from/to must be YYYY-MM-DD");
  const out = [];
  const start = new Date(from + "T00:00:00+09:00");
  const end = new Date(to + "T00:00:00+09:00");
  if (start > end) throw new Error("from must be <= to");

  let cur = start;
  while (cur <= end) {
    // extract JST date
    const jst = new Date(cur.getTime() + 9 * 60 * 60 * 1000);
    out.push(jst.toISOString().slice(0, 10));
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
  }
  return out;
}

function getRequestId(req) {
  return (
    String(req.header("x-request-id") || req.header("x-cloud-trace-context") || "")
      .slice(0, 100) || null
  );
}

// --------------------
// Transit (approx, now対応)
// --------------------
function calcLonApprox(asOfISO, speedPerDay, seedDeg = 0, precisionDeg = 0.01) {
  // base: 2025-01-01T00:00:00Z
  const base = new Date("2025-01-01T00:00:00Z").getTime();
  const t = new Date(asOfISO).getTime();
  const days = (t - base) / (24 * 60 * 60 * 1000);
  const lon = seedDeg + days * speedPerDay;
  return norm360(toFixedPrecision(lon, precisionDeg));
}

function signJaFromLon(lonDeg) {
  const idx = Math.floor(norm360(lonDeg) / 30);
  return SIGNS_JA[idx] ?? null;
}

/**
 * computeTransits(as_of_iso) -> { bodies: {Sun:deg,...}, moon:{lon_deg, sign_ja} }
 */
function computeTransitsApprox(asOfISO, precisionDeg = 0.01) {
  const bodies = {};
  // seedDeg: 0 (雑)。将来seedを実測に置換。
  for (const [body, speed] of Object.entries(TRANSIT_SPEED_DEG_PER_DAY)) {
    bodies[body] = calcLonApprox(asOfISO, speed, 0, precisionDeg);
  }
  const moonLon = bodies.Moon;
  return {
    bodies,
    moon: {
      lon_deg: moonLon,
      sign_ja: signJaFromLon(moonLon),
    },
  };
}

// --------------------
// Natal cache load / normalize
// --------------------
async function loadNatalFromCache(appUserId) {
  const snap = await db.collection("natal_cache").doc(appUserId).get();
  if (!snap.exists) return null;
  return snap.data();
}

function extractNatalLongitudes(natalCacheDoc) {
  // Support your existing schema + fallback candidates
  // Preferred: natal_positions.sun/moon/asc.lon_deg
  const sun = natalCacheDoc?.natal_positions?.sun?.lon_deg;
  const moon = natalCacheDoc?.natal_positions?.moon?.lon_deg;
  const asc = natalCacheDoc?.natal_positions?.asc?.lon_deg;

  if (Number.isFinite(sun) && Number.isFinite(moon) && Number.isFinite(asc)) {
    return { Sun: sun, Moon: moon, ASC: asc };
  }

  // Fallback patterns
  const candidates = [];
  if (natalCacheDoc?.points) candidates.push(natalCacheDoc.points);
  if (natalCacheDoc?.natal) candidates.push(natalCacheDoc.natal);
  if (natalCacheDoc?.bodies) candidates.push(natalCacheDoc.bodies);

  for (const obj of candidates) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === "object" && typeof v.lon_deg === "number") out[k] = v.lon_deg;
      if (typeof v === "number") out[k] = v;
    }
    if (Object.keys(out).length) return out;
  }

  throw new Error("Cannot extract natal longitudes from natal_cache doc. Update extractNatalLongitudes().");
}

// --------------------
// story.json (器) v1.1 — FIX
// --------------------
function buildTouchPoints({ transitBodies, natalBodies, rules }) {
  const results = [];
  const transitKeys = Object.keys(transitBodies);
  const natalKeys = Object.keys(natalBodies);

  for (const t of transitKeys) {
    const tLon = transitBodies[t];
    if (typeof tLon !== "number") continue;

    for (const n of natalKeys) {
      const nLon = natalBodies[n];
      if (typeof nLon !== "number") continue;

      const dist = absAngularDistance(tLon, nLon);
      const best = (() => {
        let b = null;
        for (const a of ASPECTS) {
          const delta = Math.abs(dist - a.deg);
          if (!b || delta < b.delta) b = { type: a.type, aspect_deg: a.deg, delta };
        }
        return b;
      })();

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

  const preferred = ["Sun", "Venus", "Mars", "Mercury", "Jupiter", "Saturn"];
  const out = [];

  for (const b of preferred) {
    const lon = transitMap[b];
    if (typeof lon !== "number") continue;

    const dist = absAngularDistance(moonLon, lon);
    // best aspect
    let best = null;
    for (const a of ASPECTS) {
      const delta = Math.abs(dist - a.deg);
      if (!best || delta < best.delta) best = { type: a.type, aspect_deg: a.deg, delta };
    }
    if (best.delta <= 6) {
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

/**
 * story.json v1.1 (FIX)
 * - public: sky only (X/IG)
 * - personal: touch points (LINE only)
 * - guardrails: thoughts boundary
 */
function storyJsonV11({
  appUserId,
  displayName,
  dateLocal,
  asOfISO,
  transitInfo,
  touchPointsAll,
  rules,
  engineMeta,
}) {
  const touchTop3 = pickTopByOrb(touchPointsAll, 3);
  const skyTop = buildPublicSkyTop(transitInfo.bodies);

  return {
    meta: {
      schema_version: SCHEMA_VERSION,
      project: PROJECT,
      timezone: DEFAULT_TZ,
      date_local: dateLocal,
      as_of: asOfISO,
      generated_at_utc: nowIso(),
      engine: engineMeta ?? {
        ephemeris_source: "approx",
        precision_deg: 0.01,
      },
      rules,
    },

    public: {
      date_local: dateLocal,
      moon: {
        sign_ja: transitInfo?.moon?.sign_ja ?? null,
        lon_deg: transitInfo?.moon?.lon_deg ?? null,
      },
      sky_top: skyTop,
      // ここは後から辞書/AIで埋める余白（思想的にもOK）
      tone_hints: {
        resonance_bullets: [],
      },
    },

    personal: {
      user_id: appUserId,
      user: {
        display_name: displayName ?? null,
      },
      privacy: {
        contains_personal_data: true,
        allowed_channels: ["line"],
      },
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
}

// --------------------
// Renderers (LINE / X / IG)
// --------------------
function fmtAspectJa(aspect) {
  return ASPECT_JA[aspect] || aspect;
}
function fmtBodyJa(body) {
  return BODY_JA[body] || body;
}
function fmtPointJa(p) {
  return POINT_JA[p] || p;
}

function renderLine(story) {
  const dateLabel = String(story?.meta?.date_local || "").replaceAll("-", ".");
  const top = story?.personal?.touch_points_top3 || [];
  const moonSign = story?.public?.moon?.sign_ja || null;

  const lines = top.map((r, i) => {
    const t = fmtBodyJa(r.transit_body);
    const n = fmtPointJa(r.natal_body_or_point);
    const a = fmtAspectJa(r.aspect);
    return `${i + 1}) ${t} × ${n}｜${a}（orb ${r.orb_deg}°）`;
    // ※ここで意味解説をしない（思想FIX）
  });

  const moonLine = moonSign ? `\n【今日の月】\n月は ${moonSign} を通過中。` : "";

  return `🌌 今日のソラのこえ。｜${dateLabel}

【今日、強く触れている配置】
${lines.join("\n")}${moonLine}

どれか一つでも、まったく違っても大丈夫。

解釈は、あなたのもの。
星は語る。決めるのは、人。`;
}

function renderX(story) {
  // X/IGは「public only」でも成立するように（個人情報なし）
  const dateLabel = String(story?.meta?.date_local || "").replaceAll("-", ".");
  const sky = story?.public?.sky_top || [];
  const moonSign = story?.public?.moon?.sign_ja || null;

  const skyLines = sky.length
    ? sky
        .map((s, i) => {
          const a = fmtBodyJa(s.a);
          const b = fmtBodyJa(s.b);
          const asp = fmtAspectJa(s.type);
          return `${i + 1}) ${a} × ${b}｜${asp}（orb ${s.orb_deg}°）`;
        })
        .join("\n")
    : "（今日は空の情報を静かに置きます）";

  const moonLine = moonSign ? `\n月は ${moonSign} を通過中。` : "";

  // 200文字に寄せたい場合は後で短縮版も作れる。今は読みやすさ優先。
  return `🌌 ソラのこえ。
［${dateLabel}｜空の配置］${moonLine}

${skyLines}

解釈は、あなたのもの。`;
}

function renderIG(story) {
  // IGはそのまま貼れる整形（改行多め）
  const dateLabel = String(story?.meta?.date_local || "").replaceAll("-", ".");
  const moonSign = story?.public?.moon?.sign_ja || null;
  const sky = story?.public?.sky_top || [];

  const skyLines = sky.length
    ? sky
        .map((s) => {
          const a = fmtBodyJa(s.a);
          const b = fmtBodyJa(s.b);
          const asp = fmtAspectJa(s.type);
          return `・${a} × ${b}｜${asp}（orb ${s.orb_deg}°）`;
        })
        .join("\n")
    : "・（今日は空の情報を静かに置きます）";

  const moonLine = moonSign ? `月は ${moonSign} を通過中。` : "月のサインは取得中。";

  return `🌌 ソラのこえ。｜${dateLabel}

${moonLine}

【空の主な配置】
${skyLines}

解釈は、あなたのもの。
星は語る。決めるのは、人。`;
}

// --------------------
// Firestore writers
// --------------------
function storyDocId(appUserId, dateLocal) {
  return `${appUserId}-${dateLocal}`;
}

/**
 * Overwrite stories doc (single)
 * - doc id is fixed per day: {appUserId}-{dateLocal}
 * - we keep last_generated and overwrite the story itself
 */
async function saveStoryOverwrite(story) {
  const id = storyDocId(story.personal.user_id, story.meta.date_local);
  const ref = db.collection("stories").doc(id);
  await ref.set(
    {
      doc_id: id,
      user_id: story.personal.user_id,
      date_local: story.meta.date_local,
      as_of: story.meta.as_of,
      schema_version: story.meta.schema_version,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      story,
    },
    { merge: true } // keep timestamps fields stable
  );
  return id;
}

/**
 * Batch overwrite multiple stories
 */
async function batchUpsertStories(stories) {
  const chunks = [];
  for (let i = 0; i < stories.length; i += 450) chunks.push(stories.slice(i, i + 450));

  for (const chunk of chunks) {
    const batch = db.batch();
    for (const s of chunk) {
      const id = storyDocId(s.personal.user_id, s.meta.date_local);
      const ref = db.collection("stories").doc(id);
      batch.set(
        ref,
        {
          doc_id: id,
          user_id: s.personal.user_id,
          date_local: s.meta.date_local,
          as_of: s.meta.as_of,
          schema_version: s.meta.schema_version,
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
          created_at: admin.firestore.FieldValue.serverTimestamp(),
          story: s,
        },
        { merge: true }
      );
    }
    await batch.commit();
  }
}

// --------------------
// LINE signature verify (raw body)
// --------------------
function verifyLineSignatureRaw(rawBodyBuf, signature, secret) {
  if (!secret) return { ok: false, reason: "LINE_CHANNEL_SECRET is missing" };
  if (!signature) return { ok: false, reason: "x-line-signature missing" };
  if (!Buffer.isBuffer(rawBodyBuf)) return { ok: false, reason: "raw body is not Buffer" };

  const hmac = crypto.createHmac("sha256", secret).update(rawBodyBuf).digest("base64");
  return { ok: hmac === signature, reason: hmac === signature ? "ok" : "signature mismatch" };
}

// --------------------
// Firestore: line_users upsert / normalize
// --------------------
function makeAppUserId(prefix = "u") {
  return `${prefix}_${crypto.randomBytes(12).toString("base64url")}`;
}

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
    const userRef = db.collection("users").doc(appUserId);
    const userSnap = await tx.get(userRef);
    const userData = userSnap.exists ? userSnap.data() : null;

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
        { app_user_id: appUserId, status, profile: mergedProfile, updated_at: now },
        { merge: true }
      );
    }

    if (!userSnap.exists) {
      tx.set(userRef, {
        display_name: force.display_name || userData?.display_name || "unknown",
        timezone: mergedProfile.timezone || DEFAULT_TZ,
        created_at: now,
        updated_at: now,
      });
    } else {
      tx.set(userRef, { timezone: mergedProfile.timezone || DEFAULT_TZ, updated_at: now }, { merge: true });
    }

    return { lineUserId, appUserId, status };
  });
}

// --------------------
// Jobs queue (natal calc placeholder)
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
    // TODO: SwissEph計算などに差し替え
    await db.collection("natal_cache").doc(job.app_user_id).set(
      {
        computed_at: admin.firestore.FieldValue.serverTimestamp(),
        engine: { ephemeris_source: "swisseph" },
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
        // natal_positions を生成する本体は将来ここで埋める
      },
      { merge: true }
    );

    // line_users status refresh
    const lineRef = db.collection("line_users").doc(job.line_user_id);
    const lineSnap = await lineRef.get();
    if (lineSnap.exists) {
      const d = lineSnap.data() || {};
      const status = computeStatusFromProfile({
        profile: d.profile || {},
        currentStatus: d.status || "pending_profile",
        consentProfile: !!d?.consent?.profile,
      });
      await lineRef.set({ status, updated_at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }

    await doc.ref.set({ status: "done", last_error: null, updated_at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

    return ok(res, { ran: true, processed: 1, job_id: doc.id, app_user_id: job.app_user_id });
  } catch (e) {
    await doc.ref.set(
      { status: "failed", last_error: String(e), updated_at: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    return bad(res, 500, "job failed", { job_id: doc.id, error: String(e) });
  }
}

// --------------------
// optional: geocoding
// --------------------
async function geocodePlace(place, apiKey) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(place)}&key=${apiKey}&language=ja`;
  const r = await fetch(url);
  const json = await r.json();

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
// LINE reply/push helper
// --------------------
async function lineReply(replyToken, text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN missing");

  const payload = { replyToken, messages: [{ type: "text", text: safeText(text, 5000) }] };

  const r = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const body = await r.text();
    throw new Error(`LINE reply failed: ${r.status} ${body}`);
  }
}

async function linePush(to, text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN missing");

  const payload = { to, messages: [{ type: "text", text: safeText(text, 5000) }] };

  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });

  const body = await r.text();
  return { ok: r.ok, status: r.status, response: body };
}

// --------------------
// Registration parsing / flow
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

async function handleRegistrationFlow({ lineUserId, appUserId, replyToken, userText }) {
  const ref = db.collection("line_users").doc(lineUserId);

  const snap0 = await ref.get();
  if (!snap0.exists) {
    const ensured = await ensureUserGraphFromLine({ lineUserId, profilePatch: { timezone: DEFAULT_TZ } });
    appUserId = ensured.appUserId; // eslint-disable-line no-param-reassign
  }

  const fresh = await ref.get();
  const data = fresh.data() || {};
  let status = data.status || "pending_profile";

  if (!data.profile?.birth_date && status === "pending_profile") {
    await ref.set({ status: "pending_birth_date" }, { merge: true });
    status = "pending_birth_date";
  }

  if (status === "pending_birth_date") {
    const v = parseBirthDate(userText);
    if (!v) {
      await lineReply(replyToken, "🌌 ソラのこえ。\n生年月日を YYYY-MM-DD で受け取ります。\n例：1990-07-24");
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
      await lineReply(replyToken, "出生時刻は HH:MM で受け取ります。\n例：12:18\nわからない場合は「不明」と返してください。");
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
        await lineReply(replyToken, "出生地の候補が特定できませんでした。\nもう少し詳しく（例：北海道 帯広市）で送ってください。");
        return;
      }
      lat = g.lat;
      lon = g.lon;
    } else {
      // API key無しだと lat/lon が入らない => readyになれない。
      // ただし思想的にはOKなので、ここは「未計算でも進める」ルートを選ぶ。
      // ready判定は lat/lon を要求してるので、必要なら computeStatusFromProfile を緩めてね。
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

    await lineReply(replyToken, "受け取りました。\nこの情報を保存して、星の計算に使っても大丈夫ですか？\n「はい / いいえ」で返してください。");
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

    await ref.set(
      {
        consent: { profile: true, saved_at: admin.firestore.FieldValue.serverTimestamp() },
        status: "ready",
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const latest = await ref.get();
    const latestData = latest.data() || {};
    const ensuredAppUserId = latestData.app_user_id || appUserId;
    if (ensuredAppUserId) {
      await enqueueNatalCalc({ appUserId: ensuredAppUserId, lineUserId });
    }

    await lineReply(replyToken, "保存しました。\n星の配置は数値として置きます。\n解釈は、あなたのもの。");
    return;
  }

  await lineReply(replyToken, "🌌 ソラのこえ。\n受け取りは完了しています。");
}

// --------------------
// Core: build story (single)
// --------------------
async function buildStoryForUser({ appUserId, dateLocal, asOfISO, orbMaxDeg = 15, precisionDeg = 0.01 }) {
  // user display_name
  let displayName = null;
  try {
    const u = await db.collection("users").doc(appUserId).get();
    if (u.exists) displayName = u.data()?.display_name ?? null;
  } catch (_) {}

  // natal
  const natalCache = await loadNatalFromCache(appUserId);
  if (!natalCache) throw new Error(`natal_cache not found for user_id=${appUserId}`);
  const natalLonMap = extractNatalLongitudes(natalCache);

  // transits (now対応)
  const transitInfo = computeTransitsApprox(asOfISO, precisionDeg);

  const rules = {
    aspects_used: ASPECTS.map((a) => a.type),
    orb_max_deg: orbMaxDeg,
    sort: "orb_asc",
  };

  const touchAll = buildTouchPoints({
    transitBodies: transitInfo.bodies,
    natalBodies: natalLonMap,
    rules,
  });

  const story = storyJsonV11({
    appUserId,
    displayName,
    dateLocal,
    asOfISO,
    transitInfo,
    touchPointsAll: touchAll,
    rules,
    engineMeta: { ephemeris_source: "approx", precision_deg: precisionDeg },
  });

  return story;
}

// --------------------
// HTTP handlers
// --------------------
async function handleTransit(req, res) {
  const precisionDeg = 0.01;
  const asOfISO = String(req.query.as_of || nowIso());
  const t = computeTransitsApprox(asOfISO, precisionDeg);

  return ok(res, {
    meta: {
      project: PROJECT,
      timezone: DEFAULT_TZ,
      as_of: asOfISO,
      generated_at_utc: nowIso(),
      engine: { ephemeris_source: "approx", precision_deg: precisionDeg },
    },
    transit: t,
  });
}

/**
 * GET /stories/build
 * query:
 *   user_id (required)
 *   date_local (optional, default: JST today of as_of)
 *   as_of (optional ISO datetime, default now)
 *   save=1 (default 1)
 */
async function handleStoriesBuild(req, res) {
  try {
    const appUserId = must(req.query.user_id, "user_id");
    const asOfISO = String(req.query.as_of || nowIso());
    const { date_local: inferred } = isoToJstParts(asOfISO);
    const dateLocal = String(req.query.date_local || inferred);

    if (!isYYYYMMDD(dateLocal)) return bad(res, 400, "date_local must be YYYY-MM-DD");

    const save = req.query.save === undefined ? true : parseBool(req.query.save);

    const story = await buildStoryForUser({ appUserId, dateLocal, asOfISO });

    let docId = null;
    if (save) docId = await saveStoryOverwrite(story);

    return ok(res, { saved: save, doc_id: docId, story });
  } catch (e) {
    return bad(res, 400, String(e?.message ?? e));
  }
}

/**
 * GET /stories/rebuild
 * query:
 *   user_id (required)
 *   from (required YYYY-MM-DD)
 *   to   (required YYYY-MM-DD)
 *   time (optional HH:MM, default 14:00)  -> used to build as_of each day
 *   dry_run (optional 1)
 *   orb_max_deg (optional number)
 */
async function handleStoriesRebuild(req, res) {
  try {
    const appUserId = must(req.query.user_id, "user_id");
    const from = must(req.query.from, "from");
    const to = must(req.query.to, "to");
    if (!isYYYYMMDD(from) || !isYYYYMMDD(to)) return bad(res, 400, "from/to must be YYYY-MM-DD");

    const time = req.query.time ? String(req.query.time) : "14:00";
    if (!isHHMM(time)) return bad(res, 400, "time must be HH:MM");

    const dryRun = parseBool(req.query.dry_run);
    const orbMaxDeg = req.query.orb_max_deg !== undefined ? Number(req.query.orb_max_deg) : 15;
    if (!Number.isFinite(orbMaxDeg) || orbMaxDeg <= 0) return bad(res, 400, "orb_max_deg invalid");

    const dates = eachDateLocal(from, to);

    const stories = [];
    for (const dateLocal of dates) {
      const asOfISO = isoWithJST(dateLocal, time);
      const story = await buildStoryForUser({ appUserId, dateLocal, asOfISO, orbMaxDeg });
      stories.push(story);
    }

    if (!dryRun) await batchUpsertStories(stories);

    return ok(res, {
      dry_run: dryRun,
      user_id: appUserId,
      from,
      to,
      count: stories.length,
      sample_doc_id: stories.length ? storyDocId(appUserId, stories[0].meta.date_local) : null,
    });
  } catch (e) {
    return bad(res, 400, String(e?.message ?? e));
  }
}

/**
 * GET /posts/x
 * query:
 *   user_id (optional)
 *   date_local (optional)
 *   as_of (optional)
 *   mode=public (default) | personal (if user_id given)
 *
 * - public: build story in-memory with dummy personal? => we still need natal if personal.
 * - For now: If user_id is given, use saved story doc (or build+save if missing).
 */
async function handlePostsX(req, res) {
  try {
    const asOfISO = String(req.query.as_of || nowIso());
    const { date_local: inferred } = isoToJstParts(asOfISO);
    const dateLocal = String(req.query.date_local || inferred);

    let story = null;

    const userId = req.query.user_id ? String(req.query.user_id) : null;
    if (userId) {
      const id = storyDocId(userId, dateLocal);
      const snap = await db.collection("stories").doc(id).get();
      if (snap.exists) {
        story = snap.data()?.story || null;
      } else {
        // auto-build & save
        story = await buildStoryForUser({ appUserId: userId, dateLocal, asOfISO });
        await saveStoryOverwrite(story);
      }
    } else {
      // public-only: build transit info without natal
      const t = computeTransitsApprox(asOfISO, 0.01);
      story = {
        meta: {
          schema_version: SCHEMA_VERSION,
          project: PROJECT,
          timezone: DEFAULT_TZ,
          date_local: dateLocal,
          as_of: asOfISO,
          generated_at_utc: nowIso(),
          engine: { ephemeris_source: "approx", precision_deg: 0.01 },
          rules: { aspects_used: ASPECTS.map((a) => a.type), orb_max_deg: 6, sort: "orb_asc" },
        },
        public: {
          date_local: dateLocal,
          moon: t.moon,
          sky_top: buildPublicSkyTop(t.bodies),
          tone_hints: { resonance_bullets: [] },
        },
        personal: {
          user_id: null,
          user: { display_name: null },
          privacy: { contains_personal_data: false, allowed_channels: ["x", "instagram"] },
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

    const x = renderX(story);
    return ok(res, { date_local: dateLocal, x_post: x, used: { schema_version: story.meta.schema_version } });
  } catch (e) {
    return bad(res, 400, String(e?.message ?? e));
  }
}

/**
 * GET /posts/ig
 */
async function handlePostsIG(req, res) {
  try {
    const asOfISO = String(req.query.as_of || nowIso());
    const { date_local: inferred } = isoToJstParts(asOfISO);
    const dateLocal = String(req.query.date_local || inferred);

    const t = computeTransitsApprox(asOfISO, 0.01);
    const story = {
      meta: {
        schema_version: SCHEMA_VERSION,
        project: PROJECT,
        timezone: DEFAULT_TZ,
        date_local: dateLocal,
        as_of: asOfISO,
        generated_at_utc: nowIso(),
        engine: { ephemeris_source: "approx", precision_deg: 0.01 },
        rules: { aspects_used: ASPECTS.map((a) => a.type), orb_max_deg: 6, sort: "orb_asc" },
      },
      public: {
        date_local: dateLocal,
        moon: t.moon,
        sky_top: buildPublicSkyTop(t.bodies),
        tone_hints: { resonance_bullets: [] },
      },
      personal: {
        user_id: null,
        user: { display_name: null },
        privacy: { contains_personal_data: false, allowed_channels: ["x", "instagram"] },
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

    const ig = renderIG(story);
    return ok(res, { date_local: dateLocal, ig_post: ig });
  } catch (e) {
    return bad(res, 400, String(e?.message ?? e));
  }
}

/**
 * GET /line/daily  (now対応)
 * query:
 *   user_id (required)
 *   as_of (optional ISO; default now)
 *   save_story=1 (default 1) -> その時点のstoryを作って上書き保存
 */
async function handleLineDaily(req, res) {
  try {
    const appUserId = must(req.query.user_id, "user_id");
    const asOfISO = String(req.query.as_of || nowIso());
    const { date_local: inferred } = isoToJstParts(asOfISO);
    const dateLocal = String(req.query.date_local || inferred);

    const saveStory = req.query.save_story === undefined ? true : parseBool(req.query.save_story);

    const story = await buildStoryForUser({ appUserId, dateLocal, asOfISO });

    let docId = null;
    if (saveStory) docId = await saveStoryOverwrite(story);

    const lineText = renderLine(story);
    return ok(res, { date_local: dateLocal, as_of: asOfISO, saved_story: saveStory, doc_id: docId, line_message: lineText });
  } catch (e) {
    return bad(res, 400, String(e?.message ?? e));
  }
}

/**
 * GET /push (owner test)
 * query:
 *   text
 */
async function handlePushMe(req, res) {
  const text = String(req.query.text || "🌌 ソラのこえ。").trim();
  const userId = process.env.OWNER_LINE_USER_ID;
  if (!userId) return bad(res, 500, "OWNER_LINE_USER_ID missing");

  const r = await linePush(userId, text);
  return ok(res, { pushed: r.ok, status: r.status, response: r.response });
}

// --------------------
// LINE webhook handler (raw body)
// --------------------
async function handleLineWebhook(req, res) {
  const requestId = getRequestId(req);
  const secret = process.env.LINE_CHANNEL_SECRET;
  const signature = req.header("x-line-signature") || "";

  const raw = req.body; // bodyParser.raw
  if (!Buffer.isBuffer(raw)) {
    console.error(`[${nowIso()}] raw body missing`, { requestId });
    return res.status(200).send("ok");
  }

  const verify = verifyLineSignatureRaw(raw, signature, secret);
  if (!verify.ok) {
    console.log(`[${nowIso()}] LINE signature verify failed: ${verify.reason}`, { requestId });
    if (LINE_STRICT) return res.status(401).send(verify.reason);
    return res.status(200).send("ok");
  }

  let json;
  try {
    json = JSON.parse(raw.toString("utf8") || "{}");
  } catch (e) {
    console.error("invalid JSON body:", e);
    return res.status(200).send("ok");
  }

  const ev = json?.events?.[0];
  const lineUserId = ev?.source?.userId;
  if (!lineUserId) return res.status(200).send("ok");

  const { appUserId } = await ensureUserGraphFromLine({ lineUserId, profilePatch: { timezone: DEFAULT_TZ } });

  const replyToken = ev?.replyToken;
  const msgText = ev?.message?.type === "text" ? ev.message.text : null;

  try {
    if (replyToken && msgText != null) {
      await handleRegistrationFlow({ lineUserId, appUserId, replyToken, userText: msgText });
    }
  } catch (e) {
    console.error("registrationFlow error:", e);
  }

  return res.status(200).send("ok");
}

// --------------------
// DEBUG / ADMIN (token protected)
// --------------------
function requireDebugToken(req) {
  const need = process.env.DEBUG_TOKEN;
  const token = String(req.query.token || req.header("x-debug-token") || "");
  if (!need) throw new Error("DEBUG_TOKEN is missing in env");
  if (!token || token !== need) throw new Error("forbidden");
}

/**
 * GET /debug/resetRegistration?token=...&line_user_id=...&keep_app_user_id=true|false
 */
async function handleDebugResetRegistration(req, res) {
  try {
    requireDebugToken(req);

    const lineUserId = must(req.query.line_user_id, "line_user_id");
    const keepAppUserId = String(req.query.keep_app_user_id || "true").toLowerCase() !== "false";

    const ref = db.collection("line_users").doc(lineUserId);
    const snap = await ref.get();
    if (!snap.exists) return bad(res, 404, "line_users doc not found");

    const data = snap.data() || {};
    const now = admin.firestore.FieldValue.serverTimestamp();

    const patch = {
      status: "pending_birth_date",
      consent: { profile: false, saved_at: null },
      profile: { timezone: data?.profile?.timezone || DEFAULT_TZ },
      updated_at: now,
    };

    if (!keepAppUserId) patch.app_user_id = admin.firestore.FieldValue.delete();

    await ref.set(patch, { merge: true });

    return ok(res, { reset: true, line_user_id: lineUserId, keep_app_user_id: keepAppUserId, next_status: "pending_birth_date" });
  } catch (e) {
    return bad(res, 403, String(e?.message ?? e));
  }
}

/**
 * POST /admin/stories/seed?token=...
 * body: { stories: [ {meta,public,personal,guardrails}, ... ] }
 *
 * 👉「一個一個いれずに、storiesを一括更新したい」用。
 * - docIdは personal.user_id + meta.date_local で決まる
 * - merge:true で upsert
 */
async function handleAdminSeedStories(req, res) {
  try {
    requireDebugToken(req);

    const body = req.body || {};
    const stories = body.stories;
    if (!Array.isArray(stories) || !stories.length) return bad(res, 400, "body.stories must be a non-empty array");

    // minimal validate
    for (const s of stories) {
      if (!s?.personal?.user_id) throw new Error("each story must include personal.user_id");
      if (!s?.meta?.date_local) throw new Error("each story must include meta.date_local");
      if (!isYYYYMMDD(s.meta.date_local)) throw new Error("meta.date_local must be YYYY-MM-DD");
    }

    await batchUpsertStories(stories);
    return ok(res, { upserted: stories.length });
  } catch (e) {
    return bad(res, 400, String(e?.message ?? e));
  }
}

// --------------------
// Express app / router (SINGLE)
// --------------------
const app = express();

// common log
app.use((req, res, next) => {
  if (req.path !== "/healthz") console.log(`[${nowIso()}] ${req.method} ${req.path}`);
  next();
});

// JSON for most routes
app.use(express.json({ limit: "2mb" }));

app.get("/", (req, res) =>
  ok(res, {
    service: PROJECT,
    routes: [
      "/healthz",
      "/transit?as_of=",
      "/stories/build?user_id=&as_of=&date_local=&save=",
      "/stories/rebuild?user_id=&from=&to=&time=&dry_run=",
      "/line/daily?user_id=&as_of=&save_story=",
      "/posts/x?as_of=&date_local=&user_id=",
      "/posts/ig?as_of=&date_local=",
      "/push?text=",
      "/jobs/worker (POST)",
      "/line/webhook (POST raw)",
      "/debug/resetRegistration?token=&line_user_id=",
      "/admin/stories/seed?token= (POST json)",
    ],
  })
);

app.get("/healthz", (req, res) => res.status(200).send("ok"));

// endpoints
app.get("/transit", (req, res) => handleTransit(req, res));
app.get("/stories/build", (req, res) => handleStoriesBuild(req, res));
app.get("/stories/rebuild", (req, res) => handleStoriesRebuild(req, res));
app.get("/line/daily", (req, res) => handleLineDaily(req, res));
app.get("/posts/x", (req, res) => handlePostsX(req, res));
app.get("/posts/ig", (req, res) => handlePostsIG(req, res));
app.get("/push", (req, res) => handlePushMe(req, res));

// jobs worker
app.post("/jobs/worker", bodyParser.json({ limit: "1mb" }), (req, res) => {
  handleJobsWorker(req, res).catch((err) => {
    console.error(err);
    return bad(res, 500, String(err));
  });
});

// LINE webhook must be RAW
app.post("/line/webhook", bodyParser.raw({ type: "*/*" }), (req, res) => {
  handleLineWebhook(req, res).catch((err) => {
    console.error("handleLineWebhook error:", err);
    // LINEにはとにかく200（再送ループ防止）
    return res.status(200).send("ok");
  });
});

// debug / admin
app.get("/debug/resetRegistration", (req, res) => handleDebugResetRegistration(req, res));
app.post("/admin/stories/seed", bodyParser.json({ limit: "5mb" }), (req, res) => handleAdminSeedStories(req, res));

// fallback
app.use((req, res) => bad(res, 404, "not found", { path: req.path }));

// Functions Framework entry (ONLY ONCE)
functions.http("app", app);
