"use strict";

function mapAiContent(ai) {
  const sections = Array.isArray(ai?.sections) ? ai.sections : [];
  const pickSection = (id) => sections.find((s) => s?.id === id) || null;

  const summary = pickSection("summary");
  const summaryBlocks = Array.isArray(summary?.blocks) ? summary.blocks : [];
  const summaryOut = {
    element: summaryBlocks[0] ? { text: summaryBlocks[0].text || "" } : null,
    modality: summaryBlocks[1] ? { text: summaryBlocks[1].text || "" } : null,
    closing: null,
  };

  const bodies = pickSection("bodies");
  const bodyItems = Array.isArray(bodies?.items) ? bodies.items : [];
  const normalizeKey = (key) => String(key || "").trim().toLowerCase();
  const bodyTextByKey = new Map(bodyItems.map((i) => [normalizeKey(i?.key), i?.text]));

  const angles = pickSection("angles");
  const angleItems = Array.isArray(angles?.items) ? angles.items : [];
  const angleTextByKey = new Map(angleItems.map((i) => [normalizeKey(i?.key), i?.text]));

  const chiron = pickSection("chiron");
  const lilith = pickSection("lilith");

  const nodes = pickSection("nodes") || {};
  const nodeBlocks = Array.isArray(nodes?.blocks) ? nodes.blocks : [];
  const nodeText = {
    south:
      nodes?.south?.text ||
      nodes?.south ||
      nodeBlocks.find((b) => b?.key === "south")?.text ||
      nodeBlocks.find((b) => String(b?.subheading || "").includes("☋"))?.text ||
      nodeBlocks[0]?.text ||
      "",
    north:
      nodes?.north?.text ||
      nodes?.north ||
      nodeBlocks.find((b) => b?.key === "north")?.text ||
      nodeBlocks.find((b) => String(b?.subheading || "").includes("☊"))?.text ||
      nodeBlocks[1]?.text ||
      "",
  };

  summaryOut.closing = { text: (pickSection("closing_summary")?.text || pickSection("closing")?.text || "") };

  return {
    summary: summaryOut,
    bodyTextByKey,
    angleTextByKey,
    chironText: chiron?.text || "",
    lilithText: lilith?.text || "",
    nodeText,
    closingText:
      pickSection("closing_summary")?.text ||
      pickSection("closing")?.text ||
      "",
    footerEcho: ai?.footer?.echo || "",
  };
}

module.exports = {
  mapAiContent,
};
