"use strict";

const dict = require("../../content/dict");
const { SPEC, resolveBlogResonanceOrbLimit } = require("../../config/sora_spec");
const { buildRetrogradeMap } = require("../../domain/astro/retrograde");
const {
  bodyGlyph,
  bodyLabelJa,
  signLabelJa,
} = require("../shared/text/tokens");
const {
  normalizeBodyKey,
  normalizeSignKey,
  normalizeAspectKey,
} = require("../../domain/canonical");
const { formatTodayMoonLines, buildNextMoonEvents, orderedMoonEvents, formatMoonEventDisplay } = require("../../domain/moon");
const {
  computeTokyoAscDeg,
  signIndexFromKey,
  houseNumberForSignIndex,
} = require("../../domain/astro/compute");
const { EXTENDED_PLANETS, DEEP_BODIES } = require("../../domain/astro/constants");

const BODY_ORDER = EXTENDED_PLANETS;

const RESONANCE_EXCLUDE_BODIES = new Set(DEEP_BODIES);

function aspectMeta(typeRaw, deg) {
  const key = normalizeAspectKey(typeRaw, deg);
  return (
    dict?.ASPECTS_V2?.major?.[key] ||
    dict?.ASPECTS_V2?.deep_space?.[key] ||
    dict?.ASPECTS_V2?.craft_space?.[key] ||
    null
  );
}

function aspectLabelJa(typeRaw, deg) {
  const key = normalizeAspectKey(typeRaw, deg);
  const meta = aspectMeta(typeRaw, deg);
  if (meta?.label_ja) return meta.label_ja;
  return key || String(typeRaw || "");
}

function formatElementCount(count = {}) {
  return `火${count.fire || 0} 地${count.earth || 0} 風${count.air || 0} 水${count.water || 0}`;
}

function formatModalityCount(count = {}) {
  return `活動${count.cardinal || 0} 不動${count.fixed || 0} 柔軟${count.mutable || 0}`;
}

function formatSignConcentration(counts = {}) {
  const entries = Object.entries(counts)
    .map(([k, v]) => [k, Number(v)])
    .filter(([k, v]) => k && Number.isFinite(v) && v > 0)
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
  if (!entries.length) return "";
  const top = entries.slice(0, 2).map(([k, v]) => {
    const label = signLabelJa(dict, k) || k;
    return `${label}${v}件`;
  });
  return top.join(" / ");
}

function formatPositionLine({ bodyKey, signKey, signJa, retro, lonDeg, houseNo }) {
  const glyph = bodyGlyph(bodyKey);
  const label = bodyLabelJa(dict, bodyKey) || bodyKey;
  const signLabel = formatSignDegree(signKey, signJa, lonDeg);
  const retroText = retro ? SPEC.retro.suffix : "";
  const left = `${glyph ? `${glyph} ` : ""}${label}${retroText}`.trim();
  const right = [
    signLabel ? `${signLabel}` : "",
    Number.isFinite(Number(houseNo)) ? `第${Number(houseNo)}ハウス` : "",
  ].filter(Boolean).join("｜");
  return right ? `${left}｜${right}`.trim() : `${left}`.trim();
}

function formatSignDegree(signKey, signJa, lonDeg) {
  const signLabel = signJa || signLabelJa(dict, signKey) || signKey || "";
  if (!Number.isFinite(Number(lonDeg))) return signLabel;
  const deg = ((Number(lonDeg) % 30) + 30) % 30;
  let degInt = Math.floor(deg + 1e-6);
  if (degInt >= 30) degInt = 29;
  return `${signLabel} ${degInt}°`.trim();
}

function formatAspectLine(item, retroMap = {}) {
  const aKey = normalizeBodyKey(item?.a || "");
  const bKey = normalizeBodyKey(item?.b || "");
  const aGlyph = bodyGlyph(aKey);
  const bGlyph = bodyGlyph(bKey);
  const aLabel = bodyLabelJa(dict, aKey) || aKey;
  const bLabel = bodyLabelJa(dict, bKey) || bKey;
  const aRetro = retroMap[aKey] ? SPEC.retro.suffix : "";
  const bRetro = retroMap[bKey] ? SPEC.retro.suffix : "";
  const aSign = item?.a_sign_ja || signLabelJa(dict, item?.a_sign_key || "");
  const bSign = item?.b_sign_ja || signLabelJa(dict, item?.b_sign_key || "");
  const aspectDeg = Number.isFinite(Number(item?.aspect_deg)) ? Number(item.aspect_deg) : null;
  const aspectLabel = aspectLabelJa(item?.type || item?.aspect, aspectDeg);
  const degText = aspectDeg != null ? `${Math.round(aspectDeg)}°` : "";
  const orb = Number.isFinite(Number(item?.orb_deg)) ? Number(item.orb_deg) : null;
  const orbText = orb != null ? `${orb.toFixed(1)}°` : "";

  const left = `${aGlyph ? `${aGlyph} ` : ""}${aLabel}${aRetro}`.trim();
  const right = `${bGlyph ? `${bGlyph} ` : ""}${bLabel}${bRetro}`.trim();
  const signTextA = aSign ? `（${aSign}）` : "";
  const signTextB = bSign ? `（${bSign}）` : "";
  const pair = `${left}${signTextA} × ${right}${signTextB}`.trim();
  const angle = [aspectLabel, degText].filter(Boolean).join(" ");
  const tail = [angle, orbText ? `orb ${orbText}` : ""].filter(Boolean).join("｜");
  return `${pair}｜${tail}`.trim();
}

function isResonanceExcluded(item) {
  const aKey = normalizeBodyKey(item?.a || "");
  const bKey = normalizeBodyKey(item?.b || "");
  return RESONANCE_EXCLUDE_BODIES.has(aKey) || RESONANCE_EXCLUDE_BODIES.has(bKey);
}

function formatResonanceHeading(item, retroMap = {}) {
  const aKey = normalizeBodyKey(item?.a || "");
  const bKey = normalizeBodyKey(item?.b || "");
  const aGlyph = bodyGlyph(aKey);
  const bGlyph = bodyGlyph(bKey);
  const aLabel = bodyLabelJa(dict, aKey) || aKey;
  const bLabel = bodyLabelJa(dict, bKey) || bKey;
  const aRetro = retroMap[aKey] ? SPEC.retro.suffix : "";
  const bRetro = retroMap[bKey] ? SPEC.retro.suffix : "";
  const aSign = item?.a_sign_ja || signLabelJa(dict, item?.a_sign_key || "");
  const bSign = item?.b_sign_ja || signLabelJa(dict, item?.b_sign_key || "");
  const aspectDeg = Number.isFinite(Number(item?.aspect_deg)) ? Number(item.aspect_deg) : null;
  const aspectLabel = aspectLabelJa(item?.type || item?.aspect, aspectDeg);
  const degText = aspectDeg != null ? `${Math.round(aspectDeg)}°` : "";

  const left = `${aGlyph ? `${aGlyph} ` : ""}${aLabel}${aRetro}`.trim();
  const right = `${bGlyph ? `${bGlyph} ` : ""}${bLabel}${bRetro}`.trim();
  const signTextA = aSign ? `（${aSign}）` : "";
  const signTextB = bSign ? `（${bSign}）` : "";
  const pair = `${left}${signTextA} × ${right}${signTextB}`.trim();
  const angle = [aspectLabel, degText].filter(Boolean).join(" ");
  if (!angle) return pair;
  return `${pair}｜ ${angle}`.trim();
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateJaMd(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const m = jst.getUTCMonth() + 1;
  const d = jst.getUTCDate();
  return `${m}月${d}日`;
}

function buildMoonBlockHtml({ story, asOfISO }) {
  const todayItems = formatTodayMoonLines({ asOfISO, story, dict }).lines || [];

  const events = buildNextMoonEvents(asOfISO, dict) || {};
  const ordered = orderedMoonEvents(events);

  const parts = [];
  parts.push("<h2>3｜🌙 本日の月</h2>");
  todayItems.forEach((line) => {
    parts.push(`<h3>${escapeHtml(line)}</h3>`);
    if (/^月齢/.test(line)) {
      parts.push("<br>");
    }
  });

  ordered.forEach((ev) => {
    const display = formatMoonEventDisplay(ev);
    if (!display?.line1) return;
    const sign = ev?.signJa && ev.signJa !== "—" ? ev.signJa : "";
    const dateMd = formatDateJaMd(ev.date);
    let desc = "";
    if (ev.kind === "new") {
      const signText = sign ? `、${sign}で` : "、";
      desc = dateMd ? `次の新月は${dateMd}${signText}迎えます。新しいサイクルの始まりを予感させます。` : "";
    } else if (ev.kind === "full") {
      const signText = sign ? `${sign}で` : "";
      desc = dateMd ? `${dateMd}には${signText}満月が訪れます。調和と美を意識する時期です。` : "";
    }
    parts.push(`<h3>${escapeHtml(display.line1)}</h3>`);
    if (display.line2) parts.push(`<h3>${escapeHtml(display.line2)}</h3>`);
    if (desc) parts.push(`<p>${escapeHtml(desc)}</p>`);
  });

  return parts.join("\n");
}

function houseNumberForSignKey(signKey, ascIndex) {
  if (!signKey || ascIndex == null) return null;
  const signIndex = signIndexFromKey(dict, signKey);
  if (!Number.isFinite(signIndex) || signIndex < 0) return null;
  return houseNumberForSignIndex(signIndex, ascIndex);
}

function buildBlogBlocks(story, opts = {}) {
  const pub = story?.public || {};
  const dateLocal = opts.dateLocal || story?.meta?.date_local || "";
  const asOfISO = story?.meta?.as_of || null;

  const transitSigns = pub.transit_signs || {};
  const retroMap = buildRetrogradeMap(asOfISO, BODY_ORDER);

  const ascDeg = asOfISO ? computeTokyoAscDeg(asOfISO) : null;
  const ascIndex = Number.isFinite(Number(ascDeg))
    ? Math.floor((((Number(ascDeg) % 360) + 360) % 360) / 30)
    : null;

  const positions = BODY_ORDER.map((key) => {
    const item = transitSigns[key];
    if (!item) return "";
    const signKey = normalizeSignKey(item?.sign_key || "");
    const houseNo = houseNumberForSignKey(signKey, ascIndex);
    return formatPositionLine({
      bodyKey: key,
      signKey,
      signJa: item?.sign_ja || "",
      lonDeg: item?.lon_deg,
      houseNo,
      retro: retroMap[key],
    });
  }).filter(Boolean);

  const skyAll = Array.isArray(pub.sky_all) ? [...pub.sky_all] : [];
  skyAll.sort((a, b) => (a?.orb_deg ?? 99) - (b?.orb_deg ?? 99));

  const resonanceOrbLimit = resolveBlogResonanceOrbLimit();
  const resonancePool = skyAll
    .filter((it) => Number(it?.orb_deg) <= resonanceOrbLimit)
    .filter((it) => !isResonanceExcluded(it));
  const resonanceItems = resonancePool.map((it) => formatResonanceHeading(it, retroMap)).filter(Boolean);
  const resonanceTop = resonanceItems.slice(0, 3);

  const leadAspect = resonancePool?.[0] || skyAll?.[0] || null;
  const leadAspectLine = leadAspect ? formatAspectLine(leadAspect, retroMap) : "";

  const strata = pub.sky_strata || {};
  const elements = formatElementCount(strata.element_count || {});
  const modalities = formatModalityCount(strata.modality_count || {});

  const signCounts = {};
  BODY_ORDER.forEach((key) => {
    const signKey = normalizeSignKey(transitSigns?.[key]?.sign_key || "");
    if (!signKey) return;
    signCounts[signKey] = (signCounts[signKey] || 0) + 1;
  });
  const signConcentration = formatSignConcentration(signCounts);

  const orbValues = resonancePool
    .map((it) => (Number.isFinite(Number(it?.orb_deg)) ? Number(it.orb_deg) : null))
    .filter((n) => n != null);
  const orbMin = orbValues.length ? Math.min(...orbValues) : null;
  const orbMax = orbValues.length ? Math.max(...orbValues) : null;

  const moonBlockHtml = buildMoonBlockHtml({ story, asOfISO });

  const blocks = [
    {
      id: "lead",
      title: "0｜今日の全体圧",
      facts: [
        dateLocal ? `日付: ${dateLocal}` : "",
        leadAspectLine ? `最接近: ${leadAspectLine}` : "",
        signConcentration ? `集中: ${signConcentration}` : "",
      ].filter(Boolean),
    },
    {
      id: "positions",
      title: "1｜きょうのソラの配置",
      facts: [`対象: トランジット（${positions.length}件）`],
      items: positions,
      itemsAsH3: true,
    },
    {
      id: "today_moon",
      title: "🌙 本日の月",
      render: "html",
      html: moonBlockHtml,
    },
    {
      id: "resonance",
      title: "2｜共鳴",
      facts: [
        `抽出: orb昇順（最大3件 / ${resonanceItems.length}件）`,
        orbMin != null && orbMax != null
          ? `orb範囲: ${orbMin.toFixed(2)}°〜${orbMax.toFixed(2)}°`
          : "",
      ].filter(Boolean),
      items: resonanceTop.length ? resonanceTop : ["近接角度は観測されていない"],
      itemsAsH3: true,
    },
    {
      id: "aftertaste",
      title: "8｜余韻",
      facts: [
        dateLocal ? `日付: ${dateLocal}` : "",
        resonanceTop.length ? `共鳴: ${resonanceTop.length}件` : "共鳴: 該当なし",
      ].filter(Boolean),
    },
  ];

  return blocks;
}

function blocksToInput(blocks = []) {
  return blocks
    .map((block) => {
      const lines = [`[${block.title}]`];
      if (block.facts?.length) {
        lines.push("FACTS:");
        block.facts.forEach((f) => lines.push(`- ${f}`));
      }
      if (block.items?.length) {
        lines.push("ITEMS:");
        block.items.forEach((it) => lines.push(`- ${it}`));
      }
      if (block.itemsAsH3) {
        lines.push("ITEMS_AS_H3: yes");
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

module.exports = { buildBlogBlocks, blocksToInput, buildMoonBlockHtml };
