"use strict";

function isPaidLine500(sub) {
  if (!sub || typeof sub !== "object") return false;
  return sub.plan === "line_500" && sub.subscription_status === "active";
}

async function getLineSubscription(db, lineUserId) {
  if (!db || !lineUserId) return null;
  const ref = db.collection("line_subscriptions").doc(String(lineUserId));
  const snap = await ref.get();
  return snap.exists ? snap.data() : null;
}

module.exports = { isPaidLine500, getLineSubscription };
