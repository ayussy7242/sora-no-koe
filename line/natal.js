"use strict";

/**
 * line/natal.js
 * 🌌 ネイタル登録・収集・計算・表示の完全管理
 *
 * ✅ やること
 * - stage: birth_date → birth_time → birth_place
 * - users.natal.birth に保存
 * - geo が取れたら finalize + enqueue job
 * - natal_list は natal_cache を見て表示/再計算
 */

const { isUnknown } = require("./intent");

function createLineNatal({ db, admin, geocoder = null, renderers, config = {} }) {
  if (!db) throw new Error("db is required");
  if (!admin) throw new Error("admin is required");
  if (!renderers?.renderNatalListFromCache) throw new Error("renderers.renderNatalListFromCache is required");

  const DEFAULT_TZ = config.DEFAULT_TZ || "Asia/Tokyo";
  const MAX_LINE_TEXT = Number(config.MAX_LINE_TEXT || 4800);

  // copy
  const TEXT = {
    START_NATAL:
      "個人版（あなたの回路）を登録するよ🌌\n\n" +
      "まずは【生年月日】を送ってね。\n" +
      "例：1990-07-24（または 19900724）\n\n" +
      "わからなければ「不明」でもOK。\n" +
      "やめるなら「やめる」",
    ASK_BIRTH_TIME:
      "次に【出生時刻】を送ってね。\n" +
      "例：12:18（24h）\n\n" +
      "わからなければ「不明」でもOK。",
    ASK_BIRTH_PLACE:
      "最後に【出生地】を送ってね。\n" +
      "例：札幌 / 横浜 / Shimizu, Hokkaido / Tono, Iwate\n\n" +
      "（場所は、緯度経度に変換して計算に使うよ）\n" +
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
      "これで「今日」を送ると、\n" +
      "空の配置＋あなたの回路で返るよ。\n\n" +
      "💫 毎朝8時のお届け（ネイタル登録済み）も対象になったよ📮",
    NATAL_PARTIAL_SKIP:
      "受け取ったよ🌌\n\n" +
      "いまの情報でも、あなた向けの返しは動く。\n" +
      "まず「今日」を送ってみて。\n\n" +
      "あとで整えたくなったら「はじめる」で上書きできるよ🕊️",
  };

  function serverNow() {
    return admin.firestore.FieldValue.serverTimestamp();
  }

  // --------------------
  // Stages
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
        natal: { collect: { stage, updated_at: serverNow(), version: 1 } },
      },
      { merge: true }
    );
  }

  async function getUserDoc(appUserId) {
    if (!appUserId) return null;
    const snap = await db.collection("users").doc(appUserId).get();
    return snap.exists ? snap.data() : null;
  }

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

    await db.collection("natal_cache").doc(appUserId).delete().catch(() => { });
    await enableDaily8OnRegistration({ db, admin, appUserId });

    await db.collection("jobs_natal_calc").doc(appUserId).delete().catch(() => { });
  }

  async function saveBirthDate(appUserId, dateLocalOrNull) {
    await db.collection("users").doc(appUserId).set(
      {
        updated_at: serverNow(),
        natal: { birth: { date_local: dateLocalOrNull, timezone: DEFAULT_TZ } },
      },
      { merge: true }
    );
  }

  async function saveBirthTime(appUserId, timeHmOrNull) {
    await db.collection("users").doc(appUserId).set(
      {
        updated_at: serverNow(),
        natal: { birth: { time_hm: timeHmOrNull, timezone: DEFAULT_TZ } },
      },
      { merge: true }
    );
  }

  async function saveBirthPlace(appUserId, { placeText, geo }) {
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

  async function finalizeNatal(appUserId) {
    await db.collection("users").doc(appUserId).set(
      {
        updated_at: serverNow(),
        status: "active",
        profile: { status: "active" },
        natal: {
          enabled: true,
          completed_at: serverNow(),
          collect: { stage: NATAL_STAGE.done, updated_at: serverNow(), version: 1 },
          delivery: { daily_8: true },
        },
      },
      { merge: true }
    );
  }

  // --------------------
  // parsers
  // --------------------
  function parseYYYYMMDD(text) {
    const t = String(text || "").trim();

    // 1990-07-24 / 1990/07/24 / 1990.07.24
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

    // 19900724
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
  // enqueue job (fixed docId)
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
      created_at: admin.firestore.Timestamp.now(), // orderBy用に即値
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

    // 正規
    const a = cache?.houses?.angles;
    let asc = Number(a?.ASC);
    let mc = Number(a?.MC);

    // フォールバック（top-level cusp）
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
      // まずそのまま
      const geo = await geocoder.geocodePlace(placeText);
      if (geo?.ok) return geo;
    } catch (_) { }

    // ちょい整形（雑に強く）
    const s = String(placeText || "").trim().replace(/\s+/g, " ");
    const variants = Array.from(
      new Set([
        s,
        s.replace(/　/g, " "),
        s.replace(/、/g, " "),
        `${s} Japan`,
        `${s} 日本`,
      ])
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
  // handle collect (stage progression)
  // --------------------
  async function handleCollect({ appUserId, rawText }) {
    if (!appUserId) return null;

    const userDoc = await getUserDoc(appUserId);
    const stage = getNatalStage(userDoc);

    // idle/done は何もしない（通常のintentへ）
    if (stage === NATAL_STAGE.idle || stage === NATAL_STAGE.done) return null;

    // birth_date
    if (stage === NATAL_STAGE.birth_date) {
      if (isUnknown(rawText)) {
        await saveBirthDate(appUserId, null);
        await setNatalStage(appUserId, NATAL_STAGE.birth_time);
        return { text: TEXT.ASK_BIRTH_TIME };
      }
      const d = parseYYYYMMDD(rawText);
      if (!d) return { text: TEXT.ERR_BIRTHDATE };

      await saveBirthDate(appUserId, d);
      await setNatalStage(appUserId, NATAL_STAGE.birth_time);
      return { text: TEXT.ASK_BIRTH_TIME };
    }

    // birth_time
    if (stage === NATAL_STAGE.birth_time) {
      if (isUnknown(rawText)) {
        await saveBirthTime(appUserId, null);
        await setNatalStage(appUserId, NATAL_STAGE.birth_place);
        return { text: TEXT.ASK_BIRTH_PLACE };
      }
      const hm = parseHHMM(rawText);
      if (!hm) return { text: TEXT.ERR_BIRTHTIME };

      await saveBirthTime(appUserId, hm);
      await setNatalStage(appUserId, NATAL_STAGE.birth_place);
      return { text: TEXT.ASK_BIRTH_PLACE };
    }

    // birth_place
    if (stage === NATAL_STAGE.birth_place) {
      if (isUnknown(rawText)) {
        await saveBirthPlace(appUserId, { placeText: null, geo: null });
        await enqueueNatalCalcJob(appUserId);
        await finalizeNatal(appUserId);
        return { text: TEXT.NATAL_PARTIAL_SKIP };
      }

      const placeText = String(rawText || "").trim();
      const geo = await geocodeBestEffort(placeText);

      await saveBirthPlace(appUserId, { placeText, geo });

      if (geo?.ok) {
        await finalizeNatal(appUserId);
        await enqueueNatalCalcJob(appUserId);
        return { text: TEXT.NATAL_DONE };
      }

      // geocode failed → もう一回書き方変える案内
      let reasonText =
        "場所が特定できなかったみたい🕊️\n" +
        "・市区町村だけ（例：遠野市）\n" +
        "・英語表記（例：Tono, Iwate）\n" +
        "・座標（例：39.33, 141.53）\n\n" +
        "どれかで再送するか、「不明」で進めるよ。";

      if (geo?.status === "NO_GEOCODER") {
        reasonText =
          "いまサーバー側に地図変換（geocoder）が入ってないっぽい🙏\n" +
          "開発者が直すやつ。\n\n" +
          "いまは「不明」で進んでもOKだよ。";
      }

      return {
        text: "受け取ったよ🌌\n出生地を“地図の座標”に整えようとしてるところ。\n\n" + reasonText,
      };
    }

    return null;
  }

  // --------------------
  // natal list
  // --------------------
  async function handleNatalList({ appUserId }) {
    if (!appUserId) {
      return { text: "個人版はLINEの中で紐づく設計だよ🌌\nまず「はじめる」で登録してね🕊️" };
    }

    const ref = db.collection("natal_cache").doc(appUserId);
    const snap = await ref.get();

    // no cache → mark + enqueue
    if (!snap.exists) {
      await ref.set({ needs_compute: true, updated_at: serverNow() }, { merge: true }).catch(() => { });
      await enqueueNatalCalcJob(appUserId);
      return { text: "ネイタル計算を開始したよ🌌\n少し後にもう一度「わたしのほし」って送ってね🕊️" };
    }

    const cache = snap.data() || {};

    // computing
    if (cache.needs_compute === true) {
      return { text: "ネイタル計算中みたい🌌\n少し後にもう一度「わたしのほし」って送ってね🕊️" };
    }

    // broken → recompute
    if (!isNatalCacheComplete(cache)) {
      await ref.set({ needs_compute: true, updated_at: serverNow() }, { merge: true });
      await enqueueNatalCalcJob(appUserId);
      return { text: "ネイタル情報を整え直してるよ🌌\n少し後にもう一度「わたしのほし」って送ってね🕊️" };
    }

    // render
    const rendered = renderers.renderNatalListFromCache(cache) || "";
    const text = rendered.length > MAX_LINE_TEXT ? rendered.slice(0, MAX_LINE_TEXT) : rendered;
    return { text };
  }

  async function enableDaily8OnRegistration({ db, admin, appUserId }) {
    if (!appUserId) return;
    await db.collection("users").doc(appUserId).set(
      {
        profile: { status: "active" },
        natal: {
          enabled: true,
          delivery: { daily_8: true },
        },
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  return {
    NATAL_STAGE,
    getNatalStage,
    setNatalStage,
    resetNatal,
    enqueueNatalCalcJob,
    isNatalCacheComplete,
    handleCollect,
    handleNatalList,
    enableDaily8OnRegistration
  };
}

module.exports = { createLineNatal };
