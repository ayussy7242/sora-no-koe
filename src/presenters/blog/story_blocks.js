"use strict";

const dict = require("../../content/dict");
const { SPEC } = require("../../config/sora_spec");
const { buildRetrogradeMap } = require("../../domain/astro/retrograde");
const {
  bodyGlyph,
  bodyLabelJa,
  signLabelJa,
} = require("../render/render_tokens");
const {
  normalizeBodyKey,
  normalizeSignKey,
  normalizeAspectKey,
} = require("../../domain/canonical");

const BODY_ORDER = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
  "lilith",
  "chiron",
];

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

function formatPositionLine({ bodyKey, signKey, signJa, retro }) {
  const glyph = bodyGlyph(bodyKey);
  const label = bodyLabelJa(dict, bodyKey) || bodyKey;
  const signLabel = signJa || signLabelJa(dict, signKey) || signKey || "";
  const retroText = retro ? SPEC.retro.suffix : "";
  const left = `${glyph ? `${glyph} ` : ""}${label}${retroText}`.trim();
  const right = signLabel ? `｜${signLabel}` : "";
  return `${left}${right}`.trim();
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

function formatHouseCounts(counts = {}) {
  const entries = Object.entries(counts)
    .map(([h, c]) => [Number(h), Number(c)])
    .filter(([h, c]) => Number.isFinite(h) && Number.isFinite(c) && c > 0)
    .sort((a, b) => a[0] - b[0]);
  if (!entries.length) return "";
  return entries.map(([h, c]) => `${h}H:${c}`).join(" / ");
}

function formatKinjitsuLine(row = {}) {
  const aKey = normalizeBodyKey(row?.a || "");
  const bKey = normalizeBodyKey(row?.b || "");
  const aGlyph = bodyGlyph(aKey);
  const bGlyph = bodyGlyph(bKey);
  const aLabel = bodyLabelJa(dict, aKey) || aKey;
  const bLabel = bodyLabelJa(dict, bKey) || bKey;
  const aSign = row?.a_sign_ja || signLabelJa(dict, row?.a_sign_key || "");
  const bSign = row?.b_sign_ja || signLabelJa(dict, row?.b_sign_key || "");
  const aspectDeg = Number.isFinite(Number(row?.aspect_deg)) ? Number(row.aspect_deg) : null;
  const aspectLabel = aspectLabelJa(row?.aspect || row?.type, aspectDeg);
  const degText = aspectDeg != null ? `${Math.round(aspectDeg)}°` : "";
  const orb = Number.isFinite(Number(row?.now_orb)) ? Number(row.now_orb) : null;
  const orbText = orb != null ? `${orb.toFixed(1)}°` : "";
  const peak = row?.peak_label || "";

  const left = `${aGlyph ? `${aGlyph} ` : ""}${aLabel}`.trim();
  const right = `${bGlyph ? `${bGlyph} ` : ""}${bLabel}`.trim();
  const signTextA = aSign ? `（${aSign}）` : "";
  const signTextB = bSign ? `（${bSign}）` : "";
  const pair = `${left}${signTextA} × ${right}${signTextB}`.trim();
  const angle = [aspectLabel, degText].filter(Boolean).join(" ");
  const tail = [
    angle,
    orbText ? `現在 orb ${orbText}` : "",
    peak ? `最接近 ${peak}` : "",
  ]
    .filter(Boolean)
    .join("｜");
  return `${pair}｜${tail}`.trim();
}

function buildBlogBlocks(story, opts = {}) {
  const pub = story?.public || {};
  const dateLocal = opts.dateLocal || story?.meta?.date_local || "";
  const asOfISO = story?.meta?.as_of || null;

  const transitSigns = pub.transit_signs || {};
  const retroMap = buildRetrogradeMap(asOfISO, BODY_ORDER);

  const positions = BODY_ORDER.map((key) => {
    const item = transitSigns[key];
    if (!item) return "";
    const signKey = normalizeSignKey(item?.sign_key || "");
    return formatPositionLine({
      bodyKey: key,
      signKey,
      signJa: item?.sign_ja || "",
      retro: retroMap[key],
    });
  }).filter(Boolean);

  const skyAll = Array.isArray(pub.sky_all) ? [...pub.sky_all] : [];
  skyAll.sort((a, b) => (a?.orb_deg ?? 99) - (b?.orb_deg ?? 99));

  const resonanceOrbLimit = SPEC?.orb?.paid ?? 3.0;
  const resonancePool = skyAll.filter((it) => Number(it?.orb_deg) <= resonanceOrbLimit);
  const resonanceItems = resonancePool.map((it) => formatAspectLine(it, retroMap)).filter(Boolean);

  const leadAspect = resonancePool?.[0] || skyAll?.[0] || null;
  const leadAspectLine = leadAspect ? formatAspectLine(leadAspect, retroMap) : "";

  const strata = pub.sky_strata || {};
  const elements = formatElementCount(strata.element_count || {});
  const modalities = formatModalityCount(strata.modality_count || {});

  const retroBodies = BODY_ORDER.filter((key) => retroMap[key] && transitSigns[key]);
  const retroItems = retroBodies.map((key) => {
    const item = transitSigns[key];
    const signKey = normalizeSignKey(item?.sign_key || "");
    return formatPositionLine({
      bodyKey: key,
      signKey,
      signJa: item?.sign_ja || "",
      retro: retroMap[key],
    });
  });

  const houseFocus = pub.house_focus || {};
  const houseCounts = houseFocus.counts || {};
  const houseCountLine = formatHouseCounts(houseCounts);
  const houseTop = Array.isArray(houseFocus.top) ? houseFocus.top : [];
  const houseItems = houseTop.map((row) => `第${row.house_no}ハウス｜${row.count}件`);

  const kinjitsu = Array.isArray(pub.kinjitsu) ? pub.kinjitsu : [];
  const kinjitsuItems = kinjitsu.map((row) => formatKinjitsuLine(row)).filter(Boolean);

  const aftertaste = Array.isArray(pub?.tone_hints?.resonance_bullets)
    ? pub.tone_hints.resonance_bullets
    : [];

  const orbValues = resonancePool
    .map((it) => (Number.isFinite(Number(it?.orb_deg)) ? Number(it.orb_deg) : null))
    .filter((n) => n != null);
  const orbMin = orbValues.length ? Math.min(...orbValues) : null;
  const orbMax = orbValues.length ? Math.max(...orbValues) : null;

  const blocks = [
    {
      id: "lead",
      title: "今日の空の輪郭",
      facts: [
        dateLocal ? `日付: ${dateLocal}` : "",
        leadAspectLine ? `最接近: ${leadAspectLine}` : "",
        elements ? `要素: ${elements}` : "",
        modalities ? `区分: ${modalities}` : "",
      ].filter(Boolean),
    },
    {
      id: "positions",
      title: "天体の配置",
      facts: [`対象: トランジット（${positions.length}件）`],
      items: positions,
      itemsAsH3: true,
    },
    {
      id: "resonance",
      title: "今日いちばん近い角度",
      facts: [
        `抽出: orb昇順（${resonanceItems.length}件）`,
        orbMin != null && orbMax != null
          ? `orb範囲: ${orbMin.toFixed(2)}°〜${orbMax.toFixed(2)}°`
          : "",
      ].filter(Boolean),
      items: resonanceItems.length ? resonanceItems : ["近接角度は観測されていない"],
      itemsAsH3: true,
    },
    {
      id: "distribution",
      title: "分布",
      facts: [
        elements ? `要素: ${elements}` : "",
        modalities ? `区分: ${modalities}` : "",
      ].filter(Boolean),
    },
    {
      id: "retrograde",
      title: "逆行",
      facts: [`逆行中: ${retroBodies.length}件`],
      items: retroItems.length ? retroItems : ["逆行中の天体は観測されていない"],
      itemsAsH3: true,
    },
    {
      id: "houses",
      title: "ハウスの集中",
      facts: [
        `天体数: ${houseFocus.total || 0}件`,
        houseCountLine ? `分布: ${houseCountLine}` : "",
      ].filter(Boolean),
      items: houseItems.length ? houseItems : ["集中は観測されていない"],
      itemsAsH3: true,
    },
    {
      id: "near_future",
      title: "近日の接近",
      facts: [
        `抽出: orb≤3° / ${kinjitsuItems.length}件`,
      ],
      items: kinjitsuItems.length ? kinjitsuItems : ["近日の接近は観測されていない"],
      itemsAsH3: true,
    },
    {
      id: "aftertaste",
      title: "余韻",
      facts: aftertaste.length ? aftertaste : ["余韻の言葉はまだ薄い"],
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

module.exports = { buildBlogBlocks, blocksToInput };
