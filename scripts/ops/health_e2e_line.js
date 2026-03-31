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

function baseOrigin() {
  const base = env.BLUEPRINT_WORKER_URL || env.BLUEPRINT_GENERATE_URL;
  if (!base) throw new Error("BLUEPRINT_WORKER_URL missing");
  return new URL(base).origin;
}

async function fetchJson(url, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs || 12000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (_) {
      json = { raw: text };
    }
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

function pick(obj, key, fallback = null) {
  return obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : fallback;
}

function normalizeResult(name, ok, level, detail) {
  return { name, ok: !!ok, level: level || (ok ? "ok" : "fail"), detail: detail || "" };
}

function resultLine(r) {
  const head = r.level === "ok" ? "OK" : r.level === "warn" ? "WARN" : "FAIL";
  return `[${head}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`;
}

async function main() {
  const notify = toBool(getArg("notify") || process.env.E2E_NOTIFY);
  const ownerLineUserId = env.OWNER_LINE_USER_ID || process.env.OWNER_LINE_USER_ID || "";
  const ownerAppUserId = env.OWNER_APP_USER_ID || process.env.OWNER_APP_USER_ID || "";
  const debugToken = env.DEBUG_TOKEN || process.env.DEBUG_TOKEN || "";
  const internalToken = env.INTERNAL_TASKS_TOKEN || process.env.INTERNAL_TASKS_TOKEN || "";

  const origin = baseOrigin();
  const results = [];

  // 1) LINE health
  try {
    const url = new URL("/line/health", origin);
    const r = await fetchJson(url.toString());
    const j = r.json || {};
    const ok =
      r.ok &&
      pick(j, "ok") === true &&
      pick(j, "line_enabled") === true &&
      pick(j, "has_secret") === true &&
      pick(j, "has_token") === true;
    results.push(normalizeResult("line/health", ok, ok ? "ok" : "fail", r.ok ? "" : `http ${r.status}`));
  } catch (e) {
    results.push(normalizeResult("line/health", false, "fail", e?.message || String(e)));
  }

  // 2) Debug user (owner)
  if (ownerAppUserId && debugToken) {
    try {
      const url = new URL("/debug/user", origin);
      url.searchParams.set("token", debugToken);
      url.searchParams.set("app_user_id", ownerAppUserId);
      const r = await fetchJson(url.toString());
      const j = r.json || {};
      const hasUser = pick(j, "users_exists") === true;
      const hasCache = pick(j, "natal_cache_exists") === true;
      const needsCompute = pick(j?.natal_cache, "needs_compute");
      const hasBodies = !!pick(j?.natal_cache?.min, "bodies");
      const ok = r.ok && hasUser && hasCache && needsCompute !== true && hasBodies;
      const level = ok ? "ok" : hasUser && hasCache ? "warn" : "fail";
      const detail = ok
        ? ""
        : !hasUser
          ? "user missing"
          : !hasCache
            ? "natal_cache missing"
            : needsCompute === true
              ? "needs_compute"
              : !hasBodies
                ? "min.bodies missing"
                : "unknown";
      results.push(normalizeResult("debug/user", ok, level, detail));
    } catch (e) {
      results.push(normalizeResult("debug/user", false, "fail", e?.message || String(e)));
    }
  } else {
    results.push(normalizeResult("debug/user", true, "warn", "missing owner app id or debug token"));
  }

  // 3) Blueprint status (owner)
  if (ownerLineUserId && internalToken) {
    try {
      const url = new URL("/internal/blueprints/light/status", origin);
      url.searchParams.set("line_user_id", ownerLineUserId);
      const r = await fetchJson(url.toString(), {
        headers: { "x-internal-tasks-token": internalToken },
      });
      const j = r.json || {};
      const status = String(pick(j, "status") || "");
      const ok = r.ok && status === "done";
      const level = ok ? "ok" : status === "running" ? "warn" : "warn";
      results.push(normalizeResult("blueprint/status", ok, level, status || "unknown"));
    } catch (e) {
      results.push(normalizeResult("blueprint/status", false, "fail", e?.message || String(e)));
    }
  } else {
    results.push(normalizeResult("blueprint/status", true, "warn", "missing owner line id or internal token"));
  }

  const failed = results.filter((r) => r.level === "fail");
  const warned = results.filter((r) => r.level === "warn");
  const summaryLines = [
    "E2E health check",
    `Result: ${failed.length ? "FAIL" : warned.length ? "WARN" : "OK"}`,
    ...results.map(resultLine),
  ];

  console.log(summaryLines.join("\n"));

  if (notify && ownerLineUserId) {
    const lineApiClient = createLineApi({ accessToken: env.LINE_CHANNEL_ACCESS_TOKEN, maxText: env.MAX_LINE_TEXT });
    const payload = summaryLines.join("\n");
    await pushLineMessage({
      lineApiClient,
      to: ownerLineUserId,
      payload,
      maxText: env.MAX_LINE_TEXT,
      toSafeText,
      isNonEmptyText,
      meta: { kind: "e2e_health" },
    });
  }

  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error("[e2e] failed:", err?.message || String(err));
  process.exit(1);
});
