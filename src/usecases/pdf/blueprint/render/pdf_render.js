"use strict";

const { renderPdfBuffer } = require("../../../../engine/pdf/blueprint_light/render");

function renderBlueprintLightPdf({
  manifest,
  displayName,
  birthText,
  rowsMain,
  rowsAngles,
  rowsExtra,
  summary,
  element,
  modality,
  blueprintText,
  bgImages,
  story,
}) {
  return renderPdfBuffer({
    manifest,
    displayName,
    birthText,
    rowsMain,
    rowsAngles,
    rowsExtra,
    summary,
    element,
    modality,
    blueprintText,
    bgImages,
    story,
  });
}

module.exports = { renderBlueprintLightPdf };
