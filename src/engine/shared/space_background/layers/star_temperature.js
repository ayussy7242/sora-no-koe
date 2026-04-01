"use strict";

const { clamp } = require("../utils");
const { hexToRgb, rgbToHex, mixColor } = require("../../../shared/color");

function sampleTempRange(rand, minK, maxK, skew = 1.2) {
  const u = rand();
  const t = Math.pow(u, skew);
  return minK + (maxK - minK) * t;
}

function sampleSpectralClass(rand) {
  const classes = [
    { key: "O", weight: 1, min: 25000, max: 35000, skew: 1.0 },
    { key: "B", weight: 4, min: 12000, max: 25000, skew: 1.05 },
    { key: "A", weight: 10, min: 9000, max: 12000, skew: 1.1 },
    { key: "F", weight: 14, min: 6500, max: 9000, skew: 1.2 },
    { key: "G", weight: 22, min: 5200, max: 6500, skew: 1.25 },
    { key: "K", weight: 24, min: 3900, max: 5200, skew: 1.3 },
    { key: "M", weight: 25, min: 2600, max: 3900, skew: 1.35 },
  ];
  const total = classes.reduce((s, c) => s + c.weight, 0);
  let roll = rand() * total;
  for (const c of classes) {
    if (roll < c.weight) return c;
    roll -= c.weight;
  }
  return classes[classes.length - 1];
}

function normalizeWeights(weights) {
  const w = {
    white: Number(weights?.white) || 0,
    blue: Number(weights?.blue) || 0,
    yellow: Number(weights?.yellow) || 0,
    red: Number(weights?.red) || 0,
  };
  const sum = w.white + w.blue + w.yellow + w.red;
  if (sum <= 0) {
    return { white: 0.75, blue: 0.12, yellow: 0.08, red: 0.05 };
  }
  return {
    white: w.white / sum,
    blue: w.blue / sum,
    yellow: w.yellow / sum,
    red: w.red / sum,
  };
}

function sampleStarTemperature(rand, opts = {}) {
  const weights = opts?.weights ? normalizeWeights(opts.weights) : null;
  if (weights) {
    const roll = rand();
    if (roll < weights.blue) return sampleTempRange(rand, 10000, 30000, 1.05);
    if (roll < weights.blue + weights.white) return sampleTempRange(rand, 6000, 10000, 1.15);
    if (roll < weights.blue + weights.white + weights.yellow) return sampleTempRange(rand, 4500, 6500, 1.25);
    return sampleTempRange(rand, 2800, 4500, 1.35);
  }
  const picked = sampleSpectralClass(rand);
  return sampleTempRange(rand, picked.min, picked.max, picked.skew);
}

function temperatureToRGB(tempK) {
  const t = clamp(tempK, 1000, 40000) / 100;
  let r;
  let g;
  let b;

  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }

  return rgbToHex({ r, g, b });
}

function mixStarWithThemeTone({ temperatureColor, haloBias, mistColor, mix = {} }) {
  const coreMix = Number.isFinite(Number(mix.core)) ? Number(mix.core) : 0.08;
  const haloMix = Number.isFinite(Number(mix.halo)) ? Number(mix.halo) : 0.26;
  const outerMix = Number.isFinite(Number(mix.outer)) ? Number(mix.outer) : 0.52;
  const coreColor = mixColor(temperatureColor, haloBias || "#FFFFFF", coreMix);
  const haloColor = mixColor(temperatureColor, haloBias || "#FFFFFF", haloMix);
  const outerHaloColor = mixColor(temperatureColor, mistColor || "#FFFFFF", outerMix);
  return { coreColor, haloColor, outerHaloColor };
}

function pickStarColorByTemperature(rand, weights, tone = null) {
  const temp = sampleStarTemperature(rand, { weights });
  const temperatureColor = temperatureToRGB(temp);
  const spectralClass = tone?.spectralClass || null;
  if (tone) {
    const mixed = mixStarWithThemeTone({
      temperatureColor,
      haloBias: tone.haloBias,
      mistColor: tone.mistColor,
      mix: tone.mix,
    });
    return { temp, color: mixed.coreColor, haloColor: mixed.haloColor, outerHaloColor: mixed.outerHaloColor, spectralClass };
  }
  return { temp, color: temperatureColor, spectralClass };
}

module.exports = {
  hexToRgb,
  rgbToHex,
  mixColor,
  sampleSpectralClass,
  sampleStarTemperature,
  temperatureToRGB,
  mixStarWithThemeTone,
  pickStarColorByTemperature,
};
