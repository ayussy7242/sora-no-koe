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

function buildPhasePayload({ field, phase, eventType, admin }) {
  const now = serverNow(admin);
  return {
    [field]: phase,
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

async function getLineUserBlueprintPhase({ db, lineUserId } = {}) {
  if (!db || !lineUserId) return null;
  const snap = await db.collection("line_users").doc(lineUserId).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  return data.blueprint_phase || null;
}

async function getLineUserNatalPhase({ db, lineUserId } = {}) {
  if (!db || !lineUserId) return null;
  const snap = await db.collection("line_users").doc(lineUserId).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  return data.natal_phase || null;
}

async function setLineUserState({ db, admin, lineUserId, state, eventType = "state_update" }) {
  if (!db || !admin || !lineUserId || !state) return;
  const payload = buildStatePayload({ state, eventType, admin });
  await db.collection("line_users").doc(lineUserId).set(payload, { merge: true });
}

async function setLineUserBlueprintPhase({ db, admin, lineUserId, phase, eventType = "blueprint_phase_update" }) {
  if (!db || !admin || !lineUserId || !phase) return;
  const payload = buildPhasePayload({ field: "blueprint_phase", phase, eventType, admin });
  await db.collection("line_users").doc(lineUserId).set(payload, { merge: true });
}

async function setLineUserNatalPhase({ db, admin, lineUserId, phase, eventType = "natal_phase_update" }) {
  if (!db || !admin || !lineUserId || !phase) return;
  const payload = buildPhasePayload({ field: "natal_phase", phase, eventType, admin });
  await db.collection("line_users").doc(lineUserId).set(payload, { merge: true });
}

module.exports = {
  getLineUserBlueprintPhase,
  getLineUserNatalPhase,
  getLineUserState,
  setLineUserBlueprintPhase,
  setLineUserNatalPhase,
  setLineUserState,
};
