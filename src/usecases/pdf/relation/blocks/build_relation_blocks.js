"use strict";

/**
 * Build page-agnostic relation blocks from an already-built relation view.
 * - Does NOT decide page placement.
 * - Does NOT render HTML/PDF.
 */

function parseAiLines(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const byLine = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (byLine.length > 1) return byLine;
  return raw
    .split(/[。！？]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.endsWith("。") ? s : `${s}。`));
}

function buildRelationBlocks({ view, derived } = {}) {
  if (!view) throw new Error("buildRelationBlocks: view required");
  const d = derived || {};
  const ai = view?.ai_texts || {};

  const top2 = (list) => (Array.isArray(list) ? list.slice(0, 2) : []);

  const comparePairsEnsured = Array.isArray(d?.comparePairsEnsured) ? d.comparePairsEnsured : [];
  const compareIndex = new Map(comparePairsEnsured.map((row) => [row?.body_key, row]));
  const pick = (keys) => keys.map((k) => compareIndex.get(k)).filter(Boolean);

  const axisRows = pick(["asc", "dc", "mc", "ic"]);
  const deepRows = pick(["north_node", "south_node", "lilith", "chiron"]);
  const axisLines = parseAiLines(ai.axis_compare_lines);
  const deepLines = parseAiLines(ai.deep_compare_lines);
  const personalLines = parseAiLines(ai.personal_items_lines);
  const socialLines = parseAiLines(ai.social_items_lines);

  const attachLine = (rows, lines) =>
    rows.map((row, idx) => (row ? { ...row, ai_text: lines[idx] || "" } : row)).filter(Boolean);

  const houseSections = Array.isArray(d?.houseSections) ? d.houseSections : [];
  const houseAB = houseSections?.[1] || null; // owner=A, guest=B => "B → A" or "A → B" depends on viewer order; page config decides label
  const houseBA = houseSections?.[0] || null;

  return {
    relation_type: {
      pattern: {
        key: d?.relationPattern?.key || "",
        name: d?.relationPattern?.name || "—",
        tags: [],
        evidence: Array.isArray(d?.relationPattern?.evidence) ? d.relationPattern.evidence : [],
      },
      ai_summary: ai.relation_type_text || "",
    },
    balance: {
      a: {
        element_count: view?.element_balance?.a?.element_count || {},
        modality_count: view?.modality_balance?.a?.modality_count || {},
        top_element: view?.element_balance?.a?.top_element || "",
        top_modality: view?.modality_balance?.a?.top_modality || "",
      },
      b: {
        element_count: view?.element_balance?.b?.element_count || {},
        modality_count: view?.modality_balance?.b?.modality_count || {},
        top_element: view?.element_balance?.b?.top_element || "",
        top_modality: view?.modality_balance?.b?.top_modality || "",
      },
      ai_summary: ai.element_modality_text || "",
    },
    center: {
      a_center: {},
      b_center: {},
      overlap: { label: d?.relationCenter?.shared_sign_label || "", line: ai.relation_center_overlap || d?.relationCenter?.overlap_line || "" },
      separation: { label: "", line: ai.relation_center_separation || (Array.isArray(d?.baseLines) ? d.baseLines[1] : "") || "" },
      flow: { label: d?.relationCenter?.direction_vector || "", line: ai.relation_center_flow || (Array.isArray(d?.baseLines) ? d.baseLines[2] : "") || "" },
      ai_summary: ai.relation_center || ai.relation_center_summary || "",
    },
    core: {
      main_axis: d?.relationCore?.main_axis || "",
      dominant_tension: d?.relationCore?.dominant_tension || "",
      dominant_flow: d?.relationCore?.dominant_flow || "",
      dominant_relation_type: d?.relationCore?.dominant_relation_type || "",
      links: Array.isArray(d?.coreList) ? d.coreList.slice(0, 3) : [],
      ai_summary: ai.relation_core || "",
    },
    flow_friction: {
      flow: top2(d?.flowList).map((c, i) => ({ connection: c, ai_summary: (parseAiLines(ai.flow_items_lines || "")[i] || "") })),
      friction: top2(d?.frictionList).map((c, i) => ({ connection: c, ai_summary: (parseAiLines(ai.friction_items_lines || "")[i] || "") })),
    },
    communication_attraction: {
      communication: top2(d?.commList).map((c, i) => ({ connection: c, ai_summary: (parseAiLines(ai.comm_items_lines || "")[i] || "") })),
      attraction: top2(d?.attractionList).map((c, i) => ({ connection: c, ai_summary: (parseAiLines(ai.attraction_items_lines || "")[i] || "") })),
    },
    bodies_personal: {
      items: pick(["sun", "moon", "mercury", "venus", "mars"]).map((row, idx) => ({ key: row.body_key, row, ai_summary: personalLines[idx] || "" })),
    },
    bodies_social: {
      items: pick(["jupiter", "saturn", "uranus", "neptune", "pluto"]).map((row, idx) => ({ key: row.body_key, row, ai_summary: socialLines[idx] || "" })),
    },
    axis_deep: {
      axis: {
        items: attachLine(axisRows, axisLines).map((row) => ({ key: row.body_key, row, ai_summary: row.ai_text || "" })),
        ai_summary: ai.axis_compare_text || "",
      },
      deep: {
        items: attachLine(deepRows, deepLines).map((row) => ({ key: row.body_key, row, ai_summary: row.ai_text || "" })),
        ai_summary: ai.deep_compare_text || "",
      },
    },
    house_ingress_ab: {
      heading: houseAB?.heading || "",
      items: Array.isArray(houseAB?.houses)
        ? houseAB.houses.map((h, idx) => ({ house: h.house, label: h.label, items: h.items || [], ai_summary: (houseAB.aiLines?.[idx] || "") }))
        : [],
    },
    house_ingress_ba: {
      heading: houseBA?.heading || "",
      items: Array.isArray(houseBA?.houses)
        ? houseBA.houses.map((h, idx) => ({ house: h.house, label: h.label, items: h.items || [], ai_summary: (houseBA.aiLines?.[idx] || "") }))
        : [],
    },
    pattern: {
      name: d?.relationPattern?.name || "—",
      evidence: Array.isArray(d?.relationPattern?.evidence) ? d.relationPattern.evidence : [],
      ai_summary: ai.relation_pattern || "",
      structure_summary: "",
    },
  };
}

module.exports = { buildRelationBlocks };
