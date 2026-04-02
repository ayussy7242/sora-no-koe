"use strict";

const { wrapParagraph, wrapSummaryText } = require("./text");

function buildFactLine(row) {
  if (!row?.meta?.sign_ja || !row?.label) return "";
  const deg = Number(row.meta?.deg);
  const sign = row.meta.sign_ja;
  const label = row.label;
  if (Number.isNaN(deg)) return `${sign}にある${label}。`;
  if (deg >= 29) return `最終度数にある${sign}の${label}。`;
  if (deg >= 20) return `${sign}の後半度数にある${label}。`;
  if (deg >= 10) return `${sign}の中盤の位置で、${label}が立つ。`;
  return `始まりの度数にある${sign}の${label}。`;
}

function prependFactLine(text, factLine) {
  const body = String(text || "").trim();
  if (!factLine) return body;
  if (body.startsWith(factLine)) return body;
  return body ? `${factLine}\n${body}` : factLine;
}

function stripLeadingLine(text, line) {
  const body = String(text || "").trim();
  const target = String(line || "").trim();
  if (!body || !target) return body;
  const lines = body.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return body;
  if (lines[0] !== target) return body;
  const stripped = lines.slice(1).join("\n").trim();
  return stripped || body;
}

function stripLeadingAny(text, linesToStrip) {
  let out = String(text || "").trim();
  if (!out) return out;
  (linesToStrip || []).forEach((line) => {
    out = stripLeadingLine(out, line);
  });
  return out;
}

function buildStructureLineForRow(row) {
  if (!row) return "";
  return buildFactLine(row);
}

function prependStructureLine(text, structureLine) {
  const body = String(text || "").trim();
  if (!structureLine) return body;
  if (body.startsWith(structureLine)) return body;
  return body ? `${structureLine}\n${body}` : structureLine;
}

function applyFactLinesToAiData(aiData, rowsMain, rowsExtra, rowsAngles) {
  if (!aiData || !Array.isArray(aiData.sections)) return aiData;
  const byId = new Map(aiData.sections.map((s) => [s?.id, s]));
  const mainMap = new Map((rowsMain || []).map((row) => [row.key, row]));
  const extraMap = new Map((rowsExtra || []).map((row) => [row.key, row]));
  const angleMap = new Map((rowsAngles || []).map((row) => [row.key, row]));

  const bodies = byId.get("bodies");
  if (bodies && Array.isArray(bodies.items)) {
    bodies.items = bodies.items.map((item) => {
      const row = mainMap.get(item?.key);
      if (!row) return item;
      const factLine = buildFactLine(row);
      const cleaned = stripLeadingAny(item?.text, [factLine, item?.structure_line]);
      const text = wrapParagraph(cleaned, { maxLines: 6 });
      return {
        ...item,
        fact_line: factLine,
        text,
        structure_line: undefined,
      };
    });
  }

  const summary = byId.get("summary");
  if (summary && Array.isArray(summary.blocks)) {
    summary.blocks = summary.blocks.map((b) => {
      if (!b?.text) return b;
      return {
        ...b,
        text: wrapSummaryText(String(b?.text || ""), { maxLines: 10 }),
      };
    });
  }

  const chiron = byId.get("chiron");
  if (chiron && extraMap.has("chiron")) {
    const row = extraMap.get("chiron");
    const factLine = buildFactLine(row);
    chiron.fact_line = factLine;
    chiron.text = wrapParagraph(stripLeadingAny(chiron?.text, [factLine, chiron?.structure_line]), { maxLines: 6 });
    delete chiron.structure_line;
  }
  const lilith = byId.get("lilith");
  if (lilith && extraMap.has("lilith")) {
    const row = extraMap.get("lilith");
    const factLine = buildFactLine(row);
    lilith.fact_line = factLine;
    lilith.text = wrapParagraph(stripLeadingAny(lilith?.text, [factLine, lilith?.structure_line]), { maxLines: 6 });
    delete lilith.structure_line;
  }

  const nodes = byId.get("nodes");
  if (nodes && nodes.south && extraMap.has("south_node")) {
    const row = extraMap.get("south_node");
    const factLine = buildFactLine(row);
    nodes.south = {
      ...nodes.south,
      fact_line: factLine,
      text: wrapParagraph(stripLeadingAny(nodes.south?.text, [factLine, nodes.south?.structure_line]), { maxLines: 6 }),
      structure_line: undefined,
    };
  }
  if (nodes && nodes.north && extraMap.has("north_node")) {
    const row = extraMap.get("north_node");
    const factLine = buildFactLine(row);
    nodes.north = {
      ...nodes.north,
      fact_line: factLine,
      text: wrapParagraph(stripLeadingAny(nodes.north?.text, [factLine, nodes.north?.structure_line]), { maxLines: 6 }),
      structure_line: undefined,
    };
  }

  const angles = byId.get("angles");
  if (angles && Array.isArray(angles.items)) {
    angles.items = angles.items.map((item) => {
      const row = angleMap.get(item?.key);
      if (!row) return item;
      const factLine = buildFactLine(row);
      const cleaned = stripLeadingAny(item?.text, [factLine, item?.structure_line]);
      const text = wrapParagraph(cleaned, { maxLines: 6 });
      return {
        ...item,
        fact_line: factLine,
        text,
        structure_line: undefined,
      };
    });
  }

  return aiData;
}

module.exports = {
  buildFactLine,
  prependFactLine,
  stripLeadingLine,
  stripLeadingAny,
  buildStructureLineForRow,
  prependStructureLine,
  applyFactLinesToAiData,
};
