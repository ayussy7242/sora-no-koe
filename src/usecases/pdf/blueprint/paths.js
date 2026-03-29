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

function getBlueprintLightBgPaths(lineUserId) {
  if (!lineUserId) return { bgDir: null, files: {} };
  const bgDir = `blueprints/light/${lineUserId}/bg`;
  return {
    bgDir,
    files: {
      sys: `${bgDir}/bg_sys.png`,
      obs: `${bgDir}/bg_obs.png`,
      asp: `${bgDir}/bg_asp.png`,
      pat: `${bgDir}/bg_pat.png`,
    },
  };
}

module.exports = {
  getBlueprintLightPaths,
  getBlueprintLightBgPaths,
};
