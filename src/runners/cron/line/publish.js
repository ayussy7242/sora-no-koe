"use strict";

const { toSafeText, isNonEmptyText } = require("../cron_utils");

async function linePushText({ accessToken, to, text }) {
  if (!accessToken) throw new Error("LINE_CHANNEL_ACCESS_TOKEN missing");
  if (typeof fetch !== "function") throw new Error("fetch not available (Node18+ required)");
  if (!to) throw new Error("line_user_id missing");

  const safe = toSafeText(text, 4800);
  if (!isNonEmptyText(safe)) throw new Error("text empty");

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, messages: [{ type: "text", text: safe }] }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`LINE push error ${res.status} ${t}`);
  }
  return (await res.text().catch(() => "")) || null;
}

async function linePushImage({ accessToken, to, imageUrl, previewUrl }) {
  if (!accessToken) throw new Error("LINE_CHANNEL_ACCESS_TOKEN missing");
  if (typeof fetch !== "function") throw new Error("fetch not available (Node18+ required)");
  if (!to) throw new Error("line_user_id missing");
  if (!imageUrl) throw new Error("image_url missing");

  const originalContentUrl = String(imageUrl);
  const previewImageUrl = String(previewUrl || imageUrl);

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, messages: [{ type: "image", originalContentUrl, previewImageUrl }] }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`LINE push image error ${res.status} ${t}`);
  }
  return true;
}

async function writeDeliverySummary({ db, admin, env, dateLocal, runId, summary, mode, target }) {
  const ref = db.collection("posts_daily_delivery").doc(dateLocal);
  await ref.set(
    {
      meta: {
        project: env.PROJECT || null,
        timezone: env.DEFAULT_TZ || "Asia/Tokyo",
        schema_version: env.SCHEMA_VERSION || null,
        date_local: dateLocal,
        generated_at_utc: new Date().toISOString(),
        run_id: runId,
        job: "daily8",
        delivery_mode: mode, // today | sky
        target: target,      // all | owner
      },
      targets: summary.targets,
      last_error: summary.last_error || null,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function writePerUserResult({ db, admin, dateLocal, appUserId, payload }) {
  const ref = db.collection("posts_daily_delivery").doc(dateLocal).collection("deliveries").doc(appUserId);
  await ref.set(
    { app_user_id: appUserId, channel: "line", ...payload, updated_at: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
}

module.exports = {
  linePushText,
  linePushImage,
  writeDeliverySummary,
  writePerUserResult,
};
