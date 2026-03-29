"use strict";

function serverNow(admin) {
  if (admin?.firestore?.FieldValue?.serverTimestamp) {
    return admin.firestore.FieldValue.serverTimestamp();
  }
  return new Date();
}

function buildStatePayload({ state, eventType, admin }) {
  const now = serverNow(admin);
  return {
    state,
    updated_at: now,
    meta: {
      last_event_type: eventType,
      last_seen_at: now,
    },
  };
}

async function getLineUserState({ db, lineUserId }) {
  if (!db || !lineUserId) return null;
  const snap = await db.collection("line_users").doc(lineUserId).get();
  if (!snap.exists) return null;
  return snap.data()?.state || null;
}

async function setLineUserState({ db, admin, lineUserId, state, eventType = "state_update" }) {
  if (!db || !admin || !lineUserId || !state) return;
  const payload = buildStatePayload({ state, eventType, admin });
  await db.collection("line_users").doc(lineUserId).set(payload, { merge: true });
}

module.exports = {
  getLineUserState,
  setLineUserState,
};
