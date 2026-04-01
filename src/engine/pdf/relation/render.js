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

function angleDistance(a, b) {
  const aNum = Number(a);
  const bNum = Number(b);
  if (!Number.isFinite(aNum) || !Number.isFinite(bNum)) return null;
  const diff = Math.abs(aNum - bNum) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function signRelationType(aSignKey, bSignKey) {
  if (!aSignKey || !bSignKey) return "other";
  if (aSignKey === bSignKey) return "same_sign";
  const aIdx = SIGN_ORDER.indexOf(aSignKey);
  const bIdx = SIGN_ORDER.indexOf(bSignKey);
  if (aIdx < 0 || bIdx < 0) return "other";
  const delta = Math.abs(aIdx - bIdx);
  const steps = Math.min(delta, 12 - delta);
  if (steps === 6) return "opposite_sign";
  const aElem = SIGN_ELEMENT[aSignKey];
  const bElem = SIGN_ELEMENT[bSignKey];
  if (aElem && bElem && aElem === bElem) return "same_element";
  const squarePairs = new Set(["fire_water", "water_fire", "earth_air", "air_earth"]);
  if (aElem && bElem && squarePairs.has(`${aElem}_${bElem}`)) return "square_element";
  if (steps === 5) return "quincunx_like";
  if (steps === 1) return "adjacent";
  return "other";
}

function buildComparePairs({ aPlanets = [], bPlanets = [], connections = [] } = {}) {
  const aMap = new Map(aPlanets.map((p) => [p?.body_key, p]));
  const bMap = new Map(bPlanets.map((p) => [p?.body_key, p]));
  const compareKeys = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "asc", "mc", "north_node"];
  const out = [];

  compareKeys.forEach((key) => {
    const a = aMap.get(key);
    const b = bMap.get(key);
    if (!a || !b) return;
    const conn = connections.find((c) => c?.a?.body_key === key && c?.b?.body_key === key);
    const dist = angleDistance(a?.lon_deg, b?.lon_deg);
    const relation = signRelationType(a?.sign_key, b?.sign_key);
    out.push({
      body_key: key,
      body_ja: a?.body_ja || b?.body_ja || key,
      a,
      b,
      distance_deg: dist,
      aspect: conn?.aspect || null,
      orb: conn?.orb ?? null,
      sign_relation: relation,
      sign_relation_label: SIGN_RELATION_LABELS[relation] || relation,
    });
  });

  return out;
}

function buildSignRelationPairs({ aPlanets = [], bPlanets = [] } = {}) {
  const aCore = pickCoreBodies(aPlanets);
  const bCore = pickCoreBodies(bPlanets);
  const out = [];
  for (const a of aCore) {
    for (const b of bCore) {
      if (!a?.sign_key || !b?.sign_key) continue;
      const type = signRelationType(a.sign_key, b.sign_key);
      out.push({
        a_sign_key: a.sign_key,
        a_sign_ja: a.sign_ja || a.sign_key,
        b_sign_key: b.sign_key,
        b_sign_ja: b.sign_ja || b.sign_key,
        relation_type: type,
        relation_label: SIGN_RELATION_LABELS[type] || type,
      });
    }
  }
  const weight = (type) => {
    const map = { same_sign: 5, opposite_sign: 5, same_element: 4, square_element: 4, quincunx_like: 3, adjacent: 2, other: 1 };
    return map[type] || 1;
  };
  return out
    .sort((a, b) => weight(b.relation_type) - weight(a.relation_type))
    .slice(0, 8);
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

function pickCoreBodies(list = []) {
  return list.filter((row) => CORE_BODIES.has(row?.body_key));
}

function isNodeBody(key) {
  return key === "north_node" || key === "south_node";
}

function normalizePairKey(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  const aIdx = BODY_ORDER_MAP.has(left) ? BODY_ORDER_MAP.get(left) : 999;
  const bIdx = BODY_ORDER_MAP.has(right) ? BODY_ORDER_MAP.get(right) : 999;
  if (aIdx <= bIdx) return `${left}_${right}`;
  return `${right}_${left}`;
}









function scoreConnection(conn, category = "", bonus = 0) {
  const orb = Number.isFinite(Number(conn?.orb)) ? Number(conn.orb) : 99;
  const aKey = conn?.a?.body_key || "";
  const bKey = conn?.b?.body_key || "";
  const pairKey = normalizePairKey(aKey, bKey);
  const weight = (BODY_PRIORITY[aKey] || 0) + (BODY_PRIORITY[bKey] || 0);
  const aspectWeight = ASPECT_WEIGHT[String(conn?.aspect || "").toLowerCase()] || 0;
  const orbScore = Math.max(0, 10 - orb) * 5;
  const pairScore = PAIR_PRIORITY[pairKey] || 0;
  let categoryScore = 0;
  const aspect = String(conn?.aspect || "").toLowerCase();
  const hasJupiter = aKey === "jupiter" || bKey === "jupiter";

  if (category === "core") {
    if (matchPairSet(aKey, bKey, CORE_PAIR_KEYS)) categoryScore += 8;
    if (isNodeBody(aKey) || isNodeBody(bKey)) categoryScore += 6;
    if (hasJupiter && orb > 1.2) categoryScore -= 6;
  }
  if (category === "flow") {
    if (SOFT_ASPECTS.has(aspect) || aspect === "same_sign" || aspect === "same_element") categoryScore += 6;
    if (hasJupiter) categoryScore += 4;
    if (AXIS_BODIES.has(aKey) || AXIS_BODIES.has(bKey)) categoryScore -= 2;
  }
  if (category === "friction") {
    if (HARD_ASPECTS.has(aspect)) categoryScore += 6;
    if (matchPairSet(aKey, bKey, FRICTION_PAIR_KEYS)) categoryScore += 4;
  }
  if (category === "comm") {
    if (matchPairSet(aKey, bKey, COMM_PAIR_KEYS)) categoryScore += 6;
    if (aKey === "mercury" || bKey === "mercury") categoryScore += 3;
    if (aKey === "moon" || bKey === "moon") categoryScore += 2;
    if (aKey === "venus" || bKey === "venus") categoryScore += 1.5;
    if (aKey === "jupiter" || bKey === "jupiter") categoryScore += 1.5;
  }
  if (category === "attraction") {
    if (matchPairSet(aKey, bKey, ATTRACTION_PAIR_KEYS)) categoryScore += 6;
    if (hasJupiter) categoryScore += 3;
    if (aKey === "venus" || bKey === "venus") categoryScore += 3;
    if (aKey === "mars" || bKey === "mars") categoryScore += 3;
    if (aKey === "sun" || bKey === "sun") categoryScore += 1.5;
    if (aKey === "moon" || bKey === "moon") categoryScore += 1.5;
  }
  if (category === "axis") {
    if (AXIS_BODIES.has(aKey) || AXIS_BODIES.has(bKey)) categoryScore += 6;
  }
  if (category === "deep") {
    if (DEEP_BODIES.has(aKey) || DEEP_BODIES.has(bKey)) categoryScore += 6;
  }

  return orbScore + weight * 3 + aspectWeight * 2 + pairScore * 3 + categoryScore + bonus;
}

function sortByScore(list = [], category = "") {
  return list.slice().sort((a, b) => scoreConnection(b, category) - scoreConnection(a, category));
}

function matchPairSet(aKey, bKey, set) {
  return set.has(normalizePairKey(aKey, bKey));
}

function buildSameSignElementMatches(aPlanets = [], bPlanets = []) {
  const target = new Set(["sun", "moon", "mercury", "venus", "mars", "jupiter", "asc"]);
  const out = [];
  for (const a of aPlanets) {
    if (!target.has(a?.body_key)) continue;
    for (const b of bPlanets) {
      if (!target.has(b?.body_key)) continue;
      if (!a?.sign_key || !b?.sign_key) continue;
      if (a.sign_key === b.sign_key) {
        out.push({
          a,
          b,
          aspect: "same_sign",
          orb: 0.6,
          pair: normalizePairKey(a.body_key, b.body_key),
        });
        continue;
      }
      const aElem = SIGN_ELEMENT[a.sign_key];
      const bElem = SIGN_ELEMENT[b.sign_key];
      if (aElem && bElem && aElem === bElem) {
        out.push({
          a,
          b,
          aspect: "same_element",
          orb: 1.2,
          pair: normalizePairKey(a.body_key, b.body_key),
        });
      }
    }
  }
  return out;
}

function filterConnections(connections = [], predicate) {
  return connections.filter((c) => {
    const aKey = c?.a?.body_key;
    const bKey = c?.b?.body_key;
    if (!aKey || !bKey) return false;
    return predicate(c, aKey, bKey);
  });
}

function buildCoreConnections(connections = []) {
  return filterConnections(connections, (c, aKey, bKey) => {
    if (matchPairSet(aKey, bKey, CORE_PAIR_KEYS)) return true;
    if (isNodeBody(aKey) && ["sun", "moon", "asc"].includes(bKey)) return true;
    if (isNodeBody(bKey) && ["sun", "moon", "asc"].includes(aKey)) return true;
    return false;
  });
}

function buildFlowConnections(connections = [], aPlanets = [], bPlanets = []) {
  const soft = filterConnections(connections, (c) => SOFT_ASPECTS.has(String(c?.aspect || "")));
  const same = buildSameSignElementMatches(aPlanets, bPlanets);
  return [...soft, ...same];
}

function buildFrictionConnections(connections = []) {
  return filterConnections(connections, (c, aKey, bKey) => {
    if (HARD_ASPECTS.has(String(c?.aspect || ""))) return true;
    return matchPairSet(aKey, bKey, FRICTION_PAIR_KEYS) && HARD_ASPECTS.has(String(c?.aspect || ""));
  });
}

function buildCommunicationConnections(connections = []) {
  return filterConnections(connections, (c, aKey, bKey) => matchPairSet(aKey, bKey, COMM_PAIR_KEYS));
}

function buildAttractionConnections(connections = []) {
  return filterConnections(connections, (c, aKey, bKey) => matchPairSet(aKey, bKey, ATTRACTION_PAIR_KEYS));
}

function makeConnectionKey(conn) {
  const aKey = conn?.a?.body_key || "";
  const bKey = conn?.b?.body_key || "";
  const aspect = normalizeAspectKey(conn?.aspect) || "unknown";
  const rounded = formatOrbValue(conn?.orb);
  return `${aKey}_${bKey}_${aspect}_${rounded}`;
}

function makePairKey(conn) {
  return makeConnectionKey(conn);
}

function assignConnections({ candidates = [], category = "", max = 6, used = new Set(), usedPairs = null, assigned = null, allow = null, diversity = null } = {}) {
  const picked = [];
  const bodyCount = new Map();
  const list = candidates
    .filter((c) => {
      if (!c) return false;
      const key = makeConnectionKey(c);
      if (used.has(key)) return false;
      if (usedPairs && usedPairs.has(makePairKey(c))) return false;
      return allow ? allow(c) : true;
    })
    .sort((a, b) => scoreConnection(b, category) - scoreConnection(a, category));

  for (const c of list) {
    if (picked.length >= max) break;
    if (diversity && !diversity(c, bodyCount)) continue;
    const key = makeConnectionKey(c);
    used.add(key);
    if (usedPairs) usedPairs.add(makePairKey(c));
    if (assigned) assigned.set(key, category || "unassigned");
    picked.push(c);
    const aKey = c?.a?.body_key || "";
    const bKey = c?.b?.body_key || "";
    if (aKey) bodyCount.set(aKey, (bodyCount.get(aKey) || 0) + 1);
    if (bKey) bodyCount.set(bKey, (bodyCount.get(bKey) || 0) + 1);
  }
  return picked;
}

function houseNumberForLon(lon, ascLon) {
  if (!Number.isFinite(Number(lon)) || !Number.isFinite(Number(ascLon))) return null;
  const signIndex = Math.floor(((Number(lon) % 360) + 360) % 360 / 30);
  const ascIndex = Math.floor(((Number(ascLon) % 360) + 360) % 360 / 30);
  return ((signIndex - ascIndex + 12) % 12) + 1;
}

function buildHouseOverlayRows({ ownerPlanets = [], guestPlanets = [], ownerName = "A", guestName = "B" } = {}) {
  const asc = ownerPlanets.find((p) => p?.body_key === "asc");
  const ascLon = asc?.lon_deg;
  if (!Number.isFinite(Number(ascLon))) return [];
  const out = [];
  for (const row of guestPlanets) {
    if (!row?.body_key || !Number.isFinite(Number(row?.lon_deg))) continue;
    if (AXIS_BODIES.has(row.body_key)) continue;
    if (DEEP_BODIES.has(row.body_key)) continue;
    const house = houseNumberForLon(row.lon_deg, ascLon);
    if (!Number.isFinite(Number(house))) continue;
    const label = row?.body_glyph || row?.body_ja || formatBodyKeyShort(row?.body_key);
    out.push(`${guestName} ${label} → ${ownerName} ${house}H`);
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
  const sentenceSplit = raw
    .split(/[。！？]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.endsWith("。") ? s : `${s}。`));
  return sentenceSplit.length ? sentenceSplit : byLine;
}

function buildHouseIngressSection({
  ownerPlanets = [],
  guestPlanets = [],
  ownerName = "A",
  guestName = "B",
  maxHouses = 5,
  aiLines = [],
  aiSummary = "",
} = {}) {
  const asc = ownerPlanets.find((p) => p?.body_key === "asc");
  const ascLon = asc?.lon_deg;
  const heading = `${shortName(guestName)} → ${shortName(ownerName)}`;
  if (!Number.isFinite(Number(ascLon))) return { heading, houses: [], summary: "" };

  const byHouse = new Map();
  const weightByHouse = new Map();
  for (const row of guestPlanets) {
    if (!row?.body_key || !Number.isFinite(Number(row?.lon_deg))) continue;
    if (AXIS_BODIES.has(row.body_key)) continue;
    const house = houseNumberForLon(row.lon_deg, ascLon);
    if (!Number.isFinite(Number(house))) continue;
    const label = [row.body_glyph, row.body_ja].filter(Boolean).join(" ").trim();
    if (!label) continue;
    if (!byHouse.has(house)) byHouse.set(house, []);
    const list = byHouse.get(house);
    list.push(label);
    const key = String(row.body_key || "").toLowerCase();
    const w = HOUSE_BODY_WEIGHT[key] ?? 1;
    weightByHouse.set(house, (weightByHouse.get(house) || 0) + w);
  }

  const houseEntries = Array.from(byHouse.entries())
    .map(([house, items]) => ({
      house,
      label: HOUSE_LABELS[house] || "",
      items,
      weight: weightByHouse.get(house) || 0,
    }))
    .filter((row) => row.items && row.items.length)
    .sort((a, b) => (b.weight - a.weight) || (a.house - b.house))
    .slice(0, maxHouses);

  const aiList = Array.isArray(aiLines) ? aiLines : [];
  const normalizedAi = aiList.length ? aiList.slice(0, houseEntries.length) : [];

  return { heading, houses: houseEntries, aiLines: normalizedAi, summary: aiSummary || "" };
}

function countBy(list = [], keyFn) {
  const out = {};
  for (const row of list) {
    const key = keyFn(row);
    if (!key) continue;
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function pickSharedMax(countA = {}, countB = {}) {
  let best = null;
  for (const key of Object.keys({ ...countA, ...countB })) {
    const a = countA[key] || 0;
    const b = countB[key] || 0;
    if (!a || !b) continue;
    const total = a + b;
    if (!best || total > best.total) best = { key, total, a, b };
  }
  return best;
}

function pickSharedMaxWithMin(countA = {}, countB = {}, minEach = 1) {
  let best = null;
  for (const key of Object.keys({ ...countA, ...countB })) {
    const a = countA[key] || 0;
    const b = countB[key] || 0;
    if (a < minEach || b < minEach) continue;
    const total = a + b;
    if (!best || total > best.total) best = { key, total, a, b };
  }
  return best;
}

function pickTop(counts = {}) {
  let best = null;
  for (const [key, count] of Object.entries(counts)) {
    if (!best || count > best.count) best = { key, count };
  }
  return best;
}

function buildSignLabelMap(list = []) {
  const out = {};
  for (const row of list) {
    if (row?.sign_key && row?.sign_ja && !out[row.sign_key]) {
      out[row.sign_key] = row.sign_ja;
    }
  }
  return out;
}

function bandFromHouse(house) {
  const num = Number(house);
  if (!Number.isFinite(num)) return null;
  return HOUSE_BANDS.find((b) => b.houses.includes(num)) || null;
}

function dominantBand(list = []) {
  const counts = {};
  for (const row of list) {
    const band = bandFromHouse(row?.house);
    if (!band) continue;
    counts[band.key] = (counts[band.key] || 0) + 1;
  }
  let best = null;
  for (const [key, count] of Object.entries(counts)) {
    if (!best || count > best.count) best = { key, count };
  }
  if (!best) return null;
  return HOUSE_BANDS.find((b) => b.key === best.key) || null;
}

function buildRelationInsight({ aPlanets, bPlanets, elementBalanceA, elementBalanceB } = {}) {
  const aCore = pickCoreBodies(aPlanets);
  const bCore = pickCoreBodies(bPlanets);

  const signLabelMap = {
    ...buildSignLabelMap(aCore),
    ...buildSignLabelMap(bCore),
  };

  const signCountA = countBy(aCore, (row) => row?.sign_key);
  const signCountB = countBy(bCore, (row) => row?.sign_key);

  const overlapSign = pickSharedMaxWithMin(signCountA, signCountB, 1);
  let overlapLine = "";
  if (overlapSign?.key) {
    const label = signLabelMap[overlapSign.key] || overlapSign.key;
    const tone =
      overlapSign.a >= 2 || overlapSign.b >= 2
        ? "天体が寄る帯で重なりが濃く出ています。"
        : "双方の分布が同じ帯で接触しています。";
    overlapLine = `重なりは${label}帯に現れ、${tone}`;
  }

  if (!overlapLine) {
    const elemA = elementBalanceA?.element_count || {};
    const elemB = elementBalanceB?.element_count || {};
    const overlapElem = pickSharedMaxWithMin(elemA, elemB, 3);
    if (overlapElem?.key) {
      const label = formatElementKey(overlapElem.key);
      overlapLine = `重なりは${label}寄りで、同じ温度帯に分布します。`;
    }
  }

  if (!overlapLine) {
    const bandCountA = countBy(aCore, (row) => bandFromHouse(row?.house)?.key);
    const bandCountB = countBy(bCore, (row) => bandFromHouse(row?.house)?.key);
    const sharedBand = pickSharedMaxWithMin(bandCountA, bandCountB, 2);
    if (sharedBand?.key) {
      const band = HOUSE_BANDS.find((b) => b.key === sharedBand.key);
      if (band) overlapLine = `重なりは${band.label}に分布し、そこで接点が生まれます。`;
    }
  }

  if (!overlapLine) overlapLine = "重なりは一点に定まらず、配置は分散しています。";

  let separationLine = "";
  let separationBand = null;

  const topSignA = pickTop(signCountA);
  const topSignB = pickTop(signCountB);
  if (topSignA?.key && topSignB?.key && topSignA.key !== topSignB.key && topSignA.count >= 2 && topSignB.count >= 2) {
    const labelA = signLabelMap[topSignA.key] || topSignA.key;
    const labelB = signLabelMap[topSignB.key] || topSignB.key;
    separationLine = `分離は${labelA}帯と${labelB}帯の重心差で現れます。`;
  }

  if (!separationLine) {
    const elemA = elementBalanceA?.top_element || "";
    const elemB = elementBalanceB?.top_element || "";
    const pair = `${elemA}_${elemB}`;
    const opposites = new Set(["fire_water", "water_fire", "earth_air", "air_earth"]);
    const elemCountA = elementBalanceA?.element_count || {};
    const elemCountB = elementBalanceB?.element_count || {};
    if (opposites.has(pair) && (elemCountA[elemA] || 0) >= 4 && (elemCountB[elemB] || 0) >= 4) {
      separationLine = `分離は${formatElementKey(elemA)}と${formatElementKey(elemB)}の対照で現れます。`;
    }
  }

  if (!separationLine) {
    const bandCountA = countBy(aCore, (row) => bandFromHouse(row?.house)?.key);
    const bandCountB = countBy(bCore, (row) => bandFromHouse(row?.house)?.key);
    const bandA = dominantBand(aCore);
    const bandB = dominantBand(bCore);
    if (bandA && bandB && bandA.key !== bandB.key && (bandCountA[bandA.key] || 0) >= 4 && (bandCountB[bandB.key] || 0) >= 4) {
      separationLine = `分離は${bandA.label}と${bandB.label}の方向差で現れます。`;
      separationBand = { a: bandA, b: bandB };
    }
  }

  if (!separationLine) separationLine = "分離は固定されず、配置は交差します。";

  let flowLine = "";
  const combinedSignIndices = [
    ...aCore.map((r) => SIGN_ORDER.indexOf(r.sign_key)).filter((i) => i >= 0),
    ...bCore.map((r) => SIGN_ORDER.indexOf(r.sign_key)).filter((i) => i >= 0),
  ];
  const uniq = Array.from(new Set(combinedSignIndices)).sort((a, b) => a - b);
  if (uniq.length >= 3) {
    const extended = uniq.concat(uniq.map((i) => i + 12));
    let best = { len: 1, start: uniq[0], end: uniq[0] };
    let start = extended[0];
    let len = 1;
    for (let i = 1; i < extended.length; i++) {
      if (extended[i] === extended[i - 1] + 1) {
        len += 1;
      } else {
        if (len > best.len && start < 12) best = { len, start, end: extended[i - 1] };
        start = extended[i];
        len = 1;
      }
      if (i === extended.length - 1 && len > best.len && start < 12) {
        best = { len, start, end: extended[i] };
      }
    }
    if (best.len >= 3) {
      const startKey = SIGN_ORDER[best.start % 12];
      const endKey = SIGN_ORDER[best.end % 12];
      const startLabel = signLabelMap[startKey] || startKey;
      const endLabel = signLabelMap[endKey] || endKey;
      flowLine = `流れは${startLabel}→${endLabel}の帯で連続します。`;
    }
  }
  if (!flowLine && separationBand?.a && separationBand?.b) {
    if (separationBand.a.key === "inner" && separationBand.b.key === "outer") {
      flowLine = "流れは内側帯から社会帯へ移ります。";
    } else if (separationBand.a.key === "outer" && separationBand.b.key === "inner") {
      flowLine = "流れは社会帯から内側帯へ戻ります。";
    } else {
      flowLine = `流れは${separationBand.a.label}と${separationBand.b.label}を往復します。`;
    }
  }

  const lines = [overlapLine, separationLine];
  if (flowLine) lines.push(flowLine);
  return lines;
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

function deriveRelationData(view) {
  const aPlanetsRaw = view?.planet_matrix?.a || [];
  const bPlanetsRaw = view?.planet_matrix?.b || [];
  const aName = view?.people?.a?.name || "A";
  const bName = view?.people?.b?.name || "B";
  const seedLabel = view?.pair_key || "";

  const aDeepAll = Array.isArray(view?.deep_points?.a) ? view.deep_points.a : [];
  const bDeepAll = Array.isArray(view?.deep_points?.b) ? view.deep_points.b : [];
  const aFull = mergeUniqueBodies(aPlanetsRaw, aDeepAll);
  const bFull = mergeUniqueBodies(bPlanetsRaw, bDeepAll);

  const connectionsAll = Array.isArray(view?.connections) ? view.connections : [];
  const used = new Set();
  const usedPairs = new Set();
  const assigned = new Map();

  const coreDiversity = (conn, counts) => {
    const aKey = conn?.a?.body_key || "";
    const bKey = conn?.b?.body_key || "";
    const limit = (key) => (key === "moon" ? 2 : 2);
    if (aKey && (counts.get(aKey) || 0) >= limit(aKey)) return false;
    if (bKey && (counts.get(bKey) || 0) >= limit(bKey)) return false;
    return true;
  };

  const coreCandidates = buildCoreConnections(connectionsAll);
  let coreList = assignConnections({
    candidates: coreCandidates,
    category: "core",
    max: 5,
    used,
    usedPairs,
    assigned,
    diversity: coreDiversity,
  });

  const ensureCorePair = (aKey, bKey) => {
    const found = connectionsAll
      .filter((c) => {
        const a = c?.a?.body_key;
        const b = c?.b?.body_key;
        return (a === aKey && b === bKey) || (a === bKey && b === aKey);
      })
      .sort((a, b) => (a?.orb ?? 99) - (b?.orb ?? 99))[0];
    if (!found) return;
    const exists = coreList.some((c) => {
      const a = c?.a?.body_key;
      const b = c?.b?.body_key;
      return (a === aKey && b === bKey) || (a === bKey && b === aKey);
    });
    if (exists) return;
    coreList = [found, ...coreList].slice(0, 5);
  };

  ensureCorePair("sun", "moon");
  ensureCorePair("moon", "moon");

  if (coreList.length < 3) {
    const fallback = assignConnections({
      candidates: connectionsAll,
      category: "core",
      max: 3 - coreList.length,
      used,
      usedPairs,
      assigned,
      diversity: coreDiversity,
      allow: (c) => {
        const aKey = c?.a?.body_key || "";
        const bKey = c?.b?.body_key || "";
        if (DEEP_BODIES.has(aKey) || DEEP_BODIES.has(bKey)) return false;
        if (AXIS_BODIES.has(aKey) && AXIS_BODIES.has(bKey)) return false;
        if ((aKey === "jupiter" || bKey === "jupiter") && Number(c?.orb || 99) > 1.2) return false;
        return true;
      },
    });
    coreList = coreList.concat(fallback);
  }

  const commBodies = new Set(["mercury", "moon", "venus", "sun", "jupiter"]);
  const commMain = new Set(["mercury", "moon"]);
  const commCandidates = buildCommunicationConnections(connectionsAll);
  const commList = assignConnections({
    candidates: commCandidates,
    category: "comm",
    max: 4,
    used,
    usedPairs,
    assigned,
    allow: (c) => {
      const aKey = c?.a?.body_key || "";
      const bKey = c?.b?.body_key || "";
      if (AXIS_BODIES.has(aKey) || AXIS_BODIES.has(bKey)) return false;
      if (DEEP_BODIES.has(aKey) || DEEP_BODIES.has(bKey)) return false;
      if (!commBodies.has(aKey) || !commBodies.has(bKey)) return false;
      if (!(commMain.has(aKey) || commMain.has(bKey))) return false;
      return true;
    },
  });

  const attractionBodies = new Set(["venus", "mars", "sun", "moon", "jupiter"]);
  const attractionMain = new Set(["venus", "mars", "jupiter"]);
  const attractionCandidates = buildAttractionConnections(connectionsAll);
  const attractionList = assignConnections({
    candidates: attractionCandidates,
    category: "attraction",
    max: 4,
    used,
    usedPairs,
    assigned,
    allow: (c) => {
      const aKey = c?.a?.body_key || "";
      const bKey = c?.b?.body_key || "";
      if (AXIS_BODIES.has(aKey) || AXIS_BODIES.has(bKey)) return false;
      if (DEEP_BODIES.has(aKey) || DEEP_BODIES.has(bKey)) return false;
      if (!attractionBodies.has(aKey) || !attractionBodies.has(bKey)) return false;
      if (!(attractionMain.has(aKey) || attractionMain.has(bKey))) return false;
      return true;
    },
  });

  const flowCandidates = buildFlowConnections(connectionsAll, aPlanetsRaw, bPlanetsRaw);
  const flowList = assignConnections({
    candidates: flowCandidates,
    category: "flow",
    max: 6,
    used,
    usedPairs,
    assigned,
    allow: (c) => {
      const aKey = c?.a?.body_key || "";
      const bKey = c?.b?.body_key || "";
      const aspect = String(c?.aspect || "").toLowerCase();
      if (HARD_ASPECTS.has(aspect)) return false;
      if (DEEP_BODIES.has(aKey) || DEEP_BODIES.has(bKey)) return false;
      if (aspect === "conjunction") {
        const heavy = new Set(["saturn", "pluto", "uranus", "neptune"]);
        if (heavy.has(aKey) || heavy.has(bKey)) return false;
      }
      if (AXIS_BODIES.has(aKey) || AXIS_BODIES.has(bKey)) {
        const allowAxis = new Set(["sun", "moon", "mercury", "venus", "mars", "jupiter"]);
        if (!allowAxis.has(aKey) && !allowAxis.has(bKey)) return false;
      }
      return true;
    },
  });

  const frictionCandidates = buildFrictionConnections(connectionsAll);
  const frictionList = assignConnections({
    candidates: frictionCandidates,
    category: "friction",
    max: 6,
    used,
    usedPairs,
    assigned,
    allow: (c) => {
      const aKey = c?.a?.body_key || "";
      const bKey = c?.b?.body_key || "";
      if (AXIS_BODIES.has(aKey) || AXIS_BODIES.has(bKey)) return false;
      if (DEEP_BODIES.has(aKey) || DEEP_BODIES.has(bKey)) return false;
      return true;
    },
  });

  const axisList = assignConnections({
    candidates: filterConnections(connectionsAll, (c, aKey, bKey) => AXIS_BODIES.has(aKey) || AXIS_BODIES.has(bKey)),
    category: "axis",
    max: 4,
    used,
    usedPairs,
    assigned,
    allow: (c) => {
      const aKey = c?.a?.body_key || "";
      const bKey = c?.b?.body_key || "";
      if (AXIS_BODIES.has(aKey) && AXIS_BODIES.has(bKey)) return true;
      const personal = new Set(["sun", "moon", "venus", "mercury"]);
      if (AXIS_BODIES.has(aKey) && personal.has(bKey)) return true;
      if (AXIS_BODIES.has(bKey) && personal.has(aKey)) return true;
      return false;
    },
  });

  const deepList = assignConnections({
    candidates: filterConnections(connectionsAll, (c, aKey, bKey) => DEEP_BODIES.has(aKey) || DEEP_BODIES.has(bKey)),
    category: "deep",
    max: 3,
    used,
    usedPairs,
    assigned,
  });

  const houseAiLinesA = parseAiLines(view?.ai_texts?.house_ingress_a_lines);
  const houseAiLinesB = parseAiLines(view?.ai_texts?.house_ingress_b_lines);
  const houseAiSummaryA = view?.ai_texts?.house_ingress_a_summary || "";
  const houseAiSummaryB = view?.ai_texts?.house_ingress_b_summary || "";
  const houseSections = [
    buildHouseIngressSection({
      ownerPlanets: aFull,
      guestPlanets: bFull,
      ownerName: aName,
      guestName: bName,
      aiLines: houseAiLinesA,
      aiSummary: houseAiSummaryA,
    }),
    buildHouseIngressSection({
      ownerPlanets: bFull,
      guestPlanets: aFull,
      ownerName: bName,
      guestName: aName,
      aiLines: houseAiLinesB,
      aiSummary: houseAiSummaryB,
    }),
  ];

  const baseLines = buildRelationInsight({
    aPlanets: aPlanetsRaw,
    bPlanets: bPlanetsRaw,
    elementBalanceA: view?.element_balance?.a || {},
    elementBalanceB: view?.element_balance?.b || {},
  });

  const comparePairs = buildComparePairs({
    aPlanets: aPlanetsRaw,
    bPlanets: bPlanetsRaw,
    connections: connectionsAll,
  });

  const relationCenter = buildRelationCenter({
    aPlanets: aPlanetsRaw,
    bPlanets: bPlanetsRaw,
    elementBalanceA: view?.element_balance?.a || {},
    elementBalanceB: view?.element_balance?.b || {},
  });
  relationCenter.overlap_band = baseLines?.[0] || "";
  relationCenter.separation_band = baseLines?.[1] || "";
  relationCenter.flow_band = baseLines?.[2] || "";

  const relationCore = buildRelationCore({
    comparePairs,
    coreConnections: coreList,
    flowList,
    frictionList,
  });

  const signRelationPairs = buildSignRelationPairs({
    aPlanets: aPlanetsRaw,
    bPlanets: bPlanetsRaw,
  });

  const relationPattern = buildRelationPattern({
    relationCenter,
    relationCore,
    comparePairs,
    signPairs: signRelationPairs,
    flowList,
    frictionList,
    houseSections,
  });

  return {
    coreList,
    flowList,
    frictionList,
    commList,
    attractionList,
    axisList,
    deepList,
    houseSections,
    comparePairs,
    signRelationPairs,
    relationCenter,
    relationCore,
    relationPattern,
  };
}

function buildRelationCenter({ aPlanets = [], bPlanets = [], elementBalanceA = {}, elementBalanceB = {} } = {}) {
  const aCore = pickCoreBodies(aPlanets);
  const bCore = pickCoreBodies(bPlanets);
  const signCountA = countBy(aCore, (row) => row?.sign_key);
  const signCountB = countBy(bCore, (row) => row?.sign_key);
  const houseCountA = countBy(aCore, (row) => row?.house);
  const houseCountB = countBy(bCore, (row) => row?.house);

  const sharedSign = pickSharedMaxWithMin(signCountA, signCountB, 1);
  const sharedHouse = pickSharedMaxWithMin(houseCountA, houseCountB, 1);
  const overlapLine = buildRelationInsight({ aPlanets, bPlanets, elementBalanceA, elementBalanceB })?.[0] || "";

  let dominantOverlapType = "dispersed";
  if (sharedSign?.key) dominantOverlapType = "sign";
  else if (sharedHouse?.key) dominantOverlapType = "house";
  else {
    const elemA = elementBalanceA?.element_count || {};
    const elemB = elementBalanceB?.element_count || {};
    const overlapElem = pickSharedMaxWithMin(elemA, elemB, 3);
    if (overlapElem?.key) dominantOverlapType = "element";
  }

  const topHouseA = pickTop(houseCountA);
  const topHouseB = pickTop(houseCountB);
  const directionVector = topHouseA?.key && topHouseB?.key ? `${topHouseA.key}H→${topHouseB.key}H` : "";

  return {
    shared_sign_cluster: sharedSign?.key || "",
    shared_sign_label: sharedSign?.key ? (aCore.find((r) => r.sign_key === sharedSign.key)?.sign_ja || sharedSign.key) : "",
    shared_house_cluster: sharedHouse?.key ? `${sharedHouse.key}H` : "",
    dominant_overlap_type: dominantOverlapType,
    direction_vector: directionVector,
    overlap_line: overlapLine,
  };
}

function buildRelationCore({ comparePairs = [], coreConnections = [], flowList = [], frictionList = [] } = {}) {
  const priority = ["sun", "moon", "mercury", "venus", "mars"];
  const scoreBody = (key) => {
    const idx = priority.indexOf(key);
    return idx >= 0 ? (priority.length - idx) : 0;
  };
  const axisCandidate = coreConnections
    .slice()
    .sort((a, b) => {
      const aScore = scoreBody(a?.a?.body_key) + scoreBody(a?.b?.body_key);
      const bScore = scoreBody(b?.a?.body_key) + scoreBody(b?.b?.body_key);
      return (bScore - aScore) || ((a?.orb ?? 99) - (b?.orb ?? 99));
    })[0];

  let mainAxis = "—";
  if (axisCandidate) {
    const left = axisCandidate?.a?.body_ja || axisCandidate?.a?.body_key || "—";
    const right = axisCandidate?.b?.body_ja || axisCandidate?.b?.body_key || "—";
    mainAxis = `${left}–${right}`;
  } else {
    const sameBody = comparePairs
      .filter((p) => priority.has(p?.body_key))
      .sort((a, b) => (a?.orb ?? 99) - (b?.orb ?? 99))[0];
    if (sameBody) {
      const label = sameBody?.body_ja || sameBody?.body_key || "—";
      mainAxis = `${label}–${label}`;
    }
  }

  const tensionCounts = coreConnections.reduce((acc, c) => {
    const key = normalizeAspectKey(c?.aspect);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const flowCounts = coreConnections.reduce((acc, c) => {
    const key = normalizeAspectKey(c?.aspect);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const topTension = Object.entries(tensionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  const topFlow = Object.entries(flowCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  const tensionLabel = topTension ? (ASPECT_DISPLAY[topTension]?.ja || topTension) : "—";
  const flowLabel = topFlow ? (ASPECT_DISPLAY[topFlow]?.ja || topFlow) : "—";

  return {
    main_axis: mainAxis,
    dominant_tension: tensionLabel,
    dominant_flow: flowLabel,
  };
}

function pickRelationType({ comparePairs = [], signPairs = [], flowList = [], frictionList = [], houseSections = [] } = {}) {
  const score = {
    mirror: 0,
    merge: 0,
    flow: 0,
    tension: 0,
    mismatch: 0,
    layered: 0,
    house_binding: 0,
  };

  const countByType = (list, field) =>
    list.reduce((acc, row) => {
      const key = row?.[field];
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

  const compareTypes = countByType(comparePairs, "sign_relation");
  const signTypes = countByType(signPairs, "relation_type");
  const opposite = (compareTypes.opposite_sign || 0) + (signTypes.opposite_sign || 0);
  const same = (compareTypes.same_sign || 0) + (signTypes.same_sign || 0) + (signTypes.same_element || 0);
  const mismatch = (compareTypes.quincunx_like || 0) + (signTypes.quincunx_like || 0);

  score.mirror += opposite * 3;
  score.merge += same * 2;
  score.mismatch += mismatch * 2;
  score.flow += flowList.length;
  score.tension += frictionList.length;

  const houseCount = houseSections.reduce((sum, s) => sum + (s?.houses?.length || 0), 0);
  if (houseCount >= 6) score.house_binding += 4;

  const entries = Object.entries(score).sort((a, b) => b[1] - a[1]);
  const pick = entries[0]?.[0] || "layered";
  return pick;
}

function buildRelationPattern({ relationCenter, relationCore, comparePairs, signPairs, flowList, frictionList, houseSections } = {}) {
  const patternKey = pickRelationType({ comparePairs, signPairs, flowList, frictionList, houseSections });
  const patternMap = {
    mirror: "対向軸が強い関係",
    merge: "同調で結びやすい関係",
    flow: "流れが生まれやすい関係",
    tension: "張力で輪郭が出る関係",
    mismatch: "噛み合いにくさが残る関係",
    layered: "層が重なる関係",
    house_binding: "ハウス流入が強い関係",
  };

  const evidence = [];
  if (relationCore?.main_axis && relationCore.main_axis !== "—") evidence.push(`主軸: ${relationCore.main_axis}`);
  if (relationCore?.dominant_tension && relationCore.dominant_tension !== "—") evidence.push(`張力: ${relationCore.dominant_tension}`);
  if (relationCore?.dominant_flow && relationCore.dominant_flow !== "—") evidence.push(`通路: ${relationCore.dominant_flow}`);
  if (relationCenter?.direction_vector) evidence.push(`方向: ${relationCenter.direction_vector}`);

  return {
    key: patternKey,
    name: patternMap[patternKey] || "層が重なる関係",
    evidence: evidence.slice(0, 4),
  };
}

function buildRelationPatternText({ pattern, relationCenter, relationCore } = {}) {
  const name = pattern?.name || "関係の構造";
  const overlap = relationCenter?.overlap_line || "";
  const tension = relationCore?.dominant_tension || "—";
  const flow = relationCore?.dominant_flow || "—";
  if (!name) return "この関係は複数の層で支えられています。";
  const axis = relationCore?.main_axis || "—";
  const evid = Array.isArray(pattern?.evidence) ? pattern.evidence.slice(0, 2) : [];
  const evidText = evid.length ? `根拠は${evid.join(" / ")}。` : "";
  return `${name}。${overlap ? `${overlap}` : ""}主軸は${axis}。張力は${tension}、通路は${flow}が目立ちます。${evidText}全体として、向かい合いと重なりが交差して形になります。`;
}

function buildRelationCenterText({ relationCenter }) {
  const overlap = relationCenter?.overlap_line || "重なりは一点に定まらず、配置は分散しています。";
  const direction = relationCenter?.direction_vector ? `方向は${relationCenter.direction_vector}に寄ります。` : "";
  return `${overlap}${direction}`;
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
  const aPlanetsRaw = view?.planet_matrix?.a || [];
  const bPlanetsRaw = view?.planet_matrix?.b || [];
  const aName = view?.people?.a?.name || "A";
  const bName = view?.people?.b?.name || "B";

  const aDeepAll = Array.isArray(view?.deep_points?.a) ? view.deep_points.a : [];
  const bDeepAll = Array.isArray(view?.deep_points?.b) ? view.deep_points.b : [];
  const aFull = mergeUniqueBodies(aPlanetsRaw, aDeepAll);
  const bFull = mergeUniqueBodies(bPlanetsRaw, bDeepAll);
  const aFullRows = aFull.map(formatPlanetRow);
  const bFullRows = bFull.map(formatPlanetRow);
  const elementCountsA = view?.element_balance?.a?.element_count || {};
  const elementCountsB = view?.element_balance?.b?.element_count || {};
  const dominantElementA = view?.element_balance?.a?.top_element || pickDominantElementKey(elementCountsA);
  const dominantElementB = view?.element_balance?.b?.top_element || pickDominantElementKey(elementCountsB);
  const coverWheel = buildSharedRelationWheel({
    view,
    elementKeyA: dominantElementA,
    elementKeyB: dominantElementB,
  });

  const connectionsAll = Array.isArray(view?.connections) ? view.connections : [];
  const used = new Set();
  const usedPairs = new Set();
  const assigned = new Map();

  const coreDiversity = (conn, counts) => {
    const aKey = conn?.a?.body_key || "";
    const bKey = conn?.b?.body_key || "";
    const limit = (key) => (key === "moon" ? 2 : 2);
    if (aKey && (counts.get(aKey) || 0) >= limit(aKey)) return false;
    if (bKey && (counts.get(bKey) || 0) >= limit(bKey)) return false;
    return true;
  };

  const coreCandidates = buildCoreConnections(connectionsAll);
  let coreList = assignConnections({
    candidates: coreCandidates,
    category: "core",
    max: 5,
    used,
    usedPairs,
    assigned,
    diversity: coreDiversity,
  });

  const ensureCorePair = (aKey, bKey) => {
    const found = connectionsAll
      .filter((c) => {
        const a = c?.a?.body_key;
        const b = c?.b?.body_key;
        return (a === aKey && b === bKey) || (a === bKey && b === aKey);
      })
      .sort((a, b) => (a?.orb ?? 99) - (b?.orb ?? 99))[0];
    if (!found) return;
    const exists = coreList.some((c) => {
      const a = c?.a?.body_key;
      const b = c?.b?.body_key;
      return (a === aKey && b === bKey) || (a === bKey && b === aKey);
    });
    if (exists) return;
    coreList = [found, ...coreList].slice(0, 5);
  };

  ensureCorePair("sun", "moon");
  ensureCorePair("moon", "moon");
  if (coreList.length < 3) {
    const fallback = assignConnections({
      candidates: connectionsAll,
      category: "core",
      max: 3 - coreList.length,
      used,
      usedPairs,
      assigned,
      diversity: coreDiversity,
      allow: (c) => {
        const aKey = c?.a?.body_key || "";
        const bKey = c?.b?.body_key || "";
        if (DEEP_BODIES.has(aKey) || DEEP_BODIES.has(bKey)) return false;
        if (AXIS_BODIES.has(aKey) && AXIS_BODIES.has(bKey)) return false;
        if ((aKey === "jupiter" || bKey === "jupiter") && Number(c?.orb || 99) > 1.2) return false;
        return true;
      },
    });
    coreList = coreList.concat(fallback);
  }

  const commBodies = new Set(["mercury", "moon", "venus", "sun", "jupiter"]);
  const commMain = new Set(["mercury", "moon"]);
  const commCandidates = buildCommunicationConnections(connectionsAll);
  const commList = assignConnections({
    candidates: commCandidates,
    category: "comm",
    max: 4,
    used,
    usedPairs,
    assigned,
    allow: (c) => {
      const aKey = c?.a?.body_key || "";
      const bKey = c?.b?.body_key || "";
      if (AXIS_BODIES.has(aKey) || AXIS_BODIES.has(bKey)) return false;
      if (DEEP_BODIES.has(aKey) || DEEP_BODIES.has(bKey)) return false;
      if (!commBodies.has(aKey) || !commBodies.has(bKey)) return false;
      if (!(commMain.has(aKey) || commMain.has(bKey))) return false;
      return true;
    },
  });

  const attractionBodies = new Set(["venus", "mars", "sun", "moon", "jupiter"]);
  const attractionMain = new Set(["venus", "mars", "jupiter"]);
  const attractionCandidates = buildAttractionConnections(connectionsAll);
  const attractionList = assignConnections({
    candidates: attractionCandidates,
    category: "attraction",
    max: 4,
    used,
    usedPairs,
    assigned,
    allow: (c) => {
      const aKey = c?.a?.body_key || "";
      const bKey = c?.b?.body_key || "";
      if (AXIS_BODIES.has(aKey) || AXIS_BODIES.has(bKey)) return false;
      if (DEEP_BODIES.has(aKey) || DEEP_BODIES.has(bKey)) return false;
      if (!attractionBodies.has(aKey) || !attractionBodies.has(bKey)) return false;
      if (!(attractionMain.has(aKey) || attractionMain.has(bKey))) return false;
      return true;
    },
  });

  const flowCandidates = buildFlowConnections(connectionsAll, aPlanetsRaw, bPlanetsRaw);
  const flowList = assignConnections({
    candidates: flowCandidates,
    category: "flow",
    max: 6,
    used,
    usedPairs,
    assigned,
    allow: (c) => {
      const aKey = c?.a?.body_key || "";
      const bKey = c?.b?.body_key || "";
      const aspect = String(c?.aspect || "").toLowerCase();
      if (HARD_ASPECTS.has(aspect)) return false;
      if (DEEP_BODIES.has(aKey) || DEEP_BODIES.has(bKey)) return false;
      if (aspect === "conjunction") {
        const heavy = new Set(["saturn", "pluto", "uranus", "neptune"]);
        if (heavy.has(aKey) || heavy.has(bKey)) return false;
      }
      if (AXIS_BODIES.has(aKey) || AXIS_BODIES.has(bKey)) {
        const allowAxis = new Set(["sun", "moon", "mercury", "venus", "mars", "jupiter"]);
        if (!allowAxis.has(aKey) && !allowAxis.has(bKey)) return false;
      }
      return true;
    },
  });

  const frictionCandidates = buildFrictionConnections(connectionsAll);
  const frictionList = assignConnections({
    candidates: frictionCandidates,
    category: "friction",
    max: 6,
    used,
    usedPairs,
    assigned,
    allow: (c) => {
      const aKey = c?.a?.body_key || "";
      const bKey = c?.b?.body_key || "";
      if (AXIS_BODIES.has(aKey) || AXIS_BODIES.has(bKey)) return false;
      if (DEEP_BODIES.has(aKey) || DEEP_BODIES.has(bKey)) return false;
      return true;
    },
  });

  const axisList = assignConnections({
    candidates: filterConnections(connectionsAll, (c, aKey, bKey) => AXIS_BODIES.has(aKey) || AXIS_BODIES.has(bKey)),
    category: "axis",
    max: 4,
    used,
    usedPairs,
    assigned,
    allow: (c) => {
      const aKey = c?.a?.body_key || "";
      const bKey = c?.b?.body_key || "";
      if (AXIS_BODIES.has(aKey) && AXIS_BODIES.has(bKey)) return true;
      const personal = new Set(["sun", "moon", "venus", "mercury"]);
      if (AXIS_BODIES.has(aKey) && personal.has(bKey)) return true;
      if (AXIS_BODIES.has(bKey) && personal.has(aKey)) return true;
      return false;
    },
  });

  const deepList = assignConnections({
    candidates: filterConnections(connectionsAll, (c, aKey, bKey) => DEEP_BODIES.has(aKey) || DEEP_BODIES.has(bKey)),
    category: "deep",
    max: 3,
    used,
    usedPairs,
    assigned,
  });

  const houseAiLinesA = parseAiLines(view?.ai_texts?.house_ingress_a_lines);
  const houseAiLinesB = parseAiLines(view?.ai_texts?.house_ingress_b_lines);
  const houseAiSummaryA = view?.ai_texts?.house_ingress_a_summary || "";
  const houseAiSummaryB = view?.ai_texts?.house_ingress_b_summary || "";
  const houseSections = [
    buildHouseIngressSection({
      ownerPlanets: aFull,
      guestPlanets: bFull,
      ownerName: aName,
      guestName: bName,
      aiLines: houseAiLinesA,
      aiSummary: houseAiSummaryA,
    }),
    buildHouseIngressSection({
      ownerPlanets: bFull,
      guestPlanets: aFull,
      ownerName: bName,
      guestName: aName,
      aiLines: houseAiLinesB,
      aiSummary: houseAiSummaryB,
    }),
  ];

  const topElementA = topTwoFromCounts(view?.element_balance?.a?.element_count || {}, ELEMENT_LABELS);
  const topElementB = topTwoFromCounts(view?.element_balance?.b?.element_count || {}, ELEMENT_LABELS);
  const topModalityA = topTwoFromCounts(view?.modality_balance?.a?.modality_count || {}, MODALITY_LABELS);
  const topModalityB = topTwoFromCounts(view?.modality_balance?.b?.modality_count || {}, MODALITY_LABELS);

  const aCore = pickCoreBodies(aPlanetsRaw);
  const bCore = pickCoreBodies(bPlanetsRaw);
  const signLabelMap = {
    ...buildSignLabelMap(aCore),
    ...buildSignLabelMap(bCore),
  };
  const signCountA = countBy(aCore, (row) => row?.sign_key);
  const signCountB = countBy(bCore, (row) => row?.sign_key);
  const houseCountA = countBy(aCore, (row) => row?.house);
  const houseCountB = countBy(bCore, (row) => row?.house);
  const topSignA = pickTop(signCountA);
  const topSignB = pickTop(signCountB);
  const topHouseA = pickTop(houseCountA);
  const topHouseB = pickTop(houseCountB);

  const baseLines = buildRelationInsight({
    aPlanets: aPlanetsRaw,
    bPlanets: bPlanetsRaw,
    elementBalanceA: view?.element_balance?.a || {},
    elementBalanceB: view?.element_balance?.b || {},
  });

  const comparePairs = buildComparePairs({
    aPlanets: aPlanetsRaw,
    bPlanets: bPlanetsRaw,
    connections: connectionsAll,
  });

  const compareMap = new Map(comparePairs.map((row) => [row?.body_key, row]));
  const ensureCompareRow = (key) => {
    if (compareMap.has(key)) return;
    const a = aPlanetsRaw.find((p) => p?.body_key === key);
    const b = bPlanetsRaw.find((p) => p?.body_key === key);
    if (!a || !b) return;
    const conn = connectionsAll.find((c) => c?.a?.body_key === key && c?.b?.body_key === key);
    const dist = angleDistance(a?.lon_deg, b?.lon_deg);
    const relation = signRelationType(a?.sign_key, b?.sign_key);
    compareMap.set(key, {
      body_key: key,
      body_ja: a?.body_ja || b?.body_ja || key,
      a,
      b,
      distance_deg: dist,
      aspect: conn?.aspect || null,
      orb: conn?.orb ?? null,
      sign_relation: relation,
      sign_relation_label: SIGN_RELATION_LABELS[relation] || relation,
    });
  };

  BODY_ORDER.forEach(ensureCompareRow);
  const comparePairsEnsured = Array.from(compareMap.values());

  const signRelationPairs = buildSignRelationPairs({
    aPlanets: aPlanetsRaw,
    bPlanets: bPlanetsRaw,
  });

  const relationCenter = buildRelationCenter({
    aPlanets: aPlanetsRaw,
    bPlanets: bPlanetsRaw,
    elementBalanceA: view?.element_balance?.a || {},
    elementBalanceB: view?.element_balance?.b || {},
  });

  const relationCore = buildRelationCore({
    comparePairs,
    coreConnections: coreList,
    flowList,
    frictionList,
  });

  const relationPattern = buildRelationPattern({
    relationCenter,
    relationCore,
    comparePairs,
    signPairs: signRelationPairs,
    flowList,
    frictionList,
    houseSections,
  });

  const relationTypeLabel = RELATION_TYPE_LABELS[relationPattern?.key] || relationPattern?.name || "層";
  relationCore.dominant_relation_type = relationTypeLabel;

  const relationPatternText = buildRelationPatternText({
    pattern: relationPattern,
    relationCenter,
    relationCore,
  });

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
  const aPlanetsRaw = view?.planet_matrix?.a || [];
  const bPlanetsRaw = view?.planet_matrix?.b || [];
  const connectionsAll = Array.isArray(view?.connections) ? view.connections : [];
  const flowList = derived?.flowList || [];
  const frictionList = derived?.frictionList || [];
  const commList = derived?.commList || [];
  const attractionList = derived?.attractionList || [];
  const comparePairs = derived?.comparePairs || [];
  const compareMap = new Map(comparePairs.map((row) => [row?.body_key, row]));
  const ensureCompareRow = (key) => {
    if (compareMap.has(key)) return;
    const a = aPlanetsRaw.find((p) => p?.body_key === key);
    const b = bPlanetsRaw.find((p) => p?.body_key === key);
    if (!a || !b) return;
    const conn = connectionsAll.find((c) => c?.a?.body_key === key && c?.b?.body_key === key);
    const dist = angleDistance(a?.lon_deg, b?.lon_deg);
    const relation = signRelationType(a?.sign_key, b?.sign_key);
    compareMap.set(key, {
      body_key: key,
      body_ja: a?.body_ja || b?.body_ja || key,
      a,
      b,
      distance_deg: dist,
      aspect: conn?.aspect || null,
      orb: conn?.orb ?? null,
      sign_relation: relation,
      sign_relation_label: SIGN_RELATION_LABELS[relation] || relation,
    });
  };
  BODY_ORDER.forEach(ensureCompareRow);
  const comparePairsEnsured = Array.from(compareMap.values());
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
  deriveRelationData,
};
