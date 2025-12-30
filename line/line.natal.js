"use strict";

/**
 * line.natal.js
 *
 * 🌌 ネイタル登録・計算・表示の完全管理レイヤー（修正版）
 * - geocoder が未注入でも落ちない
 * - jobs_natal_calc へ birth スナップショットを確実に詰める
 * - natal_cache の完成判定を堅く
 */

function createLineNatal({ db, admin, geocoder = null, renderers, config = {} }) {
  if (!db) throw new Error("db is required");
  if (!admin) throw new Error("admin is required");
  if (!renderers?.renderNatalListFromCache) {
    throw new Error("renderers.renderNatalListFromCache is required");
  }

  const DEFAULT_TZ = config.DEFAULT_TZ || "Asia/Tokyo";
  const MAX_LINE_TEXT = Number(config.MAX_LINE_TEXT || 4800);

  // --------------------
  // Firestore helpers
  // --------------------
  function serverNow() {
    return admin.firestore.FieldValue.serverTimestamp();
  }

  // --------------------
  // Natal stages
  // --------------------
  const NATAL_STAGE = Object.freeze({
    idle: "idle",
    birth_date: "birth_date",
    birth_time: "birth_time",
    birth_place: "birth_place",
    done: "done",
  });

  function getNatalStage(userDoc) {
    return userDoc?.natal?.collect?.stage || NATAL_STAGE.idle;
  }

  async function setNatalStage(appUserId, stage) {
    if (!appUserId) return;
    await db.collection("users").doc(appUserId).set(
      {
        updated_at: serverNow(),
        natal: {
          collect: {
            stage,
            updated_at: serverNow(),
            version: 1,
          },
        },
      },
      { merge: true }
    );
  }

  // --------------------
  // Reset (超重要)
  // --------------------
  async function resetNatal(appUserId) {
    if (!appUserId) return;

    await db.collection("users").doc(appUserId).set(
      {
        updated_at: serverNow(),
        natal: {
          enabled: false,
          collect: { stage: NATAL_STAGE.idle, updated_at: serverNow(), version: 1 },
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
        },
      },
      { merge: true }
    );

    // 🔥 キャッシュとジョブを必ず消す
    await db.collection("natal_cache").doc(appUserId).delete().catch(() => {});
    await db.collection("jobs_natal_calc").doc(appUserId).delete().catch(() => {});
  }

  // --------------------
  // Enqueue natal calc (固定ID)
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
      created_at: serverNow(),
      updated_at: serverNow(),
      app_user_id: appUserId,
      line_user_id: user?.channels?.line?.line_user_id || null,
      birth: {
        date_local: b.date_local ?? null,
        time_hm: b.time_hm ?? null,
        timezone: b.timezone ?? DEFAULT_TZ,
        lat: typeof b.lat === "number" ? b.lat : null,
        lon: typeof b.lon === "number" ? b.lon : null,
        place_text: b.place_text ?? null,
        place_formatted: b.place_formatted ?? null,
        place_id: b.place_id ?? null,
      },
    };

    // 🔒 docId = appUserId（増殖防止）
    await db.collection("jobs_natal_calc").doc(appUserId).set(job, { merge: true });
  }

  // --------------------
  // natal_cache 判定（最重要）
  // --------------------
  function isNatalCacheComplete(cache) {
    if (!cache || typeof cache !== "object") return false;

    const bodies = cache?.min?.bodies;
    const hasBodies = !!bodies && typeof bodies === "object" && Object.keys(bodies).length > 0;

    const houses = cache?.houses;
    const hasHouses = !!houses && typeof houses === "object" && Object.keys(houses).length >= 2; // ASC/MC想定

    return hasBodies && hasHouses;
  }

  // --------------------
  // 「わたしのほし」メイン処理
  // --------------------
  async function handleNatalList({ appUserId }) {
    if (!appUserId) {
      return {
        text: "個人版はLINEの中で紐づく設計だよ🌌\nまず「はじめる」で登録してね🕊️",
      };
    }

    const ref = db.collection("natal_cache").doc(appUserId);
    const snap = await ref.get();

    // ① キャッシュが無い → enqueue + needs_compute を立てておく（ワーカー側の判定と揃える）
    if (!snap.exists) {
      await ref.set({ needs_compute: true, updated_at: serverNow() }, { merge: true }).catch(() => {});
      await enqueueNatalCalcJob(appUserId);
      return {
        text: "ネイタル計算を開始したよ🌌\n少し後にもう一度「わたしのほし」って送ってね🕊️",
      };
    }

    const cache = snap.data() || {};

    // ② 計算中
    if (cache.needs_compute === true) {
      return {
        text: "ネイタル計算中みたい🌌\n少し後にもう一度「わたしのほし」って送ってね🕊️",
      };
    }

    // ③ 壊れている → 再計算
    if (!isNatalCacheComplete(cache)) {
      await ref.set({ needs_compute: true, updated_at: serverNow() }, { merge: true });
      await enqueueNatalCalcJob(appUserId);
      return {
        text: "ネイタル情報を整え直してるよ🌌\n少し後にもう一度「わたしのほし」って送ってね🕊️",
      };
    }

    // ④ 完成 → 表示
    const rendered = renderers.renderNatalListFromCache(cache) || "";
    const text = rendered.length > MAX_LINE_TEXT ? rendered.slice(0, MAX_LINE_TEXT) : rendered;

    return { text };
  }

  // --------------------
  // optional: geocoder health (routes側のdebug用に使える)
  // --------------------
  function hasGeocoder() {
    return !!geocoder && typeof geocoder.geocodePlace === "function";
  }

  // --------------------
  // public API
  // --------------------
  return {
    NATAL_STAGE,
    getNatalStage,
    setNatalStage,
    resetNatal,
    enqueueNatalCalcJob,
    handleNatalList,
    hasGeocoder,
    isNatalCacheComplete,
  };
}

module.exports = { createLineNatal };
