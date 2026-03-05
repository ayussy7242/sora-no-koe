"use strict";

const { planetJa } = require("../../format/utils/line_ai_utils");
const { buildRetrogradeMap } = require("../../../domain/astro/retrograde");
const { SPEC } = require("../../../config/sora_spec");
const { scoreForAspect } = require("../../../domain/touch_point_scoring");
const { computeOrbStats } = require("../../../domain/aspect_stats");
const { normalizeBodyKey } = require("../../../domain/canonical");
const {
  formatDateLabel,
  glyphForBody,
  signJa,
  aspectInfo,
  formatElementModalityLines,
} = require("../../format/format/line_common");
const {
  scoreTouchPoints,
  sortScoredTouchPoints,
  dedupeTouchPoints,
} = require("../../../domain/touch_point_selection");

const FREE_EXCLUDED_BODY_KEYS = new Set([
  "vertex",
  "anti_vertex",
  "part_of_fortune",
  "east_point",
]);

async function renderLine(story, deps = {}) {
  const dict = deps?.dict || require("../../../content/dict");
  const includeHeader = deps?.includeHeader !== false;
  const includeSummary = deps?.includeSummary !== false;
  const isPaid = deps?.paid === true;
  const dateLabel = formatDateLabel(story?.meta?.date_local);
  const asOfISO = story?.meta?.as_of || null;
  const header = `🌌 ${dateLabel}`;
  const subHeader = "わたしのほし×きょうのそら";

  const poolAll = Array.isArray(story?.personal?.touch_points_all)
    ? story.personal.touch_points_all
    : [];
  const pool = isPaid
    ? poolAll
    : poolAll.filter((it) => {
        const nKey = normalizeBodyKey(it?.natal_body_or_point || it?.natal_body || it?.a || "");
        const tKey = normalizeBodyKey(it?.transit_body || it?.b || "");
        return !FREE_EXCLUDED_BODY_KEYS.has(nKey) && !FREE_EXCLUDED_BODY_KEYS.has(tKey);
      });

  const orbLimit = isPaid ? SPEC.orb.paid : SPEC.orb.free;
  const scored = scoreTouchPoints(pool, { orbLimit, scoreForAspect });
  const sorted = sortScoredTouchPoints(scored, { isPaid });
  const picked = dedupeTouchPoints(sorted, { max: isPaid ? null : 3 });

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

  if (isPaid && picked.length) {
    const stats = computeOrbStats(picked.map((it) => Number(it?.orb_deg)));
    lines.push(
      `件数 ${stats.count}`,
      `平均orb ${stats.avg.toFixed(1)}°｜最小 ${stats.min.toFixed(1)}°｜最大 ${stats.max.toFixed(1)}°`,
      `orb帯 0–1:${stats.bands["0-1"]} / 1–2:${stats.bands["1-2"]} / 2–3:${stats.bands["2-3"]}`,
      ""
    );
  }

  picked.forEach((it, i) => {
    const nKey = normalizeBodyKey(it?.natal_body_or_point || it?.natal_body || it?.a || "");
    const tKey = normalizeBodyKey(it?.transit_body || it?.b || "");
    const nSign = it?.natal_sign_ja || signJa(dict, it?.natal_sign_key || it?.natal_sign || "");
    const tSign = it?.transit_sign_ja || signJa(dict, it?.transit_sign_key || it?.transit_sign || "");
    const nLabel = planetJa(dict, nKey) || nKey;
    const tLabel = planetJa(dict, tKey) || tKey;
    const nGlyph = glyphForBody(nKey);
    const tGlyph = glyphForBody(tKey);
    const nSignText = nSign ? `（${nSign}）` : "";
    const tRetro = retroMap[tKey] ? SPEC.retro.suffix : "";
    const tLabelR = `${tLabel}${tRetro}`;
    const tSignText = tSign ? `（${tSign}）` : "";
    const line1 = `${i + 1}) (N) ${nGlyph ? `${nGlyph} ` : ""}${nLabel}${nSignText}`;
    const line1b = `   × (T) ${tGlyph ? `${tGlyph} ` : ""}${tLabelR}${tSignText}`;

    const aspect = aspectInfo(dict, it?.aspect || it?.type || it?.aspectType || it?.aspect_label_ja, it?.aspect_deg);
    const aspectLabel = aspect?.label_ja || String(it?.aspect || it?.type || it?.aspectType || "");
    const aspectDeg = Number.isFinite(Number(it?.aspect_deg))
      ? Number(it.aspect_deg)
      : Number.isFinite(Number(aspect?.deg))
        ? Number(aspect.deg)
        : null;
    const degText = aspectDeg != null ? `${Math.round(aspectDeg)}°` : "";
    const orb = Number.isFinite(Number(it?.orb_deg)) ? Number(it.orb_deg) : null;
    const orbText = orb != null ? `${orb.toFixed(1)}` : "";
    const line2 = `${aspectLabel} ${degText}`.trim();
    const line2b = orbText ? `orb ${orbText}°` : "";

    lines.push(line1, line1b, line2);
    if (line2b) lines.push(line2b);
    if (i < picked.length - 1) lines.push("");
  });

  if (includeSummary) {
    const summary = story?.personal?.natal_summary || null;
    const distLines = formatElementModalityLines(summary);
    if (distLines.length) {
      lines.push("", ...distLines);
    }
  }

  return lines.join("\n").trim();
}

module.exports = { renderLine };
