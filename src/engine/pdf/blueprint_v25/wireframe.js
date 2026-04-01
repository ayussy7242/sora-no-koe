"use strict";

const { buildSpaceBackground } = require("../../shared/space_background");
const { buildSoraWheelSvg } = require("../../graphics/sora_wheel");
const { BACKGROUND_COLORS } = require("../../shared/space_background/constants");
const { buildBlueprintPlaceholders } = require("./placeholders");
const { buildBlueprintCss } = require("./styles");
const { buildWireframeData } = require("./wireframe_data");
const {
  renderSysPage,
  renderMapPage,
  renderObsPage,
  renderAngPage,
  renderPlnPages,
  renderLayPages,
  renderDepPages,
  renderAspPages,
  renderPatPage,
} = require("./renderers");
const {
  PAGE_WIDTH,
  PAGE_HEIGHT,
  PAGE_INTROS,
  UI_SCALE,
  TITLE_SCALE,
  FS_BODY,
  FS_SUB,
  FS_HEAD,
  LINE_HEIGHT,
  TEXT_MAX_WIDTH,
  DEEP_AXIS_ROLE_TAGLINES,
  SIGN_JA,
  SIGN_SYMBOL,
} = require("./constants");
const {
  escapeHtml,
  renderRichText,
  renderInlineText,
  estimateBlockHeight,
  paginateBlocks,
} = require("./utils");
const { replaceGlyphsWithImages, buildGlyphImgTag } = require("./glyphs");

function buildSpaceSvg({ variant, enabled }) {
  if (!enabled) {
    return [
      `<svg class="bg-space__svg" xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}" preserveAspectRatio="xMidYMid slice">`,
      `<rect width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" fill="${BACKGROUND_COLORS.bgDeep}"/>`,
      `</svg>`,
    ].join("");
  }
  const bg = buildSpaceBackground({ width: PAGE_WIDTH, height: PAGE_HEIGHT, variant });
  return [
    `<svg class="bg-space__svg" xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}" preserveAspectRatio="xMidYMid slice">`,
    `<rect width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" fill="${BACKGROUND_COLORS.bgDeep}"/>`,
    `<defs>${bg.defs}</defs>`,
    bg.body,
    `</svg>`,
  ].join("");
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

function buildPageNumber(index) {
  const num = String(index + 1).padStart(2, "0");
  return `<div class="page-number">${num}</div>`;
}

function buildBlueprintV25WireframeHtml({ data = {}, useSpace = true } = {}) {
  const strongBg = buildSpaceSvg({ variant: "slide1", enabled: useSpace });
  const midBg = buildSpaceSvg({ variant: "slide3", enabled: useSpace });
  const bgImages = data?.bg_images || data?.bgImages || null;
  const fallbackKey = (key) => {
    if (key === "sys" || key === "pat") return "strong";
    if (key === "asp") return "medium";
    if (key === "obs") return "faint";
    return null;
  };
  const renderBg = (key, fallbackSvg) => {
    const src = bgImages?.[key] || (fallbackKey(key) ? bgImages?.[fallbackKey(key)] : null);
    if (src) {
      return `<div class="bg-space"><img class="bg-img" src="${src}" alt="space background"/></div>`;
    }
    return `<div class="bg-space">${fallbackSvg}</div>`;
  };

  const placeholders = buildBlueprintPlaceholders();

  const p = buildWireframeData(data, placeholders);
  const natalWheelMarkup = p.natalWheelSvg
    ? `<div class="wheel-svg">${p.natalWheelSvg}</div>`
    : `<div class="wheel" style="width: 92%; height: auto; aspect-ratio: 1 / 1;"></div>`;
  const dominantSignRows = (p.dominantSigns && p.dominantSigns.length)
    ? p.dominantSigns
    : [];
  const northNodeSymbol = p.nodeSigns?.find((row) => row.glyph === "☊")?.symbol || "☊";
  const southNodeSymbol = p.nodeSigns?.find((row) => row.glyph === "☋")?.symbol || "☋";

  const buildAspectSvg = () => {
    if (!p.aspectWheelAspects?.length) return "";
    const story = data?.story || data?.kernel?.story;
    if (!story) return "";
    const size = 630;
    const svg = buildSoraWheelSvg({
      story,
      size,
      rotationDeg: p.wheelRotationDeg || 0,
      showAspects: true,
      showHouses: false,
      aspects: p.aspectWheelAspects,
      ascLonDeg: p.wheelAscLon,
      mcLonDeg: p.wheelMcLon,
    });
    return `<div style="margin-top:16px; width:120%;">${svg}</div>`;
  };

  const css = buildBlueprintCss();

  const HEADER_RESERVED = 180;
  const FOOTER_RESERVED = 40;
  const USABLE_HEIGHT = PAGE_HEIGHT - 90 - 110 - HEADER_RESERVED - FOOTER_RESERVED;

  const zodiacGlyphs = Array.from(new Set(Object.values(SIGN_SYMBOL || {}).filter(Boolean)));
  const zodiacNameMap = Object.entries(SIGN_JA || {}).map(([key, name]) => ({
    name,
    glyph: SIGN_SYMBOL?.[key] || "",
  })).filter((row) => row.name && row.glyph);
  const ensureZodiacGlyphs = (text) => {
    let out = String(text || "");
    zodiacNameMap.forEach(({ name, glyph }) => {
      if (!out.includes(name)) return;
      if (out.includes(glyph)) return;
      out = out.replace(name, `${glyph} ${name}`);
    });
    return out;
  };
  const wrapZodiacGlyphs = (text) => {
    let out = ensureZodiacGlyphs(text);
    zodiacGlyphs.forEach((glyph) => {
      out = out.split(glyph).join(`<span class="zodiac-glyph">${glyph}</span>`);
    });
    return out;
  };
  if (p.angleMeta) {
    const stripAxisLabel = (value) => {
      const raw = String(value || "");
      const match = raw.match(/^(ASC|MC|IC|DC)\s*｜\s*(.+)$/i);
      return match ? match[2] : raw;
    };
    p.angleMetaInlineHtml = Object.fromEntries(
      Object.entries(p.angleMeta).map(([key, value]) => [
        key,
        wrapZodiacGlyphs(escapeHtml(stripAxisLabel(value))),
      ]),
    );
  }

  const plnBlocks = (p.planetRolesAll || []).map((card) => {
    const textForHeight = [card.roleLabel, card.text].filter(Boolean).join("\n");
    const basePad = 14;
    const extraPad = card.key === "pluto" ? 20 : 0;
    const height = estimateBlockHeight({ text: textForHeight }) + basePad + extraPad;
    const roleHtml = card.roleLabel ? `<div class="card-role">${escapeHtml(card.roleLabel)}</div>` : "";
    const metaHtml = wrapZodiacGlyphs(escapeHtml(card.meta));
    const html = [
      `<div class="card">`,
      `<div class="card-title">${escapeHtml(card.label)}<span class="card-meta-inline">${metaHtml}</span></div>`,
      roleHtml,
      `<div class="card-text text-block">${renderRichText(card.text)}</div>`,
      `</div>`,
    ].join("");
    return { html, height };
  });
  let plnPages = paginateBlocks(plnBlocks, { maxHeight: USABLE_HEIGHT, minUsage: 0.35 });
  if (plnPages.length > 3) {
    const merged = plnPages.slice(2).reduce((acc, page) => acc.concat(page.blocks), []);
    plnPages = [plnPages[0], plnPages[1], { blocks: merged, height: merged.reduce((sum, b) => sum + b.height, 0) }];
  }

  const layBlocks = [
    { key: "core", title: "中心の層", sub: "CORE LAYER", lines: p.systemLayerLines?.core || [], text: p.planetGroups.core || "" },
    { key: "personal", title: "個の層", sub: "PERSONAL LAYER", lines: p.systemLayerLines?.personal || [], text: p.planetGroups.personal || "" },
    { key: "collective", title: "外の層", sub: "COLLECTIVE LAYER", lines: p.systemLayerLines?.collective || [], text: p.planetGroups.socialTranspersonal || p.planetGroups.social || "" },
  ].map((row) => {
    const text = `${(row.lines || []).join(" ")} ${row.text || ""}`.trim();
    const height = estimateBlockHeight({ text });
    const html = [
      `<div class="chart-box full-width">`,
      `<div class="card-head">${row.title}</div>`,
      `<div class="card-sub">${row.sub}</div>`,
      row.lines?.length ? `<div class="card-list inline">${row.lines.map((l) => `<div>${escapeHtml(l)}</div>`).join("")}</div>` : "",
      `<div class="card-body text-block">${renderRichText(row.text)}</div>`,
      `</div>`,
    ].join("");
    return { html, height };
  });
  const layPages = paginateBlocks(layBlocks, { maxHeight: USABLE_HEIGHT, minUsage: 0.35 });

  const depBlocks = [
    {
      key: "node_north",
      title: `${buildGlyphImgTag("☊", { className: "glyph-img glyph-img--head", size: 22 })} ノースノード`,
      meta: [p.deepAxisMeta?.northMeta].filter(Boolean),
      role: DEEP_AXIS_ROLE_TAGLINES.north_node,
      text: p.deepAxis.nodesNorth || "",
    },
    {
      key: "node_south",
      title: `${buildGlyphImgTag("☋", { className: "glyph-img glyph-img--head", size: 22 })} サウスノード`,
      meta: [p.deepAxisMeta?.southMeta].filter(Boolean),
      role: DEEP_AXIS_ROLE_TAGLINES.south_node,
      text: p.deepAxis.nodesSouth || "",
    },
    {
      key: "chiron",
      title: `${buildGlyphImgTag("⚷", { className: "glyph-img glyph-img--head", size: 22 })} キロン`,
      meta: [p.deepAxisMeta?.chiron].filter(Boolean),
      role: [DEEP_AXIS_ROLE_TAGLINES.chiron].filter(Boolean),
      text: p.deepAxis.chiron || "",
    },
    {
      key: "lilith",
      title: `${buildGlyphImgTag("⚸", { className: "glyph-img glyph-img--head", size: 22 })} リリス`,
      meta: [p.deepAxisMeta?.lilith].filter(Boolean),
      role: [DEEP_AXIS_ROLE_TAGLINES.lilith].filter(Boolean),
      text: p.deepAxis.lilith || "",
    },
  ].map((row) => {
    const meta = Array.isArray(row.meta) ? row.meta : [];
    const roleLines = Array.isArray(row.role) ? row.role : row.role ? [row.role] : [];
    const text = [meta.join(" "), roleLines.join(" "), row.text].filter(Boolean).join(" ");
    let height = estimateBlockHeight({ text, sub: false });
    if (row.key === "node_north" || row.key === "node_south") height += 10;
    const metaInline = meta.length
      ? `<span class="card-meta-inline">${replaceGlyphsWithImages(wrapZodiacGlyphs(escapeHtml(meta[0])), { className: "glyph-img glyph-img--axis", size: 18 })}</span>`
      : "";
    const metaHtml = meta.length > 1
      ? meta.slice(1).map((m, idx) => `<div class="card-meta ${idx ? "node-meta" : ""}">${replaceGlyphsWithImages(wrapZodiacGlyphs(escapeHtml(m)), { className: "glyph-img glyph-img--axis", size: 18 })}</div>`).join("")
      : "";
    const bodyClass = "card-text text-block";
    const headHtml = `<div class="card-title">${row.title}${metaInline}</div>`;
    const boxClass = "card";
    const roleHtml = roleLines.length
      ? roleLines.map((line) => `<div class="card-role">${escapeHtml(line)}</div>`).join("")
      : "";
    const stripRoleLines = (textValue, lines) => {
      if (!textValue || !lines.length) return textValue || "";
      let out = String(textValue).trimStart();
      lines.forEach((line) => {
        if (out.startsWith(line)) {
          out = out.slice(line.length).replace(/^\s*\n/, "");
        }
      });
      return out;
    };
    const bodyText = stripRoleLines(row.text, roleLines);
    const bodyHtml = bodyText
      ? `<div class="${bodyClass}">${renderRichText(bodyText)}</div>`
      : "";
    const html = [
      `<div class="${boxClass}">`,
      headHtml,
      "",
      metaHtml,
      roleHtml,
      bodyHtml,
      `</div>`,
    ].join("");
    return { html, height };
  });
  const depPages = paginateBlocks(depBlocks, { maxHeight: USABLE_HEIGHT, minUsage: 0.35 });

  const aspBlocks = [
    {
      key: "aspects",
      title: "主要アスペクト",
      sub: "CORE ASPECTS",
      text: (p.aspectMap || []).join(" "),
      html: [
        `<div class="chart-box full-width">`,
        `<div class="card-head">主要アスペクト</div>`,
        `<div class="card-sub">CORE ASPECTS</div>`,
        `<div class="card-body text-block"><ul class="aspect-list">${(p.aspectMap || []).map((text) => `<li>${renderInlineText(text)}</li>`).join("")}</ul></div>`,
        `</div>`,
      ].join(""),
    },
  ].map((row) => ({ html: row.html, height: estimateBlockHeight({ text: row.text }) }));
  const aspPages = paginateBlocks(aspBlocks, { maxHeight: USABLE_HEIGHT, minUsage: 0.35 });

  const ctx = {
    p,
    PAGE_INTROS,
    renderBg,
    strongBg,
    midBg,
    natalWheelMarkup,
    buildAspectSvg,
    dominantSignRows,
    escapeHtml,
    renderRichText,
    renderInlineText,
    plnPages,
    layPages,
    depPages,
    aspPages,
    pageIndex: 0,
    nextPageNumber: () => buildPageNumber(ctx.pageIndex++),
  };

  const sections = [
    renderSysPage(ctx),
    renderMapPage(ctx),
    renderObsPage(ctx),
    renderAngPage(ctx),
    renderPlnPages(ctx),
    renderLayPages(ctx),
    renderDepPages(ctx),
    renderAspPages(ctx),
    renderPatPage(ctx),
  ];

  const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <title>Blueprint v2.5 Wireframe</title>
  <style>${css}</style>
</head>
<body>
  ${sections.join("\n")}
</body>
</html>`;

  return html;
}

module.exports = {
  buildBlueprintV25WireframeHtml,
  PAGE_WIDTH,
  PAGE_HEIGHT,
};
