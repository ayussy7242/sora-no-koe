"use strict";

const { isYYYYMMDD } = require("../../utils/time");

function userStoryDocId(appUserId, dateLocal) {
  if (!appUserId) throw new Error("appUserId required");
  if (!isYYYYMMDD(dateLocal)) throw new Error("dateLocal must be YYYY-MM-DD");
  return `${appUserId}-${dateLocal}`;
}

function formatLocalHHmm(asOfISO, timeZone = "Asia/Tokyo") {
  const d = new Date(asOfISO);
  if (Number.isNaN(d.getTime())) return "00-00";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hh = parts.find((p) => p.type === "hour")?.value || "00";
  const mm = parts.find((p) => p.type === "minute")?.value || "00";
  return `${hh}-${mm}`;
}

function publicStorySnapshotDocId(dateLocal, asOfISO, { label = null } = {}) {
  if (!isYYYYMMDD(dateLocal)) throw new Error("dateLocal must be YYYY-MM-DD");
  const hhmm = formatLocalHHmm(asOfISO);
  const tag = label ? `-${String(label).replace(/\s+/g, "_")}` : "";
  return `public-${dateLocal}T${hhmm}${tag}`;
}

async function saveStoryDoc(db, docId, story, { merge = false } = {}) {
  if (!db) throw new Error("db required");
  if (!docId) throw new Error("docId required");
  if (!story) throw new Error("story required");

  const payload = JSON.parse(JSON.stringify(story));
  payload.meta = payload.meta && typeof payload.meta === "object" ? payload.meta : {};
  payload.meta.doc_id = docId;
  payload.meta.saved_at_utc = new Date().toISOString();

  await db.collection("stories").doc(docId).set(payload, { merge: !!merge });
  return payload;
}

async function buildPublicStorySnapshot({
  db,
  storyService,
  dateLocal,
  asOfISO,
  save = false,
  label = null,
  docId = null,
  throwOnSaveError = false,
} = {}) {
  if (!storyService?.buildStoryForUser) throw new Error("storyService.buildStoryForUser required");
  if (!isYYYYMMDD(dateLocal)) throw new Error("dateLocal must be YYYY-MM-DD");
  if (!asOfISO) throw new Error("asOfISO required");

  const story = await storyService.buildStoryForUser({
    appUserId: "public",
    mode: "public",
    dateLocal,
    asOfISO,
  });

  if (!save) {
    return { story, doc_id: null, saved: false };
  }

  if (!db) throw new Error("db required for snapshot save");
  const snapshotId = docId || publicStorySnapshotDocId(dateLocal, asOfISO, { label });

  story.meta = story.meta && typeof story.meta === "object" ? story.meta : {};
  story.meta.snapshot = {
    id: snapshotId,
    label: label || null,
    as_of_iso: asOfISO,
    date_local: dateLocal,
    generated_at_utc: new Date().toISOString(),
  };

  try {
    const saved = await saveStoryDoc(db, snapshotId, story, { merge: false });
    return { story: saved, doc_id: snapshotId, saved: true };
  } catch (e) {
    if (throwOnSaveError) throw e;
    story.meta = story.meta || {};
    story.meta.snapshot_error = e?.message || String(e);
    return { story, doc_id: snapshotId, saved: false, error: e?.message || String(e) };
  }
}

module.exports = {
  userStoryDocId,
  publicStorySnapshotDocId,
  saveStoryDoc,
  buildPublicStorySnapshot,
};
