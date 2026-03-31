#!/usr/bin/env node
"use strict";

require("../_load_env");

const env = require("../../src/config/env");
const { createLineApi } = require("../../src/integrations/line/api");
const { pushLineMessage } = require("../../src/integrations/line/messaging");
const { toSafeText, isNonEmptyText } = require("../../src/integrations/line/webhook_utils");

function getArg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

function toBool(val) {
  if (val === true || val === 1) return true;
  if (val === false || val === 0) return false;
  const v = String(val || "").toLowerCase().trim();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

async function main() {
  const dryRun = toBool(getArg("dry_run") || process.env.DRY_RUN);
  const targetLineUserId =
    getArg("line_user_id") ||
    process.env.LINE_USER_ID ||
    process.env.LINE_USER_IDS ||
    "";
  const message =
    getArg("message") ||
    process.env.LINE_MESSAGE ||
    "";

  const targets = String(targetLineUserId)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!targets.length) throw new Error("line_user_id missing");
  if (!isNonEmptyText(message)) throw new Error("message missing");

  const lineToken = env.LINE_CHANNEL_ACCESS_TOKEN || process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!lineToken && !dryRun) throw new Error("LINE_CHANNEL_ACCESS_TOKEN missing");

  const lineApiClient = lineToken
    ? createLineApi({ accessToken: lineToken, maxText: env.MAX_LINE_TEXT })
    : null;

  const results = [];
  for (const to of targets) {
    if (dryRun) {
      results.push({ to, ok: true, dry_run: true });
      continue;
    }
    const result = await pushLineMessage({
      lineApiClient,
      to,
      payload: message,
      maxText: env.MAX_LINE_TEXT,
      toSafeText,
      isNonEmptyText,
      meta: { to },
    });
    results.push({ to, ...result });
  }

  console.log("[line:push] results:", results);
}

main().catch((err) => {
  console.error("[line:push] failed:", err?.message || String(err));
  process.exit(1);
});
