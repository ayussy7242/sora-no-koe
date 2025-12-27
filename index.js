/**
 * 🌌 sora-no-koe (Cloud Run / Functions Framework) — Unified v1.1.1 (Optimized)
 *
 * ✅ Fix/Improve:
 * - /line/webhook raw-body signature verification is now safe and NOT broken by express.json()
 * - created_at no longer overwritten on overwrite save (transactional)
 * - JST date_local inference is accurate (Intl.DateTimeFormat with timeZone)
 * - timingSafeEqual for signature compare
 * - duplicate helpers removed, structure cleaned
 * - renderers / story schema v1.1.0 kept (compatible)
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
 *   SE_EPHE_PATH                    (default: ./ephe) Swiss Ephemeris files path
 */

"use strict";

const functions = require("@google-cloud/functions-framework");
const admin = require("firebase-admin");
const crypto = require("crypto");
const express = require("express");
const bodyParser = require("body-parser");
const swisseph = require("swisseph");

// Node18+ has fetch by default. Keep a soft guard for safety.
if (typeof fetch !== "function") {
  // eslint-disable-next-line global-require
  global.fetch = require("node-fetch");
}

/* =====================
   Swiss Ephemeris setup
===================== */
const EPHE_PATH = process.env.SE_EPHE_PATH || "./ephe";
swisseph.swe_set_ephe_path(EPHE_PATH);
console.log("[SwissEph] ephe path =", EPHE_PATH);

/* =====================
   bootstrap
===================== */
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
db.settings({ databaseId: process.env.FIRESTORE_DATABASE_ID || "sora-no-koe-db" });

/* =====================
   constants / config
===================== */
const PROJECT = "sora-no-koe";
const DEFAULT_TZ = "Asia/Tokyo";
const SCHEMA_VERSION = "1.1.0"; // story schema version (keep compatible)
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

const SIGNS_JA = [
  "牡羊座", "牡牛座", "双子座", "蟹座", "獅子座", "乙女座",
  "天秤座", "蠍座", "射手座", "山羊座", "水瓶座", "魚座"
];

/* =====================
   helpers (core)
===================== */
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

function pickTopByOrb(items, n = 3) {
  return [...items].sort((x, y) => (x.orb_deg ?? 999) - (y.orb_deg ?? 999)).slice(0, n);
}

function signJaFromLon(lonDeg) {
  const idx = Math.floor(norm360(lonDeg) / 30);
  return SIGNS_JA[idx] ?? null;
}

/**
 * JST parts from ISO (accurate)
 * returns: { date_local: 'YYYY-MM-DD', time_local: 'HH:MM' }
 */
function isoToTzParts(asOfISO, timeZone = DEFAULT_TZ) {
  const d = asOfISO ? new Date(asOfISO) : new Date();
  if (Number.isNaN(d.getTime())) throw new Error(`invalid as_of ISO: ${asOfISO}`);

  const fmtDate = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const fmtTime = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  // en-CA => YYYY-MM-DD
  const date_local = fmtDate.format(d);
  const time_local = fmtTime.format(d);
  return { date_local, time_local };
}

/**
 * Create UTC ISO from JST local date + time (HH:MM)
 * JST local -> UTC: subtract 9h
 */
function isoWithJST(dateLocal, timeHHMM = "14:00") {
  if (!isYYYYMMDD(dateLocal)) throw new Error("dateLocal must be YYYY-MM-DD");
  if (!isHHMM(timeHHMM)) throw new Error("time must be HH:MM");
  const [y, m, dd] = dateLocal.split("-").map(Number);
  const [hh, mm] = timeHHMM.split(":").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, dd, hh - 9, mm, 0));
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
    // cur already JST (+09:00). format stable as date string.
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
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

/* =====================
   Swiss Ephemeris helpers
===================== */
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

  const lon = out.data?.[0];
  if (!Number.isFinite(lon)) throw new Error(`invalid lon from swe_calc_ut: ${JSON.stringify(out)}`);

  return norm360(lon);
}

/**
 * computeTransitsSwiss(as_of_iso)
 */
function computeTransitsSwiss(asOfISO, precisionDeg = 0.01) {
  const jdUt = jdUtFromIso(asOfISO);
  const bodies = {};
  const targets = ["Sun", "Moon", "Mercury", "Venus", "Mars"];

  for (const body of targets) {
    const lon = sweLonDeg(body, jdUt);
    bodies[body] = toFixedPrecision(lon, precisionDeg);
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

/* =====================
   Natal cache load / normalize
===================== */
async function loadNatalFromCache(appUserId) {
  const snap = await db.collection("natal_cache").doc(appUserId).get();
  if (!snap.exists) return null;
  return snap.data();
}

function extractNatalLongitudes(natalCacheDoc) {
  const sun = natalCacheDoc?.natal_positions?.sun?.lon_deg;
  const moon = natalCacheDoc?.natal_positions?.moon?.lon_deg;
  const asc = natalCacheDoc?.natal_positions?.asc?.lon_deg;

  if (Number.isFinite(sun) && Number.isFinite(moon) && Number.isFinite(asc)) {
    return { Sun: sun, Moon: moon, ASC: asc };
  }

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

/* =====================
   story.json v1.1 — FIX
===================== */
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

      let best = null;
      for (const a of ASPECTS) {
        const delta = Math.abs(dist - a.deg);
        if (!best || delta < best.delta) best = { type: a.type, aspect_deg: a.deg, delta };
      }

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
      engine: engineMeta ?? { ephemeris_source: "swisseph", precision_deg: 0.01 },
      rules,
    },

    public: {
      date_local: dateLocal,
      moon: {
        sign_ja: transitInfo?.moon?.sign_ja ?? null,
        lon_deg: transitInfo?.moon?.lon_deg ?? null,
      },
      sky_top: skyTop,
      tone_hints: { resonance_bullets: [] },
    },

    personal: {
      user_id: appUserId,
      user: { display_name: displayName ?? null },
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

/* =====================
   Renderers (LINE / X / IG)
===================== */
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

  return `🌌 ソラのこえ。
［${dateLabel}｜空の配置］${moonLine}

${skyLines}

解釈は、あなたのもの。`;
}

function renderIG(story) {
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

/* =====================
   Firestore writers
===================== */
function storyDocId(appUserId, dateLocal) {
  return `${appUserId}-${dateLocal}`;
}

/**
 * Overwrite single story doc, but keep created_at stable (transaction).
 */
async function saveStoryOverwrite(story) {
  const id = storyDocId(story.personal.user_id, story.meta.date_local);
  const ref = db.collection("stories").doc(id);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = admin.firestore.FieldValue.serverTimestamp();

    if (!snap.exists) {
      tx.set(ref, {
        doc_id: id,
        user_id: story.personal.user_id,
        date_local: story.meta.date_local,
        as_of: story.meta.as_of,
        schema_version: story.meta.schema_version,
        created_at: now,
        updated_at: now,
        story,
      });
    } else {
      tx.set(
        ref,
        {
          doc_id: id,
          user_id: story.personal.user_id,
          date_local: story.meta.date_local,
          as_of: story.meta.as_of,
          schema_version: story.meta.schema_version,
          updated_at: now,
          story,
        },
        { merge: true }
      );
    }
  });

  return id;
}

/**
 * Batch overwrite multiple stories
 * NOTE: batch cannot conditionally preserve created_at without pre-reads.
 * For rebuild jobs, it's usually acceptable. If you want strict created_at, do per-doc transaction (slower).
 */
async function batchUpsertStories(stories) {
  const chunks = [];
  for (let i = 0; i < stories.length; i += 450) chunks.push(stories.slice(i, i + 450));

  for (const chunk of chunks) {
    const batch = db.batch();
    const now = admin.firestore.FieldValue.serverTimestamp();

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
          // created_at is NOT set here to avoid overwriting old docs; new docs will miss created_at unless already there.
          // If you want created_at always, set created_at: now, but it overwrites existing docs.
          updated_at: now,
          story: s,
        },
        { merge: true }
      );
    }

    await batch.commit();
  }
}

/* =====================
   LINE signature verify (raw body)
===================== */
function verifyLineSignatureRaw(rawBodyBuf, signature, secret) {
  if (!secret) return { ok: false, reason: "LINE_CHANNEL_SECRET is missing" };
  if (!signature) return { ok: false, reason: "x-line-signature missing" };
  if (!Buffer.isBuffer(rawBodyBuf)) return { ok: false, reason: "raw body is not Buffer" };

  const hmac = crypto.createHmac("sha256", secret).update(rawBodyBuf).digest("base64");

  // timingSafeEqual requires same length buffers
  const a = Buffer.from(hmac);
  const b = Buffer.from(String(signature));
  if (a.length !== b.length) return { ok: false, reason: "signature mismatch" };

  const same = crypto.timingSafeEqual(a, b);
  return { ok: same, reason: same ? "ok" : "signature mismatch" };
}

/* =====================
   Firestore: line_users upsert / normalize
===================== */
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
      tx.set(lineRef, { app_user_id: appUserId, status, profile: mergedProfile, updated_at: now }, { merge: true });
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

/* =====================
   Jobs queue (natal calc placeholder)
===================== */
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
  const q = await db.collection("jobs_natal_calc")
    .where("status", "==", "queued")
    .orderBy("created_at", "asc")
    .limit(1)
    .get();

  if (q.empty) return ok(res, { ran: true, processed: 0 });

  const doc = q.docs[0];
  const job = doc.data();

  await doc.ref.set(
    { status: "running", attempts: (job.attempts || 0) + 1, updated_at: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );

  try {
    // TODO: natal_positionsを本計算で埋める
    await db.collection("natal_cache").doc(job.app_user_id).set(
      {
        computed_at: admin.firestore.FieldValue.serverTimestamp(),
        engine: { ephemeris_source: "swisseph" },
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

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
    await doc.ref.set({ status: "failed", last_error: String(e), updated_at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return bad(res, 500, "job failed", { job_id: doc.id, error: String(e) });
  }
}

/* =====================
   optional: geocoding
===================== */
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

/* =====================
   LINE reply/push helper
===================== */
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

/* =====================
   Registration parsing / flow
===================== */
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
      { profile: { ...(data.profile || {}), birth_date: v }, status: "pending_birth_time", updated_at: admin.firestore.FieldValue.serverTimestamp() },
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
      { profile: { ...(data.profile || {}), birth_time: v }, status: "pending_birth_place", updated_at: admin.firestore.FieldValue.serverTimestamp() },
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
    let lat = null;
    let lon = null;

    if (apiKey) {
      const g = await geocodePlace(place, apiKey);
      if (!g.ok) {
        await lineReply(replyToken, "出生地の候補が特定できませんでした。\nもう少し詳しく（例：北海道 帯広市）で送ってください。");
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
        { consent: { profile: false, saved_at: null }, status: "pending_profile", updated_at: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      await lineReply(replyToken, "了解です。\n保存はしません。\nまたいつでも再開できます。");
      return;
    }

    await ref.set(
      { consent: { profile: true, saved_at: admin.firestore.FieldValue.serverTimestamp() }, status: "ready", updated_at: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    const latest = await ref.get();
    const latestData = latest.data() || {};
    const ensuredAppUserId = latestData.app_user_id || appUserId;
    if (ensuredAppUserId) await enqueueNatalCalc({ appUserId: ensuredAppUserId, lineUserId });

    await lineReply(replyToken, "保存しました。\n星の配置は数値として置きます。\n解釈は、あなたのもの。");
    return;
  }

  await lineReply(replyToken, "🌌 ソラのこえ。\n受け取りは完了しています。");
}

/* =====================
   Core: build story (single)
===================== */
async function buildStoryForUser({ appUserId, dateLocal, asOfISO, orbMaxDeg = 15, precisionDeg = 0.01 }) {
  let displayName = null;
  try {
    const u = await db.collection("users").doc(appUserId).get();
    if (u.exists) displayName = u.data()?.display_name ?? null;
  } catch (_) {}

  const natalCache = await loadNatalFromCache(appUserId);
  if (!natalCache) throw new Error(`natal_cache not found for user_id=${appUserId}`);
  const natalLonMap = extractNatalLongitudes(natalCache);

  const transitInfo = computeTransitsSwiss(asOfISO, precisionDeg);

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
    engineMeta: { ephemeris_source: "swisseph", precision_deg: precisionDeg },
  });

  return story;
}

/* =====================
   HTTP handlers
===================== */
async function handleTransit(req, res) {
  try {
    const precisionDeg = 0.01;
    const asOfISO = String(req.query.as_of || nowIso());
    const t = computeTransitsSwiss(asOfISO, precisionDeg);

    return ok(res, {
      meta: {
        project: PROJECT,
        timezone: DEFAULT_TZ,
        as_of: asOfISO,
        generated_at_utc: nowIso(),
        engine: { ephemeris_source: "swisseph", precision_deg: precisionDeg },
      },
      transit: t,
    });
  } catch (e) {
    return bad(res, 400, String(e?.message ?? e));
  }
}

async function handleStoriesBuild(req, res) {
  try {
    const appUserId = must(req.query.user_id, "user_id");
    const asOfISO = String(req.query.as_of || nowIso());
    const { date_local: inferred } = isoToTzParts(asOfISO, DEFAULT_TZ);
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

async function handlePostsX(req, res) {
  try {
    const asOfISO = String(req.query.as_of || nowIso());
    const { date_local: inferred } = isoToTzParts(asOfISO, DEFAULT_TZ);
    const dateLocal = String(req.query.date_local || inferred);

    let story = null;
    const userId = req.query.user_id ? String(req.query.user_id) : null;

    if (userId) {
      const id = storyDocId(userId, dateLocal);
      const snap = await db.collection("stories").doc(id).get();
      if (snap.exists) {
        story = snap.data()?.story || null;
      } else {
        story = await buildStoryForUser({ appUserId: userId, dateLocal, asOfISO });
        await saveStoryOverwrite(story);
      }
    } else {
      const t = computeTransitsSwiss(asOfISO, 0.01);
      story = {
        meta: {
          schema_version: SCHEMA_VERSION,
          project: PROJECT,
          timezone: DEFAULT_TZ,
          date_local: dateLocal,
          as_of: asOfISO,
          generated_at_utc: nowIso(),
          engine: { ephemeris_source: "swisseph", precision_deg: 0.01 },
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

async function handlePostsIG(req, res) {
  try {
    const asOfISO = String(req.query.as_of || nowIso());
    const { date_local: inferred } = isoToTzParts(asOfISO, DEFAULT_TZ);
    const dateLocal = String(req.query.date_local || inferred);

    const t = computeTransitsSwiss(asOfISO, 0.01);
    const story = {
      meta: {
        schema_version: SCHEMA_VERSION,
        project: PROJECT,
        timezone: DEFAULT_TZ,
        date_local: dateLocal,
        as_of: asOfISO,
        generated_at_utc: nowIso(),
        engine: { ephemeris_source: "swisseph", precision_deg: 0.01 },
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

async function handleLineDaily(req, res) {
  try {
    const appUserId = must(req.query.user_id, "user_id");
    const asOfISO = String(req.query.as_of || nowIso());
    const { date_local: inferred } = isoToTzParts(asOfISO, DEFAULT_TZ);
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

async function handlePushMe(req, res) {
  const text = String(req.query.text || "🌌 ソラのこえ。").trim();
  const userId = process.env.OWNER_LINE_USER_ID;
  if (!userId) return bad(res, 500, "OWNER_LINE_USER_ID missing");

  const r = await linePush(userId, text);
  return ok(res, { pushed: r.ok, status: r.status, response: r.response });
}

/* =====================
   LINE webhook handler (raw body)
===================== */
async function handleLineWebhook(req, res) {
  const requestId = getRequestId(req);
  const secret = process.env.LINE_CHANNEL_SECRET;
  const signature = req.header("x-line-signature") || "";

  const raw = req.body; // must be Buffer
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

/* =====================
   DEBUG / ADMIN (token protected)
===================== */
function requireDebugToken(req) {
  const need = process.env.DEBUG_TOKEN;
  const token = String(req.query.token || req.header("x-debug-token") || "");
  if (!need) throw new Error("DEBUG_TOKEN is missing in env");
  if (!token || token !== need) throw new Error("forbidden");
}

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

async function handleAdminSeedStories(req, res) {
  try {
    requireDebugToken(req);

    const body = req.body || {};
    const stories = body.stories;
    if (!Array.isArray(stories) || !stories.length) return bad(res, 400, "body.stories must be a non-empty array");

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

/* =====================
   Express app / router (SINGLE)
===================== */
const app = express();

// common log
app.use((req, res, next) => {
  if (req.path !== "/healthz") console.log(`[${nowIso()}] ${req.method} ${req.path}`);
  next();
});

// IMPORTANT: /line/webhook must stay RAW.
// So we skip express.json() on that path.
app.use((req, res, next) => {
  if (req.path === "/line/webhook") return next();
  return express.json({ limit: "2mb" })(req, res, next);
});

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
    schema_version: SCHEMA_VERSION,
  })
);

app.get("/healthz", (req, res) => res.status(200).send("ok"));

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
app.post("/line/webhook", bodyParser.raw({ type: "*/*", limit: "1mb" }), (req, res) => {
  handleLineWebhook(req, res).catch((err) => {
    console.error("handleLineWebhook error:", err);
    return res.status(200).send("ok"); // prevent retry loop
  });
});

// debug / admin
app.get("/debug/resetRegistration", (req, res) => handleDebugResetRegistration(req, res));
app.post("/admin/stories/seed", bodyParser.json({ limit: "5mb" }), (req, res) => handleAdminSeedStories(req, res));

// fallback
app.use((req, res) => bad(res, 404, "not found", { path: req.path }));

// Functions Framework entry (ONLY ONCE)
functions.http("app", app);
