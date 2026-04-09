"use strict";

const { buildMoonGeometry } = require("./geometry");

function buildGeometrySamples({
  model,
  size = 160,
  waxing = true,
  illuminations = [],
  geometryOptions = {},
} = {}) {
  return illuminations.map((illumination) =>
    buildMoonGeometry({
      size,
      illumination,
      waxing,
      model,
      ...geometryOptions,
    })
  );
}

module.exports = {
  buildGeometrySamples,
};
