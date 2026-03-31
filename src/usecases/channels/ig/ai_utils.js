"use strict";

function resolveMaxRetries({ maxRetries, openaiMaxRetries, envKey = "IG_AI_MAX_RETRIES" } = {}) {
  const envRaw = process.env[envKey];
  const envNum = Number(envRaw);
  if (Number.isFinite(envNum)) return Math.max(0, envNum);

  const openaiNum = Number(openaiMaxRetries);
  if (Number.isFinite(openaiNum)) return Math.max(0, openaiNum);

  const base = Number(maxRetries);
  if (Number.isFinite(base)) return Math.max(0, base);

  return 0;
}

module.exports = { resolveMaxRetries };
