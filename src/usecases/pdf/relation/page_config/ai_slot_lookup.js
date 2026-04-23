"use strict";

const { RELATION_PDF_PAGE_CONFIG } = require("./relation_pdf_page_config");

function flattenSlots() {
  return RELATION_PDF_PAGE_CONFIG.flatMap((page) =>
    (Array.isArray(page.ai_slots) ? page.ai_slots : []).map((slot) => ({
      page: page.page,
      pageKey: page.key,
      ...slot,
    }))
  );
}

const ALL_SLOTS = flattenSlots();

function buildGuidanceForAiInputKey(aiInputKey) {
  if (!aiInputKey) return null;
  const slots = ALL_SLOTS.filter((slot) => slot.ai_input_key === aiInputKey);
  if (!slots.length) return null;

  const first = slots[0];
  return {
    key: aiInputKey,
    page: first.page,
    pageKey: first.pageKey,
    source: first.source,
    role: first.role || "",
    rule: Array.from(new Set(slots.flatMap((slot) => Array.isArray(slot.rule) ? slot.rule : []))),
    output_kind: first.output_kind || "summary",
    item_count: Number.isFinite(Number(first.item_count)) ? Number(first.item_count) : null,
    slots: slots.map((slot) => ({
      slot: slot.slot,
      source: slot.source,
      role: slot.role || "",
      rule: Array.isArray(slot.rule) ? slot.rule : [],
      output_kind: slot.output_kind || "summary",
      item_count: Number.isFinite(Number(slot.item_count)) ? Number(slot.item_count) : null,
      required: !!slot.required,
      length: slot.length || null,
    })),
  };
}

module.exports = {
  buildGuidanceForAiInputKey,
};

