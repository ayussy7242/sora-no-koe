"use strict";

const path = require("path");
const { writeTextFile, writeJsonFile } = require("../shared/io");

function safeFilePart(value, fallback) {
  const s = String(value || "").trim();
  const cleaned = s.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

function writeLocalLineOutputs({ outDir, summary, items = [] } = {}) {
  const dir = outDir || path.join(process.cwd(), "tmp", "line", "output");
  const summaryPath = writeJsonFile({ outDir: dir, filename: "summary.json", data: summary || {}, space: 2 });
  const textPaths = [];
  (Array.isArray(items) ? items : []).forEach((item, idx) => {
    const base = item?.app_user_id || item?.line_user_id || `item_${idx + 1}`;
    const name = safeFilePart(base, `item_${idx + 1}`);
    const textPath = writeTextFile({ outDir: dir, filename: `${name}.txt`, content: item?.text || "" });
    if (textPath) textPaths.push(textPath);
  });
  return { dir, summary_path: summaryPath, text_paths: textPaths };
}

function buildOutboxItem({
  admin,
  env,
  dateLocal,
  runId,
  mode,
  appUserId,
  lineUserId,
  text,
  isPaid500,
  imageUrl,
  imagePath,
  asOfISO,
  orbMaxDeg,
  precisionDeg,
} = {}) {
  if (!admin) throw new Error("admin missing");
  return {
    app_user_id: appUserId,
    line_user_id: lineUserId,
    mode,
    text,
    text_len: String(text || "").length,
    is_paid_500: !!isPaid500,
    image_url: imageUrl || null,
    image_path: imagePath || null,
    prepared_at: admin.firestore.FieldValue.serverTimestamp(),
    // 運用・デバッグ用
    run_id: runId,
    meta: {
      job: "rebuild8",
      date_local: dateLocal,
      as_of_iso: asOfISO,
      orb_max_deg: orbMaxDeg,
      precision_deg: precisionDeg,
      schema_version: env?.SCHEMA_VERSION || null,
    },
  };
}

module.exports = {
  writeLocalLineOutputs,
  buildOutboxItem,
};
