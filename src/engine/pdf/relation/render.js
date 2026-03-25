"use strict";

const puppeteer = require("puppeteer");
const { buildBlueprintCss } = require("../blueprint_v25/styles");
const { buildGlyphImgTag } = require("../blueprint_v25/glyphs");
const { PAGE_WIDTH, PAGE_HEIGHT } = require("../blueprint_v25/constants");
const { buildSpaceBackground } = require("../../shared/space_background");
const { BACKGROUND_COLORS } = require("../../shared/space_background/constants");

const COLOR_A = "#F59E0B"; // orange
const COLOR_B = "#14B8A6"; // greenish blue
const BAND_TITLE = "RELATION BLUEPRINT";
const SPACE_BG_ENABLED = !["0", "false", "off"].includes(String(process.env.RELATION_PDF_SPACE_BG ?? "0").toLowerCase());

const ASPECT_COLORS = {
  conjunction: "#E5E7EB",
  opposition: "#F43F5E",
  square: "#F97316",
  trine: "#3B82F6",
  sextile: "#22D3EE",
};

const ELEMENT_LABELS = {
  fire: "火",
  earth: "地",
  air: "風",
  water: "水",
};

const MODALITY_LABELS = {
  cardinal: "活動",
  fixed: "固定",
  mutable: "柔軟",
};

const SIGN_ORDER = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
];

const OPPOSITE_SIGN = {
  aries: "libra",
  taurus: "scorpio",
  gemini: "sagittarius",
  cancer: "capricorn",
  leo: "aquarius",
  virgo: "pisces",
  libra: "aries",
  scorpio: "taurus",
  sagittarius: "gemini",
  capricorn: "cancer",
  aquarius: "leo",
  pisces: "virgo",
};

const HOUSE_BANDS = [
  { key: "inner", label: "内側帯", houses: [1, 2, 3, 4] },
  { key: "relation", label: "対人帯", houses: [5, 6, 7, 8] },
  { key: "outer", label: "社会帯", houses: [9, 10, 11, 12] },
];

const WHEEL_BODIES = [
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
];

const BODY_SHORT_LABELS = {
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
  asc: "ASC",
  mc: "MC",
  ic: "IC",
  dc: "DC",
  north_node: "☊",
  south_node: "☋",
  chiron: "⚷",
  lilith: "⚸",
};

const MAX_ROWS_PER_COL = 18;

function escapeHtml(input) {
  const s = String(input ?? "");
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPlanetRow(entry) {
  if (!entry) return "";
  const label = entry.body_glyph || entry.body_ja || entry.body_key || "";
  const sign = entry.sign_ja || entry.sign_key || "";
  const lon = entry.lon_deg;
  const deg = Number.isFinite(Number(lon)) ? Math.floor(((Number(lon) % 30) + 30) % 30) : null;
  const degText = Number.isFinite(Number(deg)) ? `${deg}°` : "";
  const signPart = [sign, degText].filter(Boolean).join(" ").trim();
  const house = Number.isFinite(Number(entry.house)) ? `${entry.house}H` : "";
  const parts = [label, signPart].filter(Boolean);
  let row = parts.join(" ").trim();
  if (house) row = row ? `${row}｜${house}` : house;
  return row || "—";
}

function formatBodyKeyShort(keyRaw) {
  const key = String(keyRaw || "").toLowerCase();
  return BODY_SHORT_LABELS[key] || key.toUpperCase() || "—";
}

function formatElementKey(keyRaw) {
  const key = String(keyRaw || "").toLowerCase();
  return ELEMENT_LABELS[key] || key || "—";
}

function formatModalityKey(keyRaw) {
  const key = String(keyRaw || "").toLowerCase();
  return MODALITY_LABELS[key] || key || "—";
}

function formatConnectionRow(conn) {
  if (!conn) return "";
  const aLabel = conn?.a?.body_glyph || conn?.a?.body_ja || formatBodyKeyShort(conn?.a?.body_key);
  const bLabel = conn?.b?.body_glyph || conn?.b?.body_ja || formatBodyKeyShort(conn?.b?.body_key);
  const aSign = conn?.a?.sign_ja || "";
  const bSign = conn?.b?.sign_ja || "";
  const aHouse = Number.isFinite(Number(conn?.a?.house)) ? `${conn.a.house}H` : "";
  const bHouse = Number.isFinite(Number(conn?.b?.house)) ? `${conn.b.house}H` : "";
  const aspect = conn?.aspect || "";
  const orb = Number.isFinite(Number(conn?.orb)) ? `${Number(conn.orb).toFixed(2)}°` : "";
  return `${aLabel} ${aSign}${aHouse} × ${bLabel} ${bSign}${bHouse}｜${aspect} ${orb}`.trim();
}

function formatGapRow(gap) {
  if (!gap) return "";
  const pair = String(gap?.pair || "");
  const parts = pair.split("_");
  const a = formatBodyKeyShort(parts[0]);
  const b = formatBodyKeyShort(parts[1]);
  const aspect = gap?.aspect || "";
  const orb = Number.isFinite(Number(gap?.orb)) ? `${Number(gap.orb).toFixed(2)}°` : "";
  return `${a} × ${b}｜${aspect} ${orb}`.trim();
}

function formatHouseLinkRow(link) {
  if (!link) return "";
  const aHouse = Number.isFinite(Number(link?.a_house)) ? `${link.a_house}H` : "—";
  const bHouse = Number.isFinite(Number(link?.b_house)) ? `${link.b_house}H` : "—";
  const via = String(link?.via || "");
  const parts = via.split("_");
  const viaLabel = parts.length === 2 ? `${formatBodyKeyShort(parts[0])}×${formatBodyKeyShort(parts[1])}` : via;
  return `${aHouse} ↔ ${bHouse}｜${viaLabel}`.trim();
}

function buildSpaceSvg(variant = "slide3") {
  const bg = buildSpaceBackground({ width: PAGE_WIDTH, height: PAGE_HEIGHT, variant });
  return [
    `<svg class="bg-space__svg" xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}" preserveAspectRatio="xMidYMid slice">`,
    `<rect width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" fill="${BACKGROUND_COLORS.bgDeep}"/>`,
    `<defs>${bg.defs}</defs>`,
    bg.body,
    `</svg>`,
  ].join("");
}

function renderSpaceBg(variant) {
  if (!SPACE_BG_ENABLED) return "";
  return `<div class="bg-space">${buildSpaceSvg(variant)}</div>`;
}

function buildHeader(meta) {
  return `
    <div class="relation-head">
      <div class="label relation-en">${escapeHtml(meta?.en || "")}</div>
      <div class="title">${escapeHtml(meta?.ja || "")}</div>
      <div class="page-intro">${escapeHtml(meta?.intro || "")}</div>
    </div>
  `;
}

function buildFooter({ pageNo, total }) {
  const no = String(pageNo || "").padStart(2, "0");
  const totalText = total ? String(total).padStart(2, "0") : "";
  const pageText = totalText ? `${no} / ${totalText}` : no;
  return `
    <div class="relation-brand">sora-no-koe</div>
    <div class="page-number relation-page-number">PAGE ${pageText}</div>
  `;
}

function buildTwoColList({ leftRows = [], rightRows = [], leftTitle = "A SIDE", rightTitle = "B SIDE", leftSub = "A", rightSub = "B" }) {
  return `
    <div class="relation-cols">
      <div class="chart-box relation-col">
        <div class="card-head">${escapeHtml(leftTitle)}</div>
        <div class="card-sub">${escapeHtml(leftSub)}</div>
        <div class="card-list relation-list">
          ${leftRows.map((row) => `<div class="relation-row">${escapeHtml(row)}</div>`).join("")}
        </div>
      </div>
      <div class="chart-box relation-col">
        <div class="card-head">${escapeHtml(rightTitle)}</div>
        <div class="card-sub">${escapeHtml(rightSub)}</div>
        <div class="card-list relation-list">
          ${rightRows.map((row) => `<div class="relation-row">${escapeHtml(row)}</div>`).join("")}
        </div>
      </div>
    </div>
  `;
}

function formatDateLocal(dateRaw) {
  if (!dateRaw) return "";
  return String(dateRaw).replace(/\./g, "-").replace(/\//g, "-").replace(/-/g, "/");
}

function formatBirthLine(person = {}) {
  const birth = person?.birth || person || {};
  const date = formatDateLocal(birth?.date_local || birth?.date);
  const time = birth?.time_hm || birth?.time || "";
  if (date && time) return `${date} ${time}`;
  if (date) return date;
  return "—";
}

function formatPlaceLine(person = {}) {
  const birth = person?.birth || person || {};
  return birth?.place_text || birth?.place_formatted || birth?.place || "—";
}

function buildPeopleBlock({ a = {}, b = {} } = {}) {
  const aName = a?.name || "A";
  const bName = b?.name || "B";
  const aBirth = formatBirthLine(a);
  const bBirth = formatBirthLine(b);
  const aPlace = formatPlaceLine(a);
  const bPlace = formatPlaceLine(b);
  return `
    <div class="relation-info">
      <div class="chart-box relation-info-card">
        <div class="card-head">A</div>
        <div class="card-sub">PROFILE</div>
        <div class="card-list relation-info-list">
          <div class="relation-info-name">${escapeHtml(aName)}</div>
          <div class="relation-info-birth">${escapeHtml(aBirth)}</div>
          <div class="relation-info-place">${escapeHtml(aPlace)}</div>
        </div>
      </div>
      <div class="chart-box relation-info-card">
        <div class="card-head">B</div>
        <div class="card-sub">PROFILE</div>
        <div class="card-list relation-info-list">
          <div class="relation-info-name">${escapeHtml(bName)}</div>
          <div class="relation-info-birth">${escapeHtml(bBirth)}</div>
          <div class="relation-info-place">${escapeHtml(bPlace)}</div>
        </div>
      </div>
    </div>
  `;
}

function buildMetricRow({ glyph, label, count, percent, color }) {
  const glyphTag = buildGlyphImgTag(glyph, { className: "astro-symbol-img", size: 22, color });
  return `
    <div class="metric-row">
      <div class="metric-label">${glyphTag}<span class="metric-name">${escapeHtml(label)}</span><span class="metric-count">${escapeHtml(count)}</span></div>
      <div class="metric-bar"><div class="bar" style="--bar-fill:${percent}%; --bar-color:${color};"></div></div>
    </div>
  `;
}

function buildElementBarList(balance = {}) {
  const c = balance?.element_count || {};
  const total = 10;
  return `
    <div class="bar-list bar-list--element">
      ${buildMetricRow({ glyph: "🜂", label: "火", count: c.fire ?? 0, percent: ((c.fire ?? 0) / total) * 100, color: "#FF6B6B" })}
      ${buildMetricRow({ glyph: "🜃", label: "地", count: c.earth ?? 0, percent: ((c.earth ?? 0) / total) * 100, color: "#E6C36D" })}
      ${buildMetricRow({ glyph: "🜁", label: "風", count: c.air ?? 0, percent: ((c.air ?? 0) / total) * 100, color: "#7FBF8F" })}
      ${buildMetricRow({ glyph: "🜄", label: "水", count: c.water ?? 0, percent: ((c.water ?? 0) / total) * 100, color: "#7AA7FF" })}
    </div>
  `;
}

function buildModalityBarList(balance = {}) {
  const c = balance?.modality_count || {};
  const total = 10;
  return `
    <div class="bar-list bar-list--modality">
      ${buildMetricRow({ glyph: "△", label: "活動宮", count: c.cardinal ?? 0, percent: ((c.cardinal ?? 0) / total) * 100, color: "#FFB27A" })}
      ${buildMetricRow({ glyph: "□", label: "不動宮", count: c.fixed ?? 0, percent: ((c.fixed ?? 0) / total) * 100, color: "#9EC5FF" })}
      ${buildMetricRow({ glyph: "◇", label: "柔軟宮", count: c.mutable ?? 0, percent: ((c.mutable ?? 0) / total) * 100, color: "#9FD3A8" })}
    </div>
  `;
}

function buildElementModalityColumns({ aBalance, bBalance } = {}) {
  return `
    <div class="relation-bars">
      <div class="relation-bars-col">
        <div class="chart-box relation-bar-box">
          <div class="card-head">A エレメント</div>
          <div class="card-sub">ELEMENT BALANCE</div>
          ${buildElementBarList(aBalance)}
        </div>
        <div class="chart-box relation-bar-box">
          <div class="card-head">A モード</div>
          <div class="card-sub">MODALITY BALANCE</div>
          ${buildModalityBarList(aBalance)}
        </div>
      </div>
      <div class="relation-bars-col">
        <div class="chart-box relation-bar-box">
          <div class="card-head">B エレメント</div>
          <div class="card-sub">ELEMENT BALANCE</div>
          ${buildElementBarList(bBalance)}
        </div>
        <div class="chart-box relation-bar-box">
          <div class="card-head">B モード</div>
          <div class="card-sub">MODALITY BALANCE</div>
          ${buildModalityBarList(bBalance)}
        </div>
      </div>
    </div>
  `;
}

function buildBottomSections(sections = []) {
  if (!sections.length) return "";
  return `
    <div class="relation-bottom">
      ${sections
        .map(
          (s) => `
            <div class="relation-section">
              ${s.label ? `<span class="relation-label">${escapeHtml(s.label || "")}</span>` : ""}
              <span class="relation-text">${escapeHtml(s.text || "")}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function buildPage({ meta, leftRows, rightRows, bottomSections, extra = "", middleHtml = "", leftTitle, rightTitle, leftSub, rightSub, pageNo = 1, total = null, variant = "slide3", spaceOpacity = 0.8 }) {
  const spaceStyle = Number.isFinite(Number(spaceOpacity)) ? ` style="--space-opacity:${spaceOpacity};"` : "";
  const middleContent = middleHtml || buildTwoColList({ leftRows, rightRows, leftTitle, rightTitle, leftSub, rightSub });
  return `
    <div class="page page--space relation-page"${spaceStyle}>
      ${renderSpaceBg(variant)}
      <div class="blueprint-grid"></div>
      <div class="page-corner">✦</div>
      <div class="slide">
        <div class="top">
          ${buildHeader(meta)}
        </div>
        <div class="middle">
          ${middleContent}
        </div>
        ${extra}
        <div class="bottom">
          ${buildBottomSections(bottomSections)}
        </div>
      </div>
      ${buildFooter({ pageNo, total })}
    </div>
  `;
}

function buildCoverPage({ meta, pageNo = 1, total = null, spaceOpacity = 0.9 }) {
  const spaceStyle = Number.isFinite(Number(spaceOpacity)) ? ` style="--space-opacity:${spaceOpacity};"` : "";
  return `
    <div class="page page--space relation-page"${spaceStyle}>
      ${renderSpaceBg("slide1")}
      <div class="blueprint-grid"></div>
      <div class="page-corner">✦</div>
      <div class="slide relation-cover">
        <div class="top center">
          <div class="label relation-en">${escapeHtml(meta?.en || "")}</div>
          <div class="title relation-cover-ja">${escapeHtml(meta?.ja || "")}</div>
          <div class="page-intro">${escapeHtml(meta?.intro || "")}</div>
        </div>
      </div>
      ${buildFooter({ pageNo, total })}
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

function buildRelationWheelSvg(view, { size = 680, maxLines = 5, connections: connectionsOverride = null } = {}) {
  const aMap = mapBodies(view?.planet_matrix?.a || []);
  const bMap = mapBodies(view?.planet_matrix?.b || []);

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.42;
  const aR = outerR * 0.95;
  const bR = outerR * 0.78;

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
    const p1 = polarToCartesian(cx, cy, aR * 0.9, aLon);
    const p2 = polarToCartesian(cx, cy, bR * 0.9, bLon);
    const color = ASPECT_COLORS[c.aspect] || "#999";
    lines.push(`<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="${color}" stroke-width="1.4" opacity="0.9" />`);
  }

  const glyphs = [];
  for (const body of WHEEL_BODIES) {
    const aLon = aMap.get(body)?.lon_deg;
    if (Number.isFinite(Number(aLon))) {
      const p = polarToCartesian(cx, cy, aR, aLon);
      glyphs.push(`<text x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="central" font-size="18" fill="${COLOR_A}">${BODY_SHORT_LABELS[body] || body}</text>`);
    }
    const bLon = bMap.get(body)?.lon_deg;
    if (Number.isFinite(Number(bLon))) {
      const p = polarToCartesian(cx, cy, bR, bLon);
      glyphs.push(`<text x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="central" font-size="18" fill="${COLOR_B}">${BODY_SHORT_LABELS[body] || body}</text>`);
    }
  }

  return `
    <svg class="relation-wheel" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${cx}" cy="${cy}" r="${outerR}" fill="none" stroke="#EDEEFF40" stroke-width="1" />
      <circle cx="${cx}" cy="${cy}" r="${outerR * 0.72}" fill="none" stroke="#EDEEFF20" stroke-width="1" />
      ${lines.join("\n")}
      ${glyphs.join("\n")}
    </svg>
  `;
}

function chunkTwoColumns(list = [], rowsPerCol = MAX_ROWS_PER_COL) {
  const out = [];
  const chunkSize = rowsPerCol * 2;
  for (let i = 0; i < list.length; i += chunkSize) {
    const slice = list.slice(i, i + chunkSize);
    out.push({
      left: slice.slice(0, rowsPerCol),
      right: slice.slice(rowsPerCol),
    });
  }
  if (!out.length) out.push({ left: ["—"], right: ["—"] });
  return out;
}

function splitTwoColumns(list = []) {
  if (!list.length) return { left: ["—"], right: ["—"] };
  const mid = Math.ceil(list.length / 2);
  return { left: list.slice(0, mid), right: list.slice(mid) };
}

function pickCoreBodies(list = []) {
  const core = new Set(["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"]);
  return list.filter((row) => core.has(row?.body_key));
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

function buildRelationHtml(view) {
  const aPlanetsRaw = view?.planet_matrix?.a || [];
  const bPlanetsRaw = view?.planet_matrix?.b || [];

  const deepOnly = new Set(["lilith", "chiron"]);
  const aDeepExtras = (view?.deep_points?.a || []).filter((p) => deepOnly.has(p?.body_key));
  const bDeepExtras = (view?.deep_points?.b || []).filter((p) => deepOnly.has(p?.body_key));

  const aPlanets = [...aPlanetsRaw, ...aDeepExtras].map(formatPlanetRow);
  const bPlanets = [...bPlanetsRaw, ...bDeepExtras].map(formatPlanetRow);

  const axisBodies = new Set(["asc", "mc", "ic", "dc"]);
  const connectionsAll = Array.isArray(view?.connections) ? view.connections : [];
  const connections = connectionsAll.filter((c) => !axisBodies.has(c?.a?.body_key) && !axisBodies.has(c?.b?.body_key));
  const connectionRows = connections.map(formatConnectionRow);
  const connectionChunks = chunkTwoColumns(connectionRows);

  const gaps = Array.isArray(view?.gaps) ? view.gaps : [];
  const gapRows = gaps.map(formatGapRow);
  const gapChunks = chunkTwoColumns(gapRows);

  const houseLinks = Array.isArray(view?.house_links) ? view.house_links : [];
  const houseLinksFiltered = houseLinks.filter((h) => {
    const via = String(h?.via || "");
    const parts = via.split("_");
    return !parts.some((p) => axisBodies.has(p));
  });
  const houseLinkRows = houseLinksFiltered.map(formatHouseLinkRow);
  const houseLinkChunks = chunkTwoColumns(houseLinkRows);

  const axisKeys = new Set(["asc", "mc", "ic", "dc"]);
  const aAxis = (view?.planet_matrix?.a || []).filter((p) => axisKeys.has(p.body_key)).map(formatPlanetRow);
  const bAxis = (view?.planet_matrix?.b || []).filter((p) => axisKeys.has(p.body_key)).map(formatPlanetRow);

  const deepKeys = new Set(["north_node", "south_node", "chiron", "lilith"]);
  const aDeep = (view?.deep_points?.a || []).filter((p) => deepKeys.has(p?.body_key)).map(formatPlanetRow);
  const bDeep = (view?.deep_points?.b || []).filter((p) => deepKeys.has(p?.body_key)).map(formatPlanetRow);

  const topElementA = formatElementKey(view?.element_balance?.a?.top_element);
  const topElementB = formatElementKey(view?.element_balance?.b?.top_element);
  const topModalityA = formatModalityKey(view?.modality_balance?.a?.top_modality);
  const topModalityB = formatModalityKey(view?.modality_balance?.b?.top_modality);

  const aspectCounts = connections.reduce((acc, c) => {
    const key = c?.aspect || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const topAspect = Object.entries(aspectCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  const aspectSummary = Object.entries(aspectCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`)
    .join(" / ");

  const summary = [
    `接続点は${connections.length}箇所。`,
    `ズレは${gaps.length}箇所。`,
    `アスペクト構成：${aspectSummary || "-"}`,
    `主成分は${topElementA || "?"}と${topElementB || "?"}。`,
    `動きは${topModalityA || "?"}と${topModalityB || "?"}の混合。`,
  ];

  let oneLiner = "接続とズレが同居しながら進む関係。";
  if (connections.length === 0 && gaps.length === 0) {
    oneLiner = "データが揃うほど、関係の輪郭が明確になる関係。";
  } else if (connections.length >= gaps.length * 1.5) {
    oneLiner = "接続が強く、流れが保たれやすい関係。";
  } else if (gaps.length >= connections.length * 1.5) {
    oneLiner = "ズレが際立ち、調整が鍵になる関係。";
  }

  const wheelConnections = connections
    .filter((c) => ASPECT_COLORS[c?.aspect])
    .sort((x, y) => (x.orb ?? 99) - (y.orb ?? 99))
    .slice(0, 5);
  const wheelRows = wheelConnections.map(formatConnectionRow);
  const wheelCols = splitTwoColumns(wheelRows);

  const wheelSvg = buildRelationWheelSvg(view, { size: 680, maxLines: 5, connections });

  const meta = [
    {
      ja: "ふたりの星の構造図",
      en: "RELATION BLUEPRINT",
      intro: "ふたつの配置が作る構造を観測します。",
      type: "cover",
    },
    {
      ja: "ふたりの配置",
      en: "PLANET POSITION",
      intro: "ふたりの配置と位置関係を並べます。",
    },
    {
      ja: "エレメントとモード",
      en: "ELEMENT / MODE BALANCE",
      intro: "構成要素と動き方の違いを観測します。",
    },
    {
      ja: "共鳴ポイント",
      en: "RESONANCE POINTS",
      intro: "接続が自然に生まれる場所を観測します。",
    },
    {
      ja: "接続のズレ",
      en: "CONNECTION GAPS",
      intro: "同じ天体でずれが生まれる位置を観測します。",
    },
    {
      ja: "軸の相性",
      en: "AXIS ALIGNMENT",
      intro: "入口と方向の向きの差を観測します。",
    },
    {
      ja: "関係ホイール",
      en: "SYNASTRY WHEEL",
      intro: "重なりと接続の分布を可視化します。",
    },
    {
      ja: "深層ポイント",
      en: "DEEP LAYERS",
      intro: "無意識で引き合う方向を観測します。",
    },
    {
      ja: "関係の構造",
      en: "RELATION STRUCTURE",
      intro: "ふたつの流れが作る全体像を観測します。",
    },
    {
      ja: "一言でいうと",
      en: "CORE PHRASE",
      intro: "この関係の核を一行で表します。",
    },
  ];

  const pageDefs = [];

  pageDefs.push({ type: "cover", meta: meta[0] });

  const peopleBlock = buildPeopleBlock({ a: view?.people?.a || {}, b: view?.people?.b || {} });
  const insightLines = buildRelationInsight({
    aPlanets: aPlanetsRaw,
    bPlanets: bPlanetsRaw,
    elementBalanceA: view?.element_balance?.a || {},
    elementBalanceB: view?.element_balance?.b || {},
  });

  pageDefs.push({
    type: "page",
    meta: meta[1],
    leftRows: aPlanets,
    rightRows: bPlanets,
    middleHtml: `
      <div class="relation-middle-stack">
        ${peopleBlock}
        ${buildTwoColList({ leftRows: aPlanets, rightRows: bPlanets })}
      </div>
    `,
    bottomSections: insightLines.map((line) => ({ label: "", text: line })),
  });

  pageDefs.push({
    type: "page",
    meta: meta[2],
    middleHtml: buildElementModalityColumns({
      aBalance: {
        element_count: view?.element_balance?.a?.element_count || {},
        modality_count: view?.modality_balance?.a?.modality_count || {},
      },
      bBalance: {
        element_count: view?.element_balance?.b?.element_count || {},
        modality_count: view?.modality_balance?.b?.modality_count || {},
      },
    }),
    bottomSections: [
      { label: "構造：", text: `主成分は${topElementA}と${topElementB}。` },
      { label: "動き：", text: `主動作は${topModalityA}と${topModalityB}。` },
      { label: "体感：", text: "温度と速度の差が、関係のリズムとして残ります。" },
    ],
  });

  connectionChunks.forEach((chunk) => {
    pageDefs.push({
      type: "page",
      meta: meta[3],
      leftRows: chunk.left,
      rightRows: chunk.right,
      leftTitle: "A SIDE",
      rightTitle: "B SIDE",
      bottomSections: [
        { label: "構造：", text: `接続点は${connections.length}箇所。主要アスペクトは${topAspect || "?"}。` },
        { label: "動き：", text: "結び目の密度が、流れの強弱を決めます。" },
        { label: "体感：", text: "自然に引き寄せられる帯域が残ります。" },
      ],
      variant: "slide3",
    });
  });

  gapChunks.forEach((chunk) => {
    pageDefs.push({
      type: "page",
      meta: meta[4],
      leftRows: chunk.left,
      rightRows: chunk.right,
      leftTitle: "A SIDE",
      rightTitle: "B SIDE",
      bottomSections: [
        { label: "構造：", text: `ズレは${gaps.length}箇所。` },
        { label: "動き：", text: "反応の速度差が、そのまま差になって表れます。" },
        { label: "体感：", text: "同じ場面でも、別の感触が残ります。" },
      ],
    });
  });

  pageDefs.push({
    type: "page",
    meta: meta[5],
    leftRows: aAxis.length ? aAxis : ["—"],
    rightRows: bAxis.length ? bAxis : ["—"],
    leftTitle: "A AXIS",
    rightTitle: "B AXIS",
    bottomSections: [
      { label: "構造：", text: "入口と方向の向きが、別の線で現れます。" },
      { label: "動き：", text: "深く入る流れと、広く動く流れが並びます。" },
      { label: "体感：", text: "距離感の取り方に差が出やすい。" },
    ],
  });

  pageDefs.push({
    type: "page",
    meta: meta[6],
    leftRows: wheelCols.left,
    rightRows: wheelCols.right,
    leftTitle: "A SIDE",
    rightTitle: "B SIDE",
    extra: `<div class="relation-wheel-wrap">${wheelSvg}</div>`,
    bottomSections: [
      { label: "凡例：", text: "A=オレンジ / B=ブルーグリーン" },
      { label: "線：", text: "白=合 / 赤=衝 / 橙=緊張 / 青=調和 / 水=協調" },
    ],
  });

  pageDefs.push({
    type: "page",
    meta: meta[7],
    leftRows: aDeep.length ? aDeep : ["—"],
    rightRows: bDeep.length ? bDeep : ["—"],
    leftTitle: "A DEEP",
    rightTitle: "B DEEP",
    bottomSections: [
      { label: "構造：", text: "深層の引力が向かう方向を示します。" },
      { label: "体感：", text: "無意識の引き合いが、静かに残ります。" },
    ],
  });

  houseLinkChunks.forEach((chunk, idx) => {
    pageDefs.push({
      type: "page",
      meta: meta[8],
      leftRows: chunk.left,
      rightRows: chunk.right,
      leftTitle: "A LINK",
      rightTitle: "B LINK",
      bottomSections: idx === 0 ? summary.map((line) => ({ label: "", text: line })) : [],
    });
  });

  const coreRight = [
    `接続 ${connections.length}`,
    `ズレ ${gaps.length}`,
    `主成分 ${topElementA}/${topElementB}`,
    `動き ${topModalityA}/${topModalityB}`,
  ];

  pageDefs.push({
    type: "page",
    meta: meta[9],
    leftRows: [oneLiner],
    rightRows: coreRight,
    leftTitle: "CORE",
    rightTitle: "SUMMARY",
    bottomSections: [],
  });

  const totalPages = pageDefs.length;
  const numberedPages = pageDefs.map((def, idx) => {
    const pageNo = idx + 1;
    if (def.type === "cover") {
      return buildCoverPage({ meta: def.meta, pageNo, total: totalPages });
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
    });
  });

  return `<!doctype html>
  <html lang="ja">
  <head>
    <meta charset="utf-8" />
    <style>
      ${buildBlueprintCss()}
      .relation-page.page--space .bg-space__svg { opacity: var(--space-opacity); }
      .relation-head { display: flex; flex-direction: column; gap: 6px; }
      .relation-en { font-size: calc(var(--fs-label) - 2px); opacity: 0.8; }
      .relation-cols { display: grid; grid-template-columns: 1fr 1fr; gap: var(--column-gap); width: 100%; }
      .relation-col { min-height: 320px; }
      .relation-row { line-height: 1.62; letter-spacing: 0.02em; }
      .relation-list { margin-top: 12px; }
      .relation-bottom { margin-top: 18px; padding-top: 12px; border-top: 1px solid var(--line); }
      .relation-section { font-size: calc(var(--fs-body) - 2px); line-height: 1.7; margin-bottom: 6px; }
      .relation-label { color: var(--muted); margin-right: 6px; }
      .relation-brand { position: absolute; bottom: 64px; left: var(--page-margin-x); font-size: calc(var(--fs-sub) + var(--fs-bump)); letter-spacing: 0.22em; color: var(--muted); opacity: 0.8; }
      .relation-page-number { color: var(--muted); }
      .relation-wheel-wrap { display: flex; justify-content: center; align-items: center; margin-top: 10px; width: 100%; }
      .relation-wheel { width: 76%; height: auto; }
      .relation-middle-stack { display: grid; gap: 18px; width: 100%; }
      .relation-info { display: grid; grid-template-columns: 1fr 1fr; gap: var(--column-gap); width: 100%; }
      .relation-info-card { min-height: 0; }
      .relation-info-name { font-size: calc(var(--fs-body) + 8px); letter-spacing: 0.04em; }
      .relation-info-birth, .relation-info-place { font-size: calc(var(--fs-sub) + var(--fs-bump)); color: var(--muted); margin-top: 2px; letter-spacing: 0.08em; }
      .relation-bars { display: grid; grid-template-columns: 1fr 1fr; gap: var(--column-gap); width: 100%; }
      .relation-bars-col { display: grid; gap: var(--card-gap); }
      .relation-bar-box { min-height: 0; }
      .relation-cover { align-items: center; text-align: center; }
      .relation-cover-ja { font-size: calc(40px * var(--ui)); }
    </style>
  </head>
  <body>
    ${numberedPages.join("\n")}
  </body>
  </html>`;
}

async function renderRelationPdfBuffer({ view } = {}) {
  if (!view) throw new Error("renderRelationPdfBuffer: view required");

  const html = buildRelationHtml(view);
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    timeout: 0,
    protocolTimeout: 180000,
  });

  try {
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
};
