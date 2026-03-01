"use strict";

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

function _formatElementModalityLines(skyStrata) {
  const element = skyStrata?.element_count || {};
  const modality = skyStrata?.modality_count || {};
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

async function renderSoraLine(story, deps = {}) {
  const dict = deps?.dict || require("../../dict");
  const includeHeader = deps?.includeHeader !== false;
  const dateLabel = formatDateLabel(story?.meta?.date_local);
  const asOfISO = story?.meta?.as_of || null;

  const headerLine = `🌌 きょうのそら｜${dateLabel}`;
  const listTitleAll = "【配置一覧】";
  const listTitleAspect = "【今日の共鳴（最強）】";

  const pub = story?.public || {};
  const skyAll = Array.isArray(pub.sky_all) ? pub.sky_all : [];

  const bodyOrder = [
    "sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto","lilith","chiron",
  ];

  const transitSigns = pub.transit_signs || {};
  const retroMap = buildRetrogradeMap(asOfISO, bodyOrder);

  const bodyLines = bodyOrder.map((k) => {
    let signKey = transitSigns?.[k]?.sign_key || "";
    let signJa = transitSigns?.[k]?.sign_ja || "";
    if (!signJa && signKey) signJa = _signJaLocal(dict, signKey || "");
    signJa = String(signJa || "").trim();
    if (!signJa) return "";
    const retro = retroMap[k] ? "(R)" : "";
    const glyph = _glyphForBodyLocal(k);
    const bodyJa = (dict?.PLANETS_V2?.bodies?.[k]?.label_ja || dict?.POINTS_V1?.points?.[k]?.label_ja || k).toString();
    const bodyText = `${bodyJa}${retro}`;
    const prefix = glyph ? `${glyph} ` : "";
    return `${prefix}${bodyText}｜${signJa}`;
  }).filter(Boolean);

  const top1 = skyAll
    .filter((r) => Number.isFinite(Number(r?.orb_deg)))
    .filter((r) => Number(r?.orb_deg) <= 6)
    .sort((a, b) => Number(a.orb_deg) - Number(b.orb_deg))
    .slice(0, 1);

  const aspectLines = (() => {
    const item = top1[0] || null;
    if (!item) return ["該当なし"];
    const aKey = String(item?.a || "").toLowerCase();
    const bKey = String(item?.b || "").toLowerCase();
    const aSign = item?.a_sign_ja || _signJaLocal(dict, item?.a_sign_key || "");
    const bSign = item?.b_sign_ja || _signJaLocal(dict, item?.b_sign_key || "");
    const aGlyph = _glyphForBodyLocal(aKey);
    const bGlyph = _glyphForBodyLocal(bKey);
    const aLabel = dict?.PLANETS_V2?.bodies?.[aKey]?.label_ja || dict?.POINTS_V1?.points?.[aKey]?.label_ja || aKey;
    const bLabel = dict?.PLANETS_V2?.bodies?.[bKey]?.label_ja || dict?.POINTS_V1?.points?.[bKey]?.label_ja || bKey;
    const aRetro = retroMap[aKey] ? "(R)" : "";
    const bRetro = retroMap[bKey] ? "(R)" : "";
    const aLabelR = `${aLabel}${aRetro}`;
    const bLabelR = `${bLabel}${bRetro}`;
    const aSignText = aSign ? `（${aSign}）` : "";
    const bSignText = bSign ? `（${bSign}）` : "";
    const line1 = `(T) ${aGlyph ? `${aGlyph} ` : ""}${aLabelR}${aSignText} × (T) ${bGlyph ? `${bGlyph} ` : ""}${bLabelR}${bSignText}`;

    const aspectInfo = _aspectInfo(dict, item?.type || item?.aspT || item?.aspect, item?.aspect_deg);
    const aspectLabel = aspectInfo?.label_ja || String(item?.type || item?.aspT || item?.aspect || "");
    const aspectDeg = Number.isFinite(Number(item?.aspect_deg))
      ? Number(item.aspect_deg)
      : Number.isFinite(Number(aspectInfo?.deg))
        ? Number(aspectInfo.deg)
        : null;
    const degText = aspectDeg != null ? `${Math.round(aspectDeg)}°` : "";
    const orb = Number.isFinite(Number(item?.orb_deg)) ? Number(item.orb_deg) : null;
    const orbText = orb != null ? `${orb.toFixed(1)}` : "";
    const line2 = `${aspectLabel} ${degText}｜orb ${orbText}°`.trim();

    return [line1, line2];
  })();

  const distLines = _formatElementModalityLines(pub.sky_strata || story?.meta?.sky_strata || null);
  const sep = "─────────────";

  const lines = [];
  if (includeHeader) lines.push(headerLine, "");
  lines.push(
    listTitleAll,
    "",
    ...bodyLines,
    "",
    sep,
    "",
    listTitleAspect,
    "",
    ...aspectLines,
    "",
    ...distLines
  );

  return lines.filter((x) => x !== null && x !== undefined).join("\n").trim();
}

module.exports = { renderSoraLine };
