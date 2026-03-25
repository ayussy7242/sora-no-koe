"use strict";

const crypto = require("crypto");
const intent = require("./intent");
const { LINE_COPY } = require("../../content/copy");

function createLineRelation({ db, admin, relationService, geocoder = null, config = {} } = {}) {
  if (!db) throw new Error("line/relation: db required");
  if (!admin) throw new Error("line/relation: admin required");
  if (!relationService) throw new Error("line/relation: relationService required");

  const MAX_LIST = Number(config.RELATION_PICK_LIST_MAX || 10);
  const DEFAULT_TZ = config.DEFAULT_TZ || "Asia/Tokyo";
  const OWNER_APP_USER_ID = String(config.OWNER_APP_USER_ID || "").trim();
  const OWNER_LINE_USER_ID = String(config.OWNER_LINE_USER_ID || "").trim();

  function serverNow() {
    return admin.firestore.FieldValue.serverTimestamp();
  }

  async function getRelationState(lineUserId) {
    if (!lineUserId) return { state: null, payload: null };
    const snap = await db.collection("line_users").doc(lineUserId).get();
    if (!snap.exists) return { state: null, payload: null };
    const data = snap.data() || {};
    return {
      state: data?.relation_state || null,
      payload: data?.relation_payload || null,
    };
  }

  async function setRelationState(lineUserId, state, payload) {
    if (!lineUserId) return;
    await db.collection("line_users").doc(lineUserId).set(
      {
        relation_state: state || null,
        relation_payload: payload || null,
        updated_at: serverNow(),
        meta: { last_event_type: "relation_state", last_seen_at: serverNow() },
      },
      { merge: true }
    );
  }

  async function clearRelationState(lineUserId) {
    await setRelationState(lineUserId, null, null);
  }

  function normalizeDigits(text) {
    return String(text || "")
      .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0))
      .trim();
  }

  function parseSelectionIndex(text) {
    const t = normalizeDigits(text);
    const m = t.match(/(\d+)/);
    if (!m) return null;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.floor(n);
  }

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

  function isOwner({ appUserId, lineUserId }) {
    if (OWNER_APP_USER_ID && appUserId === OWNER_APP_USER_ID) return true;
    if (OWNER_LINE_USER_ID && lineUserId === OWNER_LINE_USER_ID) return true;
    return false;
  }

  function newRelationUserId() {
    return `u_rel_${crypto.randomBytes(10).toString("hex")}`;
  }

  async function loadUserDisplayName(appUserId) {
    if (!appUserId) return null;
    const snap = await db.collection("users").doc(appUserId).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    return (
      data?.profile?.display_name ||
      data?.display_name ||
      data?.channels?.line?.profile?.display_name ||
      null
    );
  }

  async function upsertRelationsIndex({ pairKey, aId, bId }) {
    if (!pairKey || !aId || !bId) return;
    const [nameA, nameB] = await Promise.all([
      loadUserDisplayName(aId),
      loadUserDisplayName(bId),
    ]);
    const now = serverNow();
    const base = { pair_key: pairKey, updated_at: now, status: null };
    const aDoc = { ...base, self_id: aId, other_id: bId, other_name: nameB || null };
    const bDoc = { ...base, self_id: bId, other_id: aId, other_name: nameA || null };
    const col = db.collection("relations_index");
    await Promise.all([
      col.doc(aId).collection("pairs").doc(pairKey).set(aDoc, { merge: true }),
      col.doc(bId).collection("pairs").doc(pairKey).set(bDoc, { merge: true }),
    ]);
  }

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

  function buildPickListText(pairs = []) {
    const rows = pairs.map((p, i) => {
      const name = p.other_name || p.other_id || p.pair_key || "-";
      return `${i + 1}. ${name}`;
    });
    return [
      LINE_COPY.RELATION_PICK_TITLE || "関係性のリストだよ",
      ...rows,
      LINE_COPY.RELATION_PICK_FOOTER || "番号で選んでね。",
    ].join("\n");
  }

  async function handleRelationSelection({ rawText, lineUserId, appUserId }) {
    if (!lineUserId || !appUserId) return null;
    const state = await getRelationState(lineUserId);
    if (state.state !== "awaiting_relation_choice") return null;

    const cmd = intent.normalizeForCommand(rawText);
    const intentKey = intent.intentFromcommand(cmd);
    if (intentKey === intent.INTENT.CANCEL) {
      await clearRelationState(lineUserId);
      return { text: LINE_COPY.RELATION_PICK_CANCEL || "キャンセルしたよ。", stage: "relation_pick_cancel" };
    }

    const idx = parseSelectionIndex(rawText);
    const list = Array.isArray(state.payload?.pairs) ? state.payload.pairs : [];
    if (!idx || idx > list.length) {
      return {
        text: LINE_COPY.RELATION_PICK_INVALID || "番号で選んでね。",
        stage: "relation_pick_invalid",
      };
    }

    const picked = list[idx - 1];
    if (!picked?.pair_key) {
      return { text: LINE_COPY.RELATION_PICK_INVALID || "番号で選んでね。", stage: "relation_pick_invalid" };
    }

    await clearRelationState(lineUserId);

    const result = await relationService.getOrCreateRelationPdf({ pairKey: picked.pair_key, viewerId: appUserId });
    if (!result?.ok || !result?.url) {
      return { text: LINE_COPY.RELATION_PDF_UNAVAILABLE || "いま関係性PDFの準備中だよ。", stage: "relation_pdf_failed" };
    }

    const templateMessage = {
      type: "template",
      altText: "相性PDFはこちら",
      template: {
        type: "buttons",
        title: "関係性PDF",
        text: "スマホ最適版",
        actions: [
          { type: "uri", label: "PDFを開く", uri: result.url },
        ],
      },
    };

    return { message: templateMessage, stage: "relation_pdf_ready" };
  }

  async function handleRelationRegisterCommand({ lineUserId, appUserId }) {
    if (!lineUserId || !appUserId) {
      return { text: LINE_COPY.BLUEPRINT_NEED_LINE || "この操作はLINEから使ってね。", stage: "relation_register_need_line" };
    }
    if (!isOwner({ appUserId, lineUserId })) {
      return { text: LINE_COPY.RELATION_REGISTER_OWNER_ONLY || "これはオーナー専用だよ。", stage: "relation_register_denied" };
    }
    await setRelationState(lineUserId, "relation_register_name", { owner_app_user_id: appUserId });
    return { text: LINE_COPY.RELATION_REGISTER_START || "相手の名前を送ってね。", stage: "relation_register_start" };
  }

  async function handleRelationRegisterStep({ rawText, lineUserId, appUserId }) {
    if (!lineUserId || !appUserId) return null;
    const state = await getRelationState(lineUserId);
    if (!state?.state || !String(state.state).startsWith("relation_register_")) return null;

    const cmd = intent.normalizeForCommand(rawText);
    const intentKey = intent.intentFromcommand(cmd);
    if (intentKey === intent.INTENT.CANCEL) {
      await clearRelationState(lineUserId);
      return { text: LINE_COPY.RELATION_REGISTER_CANCEL || "キャンセルしたよ。", stage: "relation_register_cancel" };
    }

    const payload = state.payload || {};

    if (state.state === "relation_register_name") {
      const name = String(rawText || "").trim();
      if (!name) {
        return { text: LINE_COPY.RELATION_REGISTER_NAME_INVALID || "名前を送ってね。", stage: "relation_register_name_invalid" };
      }
      await setRelationState(lineUserId, "relation_register_birth_date", { ...payload, name });
      return { text: LINE_COPY.RELATION_REGISTER_ASK_DATE || "生年月日を送ってね（例: 1990-01-23）", stage: "relation_register_ask_date" };
    }

    if (state.state === "relation_register_birth_date") {
      const dateLocal = parseYYYYMMDD(rawText);
      if (!dateLocal) {
        return { text: LINE_COPY.RELATION_REGISTER_DATE_INVALID || "日付の形式が違うみたい。", stage: "relation_register_date_invalid" };
      }
      await setRelationState(lineUserId, "relation_register_birth_time", { ...payload, date_local: dateLocal });
      return { text: LINE_COPY.RELATION_REGISTER_ASK_TIME || "出生時刻を送ってね（例: 14:35 / 不明なら「不明」）", stage: "relation_register_ask_time" };
    }

    if (state.state === "relation_register_birth_time") {
      let timeHm = null;
      if (intent.isunknown(rawText)) {
        timeHm = "12:00";
      } else {
        timeHm = parseHHMM(rawText);
      }
      if (!timeHm) {
        return { text: LINE_COPY.RELATION_REGISTER_TIME_INVALID || "時刻の形式が違うみたい。", stage: "relation_register_time_invalid" };
      }
      await setRelationState(lineUserId, "relation_register_birth_place", { ...payload, time_hm: timeHm });
      return { text: LINE_COPY.RELATION_REGISTER_ASK_PLACE || "出生地を送ってね（例: 東京 / 35.68,139.76）", stage: "relation_register_ask_place" };
    }

    if (state.state === "relation_register_birth_place") {
      const placeText = String(rawText || "").trim();
      if (!placeText) {
        return { text: LINE_COPY.RELATION_REGISTER_PLACE_INVALID || "出生地を送ってね。", stage: "relation_register_place_invalid" };
      }

      let geo = null;
      if (geocoder?.geocodePlace) {
        geo = await geocoder.geocodePlace(placeText, { language: "ja", region: "jp" });
      } else {
        geo = { ok: false, status: "NO_GEOCODER" };
      }

      if (!geo?.ok) {
        return { text: LINE_COPY.RELATION_REGISTER_PLACE_INVALID || "出生地がうまく取得できなかった。", stage: "relation_register_place_invalid" };
      }

      const partnerId = newRelationUserId();
      const ownerId = payload?.owner_app_user_id || appUserId;
      const relationName = payload?.name || "partner";

      const birth = {
        date_local: payload?.date_local || null,
        time_hm: payload?.time_hm || null,
        timezone: DEFAULT_TZ,
        lat: geo.lat,
        lon: geo.lon,
        place_text: placeText,
        place_formatted: geo.formatted || null,
        place_id: geo.place_id || null,
      };

      await db.collection("users").doc(partnerId).set(
        {
          status: "active",
          profile: { display_name: relationName, timezone: DEFAULT_TZ },
          channels: { line: null, email: null },
          created_at: serverNow(),
          updated_at: serverNow(),
          relation_owner_app_user_id: ownerId,
          natal: { enabled: true, birth },
        },
        { merge: true }
      );

      await enqueueNatalCalcJob(partnerId);

      const normalized = relationService.normalizePairKey(`${ownerId}__${partnerId}`);
      const pairKey = normalized?.pairKey || `${ownerId}__${partnerId}`;
      const memberIds = Array.isArray(normalized?.ids) && normalized.ids.length === 2
        ? { a_id: normalized.ids[0], b_id: normalized.ids[1] }
        : { a_id: ownerId, b_id: partnerId };

      await db.collection("relations_pairs").doc(pairKey).set(
        {
          pair_key: pairKey,
          members: memberIds,
          rules: {
            aspects_used: ["conjunction", "sextile", "square", "trine", "opposition"],
            orb_max_deg: 8,
          },
          status: { is_valid: false, missing: ["b_min_bodies"], reason: "natal_calc_pending" },
          schema_version: "1.1.0",
          updated_at: serverNow(),
        },
        { merge: true }
      );

      await upsertRelationsIndex({ pairKey, aId: ownerId, bId: partnerId });
      await clearRelationState(lineUserId);

      return {
        text: LINE_COPY.RELATION_REGISTER_DONE || "登録完了。計算が終わったら「ふたりの星」で開けるよ。",
        stage: "relation_register_done",
      };
    }

    return null;
  }

  async function handleRelationCommand({ lineUserId, appUserId }) {
    if (!lineUserId || !appUserId) return { text: LINE_COPY.BLUEPRINT_NEED_LINE || "この操作はLINEから使ってね。", stage: "relation_need_line" };

    const list = await relationService.listRelationsIndex({ appUserId, limit: MAX_LIST });
    if (!list.length) {
      return { text: LINE_COPY.RELATION_NO_PAIRS || "関係性リストがまだ無いみたい。", stage: "relation_no_pairs" };
    }

    if (list.length === 1) {
      const result = await relationService.getOrCreateRelationPdf({ pairKey: list[0].pair_key, viewerId: appUserId });
      if (!result?.ok || !result?.url) {
        return { text: LINE_COPY.RELATION_PDF_UNAVAILABLE || "いま関係性PDFの準備中だよ。", stage: "relation_pdf_failed" };
      }
      const templateMessage = {
        type: "template",
        altText: "相性PDFはこちら",
        template: {
          type: "buttons",
          title: "関係性PDF",
          text: "スマホ最適版",
          actions: [
            { type: "uri", label: "PDFを開く", uri: result.url },
          ],
        },
      };
      return { message: templateMessage, stage: "relation_pdf_ready" };
    }

    const pairs = list.map((p) => ({
      pair_key: p.pair_key || p.id,
      other_id: p.other_id || null,
      other_name: p.other_name || null,
    }));

    await setRelationState(lineUserId, "awaiting_relation_choice", { pairs });
    return { text: buildPickListText(pairs), stage: "relation_pick_list" };
  }

  return {
    handleRelationSelection,
    handleRelationRegisterCommand,
    handleRelationRegisterStep,
    handleRelationCommand,
    getRelationState,
    clearRelationState,
  };
}

module.exports = { createLineRelation };
