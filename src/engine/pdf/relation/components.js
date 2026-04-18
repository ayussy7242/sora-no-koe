"use strict";

const { buildGlyphImgTag } = require("../blueprint_v25/glyphs");
const { PAGE_WIDTH, PAGE_HEIGHT } = require("../blueprint_v25/constants");
const { buildSpaceBackground, buildSpaceSeedLabel } = require("../../shared/space_background");
const { BACKGROUND_COLORS } = require("../../shared/space_background/constants");
const { buildCosmicSpaceConfig } = require("../../shared/space_background");
const {
  SIGN_RELATION_LABELS,
  SIGN_RELATION_SYMBOLS,
  SIGN_ELEMENT,
  SIGN_MODALITY,
  HOUSE_BANDS,
  HOUSE_LABELS,
  HOUSE_BODY_WEIGHT,
  AXIS_SYMBOLS,
  AXIS_BODIES,
  RELATION_EXTRA_BODY_SET,
  ASPECT_DISPLAY,
} = require("./constants");
const {
  escapeHtml,
  formatBodyKeyShort,
  shortName,
  normalizeAspectKey,
  formatOrbValue,
  formatConnectionSideHtml,
  formatAspectDisplay,
} = require("./formatters");

const SPACE_BG_ENABLED = !["0", "false", "off"].includes(String(process.env.RELATION_PDF_SPACE_BG ?? "0").toLowerCase());
const SPACE_SVG_CACHE = new Map();

function buildSpaceSvg(variant = "slide3", seedLabel = "") {
  const cacheKey = `${variant}::${seedLabel || ""}`;
  const cached = SPACE_SVG_CACHE.get(cacheKey);
  if (cached) return cached;
  const seed = buildSpaceSeedLabel({
    seedVersion: "v2",
    channel: "relation",
    pairId: seedLabel,
    prefixChannel: true,
  });
  const bg = buildSpaceBackground({
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    variant,
    seedLabel: seed,
    spaceConfig: buildCosmicSpaceConfig("cosmic_soft"),
  });
  const svg = [
    `<svg class="bg-space__svg" xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}" preserveAspectRatio="xMidYMid slice">`,
    `<rect width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" fill="${BACKGROUND_COLORS.bgDeep}"/>`,
    `<defs>${bg.defs}</defs>`,
    bg.body,
    `</svg>`,
  ].join("");
  SPACE_SVG_CACHE.set(cacheKey, svg);
  return svg;
}

function renderSpaceBg(variant, seedLabel = "") {
  if (!SPACE_BG_ENABLED) return "";
  return `<div class="bg-space">${buildSpaceSvg(variant, seedLabel)}</div>`;
}

function buildHeader(meta) {
  return `
    <div class="relation-head">
      <div class="subtitle label relation-en">${escapeHtml(meta?.en || "")}</div>
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

function buildCosmicNav(activeIndex, totalSlides) {
  const total = Number.isFinite(totalSlides) ? totalSlides : 0;
  if (!total) return "";
  const dots = Array.from({ length: total }, (_, i) => {
    const isActive = i === activeIndex;
    return `<span class="nav-dot ${isActive ? "active" : ""}">${isActive ? "★" : "○"}</span>`;
  }).join("");
  return `<div class="star-nav">${dots}</div>`;
}

function renderRelationRow(row) {
  if (!row) return "";
  if (typeof row === "string") {
    return `<div class="relation-row">${escapeHtml(row)}</div>`;
  }
  const text = escapeHtml(row.text || "");
  const className = row.className ? ` ${row.className}` : "";
  return `<div class="relation-row${className}">${text}</div>`;
}

function buildTwoColList({ leftRows = [], rightRows = [], leftTitle = "A SIDE", rightTitle = "B SIDE", leftSub = "A", rightSub = "B", className = "" }) {
  return `
    <div class="relation-cols ${className || ""}">
      <div class="chart-box relation-col">
        <div class="card-head">${escapeHtml(leftTitle)}</div>
        ${leftSub ? `<div class="card-sub">${escapeHtml(leftSub)}</div>` : ""}
        <div class="card-list relation-list">
          ${leftRows.map(renderRelationRow).join("")}
        </div>
      </div>
      <div class="chart-box relation-col">
        <div class="card-head">${escapeHtml(rightTitle)}</div>
        ${rightSub ? `<div class="card-sub">${escapeHtml(rightSub)}</div>` : ""}
        <div class="card-list relation-list">
          ${rightRows.map(renderRelationRow).join("")}
        </div>
      </div>
    </div>
  `;
}

function buildSingleList({ title = "", sub = "", rows = [] } = {}) {
  return `
    <div class="relation-cols relation-cols--single">
      <div class="chart-box relation-col">
        <div class="card-head">${escapeHtml(title)}</div>
        ${sub ? `<div class="card-sub">${escapeHtml(sub)}</div>` : ""}
        <div class="card-list relation-list">
          ${rows.map(renderRelationRow).join("")}
        </div>
      </div>
    </div>
  `;
}

function buildConnectionList({ title = "", sub = "", note = "", aiText = "", connections = [], aName = "A", bName = "B", showNames = true } = {}) {
  const safeA = shortName(aName);
  const safeB = shortName(bName);
  const rows = connections.length
    ? connections.map((conn) => {
        const left = formatConnectionSideHtml(conn?.a);
        const right = formatConnectionSideHtml(conn?.b);
        const aspect = formatAspectDisplay(conn?.aspect, conn?.orb);
        return `
          <div class="connection-row">
            <div class="connection-left">${left}</div>
            <div class="connection-center">
              <span class="connection-symbol">${escapeHtml(aspect.symbol)}</span>
              <span class="connection-label">${escapeHtml(aspect.label)}</span>
            </div>
            <div class="connection-right">${right}</div>
          </div>
        `;
      }).join("")
    : `
      <div class="connection-row connection-row--empty">
        <div class="connection-center">—</div>
      </div>
    `;

  return `
    <div class="relation-cols relation-cols--single relation-cols--connection connection-grid">
      <div class="chart-box relation-col">
        <div class="card-head">${escapeHtml(title)}</div>
        ${sub ? `<div class="card-sub">${escapeHtml(sub)}</div>` : ""}
        ${note ? `<div class="card-note">${escapeHtml(note)}</div>` : ""}
        <div class="connection-names">
          <span class="connection-name-left">${escapeHtml(safeA)}</span>
          <span class="connection-name-right">${escapeHtml(safeB)}</span>
        </div>
        <div class="connection-list">
          ${rows}
        </div>
        ${aiText ? `<div class="card-ai">${escapeHtml(aiText)}</div>` : ""}
      </div>
    </div>
  `;
}

function buildBlockGrid(blocks = [], className = "") {
  return `
    <div class="relation-blocks ${className || ""}">
      ${blocks
        .map(
          (b) => `
          <div class="chart-box relation-block">
            <div class="card-head">${escapeHtml(b.title || "")}</div>
            ${b.sub ? `<div class="card-sub">${escapeHtml(b.sub)}</div>` : ""}
            <div class="card-list relation-list">
              ${(b.rows || []).map((row) => `<div class="relation-row">${escapeHtml(row)}</div>`).join("")}
            </div>
          </div>
        `
        )
        .join("")}
    </div>
  `;
}

function formatAxisLine(conn) {
  if (!conn) return "—";
  const left = formatConnectionSide(conn?.a);
  const right = formatConnectionSide(conn?.b);
  const aspect = formatAspectDisplay(conn?.aspect, conn?.orb);
  return `${left} ${aspect.symbol} ${right} ${aspect.orb}`.trim();
}

function buildAxisBlock({ title = "AXIS", connections = [], aName = "A", bName = "B", aiText = "" } = {}) {
  return `
    <div class="relation-block relation-block--axis">
      ${buildConnectionList({ title, sub: "", note: "関係の骨組み", aiText, connections, aName, bName, showNames: false })}
    </div>
  `;
}

function buildDeepBlock({ title = "DEEP", connections = [], aName = "A", bName = "B", aiText = "" } = {}) {
  return `
    <div class="relation-block relation-block--deep">
      ${buildConnectionList({ title, sub: "", note: "深層で残りやすい接触", aiText, connections, aName, bName, showNames: false })}
    </div>
  `;
}

function buildHouseBlock({ title = "HOUSE", sections = [] } = {}) {
  const list = Array.isArray(sections) ? sections.filter(Boolean) : [];
  const left = list[0] || { heading: "", houses: [], summary: "" };
  const right = list[1] || null;
  const isSingle = list.length <= 1;
  const normalizeHeading = (heading) => {
    const text = String(heading || "");
    if (!text) return "";
    const parts = text.split("→").map((s) => s.trim()).filter(Boolean);
    if (parts.length !== 2) return text;
    return `${shortName(parts[0])} → ${shortName(parts[1])}`;
  };
  const renderHouseEntry = (entry, aiLine = "") => {
    if (!entry) return "";
    const houseNum = Number.isFinite(Number(entry?.house)) ? `${entry.house}H` : "—";
    const label = entry?.label ? `｜${entry.label}` : "";
    const items = Array.isArray(entry?.items) ? entry.items.filter(Boolean).join(" / ") : "";
    return `
      <div class="house-entry">
        <div class="house-title">${escapeHtml(`${houseNum}${label}`)}</div>
        <div class="house-items">${items ? escapeHtml(items) : "—"}</div>
        ${aiLine ? `<div class="house-ai">${escapeHtml(aiLine)}</div>` : ""}
      </div>
    `;
  };
  const renderSection = (section) => {
    const houses = Array.isArray(section?.houses) ? section.houses : [];
    const aiLines = Array.isArray(section?.aiLines) ? section.aiLines : [];
    const summary = section?.summary || "";
    return `
      <div class="chart-box relation-col">
        <div class="card-head">${escapeHtml(normalizeHeading(section?.heading || ""))}</div>
        <div class="card-list house-list">
          ${houses.length ? houses.map((entry, idx) => renderHouseEntry(entry, aiLines[idx] || "")).join("") : `<div class="house-entry house-entry--empty">—</div>`}
        </div>
        ${summary ? `<div class="house-summary">${escapeHtml(summary)}</div>` : ""}
      </div>
    `;
  };
  const colsClass = `relation-cols relation-cols--house${isSingle ? " relation-cols--single" : ""}`;
  return `
    <div class="relation-house">
      <div class="card-head relation-house-title">${escapeHtml(title)}</div>
      <div class="card-note">相手が自分のどの領域を動かしやすいか</div>
      <div class="${colsClass}">
        ${renderSection(left)}
        ${right ? renderSection(right) : ""}
      </div>
    </div>
  `;
}

function buildAxisHouseDeepStack({
  axisConnections = [],
  houseSections = [],
  deepConnections = [],
  aName = "A",
  bName = "B",
  axisText = "",
  deepText = "",
} = {}) {
  return `
    <div class="relation-stack">
      ${buildAxisBlock({ connections: axisConnections, aName, bName, aiText: axisText })}
      ${buildHouseBlock({ sections: houseSections })}
      ${buildDeepBlock({ connections: deepConnections, aName, bName, aiText: deepText })}
    </div>
  `;
}

function formatCompareRow(row = {}) {
  const body = row?.body_ja || row?.body_key || "—";
  const aSign = row?.a?.sign_ja || row?.a?.sign_key || "";
  const bSign = row?.b?.sign_ja || row?.b?.sign_key || "";
  const aHouse = Number.isFinite(Number(row?.a?.house)) ? `${row.a.house}H` : "";
  const bHouse = Number.isFinite(Number(row?.b?.house)) ? `${row.b.house}H` : "";
  const relation = row?.sign_relation_label || "—";
  const aspect = row?.aspect ? (ASPECT_DISPLAY[normalizeAspectKey(row.aspect)]?.ja || row.aspect) : "";
  const orb = Number.isFinite(Number(row?.orb)) ? `${Number(row.orb).toFixed(2)}°` : "";
  const aspectPart = aspect ? `${aspect} ${orb}`.trim() : "";
  return `${body}｜${aSign} ${aHouse} ↔ ${bSign} ${bHouse}｜${relation}${aspectPart ? ` / ${aspectPart}` : ""}`.trim();
}

function formatSignRelationRow(row = {}) {
  const a = row?.a_sign_ja || row?.a_sign_key || "—";
  const b = row?.b_sign_ja || row?.b_sign_key || "—";
  const rel = row?.relation_label || "—";
  return `${a} × ${b}｜${rel}`;
}

function buildRelationCenterBlocks({ aLabel, bLabel, topSignA, topSignB, topHouseA, topHouseB, topElementA, topElementB, topModalityA, topModalityB, baseLines = [], relationCenter }) {
  const blocks = [
    {
      title: "A CENTER",
      sub: aLabel,
      rows: [
        `支配サイン: ${topSignA || "—"}`,
        `支配ハウス: ${topHouseA || "—"}`,
        `主成分: ${topElementA || "—"} / ${topModalityA || "—"}`,
      ],
    },
    {
      title: "B CENTER",
      sub: bLabel,
      rows: [
        `支配サイン: ${topSignB || "—"}`,
        `支配ハウス: ${topHouseB || "—"}`,
        `主成分: ${topElementB || "—"} / ${topModalityB || "—"}`,
      ],
    },
    {
      title: "OVERLAP",
      sub: relationCenter?.dominant_overlap_type || "",
      rows: [
        relationCenter?.shared_sign_label ? `重なりサイン: ${relationCenter.shared_sign_label}` : "重なりサイン: —",
        relationCenter?.shared_house_cluster ? `重なりハウス: ${relationCenter.shared_house_cluster}` : "重なりハウス: —",
        relationCenter?.overlap_line || "重なりの帯は分散しています。",
      ],
    },
    {
      title: "DIRECTION",
      sub: relationCenter?.direction_vector || "",
      rows: [
        baseLines?.[1] || "分離帯は固定されません。",
        baseLines?.[2] || "流れ帯は未確定です。",
      ],
    },
  ];

  return buildBlockGrid(blocks, "relation-blocks--two");
}

function buildComparePairsSection({ rows = [] } = {}) {
  const cols = splitTwoColumns(rows.map(formatCompareRow));
  return buildTwoColList({ leftRows: cols.left, rightRows: cols.right, leftTitle: "A ⇄ B", rightTitle: "A ⇄ B", leftSub: "", rightSub: "" });
}

function buildSignRelationSection({ rows = [] } = {}) {
  const list = rows.map(formatSignRelationRow);
  return buildSingleList({ title: "SIGN RELATION", sub: "", rows: list });
}

function buildCoreSection({ relationCore, coreConnections = [], aName, bName } = {}) {
  const coreRows = [
    `主軸｜${relationCore?.main_axis || "—"}`,
    `張力｜${relationCore?.dominant_tension || "—"}`,
    `通路｜${relationCore?.dominant_flow || "—"}`,
    `型｜${relationCore?.dominant_relation_type || "—"}`,
  ];
  const coreTop = coreConnections.slice(0, 3);
  return `
    <div class="relation-stack">
      ${buildSingleList({ title: "RELATION CORE", sub: "骨組み", rows: coreRows })}
      ${buildConnectionList({ title: "CORE LINKS", sub: "", note: "関係の中心に近い接触", connections: coreTop, aName, bName })}
    </div>
  `;
}

function buildRelationPatternSection({ pattern, evidence = [], text = "" } = {}) {
  const rows = evidence.length ? evidence : ["根拠は整理中です。"];
  return `
    <div class="relation-pattern">
      <div class="chart-box relation-pattern-name">
        <div class="card-head">パターン名</div>
        <div class="card-sub">PATTERN NAME</div>
        <div class="card-body text-block">${escapeHtml(pattern?.name || "—")}</div>
      </div>
      <div class="chart-box relation-pattern-summary">
        <div class="card-head">構造まとめ</div>
        <div class="card-sub">STRUCTURE SUMMARY</div>
        <div class="relation-pattern-evidence">
          ${rows.map((row) => `<div class="relation-row">${escapeHtml(row)}</div>`).join("")}
        </div>
        <div class="relation-pattern-text">${escapeHtml(text || "")}</div>
      </div>
    </div>
  `;
}

function buildConnectionDualStack({
  aName,
  bName,
  leftTitle,
  rightTitle,
  leftNote = "",
  rightNote = "",
  leftAiText = "",
  rightAiText = "",
  leftConnections = [],
  rightConnections = [],
} = {}) {
  return `
    <div class="relation-stack">
      ${buildConnectionList({ title: leftTitle, sub: "", note: leftNote, aiText: leftAiText, connections: leftConnections, aName, bName, showNames: true })}
      ${buildConnectionList({ title: rightTitle, sub: "", note: rightNote, aiText: rightAiText, connections: rightConnections, aName, bName, showNames: false })}
    </div>
  `;
}

function buildConnectionStack({ blocks = [] } = {}) {
  const html = (Array.isArray(blocks) ? blocks : [])
    .filter((b) => b && b.include !== false)
    .map((b) => buildConnectionList(b))
    .join("");
  return `<div class="relation-stack">${html}</div>`;
}

function buildRelationCoreText({ relationCore }) {
  const axis = relationCore?.main_axis || "主軸";
  const tension = relationCore?.dominant_tension || "張力";
  const flow = relationCore?.dominant_flow || "通路";
  const type = relationCore?.dominant_relation_type || "layered";
  return `${axis}を中心に、${tension}が輪郭を作り、${flow}が通路を支えます。全体は${type}の型としてまとまりやすい。`;
}

function buildCompareMetaHtml(row = {}) {
  const aSign = row?.a?.sign_ja || row?.a?.sign_key || "—";
  const bSign = row?.b?.sign_ja || row?.b?.sign_key || "—";
  const aHouse = Number.isFinite(Number(row?.a?.house)) ? `${row.a.house}H` : "";
  const bHouse = Number.isFinite(Number(row?.b?.house)) ? `${row.b.house}H` : "";
  const aSignGlyph = row?.a?.sign_glyph ? buildGlyphImgTag(row.a.sign_glyph, { className: "glyph-img glyph-img--sign", size: 16, color: "#EDEEFF" }) : "";
  const bSignGlyph = row?.b?.sign_glyph ? buildGlyphImgTag(row.b.sign_glyph, { className: "glyph-img glyph-img--sign", size: 16, color: "#EDEEFF" }) : "";
  const aText = `${escapeHtml(aSign)}${aHouse ? ` ${escapeHtml(aHouse)}` : ""}`;
  const bText = `${escapeHtml(bSign)}${bHouse ? ` ${escapeHtml(bHouse)}` : ""}`;
  const aspect = row?.aspect ? formatAspectDisplay(row.aspect, row.orb) : null;
  const aspectLabelMap = {
    conjunction: "重なり",
    opposition: "対向",
    square: "直角",
    trine: "調和",
    quincunx: "調整",
  };

  const getHouseBand = (house) => {
    const h = Number(house);
    if (!Number.isFinite(h)) return null;
    if (h >= 1 && h <= 3) return "1-3";
    if (h >= 4 && h <= 6) return "4-6";
    if (h >= 7 && h <= 9) return "7-9";
    if (h >= 10 && h <= 12) return "10-12";
    return null;
  };

  const aSignKey = row?.a?.sign_key || "";
  const bSignKey = row?.b?.sign_key || "";
  const aElem = SIGN_ELEMENT[aSignKey];
  const bElem = SIGN_ELEMENT[bSignKey];
  const aModality = SIGN_MODALITY[aSignKey];
  const bModality = SIGN_MODALITY[bSignKey];
  const sameSign = aSignKey && bSignKey && aSignKey === bSignKey;
  const sameElement = aElem && bElem && aElem === bElem;
  const sameModality = aModality && bModality && aModality === bModality;
  const sameHouse = Number.isFinite(Number(row?.a?.house)) && Number.isFinite(Number(row?.b?.house)) && Number(row.a.house) === Number(row.b.house);
  const sameHouseBand = getHouseBand(row?.a?.house) && getHouseBand(row?.b?.house) && getHouseBand(row?.a?.house) === getHouseBand(row?.b?.house);

  const attributeLabelMap = {
    same_sign: "◎ 同サイン",
    same_element: "◯ 同元素",
    same_modality: "▣ 同区分",
    same_house: "▤ 同ハウス",
    same_house_band: "▥ 同ハウス帯",
    none: "◌ 非接続",
  };

  let attributeKey = "none";
  if (sameSign) attributeKey = "same_sign";
  else if (sameElement) attributeKey = "same_element";
  else if (sameModality) attributeKey = "same_modality";
  else if (sameHouse) attributeKey = "same_house";
  else if (sameHouseBand) attributeKey = "same_house_band";

  const attributeLabel = attributeLabelMap[attributeKey] || attributeLabelMap.none;

  const aspectKey = row?.aspect ? normalizeAspectKey(row.aspect) : "";
  const aspectLabel = aspectKey && aspectLabelMap[aspectKey] ? aspectLabelMap[aspectKey] : aspect?.label;
  const aspectText = aspect && aspectLabel ? `${aspect.symbol}${aspectLabel}`.trim() : attributeLabel;
  return `
    <span class="compare-meta-side">${aSignGlyph}<span class="compare-meta-sign-text">${aText}</span></span>
    <span class="compare-meta-rel">${escapeHtml(aspectText)}</span>
    <span class="compare-meta-side compare-meta-side--weak">${bSignGlyph}<span class="compare-meta-sign-text">${bText}</span></span>
  `;
}

function buildCompareLayerItem(row = {}) {
  if (!row) return "";
  const bodyGlyph = row?.a?.body_glyph || row?.b?.body_glyph || "";
  const bodyKey = String(row?.body_key || "").toLowerCase();
  const rawName = row?.body_ja || row?.body_key || "—";
  const bodyRaw = AXIS_BODIES.has(bodyKey) ? String(rawName).toUpperCase() : rawName;
  const axisPrefix = AXIS_SYMBOLS[bodyKey] ? `${AXIS_SYMBOLS[bodyKey]} ` : "";
  const bodyJa = axisPrefix ? `${axisPrefix}${bodyRaw}` : bodyRaw;
  const title = `${bodyGlyph} ${bodyJa}`.trim();
  const glyph = bodyGlyph ? buildGlyphImgTag(bodyGlyph, { className: "glyph-img glyph-img--body", size: 24, color: "#EDEEFF" }) : "";
  const metaHtml = buildCompareMetaHtml(row);
  const aiText = row?.ai_text || row?.ai_line || "";
  return `
    <div class="compare-layer-item card">
      <div class="compare-row">
        <div class="card-title">${glyph}<span class="card-title-text">${escapeHtml(bodyJa)}</span></div>
        <div class="card-meta-inline compare-meta-line">${metaHtml}</div>
      </div>
      ${aiText ? `<div class="compare-ai">${escapeHtml(aiText)}</div>` : ""}
    </div>
  `;
}

function buildCompareLayer({ title = "", note = "", aiText = "", rows = [], className = "" } = {}) {
  return `
    <div class="chart-box relation-col compare-layer ${className || ""}">
      <div class="card-head">${escapeHtml(title)}</div>
      ${note ? `<div class="card-note">${escapeHtml(note)}</div>` : ""}
      <div class="compare-layer-list">
        ${rows.map((row) => buildCompareLayerItem(row)).join("")}
      </div>
      ${aiText ? `<div class="card-ai">${escapeHtml(aiText)}</div>` : ""}
    </div>
  `;
}

function buildCompareBlockDefs({
  personal = [],
  social = [],
  transpersonal = [],
  axis = [],
  deep = [],
  aiTexts = {},
  includeAxisDeep = true,
} = {}) {
  const blocks = [
    { title: "PERSONAL", note: "内側の機能", aiText: aiTexts.personal_text || "", rows: personal },
    { title: "SOCIAL", note: "外との接点", aiText: aiTexts.social_text || "", rows: social },
    { title: "TRANSPERSONAL", note: "構造変化", aiText: aiTexts.transpersonal_text || "", rows: transpersonal },
  ];
  if (includeAxisDeep) {
    blocks.push(
      { title: "AXIS", note: "構造の骨", aiText: aiTexts.axis_compare_text || "", rows: axis },
      { title: "DEEP", note: "地下構造", aiText: aiTexts.deep_compare_text || "", rows: deep },
    );
  }
  return blocks;
}

function buildCompareBlockStack(blocks = []) {
  return `
    <div class="relation-stack">
      ${(Array.isArray(blocks) ? blocks : []).map((b) => buildCompareLayer(b)).join("")}
    </div>
  `;
}

function buildRelationTypeSection({ pattern, relationCore, aiText = "" } = {}) {
  const name = pattern?.name || "—";
  const key = pattern?.key || "—";
  const evidence = Array.isArray(pattern?.evidence) ? pattern.evidence : [];
  const tags = [
    relationCore?.main_axis ? `主軸｜${relationCore.main_axis}` : "",
    relationCore?.dominant_tension ? `優勢角度｜${relationCore.dominant_tension}` : "",
    key ? `型｜${key}` : "",
  ].filter(Boolean);
  return `
    <div class="relation-type">
      <div class="chart-box relation-type-main">
        <div class="card-head">関係タイプ</div>
        <div class="card-sub">RELATION TYPE</div>
        <div class="relation-type-name">${escapeHtml(name)}</div>
        ${tags.length ? `<div class="relation-type-tags">${tags.map((t) => `<span class="relation-type-tag">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
        ${aiText ? `<div class="relation-type-ai">${escapeHtml(aiText)}</div>` : ""}
      </div>
      <div class="chart-box relation-type-evidence">
        <div class="card-head">根拠</div>
        <div class="card-sub">EVIDENCE</div>
        <div class="relation-type-evidence-list">
          ${(evidence.length ? evidence : ["根拠は整理中です。"]).map((row) => `<div class="relation-row">${escapeHtml(row)}</div>`).join("")}
        </div>
      </div>
    </div>
  `;
}

function buildCompareBlocksSection({ core = [], emotion = [], action = [], communication = [], expansion = [], axisDeep = [] } = {}) {
  return buildCompareBlockStack(buildCompareBlockDefs({ core, emotion, action, communication, expansion, axisDeep }));
}

function buildSignFacingRowHtml(row = {}, note = "") {
  const bodyGlyph = row?.a?.body_glyph || "";
  const bodyJa = row?.body_ja || row?.body_key || "—";
  const aSignGlyph = row?.a?.sign_glyph || "";
  const aSign = row?.a?.sign_ja || row?.a?.sign_key || "—";
  const bSignGlyph = row?.b?.sign_glyph || "";
  const bSign = row?.b?.sign_ja || row?.b?.sign_key || "—";
  const rel = row?.sign_relation || "other";
  const relSymbol = SIGN_RELATION_SYMBOLS[rel] || "·";
  const bodyGlyphTag = bodyGlyph ? buildGlyphImgTag(bodyGlyph, { className: "glyph-img glyph-img--body", size: 24, color: "#EDEEFF" }) : "";
  const aSignGlyphTag = aSignGlyph ? buildGlyphImgTag(aSignGlyph, { className: "glyph-img glyph-img--sign", size: 18, color: "#EDEEFF" }) : "";
  const bSignGlyphTag = bSignGlyph ? buildGlyphImgTag(bSignGlyph, { className: "glyph-img glyph-img--sign", size: 18, color: "#EDEEFF" }) : "";
  return `
    <div class="sign-facing-row card">
      <div class="sign-facing-head">
        <div class="card-title">${bodyGlyphTag}<span class="card-title-text">${escapeHtml(bodyJa)}</span></div>
        <div class="card-meta-inline sign-facing-meta">
          <span class="sign-facing-sign">${aSignGlyphTag}<span class="sign-facing-sign-text">${escapeHtml(aSign)}</span></span>
          <span class="sign-facing-rel">${escapeHtml(relSymbol)}</span>
          <span class="sign-facing-sign sign-facing-sign--weak">${bSignGlyphTag}<span class="sign-facing-sign-text">${escapeHtml(bSign)}</span></span>
        </div>
      </div>
      ${note ? `<div class="card-text text-block sign-facing-note">→ ${escapeHtml(note)}</div>` : ""}
    </div>
  `;
}

function buildSignFacingSection({ rows = [], noteMap = {} } = {}) {
  const items = rows.length ? rows : [{ _empty: true }];
  return `
    <div class="relation-cols relation-cols--single relation-cols--sign-facing">
      <div class="chart-box relation-col">
        <div class="card-head">SIGN FACING</div>
        <div class="card-list relation-list sign-facing-list">
          ${items
            .map((row) => {
              if (row._empty) {
                return `<div class="sign-facing-row"><div class="sign-facing-main">—</div></div>`;
              }
              const key = row?.body_key || "";
              const note = noteMap?.[key] || "";
              return buildSignFacingRowHtml(row, note);
            })
            .join("")}
        </div>
      </div>
    </div>
  `;
}

function buildSignFacingText({ rows = [] } = {}) {
  if (!rows.length) return "サインの向かい合いは分散しています。";
  const counts = rows.reduce((acc, r) => {
    const key = r?.sign_relation || "other";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "other";
  const label = SIGN_RELATION_LABELS[top] || top;
  return `向かい合いの中心は「${label}」に寄っています。サインの距離が関係の空気を作ります。`;
}

function mergeUniqueBodies(base = [], extra = []) {
  const seen = new Set(base.map((row) => row?.body_key).filter(Boolean));
  const add = extra.filter((row) => row?.body_key && !seen.has(row.body_key));
  return [...base, ...add];
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
  const aName = shortName(a?.name || "A");
  const bName = shortName(b?.name || "B");
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

function buildPage({ meta, leftRows, rightRows, bottomSections, extra = "", middleHtml = "", leftTitle, rightTitle, leftSub, rightSub, pageNo = 1, total = null, variant = "slide3", spaceOpacity = 0.8, pageClass = "", seedLabel = "" }) {
  const spaceStyle = Number.isFinite(Number(spaceOpacity)) ? ` style="--space-opacity:${spaceOpacity};"` : "";
  const middleContent = middleHtml || buildTwoColList({ leftRows, rightRows, leftTitle, rightTitle, leftSub, rightSub });
  return `
    <div class="page page--space relation-page ${pageClass || ""}"${spaceStyle}>
      ${renderSpaceBg(variant, seedLabel)}
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
      ${buildCosmicNav(pageNo - 1, total)}
      ${buildFooter({ pageNo, total })}
    </div>
  `;
}

function buildCoverPage({ meta, wheelHtml = "", pageNo = 1, total = null, spaceOpacity = 0.9, pageClass = "", seedLabel = "" }) {
  const spaceStyle = Number.isFinite(Number(spaceOpacity)) ? ` style="--space-opacity:${spaceOpacity};"` : "";
  return `
    <div class="page page--space relation-page ${pageClass || ""}"${spaceStyle}>
      ${renderSpaceBg("slide1", seedLabel)}
      <div class="blueprint-grid"></div>
      <div class="page-corner">✦</div>
      <div class="slide relation-cover">
        <div class="top center">
          <div class="label relation-en">${escapeHtml(meta?.en || "")}</div>
          <div class="title relation-cover-ja">${escapeHtml(meta?.ja || "")}</div>
          <div class="page-intro">${escapeHtml(meta?.intro || "")}</div>
        </div>
        ${wheelHtml ? `<div class="relation-wheel-wrap">${wheelHtml}</div>` : ""}
      </div>
      ${buildCosmicNav(pageNo - 1, total)}
      ${buildFooter({ pageNo, total })}
    </div>
  `;
}

module.exports = {
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
  buildRelationTypeSection,
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
};
