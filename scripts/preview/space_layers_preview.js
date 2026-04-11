#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const {
  buildSpaceWorld,
  computeSpaceTheme,
  hashString,
  mulberry32,
} = require("../../src/engine/shared/space_background/world");
const { buildMilkyBandLayer } = require("../../src/engine/shared/space_background/layers/base");
const { buildMilkyDustLayer } = require("../../src/engine/shared/space_background/layers/dust");
const {
  buildGasCloudLayer,
  buildFarGasLayer,
  buildAtmosphereTintLayer,
} = require("../../src/engine/shared/space_background/layers/gas_core");
const { BACKGROUND_COLORS } = require("../../src/engine/shared/space_background/constants");
const { fontFaceCss } = require("../../src/engine/renderers/instagram/assets/fonts");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function escapeXml(input) {
  return String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function buildBaseSvg({ width, height, defs, body, label }) {
  const labelH = 44;
  const padX = 16;
  const padY = 14;
  const overlay = [
    `<rect x="0" y="0" width="${width}" height="${labelH}" fill="#050816" opacity="0.6"/>`,
    `<text x="${padX}" y="${padY + 18}" fill="#EDEEFF" font-size="16" font-family="SoraBodyMedium" letter-spacing="0.02em">`,
    escapeXml(label || ""),
    `</text>`,
  ].join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs>${fontFaceCss()}${defs || ""}</defs>`,
    `<rect width="${width}" height="${height}" fill="${BACKGROUND_COLORS.bgDeep}"/>`,
    body || "",
    overlay,
    `</svg>`,
  ].join("");
}

async function renderPng({ width, height, defs, body, label, outPath }) {
  const svg = buildBaseSvg({ width, height, defs, body, label });
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(outPath);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const month = String(args.month || "2026-07").trim();
  const width = Number(args.width || 1080);
  const height = Number(args.height || 1350);
  const milkyBoost = Number(args.milkyBoost || args.milky_boost || 3);
  const gasBoost = Number(args.gasBoost || args.gas_boost || 1);
  const outDir = args.outDir || path.resolve(process.cwd(), "tmp", "ig", "space_layer_preview", month);
  ensureDir(outDir);

  const exportPath = path.resolve(
    process.cwd(),
    "tmp",
    "exports",
    month,
    "monthly_overview",
    `${month}.monthly_overview.export.v1.json`
  );
  if (!fs.existsSync(exportPath)) {
    throw new Error(`export not found: ${exportPath}`);
  }

  const payload = readJson(exportPath);
  const deck = payload.deck || payload;
  const story = deck.story || payload.story || null;
  const spaceConfig = deck.spaceConfig || payload.spaceConfig || null;
  const dateLabel = deck.story_date_local || payload.story_date_local || `${month}-15`;
  const seedLabel = `ig:${month}:space-layers`;

  const theme = computeSpaceTheme({ story, dateLabel, seedLabel, variant: "world", spaceConfig });
  const world = buildSpaceWorld({
    story,
    dateLabel,
    width,
    height,
    worldWidth: width,
    theme,
    avoidRegions: [],
    spaceConfig,
  });

  const basePath = path.join(outDir, "layer_base.png");
  await renderPng({
    width,
    height,
    defs: world.defs,
    body: world.body,
    label: "Base (stars + clusters + dust + milky + dark lane)",
    outPath: basePath,
  });

  const gasPath = path.join(outDir, "layer_gas.png");
  const gasBody = world.colorBody || "";
  const gasCopies = Math.max(1, Math.round(gasBoost));
  const gasStacked = gasCopies > 1 ? Array(gasCopies).fill(gasBody).join("") : gasBody;
  await renderPng({
    width,
    height,
    defs: world.colorDefs,
    body: gasStacked,
    label: gasCopies > 1 ? `Gas / Nebula (x${gasCopies})` : "Gas / Nebula (color atmosphere)",
    outPath: gasPath,
  });

  const gasSoftPath = path.join(outDir, "layer_gas_soft.png");
  const palette = world.todayPalette || world.theme?.todayPalette || {};
  const gasColorA = palette.gasColorA || world.theme?.palette?.primary?.nebula?.[0] || "#2A3555";
  const gasColorB = palette.gasColorB || world.theme?.palette?.secondary?.nebula?.[0] || gasColorA;
  const gasSoftDefs = [];
  const gasSoftBody = [];
  const cloudA = buildGasCloudLayer({
    rand: mulberry32(hashString(`${world.worldId}-gas-soft-a`)),
    width,
    height,
    idPrefix: `${world.worldId}-gas-soft-a`,
    color: gasColorA,
    opacity: 0.09,
  });
  const cloudB = buildGasCloudLayer({
    rand: mulberry32(hashString(`${world.worldId}-gas-soft-b`)),
    width,
    height,
    idPrefix: `${world.worldId}-gas-soft-b`,
    color: gasColorB,
    opacity: 0.07,
  });
  const farGas = buildFarGasLayer({
    rand: mulberry32(hashString(`${world.worldId}-gas-soft-far`)),
    width,
    height,
    densityAt: world.densityAt,
    stream: world.stream,
    streamGaps: world.streamGaps,
    voids: world.voids,
    color: gasColorA,
    opacity: 0.06,
    idPrefix: `${world.worldId}-gas-soft-far`,
  });
  const atmo = buildAtmosphereTintLayer({
    rand: mulberry32(hashString(`${world.worldId}-gas-soft-atmo`)),
    width,
    height,
    idPrefix: `${world.worldId}-gas-soft-atmo`,
    color: palette.baseBias || gasColorA,
    opacity: 0.06,
  });
  if (cloudA?.defs) gasSoftDefs.push(cloudA.defs);
  if (cloudB?.defs) gasSoftDefs.push(cloudB.defs);
  if (farGas?.defs) gasSoftDefs.push(farGas.defs);
  if (atmo?.defs) gasSoftDefs.push(atmo.defs);
  if (cloudA?.body) gasSoftBody.push(cloudA.body);
  if (cloudB?.body) gasSoftBody.push(cloudB.body);
  if (farGas?.body) gasSoftBody.push(farGas.body);
  if (atmo?.body) gasSoftBody.push(atmo.body);

  await renderPng({
    width,
    height,
    defs: gasSoftDefs.join(""),
    body: gasSoftBody.join(""),
    label: "Gas / Nebula (soft clouds)",
    outPath: gasSoftPath,
  });

  const milkyDefs = [];
  const milkyParts = [];
  if (world.stream) {
    const spaceCfg = world.spaceConfig || {};
    const milkyThicknessScale = Number(spaceCfg?.milkyThicknessScale) || 1;
    const milkyDustScale = Number(spaceCfg?.milkyDustScale) || 1;
    const milkyDustOpacityScale = clamp(0.75 + milkyDustScale * 0.45, 0.6, 1.8);
    const milkyDustSpreadScale = clamp(1 + (milkyDustScale - 1) * 0.2, 0.8, 1.4);
    const milkyIntensity = Number.isFinite(Number(world.milkyIntensity)) ? Number(world.milkyIntensity) : 0.18;
    const palette = world.todayPalette || world.theme?.todayPalette || {};
    const milkyColor = palette.glowColor || palette.gasColorA || world.theme?.palette?.primary?.nebula?.[0] || BACKGROUND_COLORS.bgDeep;
    const dustColor = palette.dustTint || world.theme?.palette?.secondary?.nebula?.[0] || world.theme?.palette?.primary?.nebula?.[0] || BACKGROUND_COLORS.bgDeep;
    const milkyBand = buildMilkyBandLayer({
      rand: mulberry32(hashString(`${world.worldId}-milky-preview`)),
      width,
      height,
      idPrefix: `${world.worldId}-milky-preview`,
      color: milkyColor,
      intensity: milkyIntensity,
      intensityScale: 1,
      thicknessScale: milkyThicknessScale,
      stream: world.stream,
    });
    if (milkyBand?.defs) milkyDefs.push(milkyBand.defs);
    if (milkyBand?.body) milkyParts.push(milkyBand.body);

    const milkyDust = buildMilkyDustLayer({
      rand: mulberry32(hashString(`${world.worldId}-milky-dust-preview`)),
      width,
      height,
      stream: world.stream,
      streamGaps: world.streamGaps,
      densityAt: world.densityAt,
      voids: world.voids,
      color: dustColor,
      countScale: milkyDustScale,
      opacityScale: milkyDustScale,
      spreadScale: 1,
      textFieldMask: world.textAvoidField,
    });
    if (milkyDust) milkyParts.push(milkyDust);

    const flowBand = buildMilkyBandLayer({
      rand: mulberry32(hashString(`${world.worldId}-milky-flow-preview`)),
      width,
      height,
      idPrefix: `${world.worldId}-milky-flow-preview`,
      color: milkyColor,
      intensity: milkyIntensity,
      intensityScale: 1.6,
      thicknessScale: 1.6 * milkyThicknessScale,
      stream: world.stream,
    });
    if (flowBand?.defs) milkyDefs.push(flowBand.defs);
    if (flowBand?.body) milkyParts.push(flowBand.body);

    const boostBand = buildMilkyBandLayer({
      rand: mulberry32(hashString(`${world.worldId}-milky-boost-preview`)),
      width,
      height,
      idPrefix: `${world.worldId}-milky-boost-preview`,
      color: milkyColor,
      intensity: milkyIntensity,
      intensityScale: 1.35,
      thicknessScale: 1.25 * milkyThicknessScale,
      stream: world.stream,
    });
    if (boostBand?.defs) milkyDefs.push(boostBand.defs);
    if (boostBand?.body) milkyParts.push(boostBand.body);

    const dustBoost = buildMilkyDustLayer({
      rand: mulberry32(hashString(`${world.worldId}-milky-dust-boost-preview`)),
      width,
      height,
      stream: world.stream,
      streamGaps: world.streamGaps,
      densityAt: world.densityAt,
      voids: world.voids,
      color: dustColor,
      countScale: 1.25 * milkyDustScale,
      opacityScale: 1.15 * milkyDustOpacityScale,
      spreadScale: 1.15 * milkyDustSpreadScale,
      textFieldMask: world.textAvoidField,
    });
    if (dustBoost) milkyParts.push(dustBoost);
  }

  const milkyPath = path.join(outDir, "layer_milky.png");
  await renderPng({
    width,
    height,
    defs: milkyDefs.join(""),
    body: milkyParts.join(""),
    label: "Milky Band + Milky Dust",
    outPath: milkyPath,
  });

  if (milkyBoost > 1) {
    const boostedDefs = [];
    const boostedParts = [];
    if (world.stream) {
      const spaceCfg = world.spaceConfig || {};
      const milkyThicknessScale = Number(spaceCfg?.milkyThicknessScale) || 1;
      const milkyDustScale = Number(spaceCfg?.milkyDustScale) || 1;
      const milkyDustOpacityScale = clamp(0.75 + milkyDustScale * 0.45, 0.6, 1.8);
      const milkyDustSpreadScale = clamp(1 + (milkyDustScale - 1) * 0.2, 0.8, 1.4);
      const milkyIntensity = Number.isFinite(Number(world.milkyIntensity)) ? Number(world.milkyIntensity) : 0.18;
      const palette = world.todayPalette || world.theme?.todayPalette || {};
      const milkyColor = palette.glowColor || palette.gasColorA || world.theme?.palette?.primary?.nebula?.[0] || BACKGROUND_COLORS.bgDeep;
      const dustColor = palette.dustTint || world.theme?.palette?.secondary?.nebula?.[0] || world.theme?.palette?.primary?.nebula?.[0] || BACKGROUND_COLORS.bgDeep;
      const boostScale = Math.max(1, milkyBoost);
      const debugColor = "#9BD8FF";
      const band = buildMilkyBandLayer({
        rand: mulberry32(hashString(`${world.worldId}-milky-debug`)),
        width,
        height,
        idPrefix: `${world.worldId}-milky-debug`,
        color: debugColor,
        intensity: milkyIntensity,
        intensityScale: 1.6 * boostScale,
        thicknessScale: 1.6 * milkyThicknessScale * clamp(0.9 + boostScale * 0.15, 0.9, 2.8),
        stream: world.stream,
      });
      if (band?.defs) boostedDefs.push(band.defs);
      if (band?.body) boostedParts.push(band.body);

      const dust = buildMilkyDustLayer({
        rand: mulberry32(hashString(`${world.worldId}-milky-dust-debug`)),
        width,
        height,
        stream: world.stream,
        streamGaps: world.streamGaps,
        densityAt: world.densityAt,
        voids: world.voids,
        color: debugColor,
        countScale: milkyDustScale * boostScale,
        opacityScale: milkyDustOpacityScale * boostScale * 1.6,
        spreadScale: milkyDustSpreadScale,
        textFieldMask: world.textAvoidField,
      });
      if (dust) boostedParts.push(dust);
    }

    const debugPath = path.join(outDir, "layer_milky_debug.png");
    await renderPng({
      width,
      height,
      defs: boostedDefs.join(""),
      body: boostedParts.join(""),
      label: `Milky (debug x${milkyBoost})`,
      outPath: debugPath,
    });
  }

  const fullPath = path.join(outDir, "layer_full.png");
  await renderPng({
    width,
    height,
    defs: `${world.defs}${world.colorDefs || ""}`,
    body: `${world.body || ""}${world.colorBody ? `<g opacity="0.62">${world.colorBody}</g>` : ""}`,
    label: "Full (Base + Gas)",
    outPath: fullPath,
  });

  console.log("[space_layers_preview] rendered", {
    outDir,
    month,
    files: [basePath, gasPath, milkyPath, fullPath],
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
