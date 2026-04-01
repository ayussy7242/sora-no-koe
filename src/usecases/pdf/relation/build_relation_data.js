"use strict";

const {
  ELEMENT_LABELS,
  MODALITY_LABELS,
  SIGN_ELEMENT,
  SIGN_ORDER,
  SIGN_RELATION_LABELS,
  HOUSE_BANDS,
  HOUSE_LABELS,
  HOUSE_BODY_WEIGHT,
  AXIS_BODIES,
  DEEP_BODIES,
  CORE_BODIES,
  BODY_ORDER,
  BODY_ORDER_MAP,
  CORE_PAIR_KEYS,
  COMM_PAIR_KEYS,
  ATTRACTION_PAIR_KEYS,
  FRICTION_PAIR_KEYS,
  SOFT_ASPECTS,
  HARD_ASPECTS,
  PAIR_PRIORITY,
  BODY_PRIORITY,
  ASPECT_WEIGHT,
  ASPECT_DISPLAY,
  RELATION_TYPE_LABELS,
} = require("../../../engine/pdf/relation/constants");
const {
  formatElementKey,
  formatOrbValue,
  normalizeAspectKey,
  formatBodyKeyShort,
  shortName,
  pickDominantElementKey,
  topTwoFromCounts,
} = require("../../../engine/pdf/relation/formatters");

function mergeUniqueBodies(base = [], extra = []) {
  const seen = new Set(base.map((row) => row?.body_key).filter(Boolean));
  const add = extra.filter((row) => row?.body_key && !seen.has(row.body_key));
  return [...base, ...add];
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

function buildComparePairsEnsured({ comparePairs = [], aPlanets = [], bPlanets = [], connections = [] } = {}) {
  const compareMap = new Map(comparePairs.map((row) => [row?.body_key, row]));
  const ensureCompareRow = (key) => {
    if (compareMap.has(key)) return;
    const a = aPlanets.find((p) => p?.body_key === key);
    const b = bPlanets.find((p) => p?.body_key === key);
    if (!a || !b) return;
    const conn = connections.find((c) => c?.a?.body_key === key && c?.b?.body_key === key);
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
  return Array.from(compareMap.values());
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

function deriveRelationData(view) {
  const aPlanetsRaw = view?.planet_matrix?.a || [];
  const bPlanetsRaw = view?.planet_matrix?.b || [];
  const aName = view?.people?.a?.name || "A";
  const bName = view?.people?.b?.name || "B";

  const aDeepAll = Array.isArray(view?.deep_points?.a) ? view.deep_points.a : [];
  const bDeepAll = Array.isArray(view?.deep_points?.b) ? view.deep_points.b : [];
  const aFull = mergeUniqueBodies(aPlanetsRaw, aDeepAll);
  const bFull = mergeUniqueBodies(bPlanetsRaw, bDeepAll);

  const elementCountsA = view?.element_balance?.a?.element_count || {};
  const elementCountsB = view?.element_balance?.b?.element_count || {};
  const dominantElementA = view?.element_balance?.a?.top_element || pickDominantElementKey(elementCountsA);
  const dominantElementB = view?.element_balance?.b?.top_element || pickDominantElementKey(elementCountsB);
  const topElementA = topTwoFromCounts(elementCountsA, ELEMENT_LABELS);
  const topElementB = topTwoFromCounts(elementCountsB, ELEMENT_LABELS);
  const topModalityA = topTwoFromCounts(view?.modality_balance?.a?.modality_count || {}, MODALITY_LABELS);
  const topModalityB = topTwoFromCounts(view?.modality_balance?.b?.modality_count || {}, MODALITY_LABELS);

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

  const comparePairsEnsured = buildComparePairsEnsured({
    comparePairs,
    aPlanets: aPlanetsRaw,
    bPlanets: bPlanetsRaw,
    connections: connectionsAll,
  });

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
  relationCenter.overlap_band = baseLines?.[0] || "";
  relationCenter.separation_band = baseLines?.[1] || "";
  relationCenter.flow_band = baseLines?.[2] || "";

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
  const relationCenterText = buildRelationCenterText({ relationCenter });

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

  return {
    aFull,
    bFull,
    dominantElementA,
    dominantElementB,
    topElementA,
    topElementB,
    topModalityA,
    topModalityB,
    coreList,
    flowList,
    frictionList,
    commList,
    attractionList,
    axisList,
    deepList,
    houseSections,
    comparePairs,
    comparePairsEnsured,
    signRelationPairs,
    relationCenter,
    relationCore,
    relationPattern,
    relationPatternText,
    relationCenterText,
    relationTypeLabel,
    baseLines,
    signLabelMap,
    signCountA,
    signCountB,
    houseCountA,
    houseCountB,
    topSignA,
    topSignB,
    topHouseA,
    topHouseB,
  };
}

module.exports = {
  deriveRelationData,
  buildRelationCenter,
  buildRelationCore,
  buildRelationPattern,
  buildRelationPatternText,
  buildRelationCenterText,
  buildComparePairs,
  buildSignRelationPairs,
  buildHouseIngressSection,
  buildHouseOverlayRows,
  assignConnections,
};
