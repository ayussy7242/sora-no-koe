"use strict";

/**
 * line/natal.js
 * 🌌 ネイタル登録・収集・計算・表示の統合管理（UNIFIED STABLE）
 *
 * ✅ 正本
 * - 登録ステート: line_users.state（pending_* / ready）
 * - birth保存: users/{appUserId}.natal.birth
 * - 計算結果: natal_cache/{appUserId}
 * - ジョブ: jobs_natal_calc/{appUserId}
 */

const { isunknown } = require("./intent");
const { LINE_COPY } = require("../../content/copy");
const { parseYYYYMMDD, parseHHMM } = require("../../utils/parse");

function createLineNatal({ db, admin, geocoder = null, renderers, config = {} }) {
  if (!db) throw new Error("db is required");
  if (!admin) throw new Error("admin is required");
  if (!renderers?.renderNatalListFromcache) throw new Error("renderers.renderNatalListFromcache is required");

  const env = config || {};
  const DEFAULT_TZ = config.DEFAULT_TZ || "Asia/Tokyo";
  const MAX_LINE_TEXT = Number(config.MAX_LINE_TEXT || 4800);

  const FLOW_STATE = Object.freeze({
    PENDING_BIRTH_DATE: "pending_birth_date",
    PENDING_BIRTH_TIME: "pending_birth_time",
    PENDING_BIRTH_PLACE: "pending_birth_place",
    QUEUED_NATAL_CALC: "queued_natal_calc",
    RUNNING_NATAL_CALC: "running_natal_calc",
    QUEUED_BLUEPRINT: "queued_blueprint",
    RUNNING_BLUEPRINT: "running_blueprint",
    BLUEPRINT_DONE: "blueprint_done",
    BLUEPRINT_FAILED: "blueprint_failed",
    READY: "ready",
  });

  function serverNow() {
    return admin.firestore.FieldValue.serverTimestamp();
  }

  // --------------------
  // state (line_users)
  // --------------------
  async function getLineState(lineUserId) {
    if (!lineUserId) return FLOW_STATE.READY;
    const snap = await db.collection("line_users").doc(lineUserId).get();
    if (!snap.exists) return FLOW_STATE.PENDING_BIRTH_DATE;
    return snap.data()?.state || FLOW_STATE.PENDING_BIRTH_DATE;
  }

  async function setLineState(lineUserId, state) {
    if (!lineUserId) return;
    await db.collection("line_users").doc(lineUserId).set(
      { state, updated_at: serverNow(), meta: { last_event_type: "natal_state", last_seen_at: serverNow() } },
      { merge: true }
    );
  }

  // --------------------
  // users birth save
  // --------------------
  async function saveBirthDate(appUserId, dateLocalOrNull) {
    if (!appUserId) return;
    await db.collection("users").doc(appUserId).set(
      { updated_at: serverNow(), natal: { birth: { date_local: dateLocalOrNull, timezone: DEFAULT_TZ } } },
      { merge: true }
    );
  }

  async function saveBirthTime(appUserId, timeHmOrNull) {
    if (!appUserId) return;
    await db.collection("users").doc(appUserId).set(
      { updated_at: serverNow(), natal: { birth: { time_hm: timeHmOrNull, timezone: DEFAULT_TZ } } },
      { merge: true }
    );
  }

  async function saveBirthPlace(appUserId, { placeText, geo }) {
    if (!appUserId) return;
    await db.collection("users").doc(appUserId).set(
      {
        updated_at: serverNow(),
        natal: {
          birth: {
            place_text: placeText ?? null,
            lat: geo?.ok ? geo.lat : null,
            lon: geo?.ok ? geo.lon : null,
            place_formatted: geo?.ok ? geo.formatted : null,
            place_id: geo?.ok ? geo.place_id : null,
            timezone: DEFAULT_TZ,
          },
        },
      },
      { merge: true }
    );
  }

  async function finalizeNatal(appUserId, lineUserId, { nextState = FLOW_STATE.READY } = {}) {
    // users側に「登録済み」フラグを持つ（storyServiceが参照してもよい）
    if (appUserId) {
      await db.collection("users").doc(appUserId).set(
        {
          updated_at: serverNow(),
          status: "active",
          natal: {
            enabled: true,
            completed_at: serverNow(),
            delivery: { daily_8: true },
          },
        },
        { merge: true }
      );
    }

    // line_users.state は READY
    if (lineUserId && nextState) await setLineState(lineUserId, nextState);
  }

  async function resetNatal(appUserId, lineUserId) {
    if (appUserId) {
      await db.collection("users").doc(appUserId).set(
        {
          updated_at: serverNow(),
          natal: {
            enabled: false,
            birth: {
              date_local: null,
              time_hm: null,
              place_text: null,
              lat: null,
              lon: null,
              place_formatted: null,
              place_id: null,
              timezone: DEFAULT_TZ,
            },
            delivery: { daily_8: false },
          },
        },
        { merge: true }
      );

      await db.collection("natal_cache").doc(appUserId).delete().catch(() => { });
      await db.collection("jobs_natal_calc").doc(appUserId).delete().catch(() => { });
    }

    if (lineUserId) await setLineState(lineUserId, FLOW_STATE.PENDING_BIRTH_DATE);
  }

  // --------------------
  // registration check
  // --------------------
  async function hasNatal(appUserId) {
    if (!appUserId) return false;
    const snap = await db.collection("users").doc(appUserId).get();
    if (!snap.exists) return false;
    const data = snap.data() || {};
    if (data?.natal?.enabled) return true;
    const birth = data?.natal?.birth || {};
    const hasDate = !!birth?.date_local;
    const hasTime = !!birth?.time_hm;
    const hasGeo = Number.isFinite(birth?.lat) && Number.isFinite(birth?.lon);
    return !!(hasDate && hasTime && hasGeo);
  }

  async function isNatalReady(appUserId) {
    if (!appUserId) return false;
    const snap = await db.collection("natal_cache").doc(appUserId).get();
    if (!snap.exists) return false;
    const cache = snap.data() || {};
    if (cache.needs_compute === true) return false;
    return isNatalCacheComplete(cache);
  }

  // --------------------
  // parsers
  // --------------------
  // --------------------
  // enqueue job (docId fixed = appUserId)
  // --------------------
  async function enqueueNatalCalcJob(appUserId) {
    if (!appUserId) return;

    const userSnap = await db.collection("users").doc(appUserId).get();
    if (!userSnap.exists) return;

    const user = userSnap.data() || {};
    const b = user?.natal?.birth || {};

    const job = {
      status: "queued",
      attempts: 0,
      created_at: admin.firestore.Timestamp.now(),
      updated_at: serverNow(),
      app_user_id: appUserId,
      birth: {
        date_local: b.date_local || null,
        time_hm: b.time_hm || null,
        timezone: b.timezone || DEFAULT_TZ,
        lat: typeof b.lat === "number" ? b.lat : null,
        lon: typeof b.lon === "number" ? b.lon : null,
        place_text: b.place_text || null,
        place_formatted: b.place_formatted || null,
        place_id: b.place_id || null,
      },
    };

    await db.collection("jobs_natal_calc").doc(appUserId).set(job, { merge: true });
  }

  // --------------------
  // natal_cache complete check
  // --------------------
  function isNatalCacheComplete(cache) {
    if (!cache || typeof cache !== "object") return false;

    const bodies = cache?.min?.bodies || cache?.min?.natal_positions;
    const hasBodies = !!bodies && typeof bodies === "object" && Object.keys(bodies).length > 0;

    const a = cache?.houses?.angles;
    let asc = Number(a?.asc);
    let mc = Number(a?.mc);

    if (!Number.isFinite(asc)) asc = Number(cache?.["1"] ?? cache?.[1]);
    if (!Number.isFinite(mc)) mc = Number(cache?.["10"] ?? cache?.[10]);

    const hasAngles =
      Number.isFinite(asc) && asc >= 0 && asc < 360 &&
      Number.isFinite(mc) && mc >= 0 && mc < 360 &&
      Math.abs(asc - mc) > 1e-9;

    return hasBodies && hasAngles;
  }

  // --------------------
  // geocode best effort
  // --------------------
  async function geocodeBestEffort(placeText) {
    if (!geocoder || typeof geocoder.geocodePlace !== "function") {
      return { ok: false, status: "NO_GEOCODER", reason: "geocoder not injected", candidates: [] };
    }
    try {
      const geo = await geocoder.geocodePlace(placeText);
      if (geo?.ok) return geo;
    } catch (_) { }

    const s = String(placeText || "").trim().replace(/\s+/g, " ");
    const variants = Array.from(
      new Set([s, s.replace(/　/g, " "), s.replace(/、/g, " "), `${s} Japan`, `${s} 日本`])
    );

    for (const q of variants) {
      try {
        const geo = await geocoder.geocodePlace(q);
        if (geo?.ok) return geo;
      } catch (_) { }
    }

    return { ok: false, status: "ZERO_RESULTS", reason: "not found", candidates: [] };
  }

  // --------------------
  // handle collect (state progression)
  // --------------------
  async function handleCollect({ lineUserId, appUserId, rawText }) {
    if (!lineUserId || !appUserId) return null;

    const state = await getLineState(lineUserId);

    // 収集中以外は通常処理へ
    if (
      state !== FLOW_STATE.PENDING_BIRTH_DATE &&
      state !== FLOW_STATE.PENDING_BIRTH_TIME &&
      state !== FLOW_STATE.PENDING_BIRTH_PLACE
    ) {
      return null;
    }

    // pending_birth_date
    if (state === FLOW_STATE.PENDING_BIRTH_DATE) {
      if (isunknown(rawText)) {
        await saveBirthDate(appUserId, null);
        await setLineState(lineUserId, FLOW_STATE.PENDING_BIRTH_TIME);
        return { text: LINE_COPY.ASK_BIRTH_TIME };
      }
      const d = parseYYYYMMDD(rawText);
      if (!d) return { text: LINE_COPY.ERR_BIRTHDATE };

      await saveBirthDate(appUserId, d);
      await setLineState(lineUserId, FLOW_STATE.PENDING_BIRTH_TIME);
      return { text: LINE_COPY.ASK_BIRTH_TIME };
    }

    // pending_birth_time
    if (state === FLOW_STATE.PENDING_BIRTH_TIME) {
      if (isunknown(rawText)) {
        await saveBirthTime(appUserId, null);
        await setLineState(lineUserId, FLOW_STATE.PENDING_BIRTH_PLACE);
        return { text: LINE_COPY.ASK_BIRTH_PLACE };
      }
      const hm = parseHHMM(rawText);
      if (!hm) return { text: LINE_COPY.ERR_BIRTHTIME };

      await saveBirthTime(appUserId, hm);
      await setLineState(lineUserId, FLOW_STATE.PENDING_BIRTH_PLACE);
      return { text: LINE_COPY.ASK_BIRTH_PLACE };
    }

    // pending_birth_place
    if (state === FLOW_STATE.PENDING_BIRTH_PLACE) {
      if (isunknown(rawText)) {
        await saveBirthPlace(appUserId, { placeText: null, geo: null });
        await enqueueNatalCalcJob(appUserId);
        await finalizeNatal(appUserId, lineUserId, { nextState: FLOW_STATE.QUEUED_NATAL_CALC });
        return { text: LINE_COPY.NATAL_RECEIVED || LINE_COPY.NATAL_DONE };
      }

      const placeText = String(rawText || "").trim();
      const geo = await geocodeBestEffort(placeText);

      await saveBirthPlace(appUserId, { placeText, geo });

      if (geo?.ok) {
        await enqueueNatalCalcJob(appUserId);
        await finalizeNatal(appUserId, lineUserId, { nextState: FLOW_STATE.QUEUED_NATAL_CALC });
        return { text: LINE_COPY.NATAL_RECEIVED || LINE_COPY.NATAL_DONE };
      }

      let reasonText = LINE_COPY.NATAL_PLACE_GEOCODE_FAIL_REASON;

      if (geo?.status === "NO_GEOCODER") {
        reasonText = LINE_COPY.NATAL_PLACE_GEOCODE_NO_GEOCODER_REASON;
      }

      return { text: LINE_COPY.NATAL_PLACE_GEOCODE_PREFIX + "\n" + reasonText };
    }

    return null;
  }

  // --------------------
  // natal list
  // --------------------
  async function handleNatalList({ appUserId }) {
    if (!appUserId) return { text: LINE_COPY.NATAL_LIST_NEED_LINK };

    const ref = db.collection("natal_cache").doc(appUserId);
    const snap = await ref.get();

    if (!snap.exists) {
      await ref.set({ needs_compute: true, updated_at: serverNow() }, { merge: true }).catch(() => { });
      await enqueueNatalCalcJob(appUserId);
      return { text: LINE_COPY.NATAL_LIST_START_CALC };
    }

    const cache = snap.data() || {};

    if (cache.needs_compute === true) {
      return { text: LINE_COPY.NATAL_LIST_CALC_RUNNING };
    }

    if (!isNatalCacheComplete(cache)) {
      await ref.set({ needs_compute: true, updated_at: serverNow() }, { merge: true });
      await enqueueNatalCalcJob(appUserId);
      return { text: LINE_COPY.NATAL_LIST_REPAIRING };
    }

    const rendered = renderers.renderNatalListFromcache(cache) || "";
    const text = rendered.length > MAX_LINE_TEXT ? rendered.slice(0, MAX_LINE_TEXT) : rendered;
    return { text };
  }

  return {
    FLOW_STATE,
    getLineState,
    setLineState,
    hasNatal,
    isNatalReady,
    resetNatal,
    enqueueNatalCalcJob,
    isNatalCacheComplete,
    handleCollect,
    handleNatalList,
    finalizeNatal,
  };
}

module.exports = { createLineNatal };
