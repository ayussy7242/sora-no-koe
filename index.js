/**
 * 🌌 sora-no-koe (Cloud Run / Functions Framework) — Unified v1.1.1 (STABLE)
 *
 * Fixes:
 * - Cloud Runで確実にPORT listen（Functions Framework前提）
 * - LINE webhook raw-body署名検証が壊れない（/line/webhookだけraw優先）
 * - Firestore multi DB を Admin SDK 正式API getFirestore(app, databaseId) に統一（起動クラッシュ回避）
 * - /stories/build と /stories/rebuild を分離（維持）
 * - stories保存フォーマットを一本化（維持）
 */

"use strict";

const functions = require("@google-cloud/functions-framework");
const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");

const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

const swisseph = require("swisseph");

// --------------------
// Swiss Ephemeris setup
// --------------------
const EPHE_PATH = process.env.SE_EPHE_PATH || "./ephe";
try {
  swisseph.swe_set_ephe_path(EPHE_PATH);
  console.log("[SwissEph] ephe path =", EPHE_PATH);
} catch (e) {
  // ephe path set で死ぬことは基本ないが、念のため
  console.error("[SwissEph] swe_set_ephe_path error:", e);
}

// --------------------
// bootstrap firebase admin + firestore (multi db)
// --------------------
if (!admin.apps.length) admin.initializeApp();

// FIRESTORE_DATABASE_ID:
// - default DBなら "(default)"
// - custom DBなら "sora-no-koe-db" 等
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || "(default)";
const db = getFirestore(admin.app(), FIRESTORE_DATABASE_ID);
console.log("[Firestore] databaseId =", FIRESTORE_DATABASE_ID);

// --------------------
// constants / config
// --------------------
const PROJECT = "sora-no-koe";
const DEFAULT_TZ = "Asia/Tokyo";
const SCHEMA_VERSION = "1.1.1";

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

const SIGNS_JA = ["牡羊座","牡牛座","双子座","蟹座","獅子座","乙女座","天秤座","蠍座","射手座","山羊座","水瓶座","魚座"];

// --------------------
// helpers
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

function pickTopByOrb(items, n = 3) {
  return [...items].sort((x, y) => (x.orb_deg ?? 999) - (y.orb_deg ?? 999)).slice(0, n);
}

function requireDebugToken(req) {
  const expected = process.env.DEBUG_TOKEN || "";
  const got = String(req.query.token || "");

  if (!expected) throw new Error("DEBUG_TOKEN is missing (set env var)");
  if (!got) throw new Error("token is required");
  if (got !== expected) throw new Error("invalid token");
}

/**
 * Convert ISO -> {date_local (JST), time_local (HH:MM)}
 * ※ timezoneは今JST固定（思想としてOK）/ 将来ユーザーTZに対応してもよい
 */
function isoToJstParts(asOfISO) {
  const d = asOfISO ? new Date(asOfISO) : new Date();
  const jstMs = d.getTime() + 9 * 60 * 60 * 1000;
  const jst = new Date(jstMs);
  const iso = jst.toISOString();
  return { date_local: iso.slice(0, 10), time_local: iso.slice(11, 16) };
}

/**
 * Create ISO string that represents "dateLocal + timeHHMM in JST"
 */
function isoWithJST(dateLocal, timeHHMM = "14:00") {
  if (!isYYYYMMDD(dateLocal)) throw new Error("dateLocal must be YYYY-MM-DD");
  if (!isHHMM(timeHHMM)) throw new Error("time must be HH:MM");
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
    const jst = new Date(cur.getTime() + 9 * 60 * 60 * 1000);
    out.push(jst.toISOString().slice(0, 10));
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
  }
  return out;
}

function getRequestId(req) {
  return (
    String(req.header("x-request-id") || req.header("x-cloud-trace-context") || "").slice(0, 100) || null
  );
}

// --------------------
// Swiss Ephemeris helpers
// --------------------
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

    const lon = (typeof out.longitude === "number")
      ? out.longitude
      : out.data?.[0];

    if (!Number.isFinite(lon)) throw new Error(`invalid lon from swe_calc_ut: ${JSON.stringify(out)}`);

    return norm360(lon);
}

function signJaFromLon(lonDeg) {
  const idx = Math.floor(norm360(lonDeg) / 30);
  return SIGNS_JA[idx] ?? null;
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

  return {
    bodies,
    moon: { lon_deg: moonLon, sign_ja: signJaFromLon(moonLon) },
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

// --------------------
// story.json (schema v1.1.1)
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

      // best aspect
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

    if (best.delta <= 6) {
      out.push({ a: "Moon", b, type: best.type, aspect_deg: best.aspect_deg, orb_deg: Number(best.delta.toFixed(2)) });
    }
  }

  return out.sort((x, y) => x.orb_deg - y.orb_deg).slice(0, 3);
}

function storyJsonV11({ appUserId, displayName, dateLocal, asOfISO, transitInfo, touchPointsAll, rules, engineMeta }) {
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
      moon: { sign_ja: transitInfo?.moon?.sign_ja ?? null, lon_deg: transitInfo?.moon?.lon_deg ?? null },
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
}

// --------------------
// Renderers
// --------------------
function fmtAspectJa(aspect) { return ASPECT_JA[aspect] || aspect; }
function fmtBodyJa(body) { return BODY_JA[body] || body; }
function fmtPointJa(p) { return POINT_JA[p] || p; }

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
    ? sky.map((s, i) => `${i + 1}) ${fmtBodyJa(s.a)} × ${fmtBodyJa(s.b)}｜${fmtAspectJa(s.type)}（orb ${s.orb_deg}°）`).join("\n")
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
    ? sky.map((s) => `・${fmtBodyJa(s.a)} × ${fmtBodyJa(s.b)}｜${fmtAspectJa(s.type)}（orb ${s.orb_deg}°）`).join("\n")
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
      // created_at は「初回だけ」にしたいなら transaction が必要。今はmergeで上書きでもOK運用。
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      story,
    },
    { merge: true }
  );
  return id;
}

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
// line_users graph
// --------------------
function makeAppUserId(prefix = "u") {
  return `${prefix}_${crypto.randomBytes(12).toString("base64url")}`;
}

function computeStatusFromProfile({ profile, currentStatus = "pending_profile", consentProfile = false }) {
  const hasCore =
    !!profile?.birth_date &&
    !!profile?.birth_time &&
    !!profile?.birth_place;

  // lat/lon を必須にすると、Google APIキーない時に永久に ready になれない。
  // 現状思想的に「場所は文字でOK」に寄せるなら lat/lon は任意の方が運用がラク。
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

// --------------------
// LINE reply/push (fetchはNode20でOK)
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
    await ref.set({ profile: { ...(data.profile || {}), birth_date: v }, status: "pending_birth_time", updated_at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await lineReply(replyToken, "受け取りました。\n次に、出生時刻です（例：12:18）\n不明なら「不明」でOK。");
    return;
  }

  if (status === "pending_birth_time") {
    const v = parseBirthTime(userText);
    if (!v) {
      await lineReply(replyToken, "出生時刻は HH:MM で受け取ります。\n例：12:18\nわからない場合は「不明」と返してください。");
      return;
    }
    await ref.set({ profile: { ...(data.profile || {}), birth_time: v }, status: "pending_birth_place", updated_at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await lineReply(replyToken, "ありがとう。\n次に、出生地（市区町村まで）を教えてください。\n例：北海道帯広市");
    return;
  }

  if (status === "pending_birth_place") {
    const place = String(userText || "").trim();
    if (!place) {
      await lineReply(replyToken, "出生地（市区町村まで）を文字で受け取ります。\n例：北海道帯広市");
      return;
    }

    await ref.set(
      {
        profile: { ...(data.profile || {}), birth_place: place, timezone: data.profile?.timezone || DEFAULT_TZ },
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
      await ref.set({ consent: { profile: false, saved_at: null }, status: "pending_profile", updated_at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      await lineReply(replyToken, "了解です。\n保存はしません。\nまたいつでも再開できます。");
      return;
    }

    await ref.set({ consent: { profile: true, saved_at: admin.firestore.FieldValue.serverTimestamp() }, status: "ready", updated_at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await lineReply(replyToken, "保存しました。\n星の配置は数値として置きます。\n解釈は、あなたのもの。");
    return;
  }

  await lineReply(replyToken, "🌌 ソラのこえ。\n受け取りは完了しています。");
}

// --------------------
// build story (single)
// --------------------
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

  const touchAll = buildTouchPoints({ transitBodies: transitInfo.bodies, natalBodies: natalLonMap, rules });

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

// --------------------
// handlers
// --------------------
async function handleTransit(req, res) {
  try {
    const precisionDeg = 0.01;
    const asOfISO = String(req.query.as_of || nowIso());
    const t = computeTransitsSwiss(asOfISO, precisionDeg);

    return ok(res, {
      meta: { project: PROJECT, timezone: DEFAULT_TZ, as_of: asOfISO, generated_at_utc: nowIso(), engine: { ephemeris_source: "swisseph", precision_deg: precisionDeg } },
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
    const { date_local: inferred } = isoToJstParts(asOfISO);
    const dateLocal = String(req.query.date_local || inferred);

    let story = null;
    const userId = req.query.user_id ? String(req.query.user_id) : null;

    if (userId) {
      const id = storyDocId(userId, dateLocal);
      const snap = await db.collection("stories").doc(id).get();
      if (snap.exists) story = snap.data()?.story || null;
      else {
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
        public: { date_local: dateLocal, moon: t.moon, sky_top: buildPublicSkyTop(t.bodies), tone_hints: { resonance_bullets: [] } },
        personal: { user_id: null, user: { display_name: null }, privacy: { contains_personal_data: false, allowed_channels: ["x", "instagram"] }, touch_points_top3: [] },
        guardrails: { no_prediction: true, no_good_bad: true, no_should: true, no_personality_label: true, no_salvation: true, sovereignty_returned: true },
      };
    }

    return ok(res, { date_local: dateLocal, x_post: renderX(story), used: { schema_version: story.meta.schema_version } });
  } catch (e) {
    return bad(res, 400, String(e?.message ?? e));
  }
}

async function handlePostsIG(req, res) {
  try {
    const asOfISO = String(req.query.as_of || nowIso());
    const { date_local: inferred } = isoToJstParts(asOfISO);
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
      public: { date_local: dateLocal, moon: t.moon, sky_top: buildPublicSkyTop(t.bodies), tone_hints: { resonance_bullets: [] } },
      personal: { user_id: null, user: { display_name: null }, privacy: { contains_personal_data: false, allowed_channels: ["x", "instagram"] }, touch_points_top3: [] },
      guardrails: { no_prediction: true, no_good_bad: true, no_should: true, no_personality_label: true, no_salvation: true, sovereignty_returned: true },
    };

    return ok(res, { date_local: dateLocal, ig_post: renderIG(story) });
  } catch (e) {
    return bad(res, 400, String(e?.message ?? e));
  }
}

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

    return ok(res, { date_local: dateLocal, as_of: asOfISO, saved_story: saveStory, doc_id: docId, line_message: renderLine(story) });
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

// --------------------
// LINE webhook handler (raw body)  ★重要：express.json より先に raw を通す
// --------------------
async function handleLineWebhook(req, res) {
  const requestId = getRequestId(req);
  const secret = process.env.LINE_CHANNEL_SECRET;
  const signature = req.header("x-line-signature") || "";

  const raw = req.body; // raw Buffer
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

  const ensured = await ensureUserGraphFromLine({ lineUserId, profilePatch: { timezone: DEFAULT_TZ } });
  const replyToken = ev?.replyToken;
  const msgText = ev?.message?.type === "text" ? ev.message.text : null;

  try {
    if (replyToken && msgText != null) {
      await handleRegistrationFlow({ lineUserId, appUserId: ensured.appUserId, replyToken, userText: msgText });
    }
  } catch (e) {
    console.error("registrationFlow error:", e);
  }

  return res.status(200).send("ok");
}

// --------------------
// DEBUG / ADMIN (token protected)  ※必要なら後で戻す（ここでは省略しない）
/* （あなたの元の実装をそのまま移植したいなら、ここに requireDebugToken / admin seed を足す）
   今回はCloud Run安定化が最優先だから、まず起動を確実にする版に寄せてる。
*/
// --------------------

function requireDebugToken(req) {
  const expected = process.env.DEBUG_TOKEN;
  if (!expected) throw new Error("DEBUG_TOKEN missing");

  const token = String(req.query.token || "");
  if (token !== expected) {
    const err = new Error("forbidden");
    err.status = 403;
    throw err;
  }
}


// --------------------
// Express app (middleware order FIX)
// --------------------
const app = express();

// log
app.use((req, res, next) => {
  if (req.path !== "/health") console.log(`[${nowIso()}] ${req.method} ${req.path}`);
  next();
});

// 1) LINE webhook only raw first (MUST be before json parser)
app.post("/line/webhook", bodyParser.raw({ type: "*/*" }), (req, res) => {
  handleLineWebhook(req, res).catch((err) => {
    console.error("handleLineWebhook error:", err);
    return res.status(200).send("ok");
  });
});

// app.post("/admin/stories/seed", express.json({ limit: "2mb" }), (req, res) => {
//   handleAdminStoriesSeed(req, res).catch((e) => bad(res, 500, String(e?.message ?? e)));
// });

// 2) JSON parser for other routes
app.use(express.json({ limit: "2mb" }));

app.get("/", (req, res) =>
  ok(res, {
    service: PROJECT,
    firestore_database_id: FIRESTORE_DATABASE_ID,
    routes: [
      "/health",
      "/transit?as_of=",
      "/stories/build?user_id=&as_of=&date_local=&save=",
      "/stories/rebuild?user_id=&from=&to=&time=&dry_run=",
      "/line/daily?user_id=&as_of=&save_story=",
      "/posts/x?as_of=&date_local=&user_id=",
      "/posts/ig?as_of=&date_local=",
      "/push?text=",
      "/line/webhook (POST raw)",
    ],
  })
);

app.get("/health", (req, res) => res.status(200).send("ok"));
app.get("/healthz", (req, res) => res.status(200).send("ok"));

// endpoints
app.get("/transit", (req, res) => handleTransit(req, res));
app.get("/stories/build", (req, res) => handleStoriesBuild(req, res));
app.get("/stories/rebuild", (req, res) => handleStoriesRebuild(req, res));
app.get("/line/daily", (req, res) => handleLineDaily(req, res));
app.get("/posts/x", (req, res) => handlePostsX(req, res));
app.get("/posts/ig", (req, res) => handlePostsIG(req, res));
app.get("/push", (req, res) => handlePushMe(req, res));

app.get("/debug/resetRegistration", (req, res) => {
  handleDebugResetRegistration(req, res).catch((err) => {
    console.error("debug/resetRegistration error:", err);
    return res.status(500).json({ ok: false, error: String(err?.message ?? err) });
  });
});



// fallback
app.use((req, res) => bad(res, 404, "not found", { path: req.path }));

// Functions Framework entry (Cloud Run: functions-framework CLIがlistenする)
functions.http("app", app);
