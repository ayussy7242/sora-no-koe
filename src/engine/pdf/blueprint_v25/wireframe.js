"use strict";

const { buildSoraWheelSvg } = require("../../graphics/sora_wheel");
const { buildBlueprintPlaceholders } = require("./placeholders");
const { buildBlueprintCss } = require("./styles");
const { buildWireframeData } = require("./wireframe_data");
const { buildSpaceSvg, buildPageNumber } = require("./bg");
const { wrapZodiacGlyphs } = require("./zodiac");
const { buildPlanetPages, buildLayerPages, buildDeepAxisPages, buildAspectPages } = require("./layout");
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
} = require("./constants");
const {
  escapeHtml,
  renderRichText,
  renderInlineText,
} = require("./utils");
const { replaceGlyphsWithImages } = require("./glyphs");

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

  const plnPages = buildPlanetPages({ p, usableHeight: USABLE_HEIGHT });
  const layPages = buildLayerPages({ p, usableHeight: USABLE_HEIGHT });
  const depPages = buildDeepAxisPages({ p, usableHeight: USABLE_HEIGHT });
  const aspPages = buildAspectPages({ p, usableHeight: USABLE_HEIGHT });

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
