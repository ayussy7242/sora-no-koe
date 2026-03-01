"use strict";

const { planetJa } = require("../render_parts/utils/line_ai_utils");
const { buildRetrogradeMap } = require("../astro/retrograde");

function formatDateLabel(dateLocal) {
  return String(dateLocal || "").replace(/-/g, ".");
}

function _glyphForBodyLocal(key) {
  const k = String(key || "").toLowerCase();
  const map = {
    sun: "☉",
    moon: "☽",
    mercury: "☿",
    venus: "♀",
    mars: "♂",
    jupiter: "♃",
    saturn: "♄",
    uranus: "♅",
    neptune: "♆",
    pluto: "♇",
    chiron: "⚷",
    lilith: "⚸",
    north_node: "☊",
    south_node: "☋",
  };
  return map[k] || "";
}

function _signJaLocal(dict, signKey) {
  const key = String(signKey || "").toLowerCase();
  if (!key) return "";
  return (
    dict?.SIGNS_V2?.signs?.[key]?.label_ja ||
    dict?.SIGNS?.signs?.[key]?.label_ja ||
    dict?.SIGNS_V1?.signs?.[key]?.label_ja ||
    ""
  );
}

function _normAspectKey(raw) {
  return String(raw || "").toLowerCase().trim();
}

function _aspectMetaFromDict(dict, key) {
  if (!key) return null;
  const v2 = dict?.ASPECTS_V2 || {};
  const v1 = dict?.ASPECTS_V1 || {};
  const pools = [v2.major, v2.deep_space, v2.craft_space, v1.major, v1.deep_space, v1.craft_space];
  for (const p of pools) {
    if (p && p[key]) return p[key];
  }
  return null;
}

function _aspectInfo(dict, rawType, aspectDeg) {
  const k = _normAspectKey(rawType);
  let meta = _aspectMetaFromDict(dict, k);

  if (!meta && Number.isFinite(Number(aspectDeg))) {
    const target = Number(aspectDeg);
    const v2 = dict?.ASPECTS_V2 || {};
    const v1 = dict?.ASPECTS_V1 || {};
    const pools = [v2.major, v2.deep_space, v2.craft_space, v1.major, v1.deep_space, v1.craft_space];
    for (const p of pools) {
      if (!p) continue;
      for (const v of Object.values(p)) {
        if (Number.isFinite(Number(v?.deg)) && Number(v.deg) === target) {
          meta = v;
          break;
        }
      }
      if (meta) break;
    }
  }

  return {
    label_ja: meta?.label_ja || "",
    deg: Number.isFinite(Number(meta?.deg)) ? Number(meta.deg) : null,
  };
}

function _formatElementModalityLines(summary) {
  const element = summary?.element || summary?.element_count || {};
  const modality = summary?.modality || summary?.modality_count || {};
  const hasElement =
    Number(element.fire || 0) + Number(element.earth || 0) + Number(element.air || 0) + Number(element.water || 0) > 0;
  const hasModality =
    Number(modality.cardinal || 0) + Number(modality.fixed || 0) + Number(modality.mutable || 0) > 0;

  if (!hasElement && !hasModality) return [];

  return [
    `🔥 火${Number(element.fire || 0)} 🪨 地${Number(element.earth || 0)} 💨 風${Number(element.air || 0)} 💧 水${Number(element.water || 0)}`,
    `🏃 活動${Number(modality.cardinal || 0)} 🧱 不動${Number(modality.fixed || 0)} 🌿 柔軟${Number(modality.mutable || 0)}`,
  ];
}

async function renderLine(story, deps = {}) {
  const dict = deps?.dict || require("../../dict");
  const includeHeader = deps?.includeHeader !== false;
  const includeSummary = deps?.includeSummary !== false;
  const dateLabel = formatDateLabel(story?.meta?.date_local);
  const asOfISO = story?.meta?.as_of || null;
  const header = `🌌 きょう｜${dateLabel}`;
  const subHeader = "わたしのほし×きょうのそら";

  const pool = Array.isArray(story?.personal?.touch_points_all)
    ? story.personal.touch_points_all
    : [];

  const picked = pool
    .filter((it) => Number.isFinite(Number(it?.orb_deg)))
    .filter((it) => Number(it.orb_deg) <= 6)
    .sort((a, b) => Number(a.orb_deg) - Number(b.orb_deg))
    .slice(0, 3);

  const lines = [];
  const tKeys = picked.map((it) => String(it?.transit_body || it?.b || "").toLowerCase()).filter(Boolean);
  const retroMap = buildRetrogradeMap(asOfISO, tKeys);
  if (includeHeader) lines.push(header, subHeader);

  if (!picked.length) {
    if (includeHeader) {
      lines.push("", "該当なし");
    } else {
      lines.push("該当なし");
    }
    return lines.join("\n").trim();
  }

  if (includeHeader) lines.push("");

  picked.forEach((it, i) => {
    const nKey = String(it?.natal_body_or_point || it?.natal_body || it?.a || "").toLowerCase();
    const tKey = String(it?.transit_body || it?.b || "").toLowerCase();
    const nSign = it?.natal_sign_ja || _signJaLocal(dict, it?.natal_sign_key || it?.natal_sign || "");
    const tSign = it?.transit_sign_ja || _signJaLocal(dict, it?.transit_sign_key || it?.transit_sign || "");
    const nLabel = planetJa(dict, nKey) || nKey;
    const tLabel = planetJa(dict, tKey) || tKey;
    const nGlyph = _glyphForBodyLocal(nKey);
    const tGlyph = _glyphForBodyLocal(tKey);
    const nSignText = nSign ? `（${nSign}）` : "";
    const tRetro = retroMap[tKey] ? "(R)" : "";
    const tLabelR = `${tLabel}${tRetro}`;
    const tSignText = tSign ? `（${tSign}）` : "";
    const line1 = `${i + 1}) (N) ${nGlyph ? `${nGlyph} ` : ""}${nLabel}${nSignText}`;
    const line1b = `   × (T) ${tGlyph ? `${tGlyph} ` : ""}${tLabelR}${tSignText}`;

    const aspectInfo = _aspectInfo(dict, it?.aspect || it?.type || it?.aspectType || it?.aspect_label_ja, it?.aspect_deg);
    const aspectLabel = aspectInfo?.label_ja || String(it?.aspect || it?.type || it?.aspectType || "");
    const aspectDeg = Number.isFinite(Number(it?.aspect_deg))
      ? Number(it.aspect_deg)
      : Number.isFinite(Number(aspectInfo?.deg))
        ? Number(aspectInfo.deg)
        : null;
    const degText = aspectDeg != null ? `${Math.round(aspectDeg)}°` : "";
    const orb = Number.isFinite(Number(it?.orb_deg)) ? Number(it.orb_deg) : null;
    const orbText = orb != null ? `${orb.toFixed(1)}` : "";
    const line2 = `${aspectLabel} ${degText}｜orb ${orbText}°`.trim();

    lines.push(line1, line1b, line2);
    if (i < picked.length - 1) lines.push("");
  });

  if (includeSummary) {
    const summary = story?.personal?.natal_summary || null;
    const distLines = _formatElementModalityLines(summary);
    if (distLines.length) {
      lines.push("", ...distLines);
    }
  }

  return lines.join("\n").trim();
}

module.exports = { renderLine };
