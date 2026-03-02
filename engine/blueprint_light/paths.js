"use strict";

const { getBlueprintLightManifest } = require("./manifest");

function getBlueprintLightPaths(lineUserId, variant = "print") {
  if (!lineUserId) return { pdfPath: null, jsonPath: null };
  const manifest = getBlueprintLightManifest({ variant });
  const pdfFile = manifest.outputFile || "v1.print.pdf";
  return {
    pdfPath: `blueprints/light/${lineUserId}/${pdfFile}`,
    jsonPath: `blueprints/light/${lineUserId}/v1.json`,
  };
}

module.exports = {
  getBlueprintLightPaths,
};
