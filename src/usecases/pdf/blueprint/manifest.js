"use strict";

const DEFAULT_VERSION = "v1";

const MANIFESTS = Object.freeze({
  print: Object.freeze({
    product: "blueprint_light",
    version: DEFAULT_VERSION,
    variant: "print",
    layout: "a4",
    theme: "sora_light",
    sections: ["cover", "toc", "quick_map", "structure", "planets", "points", "angles", "closing"],
    outputFile: `${DEFAULT_VERSION}.print.pdf`,
  }),
  mobile: Object.freeze({
    product: "blueprint_light",
    version: "v25",
    variant: "mobile",
    layout: "mobile_9x16",
    theme: "sora_light",
    sections: ["sys", "map", "obs", "ang", "pln", "lay", "dep", "asp", "pat"],
    outputFile: `v25.mobile.pdf`,
  }),
});

function getBlueprintLightManifest({ variant = "print" } = {}) {
  return MANIFESTS[variant] || MANIFESTS.print;
}

module.exports = {
  getBlueprintLightManifest,
};
