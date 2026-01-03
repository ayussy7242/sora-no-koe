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

const { isUnknown } = require("./intent");

function createLineNatal({ db, admin, geocoder = null, renderers, config = {} }) {
  if (!db) throw new Error("db is required");
  if (!admin) throw new Error("admin is required");
  if (!renderers?.renderNatalListFromCache) throw new Error("renderers.renderNatalListFromCache is required");

  const DEFAULT_TZ = config.DEFAULT_TZ || "Asia/Tokyo";
  const MAX_LINE_TEXT = Number(config.MAX_LINE_TEXT || 4800);

  const FLOW_STATE = Object.freeze({
    PENDING_BIRTH_DATE: "pending_birth_date",
    PENDING_BIRTH_TIME: "pending_birth_time",
    PENDING_BIRTH_PLACE: "pending_birth_place",
    READY: "ready",
  });

  const TEXT = {
    START_NATAL:
      "個人版（あなたの回路）を登録するよ🌌\n\n" +
      "まずは【生年月日】を送ってね。\n" +
      "例：1990-07-24（または 19900724）\n\n" +
      "わからなければ「不明」でもOK。\n" +
      "やめたくなったら「やめる」でOK✨️",
    ASK_BIRTH_TIME:
      "次に【出生時刻】を送ってね。\n" +
      "例：12:18（24h）\n\n" +
      "わからなければ「不明」でもOK。",
    ASK_BIRTH_PLACE:
      "最後に【出生地】を送ってね。\n" +
      "例：東京 / 神奈川県横浜市 / Shimizu, Hokkaido / Tono, Iwate\n\n" +
      "（場所は緯度経度に変換して計算に使うよ）\n" +
      "わからなければ「不明」でもOK。",
    ERR_BIRTHDATE:
      "生年月日が読み取れなかった🙏\n" +
      "例：1990-07-24（または 19900724）\n" +
      "わからなければ「不明」でもOK。",
    ERR_BIRTHTIME:
      "出生時刻が読み取れなかった🙏\n" +
      "例：12:18\n" +
      "わからなければ「不明」でもOK。",
    NATAL_DONE:
      "登録できた🌌\n\n" +
      "「今日」→ 登録があれば personal が立ち上がる\n" +
      "「そら」→ 今日の空の構造\n" +
      "「わたしのほし」→ ネイタル一覧（ASC/MC含む）\n\n" +
      "💫 毎朝8時のお届け（登録済み）も対象になったよ📮",
    NATAL_PARTIAL_SKIP:
      "受け取ったよ🌌\n\n" +
      "いまの情報でも、個人版は動く。\n" +
      "出生地が不明の場合は、一部要素が簡略になることがある。\n\n" +
      "あとで整えたくなったら「はじめる」で上書きできるよ🕊️",
  };

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

  async function finalizeNatal(appUserId, lineUserId) {
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
    if (lineUserId) await setLineState(lineUserId, FLOW_STATE.READY);
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

      await db.collection("natal_cache").doc(appUserId).delete().catch(() => {});
      await db.collection("jobs_natal_calc").doc(appUserId).delete().catch(() => {});
    }

    if (lineUserId) await setLineState(lineUserId, FLOW_STATE.PENDING_BIRTH_DATE);
  }

  // --------------------
  // parsers
  // --------------------
  function parseYYYYMMDD(text) {
    const t = String(text || "").trim();

    const m1 = t.match(/(\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})/);
    if (m1) {
      const cand = String(m1[1]).trim().replace(/[\/\.]/g, "-");
      const mm = cand.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (!mm) return null;
      const y = mm[1];
      const mo = String(mm[2]).padStart(2, "0");
      const d = String(mm[3]).padStart(2, "0");
      const dateLocal = `${y}-${mo}-${d}`;
      const dt = new Date(`${dateLocal}T00:00:00.000Z`);
      if (Number.isNaN(dt.getTime())) return null;
      if (dt.toISOString().slice(0, 10) !== dateLocal) return null;
      return dateLocal;
    }

    const m2 = t.match(/(\d{8})/);
    if (m2) {
      const s = m2[1];
      const y = s.slice(0, 4);
      const mo = s.slice(4, 6);
      const d = s.slice(6, 8);
      const dateLocal = `${y}-${mo}-${d}`;
      const dt = new Date(`${dateLocal}T00:00:00.000Z`);
      if (Number.isNaN(dt.getTime())) return null;
      if (dt.toISOString().slice(0, 10) !== dateLocal) return null;
      return dateLocal;
    }

    return null;
  }

  function parseHHMM(text) {
    const t = String(text || "").trim();
    const m = t.match(/(\d{1,2})\s*[:：]\s*(\d{1,2})/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    if (hh < 0 || hh > 23) return null;
    if (mm < 0 || mm > 59) return null;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

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
    let asc = Number(a?.ASC);
    let mc = Number(a?.MC);

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
    } catch (_) {}

    const s = String(placeText || "").trim().replace(/\s+/g, " ");
    const variants = Array.from(
      new Set([s, s.replace(/　/g, " "), s.replace(/、/g, " "), `${s} Japan`, `${s} 日本`])
    );

    for (const q of variants) {
      try {
        const geo = await geocoder.geocodePlace(q);
        if (geo?.ok) return geo;
      } catch (_) {}
    }

    return { ok: false, status: "ZERO_RESULTS", reason: "not found", candidates: [] };
  }

  // --------------------
  // handle collect (state progression)
  // --------------------
  async function handleCollect({ lineUserId, appUserId, rawText }) {
    if (!lineUserId || !appUserId) return null;

    const state = await getLineState(lineUserId);

    // READY は通常処理へ
    if (state === FLOW_STATE.READY) return null;

    // pending_birth_date
    if (state === FLOW_STATE.PENDING_BIRTH_DATE) {
      if (isUnknown(rawText)) {
        await saveBirthDate(appUserId, null);
        await setLineState(lineUserId, FLOW_STATE.PENDING_BIRTH_TIME);
        return { text: TEXT.ASK_BIRTH_TIME };
      }
      const d = parseYYYYMMDD(rawText);
      if (!d) return { text: TEXT.ERR_BIRTHDATE };

      await saveBirthDate(appUserId, d);
      await setLineState(lineUserId, FLOW_STATE.PENDING_BIRTH_TIME);
      return { text: TEXT.ASK_BIRTH_TIME };
    }

    // pending_birth_time
    if (state === FLOW_STATE.PENDING_BIRTH_TIME) {
      if (isUnknown(rawText)) {
        await saveBirthTime(appUserId, null);
        await setLineState(lineUserId, FLOW_STATE.PENDING_BIRTH_PLACE);
        return { text: TEXT.ASK_BIRTH_PLACE };
      }
      const hm = parseHHMM(rawText);
      if (!hm) return { text: TEXT.ERR_BIRTHTIME };

      await saveBirthTime(appUserId, hm);
      await setLineState(lineUserId, FLOW_STATE.PENDING_BIRTH_PLACE);
      return { text: TEXT.ASK_BIRTH_PLACE };
    }

    // pending_birth_place
    if (state === FLOW_STATE.PENDING_BIRTH_PLACE) {
      if (isUnknown(rawText)) {
        await saveBirthPlace(appUserId, { placeText: null, geo: null });
        await enqueueNatalCalcJob(appUserId);
        await finalizeNatal(appUserId, lineUserId);
        return { text: TEXT.NATAL_PARTIAL_SKIP };
      }

      const placeText = String(rawText || "").trim();
      const geo = await geocodeBestEffort(placeText);

      await saveBirthPlace(appUserId, { placeText, geo });

      if (geo?.ok) {
        await enqueueNatalCalcJob(appUserId);
        await finalizeNatal(appUserId, lineUserId);
        return { text: TEXT.NATAL_DONE };
      }

      let reasonText =
        "場所が特定できなかったみたい🕊️\n" +
        "・市区町村だけ（例：遠野市）\n" +
        "・英語表記（例：Tono, Iwate）\n" +
        "・座標（例：39.33, 141.53）\n\n" +
        "書き方を変えるか、「不明」でも進める。";

      if (geo?.status === "NO_GEOCODER") {
        reasonText =
          "いまサーバー側に地図変換（geocoder）が入ってないっぽい🙏\n" +
          "開発者が直すやつ。\n\n" +
          "いまは「不明」で進んでもOK。";
      }

      return { text: "受け取ったよ🌌\n出生地を座標に整えようとしてる。\n\n" + reasonText };
    }

    return null;
  }

  // --------------------
  // natal list
  // --------------------
  async function handleNatalList({ appUserId }) {
    if (!appUserId) return { text: "個人版はLINEの中で紐づく設計だよ🌌\nまず「はじめる」" };

    const ref = db.collection("natal_cache").doc(appUserId);
    const snap = await ref.get();

    if (!snap.exists) {
      await ref.set({ needs_compute: true, updated_at: serverNow() }, { merge: true }).catch(() => {});
      await enqueueNatalCalcJob(appUserId);
      return { text: "ネイタル計算を開始したよ🌌\n完了すると一覧が出る。" };
    }

    const cache = snap.data() || {};

    if (cache.needs_compute === true) {
      return { text: "ネイタル計算中みたい🌌\n完了すると一覧が出る。" };
    }

    if (!isNatalCacheComplete(cache)) {
      await ref.set({ needs_compute: true, updated_at: serverNow() }, { merge: true });
      await enqueueNatalCalcJob(appUserId);
      return { text: "ネイタル情報を整え直してるよ🌌\n完了すると一覧が出る。" };
    }

    const rendered = renderers.renderNatalListFromCache(cache) || "";
    const text = rendered.length > MAX_LINE_TEXT ? rendered.slice(0, MAX_LINE_TEXT) : rendered;
    return { text };
  }

  return {
    FLOW_STATE,
    getLineState,
    setLineState,
    resetNatal,
    enqueueNatalCalcJob,
    isNatalCacheComplete,
    handleCollect,
    handleNatalList,
    finalizeNatal,
  };
}

module.exports = { createLineNatal };
