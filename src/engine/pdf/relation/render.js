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
  RELATION_EXTRA_BODY_SET,
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
  buildRelationTypeSection,
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
const { houseNumberForLonCusps, houseNumberForLonWholeSign } = require("../../../domain/astro/houses");
























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

function withAiLabel(text = "") {
  const raw = String(text || "").trim();
  return raw ? `AI文｜${raw}` : "AI文｜（サンプル文）";
}

function sampleSectionText(key = "") {
  const map = {
    relation_type: "この関係は、向かい合いと重なりが同時に存在する構造としてまとまりやすい。主軸となる接触が全体の空気を作り、張力のある角度が差異を表面に残しやすい。一方で流れとして通る接触もあるため、単純な衝突ではなく、引き合いとズレが交互に現れる形になりやすい。配置全体を見ると、互いの違いがそのまま関係の輪郭になり、映し合うように特徴が浮かび上がる型として読める。",
    element_modality: "属性と区分の並びを見ると、温度感が近い部分と、動き方に差が出る部分が同時に存在している。片方が外へ押し出す力を持つところに、もう片方は受け止めたり溶かしたりする性質を重ねやすく、リズムの一致よりも、差の出方そのものが関係の個性になりやすい。要素と区分の偏りは、どこで噛み合い、どこで速度差が出るかを見せている。",
    center: "重心は、ふたりの配置の中で自然に集まりやすいサインとハウスに現れる。支配サインと支配ハウスが示すのは、関係の中心がどの領域に寄りやすいかという構造であり、支配属性と支配区分は、その中心がどんな温度と速度を持つかを示している。重なりだけでなくズレも含めて、この関係の軸がどこに置かれやすいかが見えてくる。",
    core: "主軸は関係の中心線として働きやすく、感情・在り方・行動のどこに骨組みがあるかを見せている。張力はズレや引っ張り合いの出やすい地点をつくり、通路は無理なく流れやすい接点として残る。全体の型は、これらの接触がどう組み合わさるかによって決まり、違いが対立ではなく輪郭として可視化される構造になりやすい。",
    pattern_name: "鏡の型",
    pattern_summary: "この関係は、中心線となる接触と、差を生みやすい角度が同時に存在することで輪郭が立ちやすい。重心は特定のサインやハウスに寄りながらも、流れと摩擦の両方を含んでいるため、一方向に固まるというより、互いを映しながら形を保つ構造として見えやすい。全体としては、重なりと対比が同時に働くことで、関係そのものの個性が立ち上がりやすい。",
    structure_summary: "中心、核、回路、流入を並べて見ると、関係は単発の相性ではなく複数の接触が重なって成立していることがわかる。どこで自然に通り、どこでズレが残り、どの領域に刺激が集まりやすいかをまとめて読むことで、この関係の配置全体の形が見えてくる。",
  };
  return withAiLabel(map[key] || "このページでは、配置の差と重なりを構造として読むためのサンプル文が入ります。");
}

function sampleItemText(prefix = "") {
  return withAiLabel(`${prefix}関係の中で現れやすい接触の出方を、構造として置くためのサンプル文です。`);
}

function houseNumberForLon(lon, ascLon, cusps) {
  if (!Number.isFinite(Number(lon))) return null;
  const byCusps = houseNumberForLonCusps(lon, cusps);
  if (Number.isFinite(Number(byCusps))) return byCusps;
  return houseNumberForLonWholeSign(lon, ascLon);
}

function buildHouseIngressItems({ ownerPlanets = [], guestPlanets = [], ownerHouses = null, fromLabel = "A", toLabel = "B", maxItems = 3 } = {}) {
  const asc = ownerPlanets.find((p) => p?.body_key === "asc");
  const ascLon = ownerHouses?.angles?.asc ?? asc?.lon_deg;
  const cusps = ownerHouses?.cusps || null;
  if (!Number.isFinite(Number(ascLon))) return [];

  return (Array.isArray(guestPlanets) ? guestPlanets : [])
    .filter((row) => row?.body_key && Number.isFinite(Number(row?.lon_deg)))
    .filter((row) => !AXIS_BODIES.has(row.body_key))
    .sort((a, b) => {
      const ah = Number(a?.house || 99);
      const bh = Number(b?.house || 99);
      return ah - bh;
    })
    .slice(0, maxItems)
    .map((row) => {
      const targetHouse = houseNumberForLon(row.lon_deg, ascLon, cusps);
      const sourceSign = row?.sign_ja || row?.sign_key || "—";
      const sourceHouse = Number.isFinite(Number(row?.house)) ? `${row.house}H` : "—";
      const targetHouseText = Number.isFinite(Number(targetHouse)) ? `${targetHouse}H` : "—";
      const targetLabel = Number.isFinite(Number(targetHouse)) ? `（${HOUSE_LABELS[targetHouse] || ""}）` : "";
      const body = row?.body_glyph ? `${row.body_glyph} ${row.body_ja || ""}`.trim() : (row?.body_ja || row?.body_key || "—");
      return {
        title: `${body} ${sourceSign} ${sourceHouse} → ${targetHouseText}${targetLabel}`,
        ai: withAiLabel(`${fromLabel}が${toLabel}に対して、この天体の働きを${targetHouseText}へ持ち込みやすい配置として読むためのサンプル文です。`),
      };
    });
}

function buildHouseIngressPage({ pageTitle = "HOUSE", heading = "", items = [] } = {}) {
  const rows = items.length
    ? items.map((item) => `
      <div class="house-flow-entry">
        <div class="house-flow-title">${escapeHtml(item.title || "—")}</div>
        <div class="house-flow-ai">${escapeHtml(item.ai || "")}</div>
      </div>
    `).join("")
    : `<div class="house-flow-entry"><div class="house-flow-title">—</div></div>`;

  return `
    <div class="relation-house-flow">
      <div class="chart-box relation-col">
        <div class="card-head">${escapeHtml(pageTitle)}</div>
        <div class="card-sub">${escapeHtml(heading)}</div>
        <div class="house-flow-list">
          ${rows}
        </div>
      </div>
    </div>
  `;
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
      ja: "ふたりの星の設計図",
      en: "RELATION BLUEPRINT",
      intro: "ふたりの接触構造を読む設計図",
      type: "cover",
    },
    {
      ja: "ふたりの星の配置",
      en: "FULL POSITION",
      intro: "それぞれが持つ配置を全体で確認します。",
    },
    {
      ja: "ふたりの星の関係",
      en: "RELATION TYPE",
      intro: "この関係の型を解説します。",
    },
    {
      ja: "ふたりの星の属性・区分",
      en: "ELEMENT / MODE BALANCE",
      intro: "要素と動き方の相性を見ていきます。",
    },
    {
      ja: "ふたりの星の重心",
      en: "CENTER",
      intro: "関係の中心に寄るサイン、ハウス、属性、区分をまとめます。",
    },
    {
      ja: "ふたりの星の核",
      en: "CORE",
      intro: "この関係を形づくる中心線を抽出します。",
    },
    {
      ja: "ふたりの星の回路",
      en: "FLOW / FRICTION",
      intro: "流れやすさと張りやすさを並べます。",
    },
    {
      ja: "ふたりの星の回路",
      en: "COMMUNICATION / ATTRACTION",
      intro: "人間的な体感の回路を整理します。",
    },
    {
      ja: "ふたりの天体同士",
      en: "PERSONAL",
      intro: "内側の機能の違いを見ます。",
    },
    {
      ja: "ふたりの天体同士",
      en: "SOCIAL / TRANSPERSONAL",
      intro: "外側の機能と構造の違いを見ます。",
    },
    {
      ja: "ふたりの星の接触",
      en: "AXIS / DEEP",
      intro: "骨組みと深層の比較をまとめます。",
    },
    {
      ja: "ふたりのハウスへの流入",
      en: "HOUSE (A → B)",
      intro: "AからBへ入る領域を整理します。",
    },
    {
      ja: "ふたりのハウスへの流入",
      en: "HOUSE (B → A)",
      intro: "BからAへ入る領域を整理します。",
    },
    {
      ja: "ふたりの星の関係",
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
      .connection-item { padding: 0 0 12px; border-bottom: 1px solid rgba(237, 238, 255, 0.08); }
      .connection-row { display: grid; grid-template-columns: var(--col-left) var(--col-center) var(--col-right); column-gap: 26px; align-items: center; padding: 18px 0; border-bottom: 1px solid rgba(237, 238, 255, 0.08); }
      .connection-item .connection-row { border-bottom: none; padding-bottom: 8px; }
      .connection-item-ai { margin: 0 0 0 0; padding: 0 8px 8px; font-size: calc(var(--fs-body) - 1px); color: var(--muted); line-height: 1.7; }
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
      .relation-house-flow .card-sub { opacity: 0.65; margin-top: 8px; }
      .house-flow-list { margin-top: 20px; display: grid; gap: 22px; }
      .house-flow-entry { display: grid; gap: 8px; }
      .house-flow-title { font-size: calc(var(--fs-body) + 4px); line-height: 1.6; }
      .house-flow-ai { font-size: calc(var(--fs-body) - 1px); color: var(--muted); line-height: 1.8; }
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
      .relation-type { display: grid; grid-template-columns: 1fr 1fr; gap: var(--column-gap); width: 100%; }
      .relation-type-main { min-height: 0; }
      .relation-type-name { margin-top: 10px; font-size: calc(var(--fs-body) + 12px); letter-spacing: 0.06em; }
      .relation-type-tags { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px; }
      .relation-type-tag { font-size: calc(var(--fs-sub) + var(--fs-bump)); color: var(--muted); border: 1px solid rgba(237, 238, 255, 0.2); padding: 4px 10px; border-radius: 999px; letter-spacing: 0.08em; }
      .relation-type-ai { margin-top: 12px; font-size: calc(var(--fs-body) - 1px); color: var(--muted); line-height: 1.7; }
      .relation-type-evidence-list { margin-top: 12px; display: grid; gap: 8px; }
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
  const seedLabel = String(
    view?.pair_key ||
    view?.pair?.key ||
    view?.meta?.pair_key ||
    `${aName}-${bName}`
  );
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
  const flowTop = flowList.slice(0, 2);
  const frictionTop = frictionList.slice(0, 2);
  const commTop = commList.slice(0, 2);
  const attractionTop = attractionList.slice(0, 2);
  const flowItems = flowTop.map((connection, idx) => ({
    connection,
    aiText: sampleItemText("FLOW｜"),
  }));
  const frictionItems = frictionTop.map((connection, idx) => ({
    connection,
    aiText: sampleItemText("FRICTION｜"),
  }));
  const commItems = commTop.map((connection, idx) => ({
    connection,
    aiText: sampleItemText("COMMUNICATION｜"),
  }));
  const attractionItems = attractionTop.map((connection, idx) => ({
    connection,
    aiText: sampleItemText("ATTRACTION｜"),
  }));
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

  const relationTypeText = sampleSectionText("relation_type");
  pageDefs.push({
    type: "page",
    meta: meta[2],
    leftRows: [],
    rightRows: [],
    middleHtml: buildRelationTypeSection({
      pattern: relationPattern,
      relationCore,
      aiText: relationTypeText,
    }),
    bottomSections: [],
    pageClass: "page-relation-type",
  });

  const elementBalanceA = view?.element_balance?.a || {};
  const elementBalanceB = view?.element_balance?.b || {};
  const modalityBalanceA = view?.modality_balance?.a || {};
  const modalityBalanceB = view?.modality_balance?.b || {};
  const elementModalityBottom = [
    {
      label: "構造：",
      text: topElementA && topElementB && topElementA !== "—" && topElementB !== "—"
        ? (topElementA === topElementB ? `主成分は${topElementA}。` : `主成分は${topElementA}と${topElementB}。`)
        : "主成分は更新中。",
    },
    {
      label: "動き：",
      text: topModalityA && topModalityB && topModalityA !== "—" && topModalityB !== "—"
        ? (topModalityA === topModalityB ? `主動作は${topModalityA}。` : `主動作は${topModalityA}と${topModalityB}。`)
        : "主動作は更新中。",
    },
    {
      label: "体感：",
      text: (() => {
        if (!topElementA || !topElementB || !topModalityA || !topModalityB) {
          return "体感の差はこれから見えてきます。";
        }
        const sameElement = topElementA === topElementB;
        const sameModality = topModalityA === topModalityB;
        if (sameElement && sameModality) return "リズムは揃いやすい構造。";
        if (sameElement) return "温度は近く、動きに差が出ます。";
        if (sameModality) return "速度は近く、温度に差が出ます。";
        return "温度と速度の差が、関係のリズムとして残ります。";
      })(),
    },
  ];
  const elementModalityBottomSections = [{ label: "", text: sampleSectionText("element_modality") }];

  pageDefs.push({
    type: "page",
    meta: meta[3],
    leftRows: [],
    rightRows: [],
    middleHtml: `
      <div class="relation-stack">
        ${buildElementModalityColumns({
          aBalance: { element_count: elementBalanceA.element_count || {}, modality_count: modalityBalanceA.modality_count || {} },
          bBalance: { element_count: elementBalanceB.element_count || {}, modality_count: modalityBalanceB.modality_count || {} },
        })}
      </div>
    `,
    bottomSections: elementModalityBottomSections,
    pageClass: "page-element-mode",
  });

  const dominantSignsA = Array.isArray(view?.dominant_signs?.a) ? view.dominant_signs.a : [];
  const dominantSignsB = Array.isArray(view?.dominant_signs?.b) ? view.dominant_signs.b : [];
  const topSignLabelA = dominantSignsA[0]?.sign_ja || dominantSignsA[0]?.sign_key || signLabelMap[topSignA?.key] || topSignA?.key || "—";
  const topSignLabelB = dominantSignsB[0]?.sign_ja || dominantSignsB[0]?.sign_key || signLabelMap[topSignB?.key] || topSignB?.key || "—";
  const primaryHouseA = view?.primary_house?.a ? `${view.primary_house.a}H` : (topHouseA?.key ? `${topHouseA.key}H` : "—");
  const primaryHouseB = view?.primary_house?.b ? `${view.primary_house.b}H` : (topHouseB?.key ? `${topHouseB.key}H` : "—");
  const topHouseLabelA = primaryHouseA;
  const topHouseLabelB = primaryHouseB;
  const houseItemsAB = buildHouseIngressItems({
    ownerPlanets: aFull,
    guestPlanets: bFull,
    ownerHouses: view?.houses?.a || null,
    fromLabel: "B",
    toLabel: "A",
    maxItems: 3,
  });
  const houseItemsBA = buildHouseIngressItems({
    ownerPlanets: bFull,
    guestPlanets: aFull,
    ownerHouses: view?.houses?.b || null,
    fromLabel: "A",
    toLabel: "B",
    maxItems: 3,
  });

  const overlapLabel = [relationCenter?.shared_sign_label, relationCenter?.shared_house_cluster].filter(Boolean).join("｜") || "—";
  const relationCenterBottomSections = [{ label: "", text: sampleSectionText("center") }];

  pageDefs.push({
    type: "page",
    meta: meta[4],
    leftRows: [],
    rightRows: [],
    middleHtml: `
      <div class="relation-stack">
        ${buildBlockGrid([
          {
            title: "A STRUCTURE",
            sub: shortName(aName),
            rows: [
              `支配サイン: ${topSignLabelA}`,
              `支配ハウス: ${topHouseLabelA}`,
              `支配属性: ${topElementA || "—"}`,
              `支配区分: ${topModalityA || "—"}`,
            ],
          },
          {
            title: "B STRUCTURE",
            sub: shortName(bName),
            rows: [
              `支配サイン: ${topSignLabelB}`,
              `支配ハウス: ${topHouseLabelB}`,
              `支配属性: ${topElementB || "—"}`,
              `支配区分: ${topModalityB || "—"}`,
            ],
          },
        ], "relation-blocks--two")}
        ${buildSingleList({
          title: "RELATION CENTER",
          sub: overlapLabel === "—" ? "" : overlapLabel,
          rows: [
            `支配サイン: ${topSignLabelA} × ${topSignLabelB}`,
            `支配ハウス: ${topHouseLabelA} × ${topHouseLabelB}`,
            `支配属性: ${topElementA || "—"} × ${topElementB || "—"}`,
            `支配区分: ${topModalityA || "—"} × ${topModalityB || "—"}`,
          ],
        })}
      </div>
    `,
    bottomSections: relationCenterBottomSections,
    pageClass: "page-relation-center",
  });

  const compareIndex = new Map(comparePairsEnsured.map((row) => [row?.body_key, row]));
  const pickByKeys = (keys) => keys.map((key) => compareIndex.get(key)).filter(Boolean);
  const personalRows = pickByKeys(["sun", "moon", "mercury", "venus", "mars"]);
  const socialRows = pickByKeys(["jupiter", "saturn"]);
  const transpersonalRows = pickByKeys(["uranus", "neptune", "pluto"]);
  const axisRows = pickByKeys(["asc", "dc", "mc", "ic"]);
  const deepRows = pickByKeys(["north_node", "south_node", "lilith", "chiron"]);
  const personalRowsWithAi = (() => {
    return personalRows.map((row) => (row ? { ...row, ai_text: sampleItemText("PERSONAL｜") } : row)).filter(Boolean);
  })();
  const socialRowsWithAi = (() => {
    return socialRows.map((row) => (row ? { ...row, ai_text: sampleItemText("SOCIAL｜") } : row)).filter(Boolean);
  })();
  const transpersonalRowsWithAi = (() => {
    return transpersonalRows.map((row) => (row ? { ...row, ai_text: sampleItemText("TRANSPERSONAL｜") } : row)).filter(Boolean);
  })();
  const axisDeepItemAiEnabled = true;
  const axisRowsWithAi = (() => {
    if (!axisDeepItemAiEnabled) return axisRows;
    return axisRows.map((row) => (row ? { ...row, ai_text: sampleItemText("AXIS｜") } : row)).filter(Boolean);
  })();
  const deepRowsWithAi = (() => {
    if (!axisDeepItemAiEnabled) return deepRows;
    return deepRows.map((row) => (row ? { ...row, ai_text: sampleItemText("DEEP｜") } : row)).filter(Boolean);
  })();
  const personalBlock = {
    title: "PERSONAL",
    note: "内側の機能",
    aiText: "",
    rows: personalRowsWithAi,
  };
  const socialBlock = {
    title: "SOCIAL",
    note: "外との接点",
    aiText: "",
    rows: socialRowsWithAi,
  };
  const transpersonalBlock = {
    title: "TRANSPERSONAL",
    note: "構造変化",
    aiText: "",
    rows: transpersonalRowsWithAi,
  };
  const axisBlock = {
    title: "AXIS",
    note: "構造の骨",
    aiText: "",
    rows: axisRowsWithAi,
  };
  const deepBlock = {
    title: "DEEP",
    note: "地下構造",
    aiText: "",
    rows: deepRowsWithAi,
  };

  pageDefs.push({
    type: "page",
    meta: meta[5],
    leftRows: [],
    rightRows: [],
    middleHtml: buildCoreSection({ relationCore, coreConnections: coreList, aName, bName }),
    bottomSections: [{ label: "", text: sampleSectionText("core") }],
    pageClass: "page-core",
  });

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
      leftNote: "上位2件の FLOW アスペクト",
      rightNote: "上位2件の FRICTION アスペクト",
      leftItems: flowItems,
      rightItems: frictionItems,
      itemMode: true,
    }),
    bottomSections: [],
    variant: "slide3",
    pageClass: "page-flow-friction",
  });

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
      leftNote: "上位2件の COMMUNICATION アスペクト",
      rightNote: "上位2件の ATTRACTION アスペクト",
      leftItems: commItems,
      rightItems: attractionItems,
      itemMode: true,
    }),
    bottomSections: [],
    variant: "slide3",
    pageClass: "page-comm-attraction",
  });

  pageDefs.push({
    type: "page",
    meta: meta[8],
    leftRows: [],
    rightRows: [],
    middleHtml: buildCompareBlockStack([personalBlock]),
    bottomSections: [],
    pageClass: "page-personal",
  });

  pageDefs.push({
    type: "page",
    meta: meta[9],
    leftRows: [],
    rightRows: [],
    middleHtml: buildCompareBlockStack([socialBlock, transpersonalBlock]),
    bottomSections: [],
    pageClass: "page-social",
  });

  pageDefs.push({
    type: "page",
    meta: meta[10],
    leftRows: [],
    rightRows: [],
    middleHtml: buildCompareBlockStack([axisBlock, deepBlock]),
    bottomSections: [],
    pageClass: "page-axis-deep",
  });

  pageDefs.push({
    type: "page",
    meta: meta[11],
    leftRows: [],
    rightRows: [],
    middleHtml: buildHouseIngressPage({
      pageTitle: "A→B HOUSE流入一覧",
      heading: `${shortName(aName)} → ${shortName(bName)}`,
      items: houseItemsBA,
    }),
    bottomSections: [],
    pageClass: "page-house",
  });

  pageDefs.push({
    type: "page",
    meta: meta[12],
    leftRows: [],
    rightRows: [],
    middleHtml: buildHouseIngressPage({
      pageTitle: "B→A HOUSE流入一覧",
      heading: `${shortName(bName)} → ${shortName(aName)}`,
      items: houseItemsAB,
    }),
    bottomSections: [],
    pageClass: "page-house",
  });

  pageDefs.push({
    type: "page",
    meta: meta[13],
    leftRows: [],
    rightRows: [],
    middleHtml: buildRelationPatternSection({
      pattern: { ...relationPattern, name: sampleSectionText("pattern_name") },
      evidence: relationPattern?.evidence || [],
      text: sampleSectionText("pattern_summary"),
    }),
    bottomSections: [],
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
  return buildRelationHtml(view);
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
