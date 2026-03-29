"use strict";

/**
 * Generation entrypoint (SSOT export).
 * Use this module to access v1/v2 generators.
 * If you are unsure which version runs, start here.
 */
const { generateBlueprintLightText } = require("./versions/v1");
const { generateBlueprintLightTextV2 } = require("./versions/v2");

module.exports = Object.freeze({
  generateBlueprintLightText,
  generateBlueprintLightTextV2,
});
