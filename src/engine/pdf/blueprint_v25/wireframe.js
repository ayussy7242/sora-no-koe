"use strict";

const { buildBlueprintPlaceholders } = require("./placeholders");
const { buildBlueprintCss } = require("./styles");
const { buildWireframeData } = require("./wireframe_data");
const { buildPageNumber } = require("./bg");
const { buildWireframeViewModel } = require("./view_model");
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

function buildBlueprintV25WireframeHtml({ data = {}, useSpace = true } = {}) {
  const placeholders = buildBlueprintPlaceholders();

  const css = buildBlueprintCss();

  const HEADER_RESERVED = 180;
  const FOOTER_RESERVED = 40;
  const USABLE_HEIGHT = PAGE_HEIGHT - 90 - 110 - HEADER_RESERVED - FOOTER_RESERVED;

  const base = buildWireframeData(data, placeholders);
  const view = buildWireframeViewModel({
    data,
    base,
    useSpace,
    usableHeight: USABLE_HEIGHT,
  });

  const ctx = {
    p: view.p,
    PAGE_INTROS,
    renderBg: view.renderBg,
    strongBg: view.strongBg,
    midBg: view.midBg,
    natalWheelMarkup: view.natalWheelMarkup,
    buildAspectSvg: view.buildAspectSvg,
    dominantSignRows: view.dominantSignRows,
    escapeHtml,
    renderRichText,
    renderInlineText,
    plnPages: view.plnPages,
    layPages: view.layPages,
    depPages: view.depPages,
    aspPages: view.aspPages,
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
