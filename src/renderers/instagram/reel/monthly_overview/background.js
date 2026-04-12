"use strict";

const sharp = require("sharp");
const {
  buildSpaceBackground,
  buildSpaceSeedLabel,
  buildCosmicSpaceConfig,
} = require("../../../../engine/shared/space_background");
const { CANVAS } = require("./shared");

const DEFAULT_VARIANT = "monthly_overview_reel";

function buildMonthlySeedLabel({ month, variant = DEFAULT_VARIANT } = {}) {
  const date = String(month || "");
  return buildSpaceSeedLabel({
    seedVersion: "v2",
    channel: "ig",
    date,
    variant,
    prefixChannel: true,
  });
}

function buildMonthlySpace({
  month,
  width = CANVAS.width,
  height = CANVAS.height,
  variant = DEFAULT_VARIANT,
  seedLabel,
  spaceConfig,
} = {}) {
  const label = seedLabel || buildMonthlySeedLabel({ month, variant });
  const config = spaceConfig || buildCosmicSpaceConfig("cosmic_soft");
  const space = buildSpaceBackground({
    width,
    height,
    dateLabel: month,
    seedLabel: label,
    variant,
    spaceConfig: config,
  });
  return { space, seedLabel: label, variant, spaceConfig: config };
}

function buildBackgroundSvg({ space, width = CANVAS.width, height = CANVAS.height } = {}) {
  if (!space) return "";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs>${space.defs || ""}</defs>`,
    space.body || "",
    `</svg>`,
  ].join("");
}

async function renderMonthlyBackground({
  month,
  width = CANVAS.width,
  height = CANVAS.height,
  variant = DEFAULT_VARIANT,
  seedLabel,
  spaceConfig,
} = {}) {
  const built = buildMonthlySpace({ month, width, height, variant, seedLabel, spaceConfig });
  const svg = buildBackgroundSvg({ space: built.space, width, height });
  const buffer = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  return { ...built, svg, buffer };
}

module.exports = {
  buildMonthlySeedLabel,
  buildMonthlySpace,
  buildBackgroundSvg,
  renderMonthlyBackground,
};
