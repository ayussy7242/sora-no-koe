"use strict";

const { normalizeStoryArgs } = require("../../../usecases/story/args");
const { toSafeText } = require("../cron_utils");
const { buildDailyLineMessage } = require("../../../usecases/channels/line/daily_message");
const { getLineSubscription, isPaidLine500 } = require("../../../integrations/firebase/subscription");
const { buildAndStoreSoraWheel } = require("../../../engine/graphics/sora_wheel");

function isPaidAllowed(env, { appUserId, lineUserId }) {
  if (!env?.PAID_MODE_ENABLED) return true;
  if (env?.PAID_ALLOW_OWNER) {
    if (env.OWNER_LINE_USER_ID && lineUserId === env.OWNER_LINE_USER_ID) return true;
    if (env.OWNER_APP_USER_ID && appUserId === env.OWNER_APP_USER_ID) return true;
  }
  if (appUserId && env?.PAID_ALLOW_APP_USER_IDS?.includes(appUserId)) return true;
  if (lineUserId && env?.PAID_ALLOW_LINE_USER_IDS?.includes(lineUserId)) return true;
  return false;
}

async function getLineUserDeepMode(db, lineUserId) {
  if (!db || !lineUserId) return false;
  try {
    const snap = await db.collection("line_users").doc(lineUserId).get();
    if (!snap.exists) return false;
    const d = snap.data() || {};
    return d?.membership?.deep_mode === true;
  } catch (_) {
    return false;
  }
}

async function buildDailyLinePayload({
  db,
  env,
  storyService,
  storage,
  dict,
  dateLocal,
  appUserId,
  lineUserId,
  asOfISO,
  orbMaxDeg,
  precisionDeg,
  wheelExpireDays = 2,
  allowWheel = true,
  allowWheelWhenLocal = true,
  localOnly = false,
} = {}) {
  if (!storyService?.buildStoryForUser) throw new Error("storyService missing");
  const bucketName = env?.GCS_BUCKET_SORA || env?.GCS_BUCKET_BLUEPRINTS || null;
  const asOf = asOfISO || new Date().toISOString();

  const story = await storyService.buildStoryForUser(
    normalizeStoryArgs({
      appUserId,
      mode: "auto",
      dateLocal,
      asOfISO: asOf,
      orbMaxDeg,
      precisionDeg,
    })
  );

  let paid = false;
  try {
    const sub = await getLineSubscription(db, lineUserId);
    paid = isPaidLine500(sub);
  } catch (_) {
    paid = false;
  }
  const allow = isPaidAllowed(env || {}, { appUserId, lineUserId });
  const isPaid500 = paid || allow;

  const deepMode = await getLineUserDeepMode(db, lineUserId);
  const text = toSafeText(await buildDailyLineMessage({ story, dict, isPaid500, deepMode }));

  let imageUrl = null;
  let imagePath = null;
  const wheelAllowed = allowWheel && isPaid500 && storage && bucketName && (allowWheelWhenLocal || !localOnly);
  if (wheelAllowed) {
    try {
      const wheel = await buildAndStoreSoraWheel({
        storage,
        bucketName,
        lineUserId,
        dateLocal,
        story,
        dateLabel: String(dateLocal || "").replace(/-/g, "."),
        expiresDays: wheelExpireDays,
      });
      if (wheel?.ok && wheel?.url) {
        imageUrl = wheel.url;
        imagePath = wheel.path || null;
      }
    } catch (_) {
      imageUrl = null;
      imagePath = null;
    }
  }

  return { text, isPaid500, imageUrl, imagePath };
}

module.exports = {
  buildDailyLinePayload,
  getLineUserDeepMode,
};
