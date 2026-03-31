"use strict";

const { applyNormalizeRules } = require("./normalizers");
const { applyRepairRules } = require("./repair");
const { validateByPreset } = require("./validators");
const { extractJson, parseJsonWithRepair } = require("./json_utils");

function mergePreset(base = {}, overrides = {}) {
  const out = { ...base, ...overrides };
  const mergeNested = (key) => {
    if (base[key] || overrides[key]) {
      out[key] = { ...(base[key] || {}), ...(overrides[key] || {}) };
    }
  };
  mergeNested("sentenceCount");
  mergeNested("lineCount");
  mergeNested("questionCount");
  mergeNested("xFormat");
  mergeNested("hashtagRules");
  if (overrides.forbiddenTerms) out.forbiddenTerms = overrides.forbiddenTerms;
  if (overrides.forbiddenPatterns) out.forbiddenPatterns = overrides.forbiddenPatterns;
  if (overrides.forbiddenTermReasons) out.forbiddenTermReasons = overrides.forbiddenTermReasons;
  return out;
}

function shouldRetryForErrors(errors = []) {
  return errors.length > 0;
}

function runAiTextPipeline({ rawText, preset, overrides = {}, context = {} } = {}) {
  const mergedPreset = mergePreset(preset || {}, overrides || {});
  const normalizeRules = mergedPreset.normalizeRules || [];
  const repairRules = mergedPreset.repairRules || [];
  const normalized = applyNormalizeRules(rawText, normalizeRules, { preset: mergedPreset, context, xFormat: mergedPreset.xFormat });
  const repaired = applyRepairRules(normalized, repairRules, { preset: mergedPreset, context });

  let textForValidation = repaired;
  const errors = [];
  const meta = {};
  if (mergedPreset.outputType === "json") {
    const jsonText = extractJson(repaired);
    if (!jsonText) {
      errors.push({ code: "JSON_EXTRACT", message: "json extract failed", reason: "json_extract_failed", meta: {} });
    } else {
      const parsed = parseJsonWithRepair(jsonText);
      if (!parsed.ok) {
        errors.push({ code: "JSON_PARSE", message: parsed.error || "json_parse_failed", reason: "json_parse_failed", meta: {} });
      } else {
        meta.json = parsed.data;
        textForValidation = jsonText;
      }
    }
  }

  const verdict = validateByPreset(textForValidation, mergedPreset, { context });
  if (verdict.errors.length) {
    errors.push(...verdict.errors);
  }

  const ok = errors.length === 0;
  return {
    ok,
    text: textForValidation,
    meta: { ...verdict.meta, ...meta },
    errors,
    reason: errors[0]?.reason || verdict.reason || "",
    shouldRetry: shouldRetryForErrors(errors),
  };
}

module.exports = {
  runAiTextPipeline,
  mergePreset,
  shouldRetryForErrors,
};
