"use strict";

function normalizeLength(length = null) {
  if (!length || typeof length !== "object") return null;
  return {
    min: Number.isFinite(Number(length.min)) ? Number(length.min) : null,
    max: Number.isFinite(Number(length.max)) ? Number(length.max) : null,
  };
}

function previewText(text = "", max = 120) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  return raw.length > max ? `${raw.slice(0, max)}...` : raw;
}

function itemLengths(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => Array.from(String(item || "")).length);
}

function buildWarnings(entry) {
  const warnings = [];
  const output = entry?.output || {};
  const guidance = entry?.guidance || {};
  const min = guidance?.length?.min;
  const outputLength = Number(output?.output_length || 0);
  const items = Array.isArray(output?.items) ? output.items : [];

  if (output?.item_count_ok === false) warnings.push("item_count_mismatch");
  if (entry?.output_kind === "lines" && items.some((item) => !String(item || "").trim())) warnings.push("empty_item");
  if (Number.isFinite(Number(min)) && outputLength > 0 && outputLength < Number(min) * 0.7) warnings.push("very_short_output");
  if (["flow_items_lines", "friction_items_lines", "personal_items_lines", "social_items_lines"].includes(entry?.key)) {
    warnings.push("possible_similarity_check_target");
  }

  return warnings;
}

function pickEntry(entries, key) {
  return entries.find((entry) => entry.key === key) || null;
}

function buildComparisonCard(entry) {
  if (!entry) return null;
  return {
    key: entry.key,
    role: entry.role,
    output_kind: entry.output_kind,
    item_count: entry.item_count,
    output_length: entry?.output?.output_length || 0,
    item_lengths: itemLengths(entry?.output?.items || []),
    text_preview: previewText(entry?.output?.raw_text || ""),
    items: entry?.output?.items || [],
    prompt_preview: previewText(entry?.prompt_preview || "", 220),
    warnings: entry?.warnings || [],
  };
}

function buildRelationAiDebugReport({ view } = {}) {
  const aiMeta = view?.ai_meta || {};
  const aiTexts = view?.ai_texts || {};

  const entries = Object.keys(aiMeta).sort().map((key) => {
    const meta = aiMeta[key] || {};
    const rawText = String(aiTexts[key] || "");
    const entry = {
      key,
      source: meta.source || null,
      role: meta.role || null,
      output_kind: meta.output_kind || null,
      item_count: Number.isFinite(Number(meta.item_count)) ? Number(meta.item_count) : null,
      generated_at: meta.generated_at || null,
      guidance: {
        rule_count: Array.isArray(meta?.slots) && meta.slots.length
          ? Array.from(new Set(meta.slots.flatMap((slot) => Array.isArray(slot.rule) ? slot.rule : []))).length
          : 0,
        length: normalizeLength(meta?.slots?.[0]?.length || null),
      },
      output: {
        output_length: Number.isFinite(Number(meta.output_length)) ? Number(meta.output_length) : Array.from(rawText).length,
        raw_text: rawText,
        items: Array.isArray(meta.items) ? meta.items : [],
        item_count_ok: typeof meta.item_count_ok === "boolean" ? meta.item_count_ok : null,
      },
      slots: Array.isArray(meta.slots) ? meta.slots.map((slot) => ({
        slot: slot.slot,
        source: slot.source,
        role: slot.role || "",
        output_kind: slot.output_kind || null,
        item_count: Number.isFinite(Number(slot.item_count)) ? Number(slot.item_count) : null,
        required: typeof slot.required === "boolean" ? slot.required : null,
        length: normalizeLength(slot.length),
      })) : [],
      prompt_preview: meta.prompt_preview || "",
    };
    entry.warnings = buildWarnings(entry);
    return entry;
  });

  const flowEntry = pickEntry(entries, "flow_items_lines");
  const frictionEntry = pickEntry(entries, "friction_items_lines");
  const personalEntry = pickEntry(entries, "personal_items_lines");
  const socialEntry = pickEntry(entries, "social_items_lines");
  const patternEntry = pickEntry(entries, "relation_pattern");

  const warnings = entries.flatMap((entry) =>
    (entry.warnings || []).map((warning) => ({
      key: entry.key,
      warning,
    }))
  );

  return {
    pair_key: view?.pair_key || null,
    updated_at: view?.updated_at || null,
    entry_count: entries.length,
    sections: {
      flow_vs_friction: {
        left: buildComparisonCard(flowEntry),
        right: buildComparisonCard(frictionEntry),
      },
      personal_vs_social: {
        left: buildComparisonCard(personalEntry),
        right: buildComparisonCard(socialEntry),
      },
      pattern_focus: patternEntry ? {
        key: patternEntry.key,
        source: patternEntry.source,
        role: patternEntry.role,
        output_length: patternEntry?.output?.output_length || 0,
        text: patternEntry?.output?.raw_text || "",
        text_preview: previewText(patternEntry?.output?.raw_text || "", 220),
        related_slots: Array.isArray(patternEntry.slots) ? patternEntry.slots.map((slot) => ({
          slot: slot.slot,
          source: slot.source,
          role: slot.role,
        })) : [],
        warnings: patternEntry.warnings || [],
      } : null,
    },
    warnings,
    entries,
  };
}

module.exports = {
  buildRelationAiDebugReport,
};
