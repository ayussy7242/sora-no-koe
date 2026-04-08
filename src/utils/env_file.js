"use strict";

const fs = require("fs");

function parseEnvLines(raw = "") {
  const out = {};
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = String(line || "").trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const idx = trimmed.indexOf("=");
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^\"|\"$/g, "");
    if (!key) return;
    out[key] = value;
  });
  return out;
}

function loadEnvFile(envPath, { override = false } = {}) {
  if (!envPath || !fs.existsSync(envPath)) return {};
  const raw = fs.readFileSync(envPath, "utf8");
  const parsed = parseEnvLines(raw);
  Object.entries(parsed).forEach(([key, value]) => {
    if (override || process.env[key] == null) {
      process.env[key] = value;
    }
  });
  return parsed;
}

function loadEnvChain(paths = [], opts = {}) {
  const merged = {};
  paths.forEach((p) => {
    const vars = loadEnvFile(p, opts);
    Object.assign(merged, vars);
  });
  return merged;
}

module.exports = {
  loadEnvFile,
  loadEnvChain,
};
