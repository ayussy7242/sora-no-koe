"use strict";

/**
 * line/user.js
 * 🌌 LINEユーザーと app_user_id の唯一の正本（STABLE）
 *
 * ✅ 方針（統一）
 * - line_users:
 *    - state: 登録フロー状態（pending_* / ready）
 *    - is_active: ブロック/解除状態（true/false）
 * - users:
 *    - app側のユーザー（statusは "active" でOK）
 *
 * ✅ 重要ルール
 * - getOrCreateAppUserId は state を勝手に変えない
 * - unfollow は is_active=false（stateは残す）
 * - 再フォロー/解除後は is_active=true（stateは保持）
 */

const crypto = require("crypto");
const {
  getLineUserState: getLineUserStateShared,
  setLineUserState: setLineUserStateShared,
} = require("./state");

function createLineUser({ db, admin, config = {} }) {
  if (!db) throw new Error("db is required");
  if (!admin) throw new Error("admin is required");

  const DEFAULT_TZ = config.DEFAULT_TZ || "Asia/Tokyo";
  const PROJECT = config.PROJECT || "sora-no-koe";
  const SCHEMA_VERSION = config.SCHEMA_VERSION || "1.0.0";

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

  function newAppUserId() {
    return `u_me_${crypto.randomBytes(10).toString("hex")}`;
  }

  function normalizeLineProfile(lineUserId, lineProfile, existingLineProfile) {
    return {
      display_name: lineProfile?.displayName ?? existingLineProfile?.display_name ?? null,
      language: lineProfile?.language ?? existingLineProfile?.language ?? "ja",
      picture_url: lineProfile?.pictureUrl ?? existingLineProfile?.picture_url ?? null,
      line_user_id: lineUserId,
    };
  }

  async function getOrCreateAppUserId({ lineUserId, lineProfile = null, eventType = "message" }) {
    if (!lineUserId) throw new Error("lineUserId is required");

    const lineRef = db.collection("line_users").doc(lineUserId);
    const now = serverNow();

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(lineRef);
      const existing = snap.exists ? snap.data() : null;

      const appUserId = existing?.app_user_id || newAppUserId();
      const userRef = db.collection("users").doc(appUserId);

      const mergedLineProfile = normalizeLineProfile(lineUserId, lineProfile, existing?.line_profile);

      // ---- users（アプリ側）
      tx.set(
        userRef,
        {
          status: "active",
          profile: {
            display_name: mergedLineProfile.display_name ?? existing?.profile?.display_name ?? null,
            timezone: existing?.profile?.timezone ?? DEFAULT_TZ,
          },
          channels: {
            line: { line_user_id: lineUserId, linked_at: existing?.channels?.line?.linked_at ?? now },
            email: null,
          },
          created_at: existing?.created_at ?? now,
          updated_at: now,
        },
        { merge: true }
      );

      // ---- line_users（LINE側）
      tx.set(
        lineRef,
        {
          line_user_id: lineUserId,
          app_user_id: appUserId,

          state: existing?.state ?? FLOW_STATE.PENDING_BIRTH_DATE,
          is_active: existing?.is_active ?? true,
          membership: {
            deep_mode: existing?.membership?.deep_mode ?? false,
            updated_at: existing?.membership?.updated_at ?? now,
          },

          created_at: existing?.created_at ?? now,
          updated_at: now,

          line_profile: mergedLineProfile,

          meta: {
            project: PROJECT,
            schema_version: SCHEMA_VERSION,
            last_event_type: eventType,
            last_seen_at: now,
          },

          consent: {
            profile: true,
            personal_data: existing?.consent?.personal_data ?? false,
            public_share: existing?.consent?.public_share ?? false,
            version: existing?.consent?.version ?? 1,
            agreed_at: existing?.consent?.agreed_at ?? null,
          },
        },
        { merge: true }
      );

      return appUserId;
    });
  }

  async function syncLineProfile({ lineUserId, lineProfile, eventType = "message" }) {
    if (!lineUserId || !lineProfile) return;

    await db.collection("line_users").doc(lineUserId).set(
      {
        updated_at: serverNow(),
        line_profile: normalizeLineProfile(lineUserId, lineProfile, null),
        meta: {
          project: PROJECT,
          schema_version: SCHEMA_VERSION,
          last_event_type: eventType,
          last_seen_at: serverNow(),
        },
        consent: { profile: true },
      },
      { merge: true }
    );
  }

  async function syncUserDisplayName(appUserId, displayName) {
    if (!appUserId || !displayName) return;

    await db.collection("users").doc(appUserId).set(
      {
        updated_at: serverNow(),
        status: "active",
        profile: { display_name: displayName, timezone: DEFAULT_TZ },
      },
      { merge: true }
    );
  }

  async function markInactiveLineUser(lineUserId) {
    if (!lineUserId) return;
    await db.collection("line_users").doc(lineUserId).set(
      {
        is_active: false,
        updated_at: serverNow(),
        meta: { last_event_type: "unfollow", last_seen_at: serverNow() },
      },
      { merge: true }
    );
  }

  async function getLineUserActive(lineUserId) {
    if (!lineUserId) return null;
    const snap = await db.collection("line_users").doc(lineUserId).get();
    if (!snap.exists) return null;
    const d = snap.data() || {};
    return typeof d.is_active === "boolean" ? d.is_active : null;
  }

  async function getLineUserDeepMode(lineUserId) {
    if (!lineUserId) return null;
    const snap = await db.collection("line_users").doc(lineUserId).get();
    if (!snap.exists) return null;
    const d = snap.data() || {};
    return typeof d?.membership?.deep_mode === "boolean" ? d.membership.deep_mode : null;
  }

  async function getLineUserState(lineUserId) {
    return getLineUserStateShared({ db, lineUserId });
  }

  async function setLineUserState(lineUserId, state) {
    return setLineUserStateShared({ db, admin, lineUserId, state, eventType: "state_update" });
  }

  async function reactivateLineUser(lineUserId, appUserId = null) {
    if (!lineUserId) return;
    const now = serverNow();

    const batch = db.batch();
    batch.set(
      db.collection("line_users").doc(lineUserId),
      {
        is_active: true,
        updated_at: now,
        meta: { last_event_type: "reactivate", last_seen_at: now },
      },
      { merge: true }
    );

    if (appUserId) {
      batch.set(db.collection("users").doc(appUserId), { status: "active", updated_at: now }, { merge: true });
    }
    await batch.commit();
  }

  return {
    FLOW_STATE,
    getOrCreateAppUserId,
    syncLineProfile,
    syncUserDisplayName,
    markInactiveLineUser,
    getLineUserActive,
    getLineUserDeepMode,
    getLineUserState,
    setLineUserState,
    reactivateLineUser,
  };
}

module.exports = { createLineUser };
