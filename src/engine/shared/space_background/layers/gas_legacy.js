"use strict";

const { clamp } = require("../utils");
const { buildLongThemeLayer } = require("./base");
const {
  buildStructureTintField,
  buildDustTintLayer,
  buildNebulaGrainLayer,
  buildMicroGlowLayer,
} = require("./dust");
const {
  buildFarGasLayer,
  buildFilamentLayer,
  buildNebulaSpreadOverlay,
  buildFilamentFieldOverlay,
  buildRidgeFieldOverlay,
  buildHeroRegionGlow,
  buildNebulaLayerFbm,
  buildFilamentNebulaLayer,
  buildNebulaFogOverlay,
  buildMilkyStreamTint,
  buildAtmosphereTintLayer,
} = require("./gas_core");

function buildNebulaVeilLayers({ rand, width, height, palette, idPrefix, mistIntensity = 0.08 }) {
  const layers = [];
  const defs = [];
  const count = 2 + Math.floor(rand() * 2);
  const patterns = ["leftTop", "rightBottom", "leftBottom", "rightTop", "diagonal"];

  for (let i = 0; i < count; i++) {
    const pattern = patterns[Math.floor(rand() * patterns.length)];
    const color = rand() < 0.6 ? palette.primary.nebula[0] : palette.secondary.nebula[0];
    const opacity = (0.025 + rand() * 0.03) * (mistIntensity / 0.08);
    const fog = buildNebulaFogOverlay({
      width,
      height,
      id: `${idPrefix}-veil-${i}`,
      color,
      opacity,
      pattern,
      idPrefix: `${idPrefix}-`,
    });
    defs.push(fog.defs);
    layers.push(fog.body);
  }

  return { defs: defs.join(""), body: layers.join("") };
}

function buildColorAtmosphereLayer({
  rand,
  width,
  height,
  stream,
  streamGaps,
  densityAt,
  filamentAt,
  ridgeAt,
  flowField,
  clusters,
  deepFields,
  voids,
  palette,
  todayPalette,
  primaryOpacityScale,
  secondaryOpacityScale,
  mistColor,
  fogPattern,
  spreadPattern,
  longThemeColor,
  mood,
  heroRegions,
  safeZone,
  idPrefix,
  textFieldMask,
}) {
  if (!palette) return { defs: "", body: "" };
  const resolvedToday = todayPalette || {};
  const gasPrimary = resolvedToday.gasColorA || palette.primary.nebula[0];
  const gasSecondary = resolvedToday.gasColorB || palette.secondary.nebula[0] || palette.primary.nebula[1];
  const dustTone = resolvedToday.dustTint || palette.secondary.nebula[0] || palette.primary.nebula[0];
  const glowColor = resolvedToday.glowColor || palette.glow || palette.primary.nebula[0];
  const baseBias = resolvedToday.baseBias || null;
  const layerProfile = resolvedToday.layers || {};
  const colorPresence = clamp(Number(resolvedToday.colorPresence ?? 1), 1.1, 2.8);
  const atmoIntensity = clamp(layerProfile.atmosphere?.intensity ?? 0.04, 0.01, 0.18);
  const mistIntensity = clamp((layerProfile.mist?.intensity ?? 0.08) * colorPresence, 0.04, 0.55);
  const glowIntensity = clamp((layerProfile.glow?.intensity ?? 0.12) * colorPresence, 0.06, 0.6);
  const dustIntensity = clamp((layerProfile.dust?.intensity ?? 0.08) * Math.min(colorPresence, 2.0), 0.04, 0.4);
  const primaryScale = Number.isFinite(primaryOpacityScale) ? primaryOpacityScale : 1;
  const secondaryScale = Number.isFinite(secondaryOpacityScale) ? secondaryOpacityScale : 1;
  const tintScale = clamp((primaryScale + secondaryScale) / 2, 0.7, 1.05);
  const glowScale = clamp(glowIntensity / 0.12, 0.9, 2.8);
  const mistScale = clamp(mistIntensity / 0.08, 0.9, 2.9);
  const dustScale = clamp(dustIntensity / 0.08, 0.9, 2.4);
  const structureScale = clamp(mistScale * 0.55 + glowScale * 0.45, 1.0, 2.8);
  const defs = [];
  const body = [];
  const baseLayers = [];
  const mistLayers = [];
  const flowLayers = [];
  const heroLayers = [];
  const structureLayers = [];
  const veilLayers = [];
  const detailLayers = [];

  if (baseBias) {
    const atmo = buildAtmosphereTintLayer({
      rand,
      width,
      height,
      idPrefix: `${idPrefix}-atmo`,
      color: baseBias,
      opacity: clamp(atmoIntensity * (0.7 + clamp(mood?.glowLevel ?? 0.4, 0, 1) * 0.5), 0.01, 0.08),
    });
    defs.push(atmo.defs);
    baseLayers.push(atmo.body);
  }

  const longLayer = buildLongThemeLayer({
    rand,
    width,
    height,
    color: longThemeColor,
    intensity: 0.045,
    idPrefix: `${idPrefix}-long`,
  });
  defs.push(longLayer.defs);
  baseLayers.push(longLayer.body);

  const nebulaPrimary = buildNebulaLayerFbm({
    rand,
    width,
    height,
    idPrefix: `${idPrefix}-nebula-a`,
    color: gasPrimary,
    opacity: 0.085 * primaryScale * mistScale,
    modality: "mixed",
    intensityScale: 0.85,
    spreadPattern,
  });
  const nebulaSecondary = buildNebulaLayerFbm({
    rand,
    width,
    height,
    idPrefix: `${idPrefix}-nebula-b`,
    color: gasSecondary,
    opacity: 0.055 * secondaryScale * mistScale,
    modality: "mixed",
    intensityScale: 0.65,
    spreadPattern,
  });
  defs.push(nebulaPrimary.defs, nebulaSecondary.defs);
  baseLayers.push(nebulaPrimary.body, nebulaSecondary.body);

  const farGasPrimary = buildFarGasLayer({
    rand,
    width,
    height,
    densityAt,
    stream,
    streamGaps,
    voids,
    color: gasPrimary,
    opacity: 0.04 * primaryScale * mistScale,
    idPrefix: `${idPrefix}-farGas-a`,
  });
  const farGasSecondary = buildFarGasLayer({
    rand,
    width,
    height,
    densityAt,
    stream,
    streamGaps,
    voids,
    color: gasSecondary,
    opacity: 0.03 * secondaryScale * mistScale,
    idPrefix: `${idPrefix}-farGas-b`,
  });
  defs.push(farGasPrimary.defs, farGasSecondary.defs);
  baseLayers.push(farGasPrimary.body, farGasSecondary.body);

  const mistColorValue = typeof mistColor === "function" ? mistColor(rand) : mistColor;
  const mist = buildNebulaFogOverlay({
    width,
    height,
    id: `${idPrefix}-mist`,
    color: mistColorValue || gasPrimary,
    opacity: 0.05 * secondaryScale * mistScale,
    pattern: fogPattern,
    idPrefix: `${idPrefix}-mist`,
  });
  defs.push(mist.defs);
  mistLayers.push(mist.body);

  const filamentPrimary = buildFilamentNebulaLayer({
    rand,
    width,
    height,
    stream,
    idPrefix: `${idPrefix}-filament-a`,
    color: gasPrimary,
    opacity: 0.09 * primaryScale * glowScale,
  });
  const filamentSecondary = buildFilamentNebulaLayer({
    rand,
    width,
    height,
    stream,
    idPrefix: `${idPrefix}-filament-b`,
    color: gasSecondary,
    opacity: 0.07 * secondaryScale * glowScale,
  });
  defs.push(filamentPrimary.defs, filamentSecondary.defs);
  flowLayers.push(filamentPrimary.body, filamentSecondary.body);

  const filamentLevel = clamp(mood?.filamentLevel ?? 0.6, 0, 1);
  if (filamentAt && filamentLevel > 0.05) {
    const filamentField = buildFilamentFieldOverlay({
      rand,
      width,
      height,
      filamentAt,
      flowField,
      color: gasPrimary,
      opacity: 0.08 * primaryScale * (0.6 + filamentLevel * 0.8) * glowScale,
      idPrefix: `${idPrefix}-filField`,
      avoidRect: safeZone,
      avoidMask: textFieldMask,
    });
    flowLayers.push(filamentField.body);
  }

  const ridgeLevel = clamp(mood?.structureEmphasis ?? 0.5, 0, 1);
  if (ridgeAt && ridgeLevel > 0.05) {
    const ridgeField = buildRidgeFieldOverlay({
      rand,
      width,
      height,
      ridgeAt,
      color: gasSecondary,
      opacity: 0.06 * secondaryScale * (0.5 + ridgeLevel * 0.9) * glowScale,
      idPrefix: `${idPrefix}-ridgeField`,
      avoidRect: safeZone,
      avoidMask: textFieldMask,
    });
    flowLayers.push(ridgeField.body);
  }

  if (Array.isArray(heroRegions) && heroRegions.length) {
    heroRegions.forEach((region, idx) => {
      const glow = buildHeroRegionGlow({
        id: `${idPrefix}-hero-${idx}`,
        x: region.x,
        y: region.y,
        r: region.r * 1.25,
        color: glowColor,
        opacity: 0.18 * (0.5 + clamp(mood?.glowLevel ?? 0.5, 0, 1)) * glowScale,
      });
      defs.push(glow.defs);
      heroLayers.push(glow.body);

      if (region.type === "filament") {
        const filamentOverlay = buildFilamentFieldOverlay({
          rand,
          width,
          height,
          filamentAt: (x, y) => {
            const dx = x - region.x;
            const dy = y - region.y;
            const d = Math.hypot(dx, dy);
            return clamp(1 - d / (region.r * 1.2), 0, 1);
          },
          flowField,
          color: gasPrimary,
          opacity: 0.12 * primaryScale * glowScale,
          idPrefix: `${idPrefix}-heroFil-${idx}`,
          avoidRect: safeZone,
          avoidMask: textFieldMask,
        });
        heroLayers.push(filamentOverlay.body);
      }

      if (region.type === "dustlane") {
        let angle = rand() * Math.PI * 2;
        if (flowField) {
          const flow = flowField(region.x, region.y);
          if (flow && flow.strength > 0.05) {
            angle = Math.atan2(flow.dy, flow.dx) + Math.PI / 2;
          }
        }
        const angleDeg = (angle * 57.2958).toFixed(2);
        heroLayers.push(
          `<ellipse cx="${region.x.toFixed(2)}" cy="${region.y.toFixed(2)}" rx="${(region.r * 1.4).toFixed(2)}" ry="${(region.r * 0.8).toFixed(2)}" fill="#02030A" opacity="${(0.16 + clamp(mood?.dustLevel ?? 0.5, 0, 1) * 0.12).toFixed(3)}" transform="rotate(${angleDeg} ${region.x.toFixed(2)} ${region.y.toFixed(2)})"/>`
        );
      }
    });
  }

  const veil = buildNebulaVeilLayers({
    rand,
    width,
    height,
    palette,
    idPrefix: `${idPrefix}-veil`,
    mistIntensity,
  });
  defs.push(veil.defs);
  veilLayers.push(veil.body);

  const dustTintLayer = buildDustTintLayer({
    rand,
    width,
    height,
    densityAt,
    stream,
    streamGaps,
    voids,
    color: dustTone,
    opacity: 0.09 * secondaryScale * dustScale,
    textFieldMask,
  });
  structureLayers.push(dustTintLayer);

  const edgePatternStart = stream.y1 > height * 0.5 ? "leftBottom" : "leftTop";
  const edgePatternEnd = stream.y2 > height * 0.5 ? "rightBottom" : "rightTop";
  const edgePattern = rand() < 0.55 ? edgePatternStart : edgePatternEnd;
  const edgeTint = buildNebulaSpreadOverlay({
    width,
    height,
    id: `${idPrefix}-edgeTint`,
    color: gasPrimary,
    intensity: 0.06 * primaryScale * glowScale,
    pattern: edgePattern,
  });
  defs.push(edgeTint.defs);
  structureLayers.push(edgeTint.body);

  const milkyGas = buildMilkyStreamTint({
    rand,
    width,
    height,
    stream,
    idPrefix: `${idPrefix}-milkyGas`,
    color: glowColor,
    opacity: 0.065 * primaryScale * glowScale,
  });
  defs.push(milkyGas.defs);
  structureLayers.push(milkyGas.body);

  const streamTint = buildMilkyStreamTint({
    rand,
    width,
    height,
    stream,
    idPrefix: `${idPrefix}-streamTint`,
    color: gasSecondary,
    opacity: 0.05 * secondaryScale * glowScale,
  });
  defs.push(streamTint.defs);
  structureLayers.push(streamTint.body);

  const filament = buildFilamentLayer({
    rand,
    width,
    height,
    stream,
    idPrefix: `${idPrefix}-filament`,
    color: gasPrimary,
    opacity: 0.055 * primaryScale * glowScale,
  });
  defs.push(filament.defs);
  flowLayers.push(filament.body);

  const structureTint = buildStructureTintField({
    rand,
    width,
    height,
    stream,
    streamGaps,
    densityAt,
    clusters,
    deepFields,
    voids,
    avoidRect: null,
    palette,
    opacityScale: tintScale * 0.7 * structureScale,
    textFieldMask,
  });
  structureLayers.push(structureTint);

  const nebulaGrain = buildNebulaGrainLayer({
    rand,
    width,
    height,
    densityAt,
    stream,
    streamGaps,
    clusters,
    deepFields,
    voids,
    palette,
    textFieldMask,
  });
  detailLayers.push(nebulaGrain);

  const microGlow = buildMicroGlowLayer({
    rand,
    width,
    height,
    clusters,
    deepFields,
    voids,
    color: glowColor,
    opacity: 0.03 * tintScale * glowScale,
    textFieldMask,
  });
  detailLayers.push(microGlow);

  body.push(
    ...baseLayers,
    ...mistLayers,
    ...flowLayers,
    ...heroLayers,
    ...structureLayers,
    ...veilLayers,
    ...detailLayers
  );

  return { defs: defs.join(""), body: body.join("") };
}

module.exports = {
  buildNebulaVeilLayers,
  buildColorAtmosphereLayer,
};
