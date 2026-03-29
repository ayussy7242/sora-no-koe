"use strict";

const { createLineApi } = require("../../../../integrations/line/api");

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function sendIgStoryToLine({ env, lineUserId, payload, dryRun = false } = {}) {
  const accessToken = env?.LINE_CHANNEL_ACCESS_TOKEN || process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) throw new Error("LINE_CHANNEL_ACCESS_TOKEN missing");
  if (!lineUserId) throw new Error("line_user_id missing");

  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  if (!messages.length) return { ok: false, error: "messages empty" };

  if (dryRun) {
    return { ok: true, dry_run: true, sent: 0 };
  }

  const lineApi = createLineApi({ accessToken });
  const batches = chunkArray(messages, 5);
  for (const batch of batches) {
    await lineApi.pushMessages(lineUserId, batch);
  }
  return { ok: true, sent: messages.length };
}

module.exports = { sendIgStoryToLine };
