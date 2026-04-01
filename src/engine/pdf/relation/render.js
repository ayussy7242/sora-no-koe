"use strict";

const puppeteer = require("puppeteer");
const { buildBlueprintCss } = require("../blueprint_v25/styles");
const { buildGlyphImgTag } = require("../blueprint_v25/glyphs");
const { PAGE_WIDTH, PAGE_HEIGHT } = require("../blueprint_v25/constants");
const { buildSoraWheelSvg } = require("../../graphics/sora_wheel");

const {
  COLOR_A,
  COLOR_B,
  ELEMENT_COLORS,
  ELEMENT_HUES,
  BAND_TITLE,
  ASPECT_COLORS,
  ELEMENT_LABELS,
  MODALITY_LABELS,
  SIGN_MODALITY,
  SAME_BODY_KEYS,
  ASPECT_DISPLAY,
  SIGN_ELEMENT,
  SIGN_ORDER,
  SIGN_RELATION_LABELS,
  SIGN_RELATION_SYMBOLS,
  RELATION_GLYPHS,
  OPPOSITE_SIGN,
  HOUSE_BANDS,
  WHEEL_BODIES,
  BODY_SHORT_LABELS,
  AXIS_SYMBOLS,
  RELATION_TYPE_LABELS,
  HOUSE_LABELS,
  HOUSE_BODY_WEIGHT,
  AXIS_BODIES,
  DEEP_BODIES,
  CORE_BODIES,
  BODY_ORDER,
  BODY_ORDER_MAP,
  MAX_ROWS_PER_COL,
  CORE_PAIR_KEYS,
  COMM_PAIR_KEYS,
  ATTRACTION_PAIR_KEYS,
  FRICTION_PAIR_KEYS,
  SOFT_ASPECTS,
  HARD_ASPECTS,
  PAIR_PRIORITY,
  BODY_PRIORITY,
  ASPECT_WEIGHT,
} = require("./constants");
const {
  escapeHtml,
  formatPlanetRow,
  formatBodyKeyShort,
  formatElementKey,
  formatModalityKey,
  pickDominantElementKey,
  topTwoFromCounts,
  formatAspectLabel,
  shortName,
  normalizeAspectKey,
  formatOrbValue,
  formatConnectionSideHtml,
  formatAspectDisplay,
  formatGapRow,
  formatHouseLinkRow,
} = require("./formatters");
const {
  buildSpaceSvg,
  renderSpaceBg,
  buildHeader,
  buildFooter,
  buildCosmicNav,
  renderRelationRow,
  buildTwoColList,
  buildSingleList,
  buildConnectionList,
  buildBlockGrid,
  formatAxisLine,
  buildAxisBlock,
  buildDeepBlock,
  buildHouseBlock,
  buildAxisHouseDeepStack,
  formatCompareRow,
  formatSignRelationRow,
  buildRelationCenterBlocks,
  buildComparePairsSection,
  buildSignRelationSection,
  buildCoreSection,
  buildRelationPatternSection,
  buildConnectionDualStack,
  buildConnectionStack,
  buildRelationCoreText,
  buildCompareMetaHtml,
  buildCompareLayerItem,
  buildCompareLayer,
  buildCompareBlockDefs,
  buildCompareBlockStack,
  buildCompareBlocksSection,
  buildSignFacingRowHtml,
  buildSignFacingSection,
  buildSignFacingText,
  mergeUniqueBodies,
  formatDateLocal,
  formatBirthLine,
  formatPlaceLine,
  buildPeopleBlock,
  buildMetricRow,
  buildElementBarList,
  buildModalityBarList,
  buildElementModalityColumns,
  buildBottomSections,
  buildPage,
  buildCoverPage,
} = require("./components");
const {
  chunkTwoColumns,
  splitTwoColumns,
  chunkList,
  buildPrefixSums,
  sumTail,
  calcBlockHeight,
  maxRowsFitFromEnd,
  paginateStackBlocksFromStart,
  paginateSingleListFromEnd,
  paginateDualListsFromEnd,
} = require("./layout");
const { deriveRelationData } = require("../../../usecases/pdf/relation/build_relation_data");
























function buildWheelStoryFromRelation({ planets = [], deepPoints = [] } = {}) {
  const transit_signs = {};
  const addRow = (row) => {
    const key = row?.body_key;
    const lon = row?.lon_deg;
    if (!key || !Number.isFinite(Number(lon))) return;
    transit_signs[key] = { lon_deg: Number(lon) };
  };
  planets.forEach(addRow);
  deepPoints.forEach(addRow);
  return {
    meta: { as_of: null, date_local: "" },
    public: { transit_signs },
  };
}

function buildSharedRelationWheel({ view, elementKeyA, elementKeyB } = {}) {
  const aStory = buildWheelStoryFromRelation({
    planets: view?.planet_matrix?.a || [],
    deepPoints: view?.deep_points?.a || [],
  });
  const bStory = buildWheelStoryFromRelation({
    planets: view?.planet_matrix?.b || [],
    deepPoints: view?.deep_points?.b || [],
  });
  const hueA = Number.isFinite(ELEMENT_HUES[elementKeyA]) ? ELEMENT_HUES[elementKeyA] : 0;
  const hueB = Number.isFinite(ELEMENT_HUES[elementKeyB]) ? ELEMENT_HUES[elementKeyB] : 160;
  const aAsc = aStory?.public?.transit_signs?.asc?.lon_deg ?? null;
  const aMc = aStory?.public?.transit_signs?.mc?.lon_deg ?? null;
  const bAsc = bStory?.public?.transit_signs?.asc?.lon_deg ?? null;
  const bMc = bStory?.public?.transit_signs?.mc?.lon_deg ?? null;
  const ascToLeft = (ascLon) => (Number.isFinite(Number(ascLon)) ? (270 - Number(ascLon)) : 0);
  const wheelA = buildSoraWheelSvg({
    story: aStory,
    size: 900,
    rotationDeg: ascToLeft(aAsc),
    showHouses: true,
    showAspects: false,
    ascLonDeg: aAsc,
    mcLonDeg: aMc,
  });
  const wheelB = buildSoraWheelSvg({
    story: bStory,
    size: 900,
    rotationDeg: ascToLeft(bAsc),
    showHouses: true,
    showAspects: false,
    ascLonDeg: bAsc,
    mcLonDeg: bMc,
  });
  return `
    <div class="relation-wheel-stack">
      <div class="relation-wheel-item" style="--wheel-hue:${hueA}deg;">
        ${wheelA}
      </div>
      <div class="relation-wheel-item" style="--wheel-hue:${hueB}deg;">
        ${wheelB}
      </div>
    </div>
  `;
}

function mapBodies(list = []) {
  const out = new Map();
  for (const row of list) {
    if (row?.body_key) out.set(row.body_key, row);
  }
  return out;
}

function polarToCartesian(cx, cy, r, deg) {
  const rad = (Number(deg) - 90) * Math.PI / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function buildRelationWheelSvg(view, { size = 680, maxLines = 5, connections: connectionsOverride = null, colorA = COLOR_A, colorB = COLOR_B } = {}) {
  const aMap = mapBodies(view?.planet_matrix?.a || []);
  const bMap = mapBodies(view?.planet_matrix?.b || []);

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.42;
  const ringGap = size * 0.035;
  const bR = outerR * 0.96;
  const aR = bR - ringGap;
  const offset = size * 0.015;
  const centerA = { x: cx - offset, y: cy + offset };
  const centerB = { x: cx + offset, y: cy - offset };

  const connections = Array.isArray(connectionsOverride)
    ? connectionsOverride
    : (Array.isArray(view?.connections) ? view.connections : []);
  const filtered = connections
    .filter((c) => ASPECT_COLORS[c?.aspect])
    .sort((x, y) => (x.orb ?? 99) - (y.orb ?? 99))
    .slice(0, maxLines);

  const lines = [];
  for (const c of filtered) {
    const aKey = c?.a?.body_key;
    const bKey = c?.b?.body_key;
    const aLon = aMap.get(aKey)?.lon_deg;
    const bLon = bMap.get(bKey)?.lon_deg;
    if (!Number.isFinite(Number(aLon)) || !Number.isFinite(Number(bLon))) continue;
    const p1 = polarToCartesian(centerA.x, centerA.y, aR * 0.92, aLon);
    const p2 = polarToCartesian(centerB.x, centerB.y, bR * 0.92, bLon);
    const color = ASPECT_COLORS[c.aspect] || "#999";
    lines.push(`<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="${color}" stroke-width="1.2" opacity="0.75" />`);
  }

  const glyphs = [];
  for (const body of WHEEL_BODIES) {
    const aLon = aMap.get(body)?.lon_deg;
    if (Number.isFinite(Number(aLon))) {
      const p = polarToCartesian(centerA.x, centerA.y, aR, aLon);
      glyphs.push(`<text x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="central" font-size="18" fill="${colorA}" opacity="0.98">${BODY_SHORT_LABELS[body] || body}</text>`);
    }
    const bLon = bMap.get(body)?.lon_deg;
    if (Number.isFinite(Number(bLon))) {
      const p = polarToCartesian(centerB.x, centerB.y, bR, bLon);
      glyphs.push(`<text x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="central" font-size="18" fill="${colorB}" opacity="0.88">${BODY_SHORT_LABELS[body] || body}</text>`);
    }
  }

  return `
    <svg class="relation-wheel" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${centerB.x}" cy="${centerB.y}" r="${bR}" fill="none" stroke="${colorB}" stroke-opacity="0.45" stroke-width="1.2" />
      <circle cx="${centerA.x}" cy="${centerA.y}" r="${aR}" fill="none" stroke="${colorA}" stroke-opacity="0.75" stroke-width="1.4" />
      ${lines.join("\n")}
      ${glyphs.join("\n")}
    </svg>
  `;
}

function replaceRelationGlyphsWithImages(html) {
  if (!html) return html || "";
  let out = String(html);
  RELATION_GLYPHS.forEach((glyph) => {
    const tag = buildGlyphImgTag(glyph, { className: "glyph-img", size: 20, color: "#EDEEFF" });
    out = out.split(glyph).join(tag);
  });
  return out;
}

function getRelationMeta() {
  return [
    {
      ja: "ふたりの星の構造図",
      en: "RELATION BLUEPRINT",
      intro: "ふたりの接触構造を読む設計図",
      type: "cover",
    },
    {
      ja: "ふたりの配置一覧",
      en: "FULL POSITION",
      intro: "それぞれが持つ配置を全体で確認します。",
    },
    {
      ja: "関係の重心",
      en: "RELATION CENTER",
      intro: "重なりと方向の中心をまとめます。",
    },
    {
      ja: "同天体どうし",
      en: "SAME BODY",
      intro: "同じ天体の向かい方を比べます。",
    },
    {
      ja: "サインの向かい合い",
      en: "SIGN RELATION",
      intro: "サイン同士の距離と関係を整理します。",
    },
    {
      ja: "関係の核",
      en: "CORE",
      intro: "この関係を形づくる中心線を抽出します。",
    },
    {
      ja: "通る回路 / 張る回路",
      en: "FLOW / FRICTION",
      intro: "流れやすさと張りやすさを並べます。",
    },
    {
      ja: "感情・会話・惹き合い",
      en: "COMMUNICATION / ATTRACTION",
      intro: "人間的な体感の回路を整理します。",
    },
    {
      ja: "軸の接触",
      en: "AXIS",
      intro: "関係の骨組みにあたる接触をまとめます。",
    },
    {
      ja: "ハウスへの流入",
      en: "HOUSE",
      intro: "関係が入り込む領域を整理します。",
    },
    {
      ja: "関係のパターン",
      en: "RELATION PATTERN",
      intro: "この関係の型と総括を置きます。",
    },
  ];
}

function buildRelationDocumentHtml(pages = []) {
  let html = `<!doctype html>
  <html lang="ja">
  <head>
    <meta charset="utf-8" />
    <style>
      ${buildBlueprintCss()}
      .relation-page.page--space .bg-space__svg { opacity: var(--space-opacity); }
      :root { --fs-body: calc(14px * var(--ui)); }
      .relation-head { display: flex; flex-direction: column; gap: 6px; }
      .relation-en { font-size: calc(var(--fs-label) - 2px); opacity: 0.8; }
      .glyph-img { margin-right: 2px; vertical-align: 0em; }
      .relation-cols { display: grid; grid-template-columns: 1fr 1fr; gap: var(--column-gap); width: 100%; }
      .relation-cols--single { grid-template-columns: 1fr; width: 100%; }
      .relation-col { min-height: 320px; }
      .relation-row { line-height: 1.62; letter-spacing: 0.02em; }
      .relation-list { margin-top: 12px; }
      .relation-bottom { margin-top: 18px; padding-top: 0; border-top: none; }
      .relation-section { font-size: calc(var(--fs-body) + 8px); line-height: 1.7; margin-bottom: 6px; }
      .relation-label { color: var(--muted); margin-right: 6px; }
      .card-note { margin-top: 6px; font-size: calc(var(--fs-sub) + var(--fs-bump)); color: var(--muted); letter-spacing: 0.06em; }
      .card-ai { margin-top: 10px; font-size: calc(var(--fs-body) - 1px); color: var(--muted); line-height: 1.7; }
      .relation-brand { position: absolute; bottom: 64px; left: var(--page-margin-x); font-size: calc(var(--fs-sub) + var(--fs-bump)); letter-spacing: 0.22em; color: var(--muted); opacity: 0.8; }
      .relation-page-number { color: var(--muted); }
      .relation-page .star-nav { bottom: 66px; font-size: calc(10px + var(--fs-bump)); }
      .relation-wheel-wrap { display: flex; justify-content: center; align-items: center; margin-top: 10px; width: 100%; }
      .relation-wheel { width: 76%; height: auto; }
      .relation-wheel-stack { display: grid; gap: 12px; width: 68%; }
      .relation-wheel-item svg { width: 100%; height: auto; display: block; filter: hue-rotate(var(--wheel-hue)) saturate(1.15); }
      .relation-middle-stack { display: grid; gap: 18px; width: 100%; }
      .relation-info { display: grid; grid-template-columns: 1fr 1fr; gap: var(--column-gap); width: 100%; }
      .relation-info-card { min-height: 0; }
      .relation-info-name { font-size: calc(var(--fs-body) + 8px); letter-spacing: 0.04em; }
      .relation-info-birth, .relation-info-place { font-size: calc(var(--fs-sub) + var(--fs-bump)); color: var(--muted); margin-top: 2px; letter-spacing: 0.08em; }
      .relation-bars { display: grid; grid-template-columns: 1fr 1fr; gap: var(--column-gap); width: 100%; }
      .relation-bars-col { display: grid; gap: var(--card-gap); }
      .relation-bar-box { min-height: 0; }
      .relation-cover { align-items: center; text-align: center; display: flex; flex-direction: column; gap: 14px; }
      .relation-cover-ja { font-size: calc(40px * var(--ui)); }
      .relation-cover .relation-wheel-wrap { margin-top: 18px; }
      .relation-cover .relation-wheel { width: 68%; height: auto; }
      .relation-blocks { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--column-gap); width: 100%; }
      .relation-block { min-height: 0; }
      .relation-blocks--summary { grid-template-columns: repeat(3, 1fr); }
      .relation-blocks--two { grid-template-columns: repeat(2, 1fr); }
      .relation-cols--connection .card-head { letter-spacing: 0.08em; }
      .connection-grid { --col-left: minmax(0, 1fr); --col-center: auto; --col-right: minmax(0, 1fr); }
      .connection-names { display: grid; grid-template-columns: var(--col-left) var(--col-center) var(--col-right); margin-top: 24px; font-size: calc(var(--fs-sub) + 2px + var(--fs-bump)); color: var(--muted); letter-spacing: 0.08em; opacity: 0.7; }
      .connection-name-left { grid-column: 1; justify-self: start; }
      .connection-name-right { grid-column: 3; justify-self: end; }
      .connection-list { margin-top: 12px; display: grid; gap: 0; width: 100%; }
      .connection-row { display: grid; grid-template-columns: var(--col-left) var(--col-center) var(--col-right); column-gap: 26px; align-items: center; padding: 18px 0; border-bottom: 1px solid rgba(237, 238, 255, 0.08); }
      .connection-left { text-align: right; white-space: nowrap; overflow: visible; display: flex; align-items: center; justify-content: flex-start; }
      .connection-right { text-align: left; white-space: nowrap; overflow: visible; display: flex; align-items: center; justify-content: flex-end; }
      .connection-center { text-align: center; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap; padding: 0 14px; font-size: calc(var(--fs-body) + 2px); color: var(--muted); }
      .connection-symbol { font-weight: 700; color: var(--text); }
      .connection-label, .connection-orb { font-size: calc(var(--fs-body) - 3px); font-weight: 400; color: rgba(237, 238, 255, 0.55); }
      .connection-body { display: inline-flex; align-items: center; gap: 6px; font-size: calc(var(--fs-body) + 10px); font-weight: 600; }
      .connection-body-text { font-size: calc(var(--fs-body) + 7px); }
      .connection-sign { display: inline-flex; align-items: center; gap: 6px; font-size: calc(var(--fs-body) + 1px); color: var(--muted); margin-left: 18px; }
      .connection-sign-text { font-size: calc(var(--fs-body) + 1px); }
      .connection-row--empty { grid-template-columns: 1fr; border-bottom: none; padding: 16px 0; }
      .connection-row--empty .connection-center { justify-content: center; }
      .relation-stack { display: grid; gap: 46px; width: 100%; }
      .compare-layer .card-note { margin-top: 6px; }
      .relation-block--axis .relation-row,
      .relation-block--deep .relation-row { line-height: 1.6; }
      .relation-block--axis .connection-orb,
      .relation-block--deep .connection-orb { font-size: calc(var(--fs-body) - 2px); opacity: 0.7; }
      .relation-block--axis .card-sub { font-size: calc(var(--fs-sub) - 1px); opacity: 0.6; }
      .relation-house .card-sub { opacity: 0.6; }
      .relation-house .relation-cols { margin-top: 46px; }
      .relation-cols--house { gap: var(--column-gap); }
      .house-list { margin-top: 12px; display: grid; gap: 12px; }
      .house-entry { display: grid; gap: 4px; }
      .house-entry--empty { color: var(--muted); font-size: calc(var(--fs-body)); }
      .house-title { font-size: calc(var(--fs-body) + 2px); letter-spacing: 0.04em; }
      .house-items { font-size: calc(var(--fs-body) + -6px); color: rgba(237, 238, 255, 0.55); margin: 12px 0 6px; }
      .house-ai-list { margin-top: 10px; display: grid; gap: 6px; }
      .house-ai { font-size: calc(var(--fs-body) - 1px); color: var(--muted); line-height: 1.6; }
      .house-summary { margin-top: 10px; font-size: calc(var(--fs-body) - 1px); color: var(--muted); line-height: 1.7; }
      .relation-pattern { width: 100%; }
      .relation-pattern-name { min-height: 0; margin-bottom: 14px; }
      .relation-pattern-summary { min-height: 0; width: 100%; }
      .relation-pattern-evidence { margin-top: 8px; }
      .relation-pattern-text { margin-top: 12px; font-size: calc(var(--fs-body) - 1px); line-height: 1.8; color: var(--text); }
      .relation-cols--sign-facing .relation-list { margin-top: 14px; }
      .sign-facing-list { display: grid; gap: 18px; }
      .sign-facing-row { padding: 0; border: none; }
      .sign-facing-head { display: flex; align-items: center; gap: 18px; }
      .sign-facing-meta { margin-top: 0; display: flex; align-items: center; gap: 10px; font-size: calc(var(--fs-body)); color: var(--muted); }
      .sign-facing-sign { display: inline-flex; align-items: center; gap: 6px; font-size: calc(var(--fs-body)); color: var(--muted); }
      .sign-facing-sign--weak { opacity: 0.55; }
      .sign-facing-rel { font-weight: 700; font-size: calc(var(--fs-body) + 2px); color: var(--muted); }
      .sign-facing-note { margin-top: 8px; font-size: calc(var(--fs-body) - 1px); color: var(--muted); }
      .relation-cols--compare { grid-template-columns: 1fr 1fr; gap: var(--column-gap); }
      .compare-layer { min-height: 0; }
      .compare-layer-list { display: grid; gap: 16px; margin-top: 12px; }
      .compare-layer-item { padding: 0; border: none; }
      .compare-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .compare-meta-line { margin-top: 0; font-size: calc(var(--fs-body)); color: var(--muted); display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
      .compare-meta-side { font-size: calc(var(--fs-body) + 8px); color: var(--muted); white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; opacity: 0.7; }
      .compare-meta-side--weak { opacity: 0.6; }
      .compare-meta-rel { font-weight: 400; color: rgba(237, 238, 255, 0.5); font-size: calc(var(--fs-body) - 2px); white-space: nowrap; padding: 0 8px; }
      .compare-meta-signs { display: inline-flex; align-items: center; gap: 6px; font-size: calc(var(--fs-body)); color: var(--muted); opacity: 0.7; }
      .relation-house .relation-cols .card-head { font-size: calc(var(--fs-sub) + var(--fs-bump)); letter-spacing: 0.08em; }
      .page-core .relation-bottom,
      .page-flow-friction .relation-bottom,
      .page-comm-attraction .relation-bottom { color: var(--muted); font-size: calc(var(--fs-body) - 2px); }
      .page-full-position .relation-row { font-size: calc(var(--fs-body) + 8px); line-height: 1.7; }
      .page-full-position .relation-info .card-sub { opacity: 0.5; }
      .page-full-position .relation-col { min-height: 0; }
      .page-full-position .card-head { font-size: calc(var(--fs-card-head) - 2px); }
      .page-full-position .relation-info { margin-bottom: 10px; }
      .page-full-position .relation-cols--full-list .card-head { display: none; }
      .page-core .relation-row { line-height: 1.8; }
      .page-core .relation-cols--single { max-width: none; margin: 0; }
      .page-axis .relation-block .relation-row { line-height: 1.55; }
      .page-summary .relation-blocks { margin-top: 8px; }
      .page-cover .top { margin-top: 10px; }
      .page-summary .relation-bottom { margin-top: 22px; }
    </style>
  </head>
  <body>
    ${pages.join("\n")}
  </body>
  </html>`;
  html = replaceRelationGlyphsWithImages(html);
  return html;
}

function buildRelationHtml(view, options = {}) {
  const aName = view?.people?.a?.name || "A";
  const bName = view?.people?.b?.name || "B";
  const derived = deriveRelationData(view);
  const aFull = Array.isArray(derived?.aFull) ? derived.aFull : [];
  const bFull = Array.isArray(derived?.bFull) ? derived.bFull : [];
  const aFullRows = aFull.map(formatPlanetRow);
  const bFullRows = bFull.map(formatPlanetRow);
  const dominantElementA = derived?.dominantElementA || null;
  const dominantElementB = derived?.dominantElementB || null;
  const topElementA = derived?.topElementA || "—";
  const topElementB = derived?.topElementB || "—";
  const topModalityA = derived?.topModalityA || "—";
  const topModalityB = derived?.topModalityB || "—";
  const coverWheel = buildSharedRelationWheel({
    view,
    elementKeyA: dominantElementA,
    elementKeyB: dominantElementB,
  });

  const coreList = derived?.coreList || [];
  const flowList = derived?.flowList || [];
  const frictionList = derived?.frictionList || [];
  const commList = derived?.commList || [];
  const attractionList = derived?.attractionList || [];
  const axisList = derived?.axisList || [];
  const deepList = derived?.deepList || [];
  const houseSections = derived?.houseSections || [];
  const baseLines = Array.isArray(derived?.baseLines) ? derived.baseLines : [];
  const comparePairsEnsured = Array.isArray(derived?.comparePairsEnsured) ? derived.comparePairsEnsured : [];
  const relationCenter = derived?.relationCenter || {};
  const relationCore = derived?.relationCore || {};
  const relationPattern = derived?.relationPattern || {};
  const relationPatternText = derived?.relationPatternText || "";
  const signLabelMap = derived?.signLabelMap || {};
  const topSignA = derived?.topSignA || {};
  const topSignB = derived?.topSignB || {};
  const topHouseA = derived?.topHouseA || {};
  const topHouseB = derived?.topHouseB || {};

  const meta = getRelationMeta();

  const pageDefs = [];
  pageDefs.push({ type: "cover", meta: meta[0], pageClass: "page-cover", wheelHtml: coverWheel });

  const peopleBlock = buildPeopleBlock({ a: view?.people?.a || {}, b: view?.people?.b || {} });
  const fullHtml = `
    <div class="relation-middle-stack">
      ${peopleBlock}
      ${buildTwoColList({ leftRows: aFullRows, rightRows: bFullRows, leftTitle: "A SIDE", rightTitle: "B SIDE", leftSub: "", rightSub: "", className: "relation-cols--full-list" })}
    </div>
  `;
  pageDefs.push({
    type: "page",
    meta: meta[1],
    leftRows: [],
    rightRows: [],
    middleHtml: fullHtml,
    bottomSections: [],
    pageClass: "page-full-position",
  });

  const dominantSignsA = Array.isArray(view?.dominant_signs?.a) ? view.dominant_signs.a : [];
  const dominantSignsB = Array.isArray(view?.dominant_signs?.b) ? view.dominant_signs.b : [];
  const topSignLabelA = dominantSignsA[0]?.sign_ja || dominantSignsA[0]?.sign_key || signLabelMap[topSignA?.key] || topSignA?.key || "—";
  const topSignLabelB = dominantSignsB[0]?.sign_ja || dominantSignsB[0]?.sign_key || signLabelMap[topSignB?.key] || topSignB?.key || "—";
  const primaryHouseA = view?.primary_house?.a ? `${view.primary_house.a}H` : (topHouseA?.key ? `${topHouseA.key}H` : "—");
  const primaryHouseB = view?.primary_house?.b ? `${view.primary_house.b}H` : (topHouseB?.key ? `${topHouseB.key}H` : "—");
  const topHouseLabelA = primaryHouseA;
  const topHouseLabelB = primaryHouseB;

  const overlapLabel = [relationCenter?.shared_sign_label, relationCenter?.shared_house_cluster].filter(Boolean).join("｜") || "—";
  const separationLabel = [topSignLabelA, topSignLabelB].filter(Boolean).join("｜") || "—";
  const flowLabel = relationCenter?.direction_vector || "—";

  pageDefs.push({
    type: "page",
    meta: meta[2],
    leftRows: [],
    rightRows: [],
    middleHtml: `
      <div class="relation-stack">
        ${buildBlockGrid([
          {
            title: "A CENTER",
            sub: shortName(aName),
            rows: [
              `支配サイン: ${topSignLabelA}`,
              `支配ハウス: ${topHouseLabelA}`,
              `主成分: ${topElementA || "—"} / ${topModalityA || "—"}`,
            ],
          },
          {
            title: "B CENTER",
            sub: shortName(bName),
            rows: [
              `支配サイン: ${topSignLabelB}`,
              `支配ハウス: ${topHouseLabelB}`,
              `主成分: ${topElementB || "—"} / ${topModalityB || "—"}`,
            ],
          },
        ], "relation-blocks--two")}
        ${buildSingleList({
          title: "OVERLAP",
          sub: overlapLabel,
          rows: [
            view?.ai_texts?.relation_center_overlap || relationCenter?.overlap_line || "重なりは分散しています。",
          ],
        })}
        ${buildSingleList({
          title: "SEPARATION",
          sub: separationLabel,
          rows: [
            view?.ai_texts?.relation_center_separation || baseLines?.[1] || "分離帯は固定されません。",
          ],
        })}
        ${buildSingleList({
          title: "FLOW",
          sub: flowLabel,
          rows: [
            view?.ai_texts?.relation_center_flow || baseLines?.[2] || "流れ帯は未確定です。",
          ],
        })}
      </div>
    `,
    bottomSections: [],
    pageClass: "page-relation-center",
  });

  const compareIndex = new Map(comparePairsEnsured.map((row) => [row?.body_key, row]));
  const pickByKeys = (keys) => keys.map((key) => compareIndex.get(key)).filter(Boolean);
  const sortByOrder = (rows) => rows.slice().sort((a, b) => {
    const aKey = a?.body_key || "";
    const bKey = b?.body_key || "";
    const aIdx = BODY_ORDER_MAP.has(aKey) ? BODY_ORDER_MAP.get(aKey) : 999;
    const bIdx = BODY_ORDER_MAP.has(bKey) ? BODY_ORDER_MAP.get(bKey) : 999;
    return aIdx - bIdx;
  });

  const personalRows = pickByKeys(["sun", "moon", "mercury", "venus", "mars"]);
  const socialRows = pickByKeys(["jupiter", "saturn"]);
  const transpersonalRows = pickByKeys(["uranus", "neptune", "pluto"]);
  const axisRows = pickByKeys(["asc", "dc", "mc", "ic"]);
  const deepRows = pickByKeys(["north_node", "south_node", "lilith", "chiron"]);
  const compareBlockDefs = buildCompareBlockDefs({
    personal: personalRows,
    social: socialRows,
    transpersonal: transpersonalRows,
    axis: axisRows,
    deep: deepRows,
    aiTexts: {
      personal_text: view?.ai_texts?.personal_text || "",
      social_text: view?.ai_texts?.social_text || "",
      transpersonal_text: view?.ai_texts?.transpersonal_text || "",
      axis_compare_text: view?.ai_texts?.axis_compare_text || "",
      deep_compare_text: view?.ai_texts?.deep_compare_text || "",
    },
  });

  const paginatedCompareBlocks = Array.isArray(options?.pagination?.compareBlocks) ? options.pagination.compareBlocks : null;
  if (paginatedCompareBlocks && paginatedCompareBlocks.length) {
    paginatedCompareBlocks.forEach((page) => {
      const start = Math.max(0, page.start || 0);
      const end = Math.max(start, page.end || start);
      pageDefs.push({
        type: "page",
        meta: meta[3],
        leftRows: [],
        rightRows: [],
        middleHtml: buildCompareBlockStack(compareBlockDefs.slice(start, end)),
        bottomSections: [],
        pageClass: "page-compare",
      });
    });
  } else {
    pageDefs.push({
      type: "page",
      meta: meta[3],
      leftRows: [],
      rightRows: [],
      middleHtml: buildCompareBlockStack(compareBlockDefs),
      bottomSections: [],
      pageClass: "page-compare",
    });
  }

  // SIGN FACING page removed

  pageDefs.push({
    type: "page",
    meta: meta[5],
    leftRows: [],
    rightRows: [],
    middleHtml: buildCoreSection({ relationCore, coreConnections: coreList, aName, bName }),
    bottomSections: [{ label: "", text: view?.ai_texts?.relation_core || buildRelationCoreText({ relationCore }) }],
    pageClass: "page-core",
  });

  const paginatedFlowFriction = Array.isArray(options?.pagination?.flowFriction) ? options.pagination.flowFriction : null;
  if (paginatedFlowFriction && paginatedFlowFriction.length) {
    const orderedPages = paginatedFlowFriction.slice().sort((a, b) => (a.flowStart || 0) - (b.flowStart || 0));
    orderedPages.forEach((page) => {
      const flowSlice = flowList.slice(page.flowStart || 0, page.flowEnd || 0);
      const frictionSlice = frictionList.slice(page.frictionStart || 0, page.frictionEnd || 0);
      const blocks = [];
      if ((page.flowCount || 0) > 0) {
        blocks.push({
          title: "FLOW",
          sub: "",
          note: "流れやすい接触",
          aiText: view?.ai_texts?.flow_text || "",
          connections: flowSlice,
          aName,
          bName,
          showNames: true,
        });
      }
      if ((page.frictionCount || 0) > 0) {
        blocks.push({
          title: "FRICTION",
          sub: "",
          note: "張りが生まれる接触",
          aiText: view?.ai_texts?.friction_text || "",
          connections: frictionSlice,
          aName,
          bName,
          showNames: false,
        });
      }
      pageDefs.push({
        type: "page",
        meta: meta[6],
        leftRows: [],
        rightRows: [],
        middleHtml: buildConnectionStack({ blocks }),
        bottomSections: [],
        variant: "slide3",
        pageClass: "page-flow-friction",
      });
    });
  } else {
    pageDefs.push({
      type: "page",
      meta: meta[6],
      leftRows: [],
      rightRows: [],
      middleHtml: buildConnectionDualStack({
        aName,
        bName,
        leftTitle: "FLOW",
        rightTitle: "FRICTION",
        leftNote: "流れやすい接触",
        rightNote: "張りが生まれる接触",
        leftAiText: view?.ai_texts?.flow_text || "",
        rightAiText: view?.ai_texts?.friction_text || "",
        leftConnections: flowList,
        rightConnections: frictionList,
      }),
      bottomSections: [],
      variant: "slide3",
      pageClass: "page-flow-friction",
    });
  }

  const paginatedCommAttraction = Array.isArray(options?.pagination?.commAttraction) ? options.pagination.commAttraction : null;
  if (paginatedCommAttraction && paginatedCommAttraction.length) {
    const orderedPages = paginatedCommAttraction.slice().sort((a, b) => (a.flowStart || 0) - (b.flowStart || 0));
    orderedPages.forEach((page) => {
      const commSlice = commList.slice(page.flowStart || 0, page.flowEnd || 0);
      const attractionSlice = attractionList.slice(page.frictionStart || 0, page.frictionEnd || 0);
      const blocks = [];
      if ((page.flowCount || 0) > 0) {
        blocks.push({
          title: "COMMUNICATION",
          sub: "",
          note: "会話・理解の接続",
          aiText: view?.ai_texts?.comm_text || view?.ai_texts?.comm_attraction || "",
          connections: commSlice,
          aName,
          bName,
          showNames: true,
        });
      }
      if ((page.frictionCount || 0) > 0) {
        blocks.push({
          title: "ATTRACTION",
          sub: "",
          note: "惹き合いの回路",
          aiText: view?.ai_texts?.attraction_text || view?.ai_texts?.comm_attraction || "",
          connections: attractionSlice,
          aName,
          bName,
          showNames: false,
        });
      }
      pageDefs.push({
        type: "page",
        meta: meta[7],
        leftRows: [],
        rightRows: [],
        middleHtml: buildConnectionStack({ blocks }),
        bottomSections: [],
        variant: "slide3",
        pageClass: "page-comm-attraction",
      });
    });
  } else {
    pageDefs.push({
      type: "page",
      meta: meta[7],
      leftRows: [],
      rightRows: [],
      middleHtml: buildConnectionDualStack({
        aName,
        bName,
        leftTitle: "COMMUNICATION",
        rightTitle: "ATTRACTION",
        leftNote: "会話・理解の接続",
        rightNote: "惹き合いの回路",
        leftAiText: view?.ai_texts?.comm_text || view?.ai_texts?.comm_attraction || "",
        rightAiText: view?.ai_texts?.attraction_text || view?.ai_texts?.comm_attraction || "",
        leftConnections: commList,
        rightConnections: attractionList,
      }),
      bottomSections: [],
      variant: "slide3",
      pageClass: "page-comm-attraction",
    });
  }

  pageDefs.push({
    type: "page",
    meta: meta[8],
    leftRows: [],
    rightRows: [],
    middleHtml: `
      <div class="relation-stack">
        ${buildAxisBlock({ connections: axisList.slice(0, 4), aName, bName, aiText: view?.ai_texts?.axis_text || "" })}
        ${buildDeepBlock({ connections: deepList.slice(0, 3), aName, bName, aiText: view?.ai_texts?.deep_text || "" })}
      </div>
    `,
    bottomSections: [],
    variant: "slide3",
    pageClass: "page-axis",
  });

  pageDefs.push({
    type: "page",
    meta: meta[9],
    leftRows: [],
    rightRows: [],
    middleHtml: buildHouseBlock({ sections: houseSections }),
    bottomSections: [],
    pageClass: "page-house",
  });

  pageDefs.push({
    type: "page",
    meta: meta[10],
    leftRows: [],
    rightRows: [],
    middleHtml: buildRelationPatternSection({
      pattern: relationPattern,
      evidence: relationPattern?.evidence || [],
      text: view?.ai_texts?.relation_pattern || relationPatternText,
    }),
    bottomSections: [{ label: "", text: "この関係の型を総括します。" }],
    pageClass: "page-pattern",
  });

  const totalPages = pageDefs.length;
  const numberedPages = pageDefs.map((def, idx) => {
    const pageNo = idx + 1;
    if (def.type === "cover") {
      return buildCoverPage({ meta: def.meta, wheelHtml: def.wheelHtml || "", pageNo, total: totalPages, pageClass: def.pageClass, seedLabel });
    }
    return buildPage({
      meta: def.meta,
      leftRows: def.leftRows,
      rightRows: def.rightRows,
      bottomSections: def.bottomSections,
      extra: def.extra || "",
      middleHtml: def.middleHtml || "",
      leftTitle: def.leftTitle,
      rightTitle: def.rightTitle,
      leftSub: def.leftSub,
      rightSub: def.rightSub,
      pageNo,
      total: totalPages,
      variant: def.variant || "slide3",
      pageClass: def.pageClass || "",
      seedLabel,
    });
  });

  return buildRelationDocumentHtml(numberedPages);
}

async function measureSingleListMetrics(page, { meta, middleHtml, bottomSections = [], pageClass = "", variant = "slide3", listSelector, rowSelector, blockSelector } = {}) {
  const html = buildRelationDocumentHtml([
    buildPage({
      meta,
      leftRows: [],
      rightRows: [],
      bottomSections,
      middleHtml,
      variant,
      pageClass,
    }),
  ]);
  await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 180000 });
  return page.evaluate(({ listSelector: listSel, rowSelector: rowSel, blockSelector: blockSel }) => {
    const slide = document.querySelector(".slide");
    const middle = document.querySelector(".middle");
    const top = slide ? slide.querySelector(".top") : null;
    const bottom = slide ? slide.querySelector(".bottom") : null;
    const list = listSel ? document.querySelector(listSel) : null;
    const rows = rowSel ? Array.from(document.querySelectorAll(rowSel)) : [];
    const block = blockSel ? document.querySelector(blockSel) : (list ? list.closest(".chart-box") : null);
    const blockHeight = block ? block.getBoundingClientRect().height : 0;
    const listHeight = list ? list.scrollHeight : 0;
    const headHeight = Math.max(0, blockHeight - listHeight);
    const style = list ? getComputedStyle(list) : null;
    const gap = style ? parseFloat(style.rowGap || style.gap || "0") : 0;
    const maxMiddleHeight = slide && middle
      ? Math.max(0, slide.clientHeight - (top?.getBoundingClientRect().height || 0) - (bottom?.getBoundingClientRect().height || 0))
      : 0;
    return {
      maxMiddleHeight,
      headHeight,
      listGap: gap,
      rowHeights: rows.map((row) => row.getBoundingClientRect().height),
    };
  }, { listSelector, rowSelector, blockSelector });
}

async function measureDualListMetrics(page, { meta, middleHtml, bottomSections = [], pageClass = "", variant = "slide3" } = {}) {
  const html = buildRelationDocumentHtml([
    buildPage({
      meta,
      leftRows: [],
      rightRows: [],
      bottomSections,
      middleHtml,
      variant,
      pageClass,
    }),
  ]);
  await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 180000 });
  return page.evaluate(() => {
    const slide = document.querySelector(".slide");
    const middle = document.querySelector(".middle");
    const top = slide ? slide.querySelector(".top") : null;
    const bottom = slide ? slide.querySelector(".bottom") : null;
    const stack = document.querySelector(".relation-stack");
    const blocks = stack ? Array.from(stack.children) : [];
    const stackStyle = stack ? getComputedStyle(stack) : null;
    const stackGap = stackStyle ? parseFloat(stackStyle.rowGap || stackStyle.gap || "0") : 0;

    const readBlock = (block) => {
      if (!block) return { headHeight: 0, listGap: 0, rowHeights: [] };
      const box = block.querySelector(".chart-box") || block;
      const list = block.querySelector(".connection-list");
      const rows = Array.from(block.querySelectorAll(".connection-row"));
      const blockHeight = box ? box.getBoundingClientRect().height : 0;
      const listHeight = list ? list.scrollHeight : 0;
      const headHeight = Math.max(0, blockHeight - listHeight);
      const style = list ? getComputedStyle(list) : null;
      const gap = style ? parseFloat(style.rowGap || style.gap || "0") : 0;
      return {
        headHeight,
        listGap: gap,
        rowHeights: rows.map((row) => row.getBoundingClientRect().height),
      };
    };

    const maxMiddleHeight = slide && middle
      ? Math.max(0, slide.clientHeight - (top?.getBoundingClientRect().height || 0) - (bottom?.getBoundingClientRect().height || 0))
      : 0;
    return {
      maxMiddleHeight,
      stackGap,
      blocks: [readBlock(blocks[0]), readBlock(blocks[1])],
    };
  });
}

async function measureStackBlocksMetrics(page, { meta, middleHtml, bottomSections = [], pageClass = "", variant = "slide3" } = {}) {
  const html = buildRelationDocumentHtml([
    buildPage({
      meta,
      leftRows: [],
      rightRows: [],
      bottomSections,
      middleHtml,
      variant,
      pageClass,
    }),
  ]);
  await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 180000 });
  return page.evaluate(() => {
    const slide = document.querySelector(".slide");
    const middle = document.querySelector(".middle");
    const top = slide ? slide.querySelector(".top") : null;
    const bottom = slide ? slide.querySelector(".bottom") : null;
    const stack = document.querySelector(".relation-stack");
    const stackStyle = stack ? getComputedStyle(stack) : null;
    const gap = stackStyle ? parseFloat(stackStyle.rowGap || stackStyle.gap || "0") : 0;
    const blocks = stack ? Array.from(stack.children) : [];
    const blockHeights = blocks.map((el) => el.getBoundingClientRect().height);
    const maxMiddleHeight = slide && middle
      ? Math.max(0, slide.clientHeight - (top?.getBoundingClientRect().height || 0) - (bottom?.getBoundingClientRect().height || 0))
      : 0;
    return { maxMiddleHeight, gap, blockHeights };
  });
}

async function buildRelationHtmlPaginated(view, { browser } = {}) {
  if (!view) throw new Error("buildRelationHtmlPaginated: view required");
  const meta = getRelationMeta();
  const aName = view?.people?.a?.name || "A";
  const bName = view?.people?.b?.name || "B";
  const derived = deriveRelationData(view);
  const flowList = derived?.flowList || [];
  const frictionList = derived?.frictionList || [];
  const commList = derived?.commList || [];
  const attractionList = derived?.attractionList || [];
  const comparePairsEnsured = Array.isArray(derived?.comparePairsEnsured) ? derived.comparePairsEnsured : [];
  const compareIndex = new Map(comparePairsEnsured.map((row) => [row?.body_key, row]));
  const pickByKeys = (keys) => keys.map((key) => compareIndex.get(key)).filter(Boolean);
  const sortByOrder = (rows) => rows.slice().sort((a, b) => {
    const aKey = a?.body_key || "";
    const bKey = b?.body_key || "";
    const aIdx = BODY_ORDER_MAP.has(aKey) ? BODY_ORDER_MAP.get(aKey) : 999;
    const bIdx = BODY_ORDER_MAP.has(bKey) ? BODY_ORDER_MAP.get(bKey) : 999;
    return aIdx - bIdx;
  });
  const personalRows = pickByKeys(["sun", "moon", "mercury", "venus", "mars"]);
  const socialRows = pickByKeys(["jupiter", "saturn"]);
  const transpersonalRows = pickByKeys(["uranus", "neptune", "pluto"]);
  const axisRows = pickByKeys(["asc", "dc", "mc", "ic"]);
  const deepRows = pickByKeys(["north_node", "south_node", "lilith", "chiron"]);

  const ownBrowser = !browser;
  const activeBrowser = browser || await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    timeout: 0,
    protocolTimeout: 180000,
  });

  try {
    const page = await activeBrowser.newPage();
    await page.setViewport({ width: PAGE_WIDTH, height: PAGE_HEIGHT, deviceScaleFactor: 1 });

    const compareBlockDefs = buildCompareBlockDefs({
      personal: personalRows,
      social: socialRows,
      transpersonal: transpersonalRows,
      axis: axisRows,
      deep: deepRows,
    });
    const compareMiddle = buildCompareBlockStack(compareBlockDefs);
    const compareMetrics = await measureStackBlocksMetrics(page, {
      meta: meta[3],
      middleHtml: compareMiddle,
      bottomSections: [],
      pageClass: "page-compare",
    });
    const comparePages = paginateStackBlocksFromStart({
      blockHeights: compareMetrics.blockHeights,
      gap: compareMetrics.gap,
      maxHeight: compareMetrics.maxMiddleHeight,
    });

    const flowFrictionMiddle = buildConnectionStack({
      blocks: [
        { title: "FLOW", sub: "", connections: flowList, aName, bName, showNames: true },
        { title: "FRICTION", sub: "", connections: frictionList, aName, bName, showNames: false },
      ],
    });
    const flowFrictionBottom = [];
    const flowFrictionMetrics = await measureDualListMetrics(page, {
      meta: meta[6],
      middleHtml: flowFrictionMiddle,
      bottomSections: flowFrictionBottom,
      pageClass: "page-flow-friction",
    });
    const flowFrictionMetricsNoBottom = await measureDualListMetrics(page, {
      meta: meta[6],
      middleHtml: flowFrictionMiddle,
      bottomSections: [],
      pageClass: "page-flow-friction",
    });
    const flowHeights = flowFrictionMetrics.blocks[0]?.rowHeights || [];
    const frictionHeights = flowFrictionMetrics.blocks[1]?.rowHeights || [];
    const flowFrictionPages = paginateDualListsFromEnd({
      flowHeights,
      frictionHeights,
      flowHeadHeight: flowFrictionMetrics.blocks[0]?.headHeight || 0,
      frictionHeadHeight: flowFrictionMetrics.blocks[1]?.headHeight || 0,
      flowGap: flowFrictionMetrics.blocks[0]?.listGap || 0,
      frictionGap: flowFrictionMetrics.blocks[1]?.listGap || 0,
      stackGap: flowFrictionMetrics.stackGap || 0,
      maxNoBottom: flowFrictionMetricsNoBottom.maxMiddleHeight,
      maxWithBottom: flowFrictionMetrics.maxMiddleHeight,
    });

    const commAttractionMiddle = buildConnectionStack({
      blocks: [
        { title: "COMMUNICATION", sub: "", note: "会話・理解の接続", aiText: view?.ai_texts?.comm_text || view?.ai_texts?.comm_attraction || "", connections: commList, aName, bName, showNames: true },
        { title: "ATTRACTION", sub: "", note: "惹き合いの回路", aiText: view?.ai_texts?.attraction_text || view?.ai_texts?.comm_attraction || "", connections: attractionList, aName, bName, showNames: false },
      ],
    });
    const commAttractionBottom = [];
    const commAttractionMetrics = await measureDualListMetrics(page, {
      meta: meta[7],
      middleHtml: commAttractionMiddle,
      bottomSections: commAttractionBottom,
      pageClass: "page-comm-attraction",
    });
    const commAttractionMetricsNoBottom = await measureDualListMetrics(page, {
      meta: meta[7],
      middleHtml: commAttractionMiddle,
      bottomSections: [],
      pageClass: "page-comm-attraction",
    });
    const commAttractionPages = paginateDualListsFromEnd({
      flowHeights: commAttractionMetrics.blocks[0]?.rowHeights || [],
      frictionHeights: commAttractionMetrics.blocks[1]?.rowHeights || [],
      flowHeadHeight: commAttractionMetrics.blocks[0]?.headHeight || 0,
      frictionHeadHeight: commAttractionMetrics.blocks[1]?.headHeight || 0,
      flowGap: commAttractionMetrics.blocks[0]?.listGap || 0,
      frictionGap: commAttractionMetrics.blocks[1]?.listGap || 0,
      stackGap: commAttractionMetrics.stackGap || 0,
      maxNoBottom: commAttractionMetricsNoBottom.maxMiddleHeight,
      maxWithBottom: commAttractionMetrics.maxMiddleHeight,
    });

    await page.close();

    const pagination = {
      compareBlocks: comparePages.map((p) => ({ start: p.start, end: p.end })),
      flowFriction: flowFrictionPages.map((p) => ({
        flowStart: p.flowStart,
        flowEnd: p.flowEnd,
        flowCount: p.flowCount,
        frictionStart: p.frictionStart,
        frictionEnd: p.frictionEnd,
        frictionCount: p.frictionCount,
        isLast: p.isLast,
      })),
      commAttraction: commAttractionPages.map((p) => ({
        flowStart: p.flowStart,
        flowEnd: p.flowEnd,
        flowCount: p.flowCount,
        frictionStart: p.frictionStart,
        frictionEnd: p.frictionEnd,
        frictionCount: p.frictionCount,
        isLast: p.isLast,
      })),
    };

    return buildRelationHtml(view, { pagination });
  } finally {
    if (ownBrowser && activeBrowser) {
      await activeBrowser.close();
    }
  }
}

async function renderRelationPdfBuffer({ view } = {}) {
  if (!view) throw new Error("renderRelationPdfBuffer: view required");
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    timeout: 0,
    protocolTimeout: 180000,
  });

  try {
    const html = await buildRelationHtmlPaginated(view, { browser });
    const page = await browser.newPage();
    page.setDefaultTimeout(180000);
    page.setDefaultNavigationTimeout(180000);
    await page.setViewport({ width: PAGE_WIDTH, height: PAGE_HEIGHT, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 180000 });
    const pdfBuffer = await page.pdf({
      width: `${PAGE_WIDTH}px`,
      height: `${PAGE_HEIGHT}px`,
      printBackground: true,
      timeout: 180000,
    });
    await page.close();
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

module.exports = {
  renderRelationPdfBuffer,
  buildRelationHtml,
  buildRelationHtmlPaginated,
};
