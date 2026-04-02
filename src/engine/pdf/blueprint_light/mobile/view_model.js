"use strict";

const path = require("path");
const { buildBlueprintV25BgImages, buildStoryStub } = require("../../blueprint_v25/backgrounds");
const { calcAscLon, calcMcLon, collectElementCounts, collectModalityCounts } = require("./formatters");

function buildBgCacheDir({ displayName = "", birthText = "" } = {}) {
  const raw = `${displayName}|${birthText}`;
  const safe = raw.replace(/[^a-z0-9]+/gi, "_").slice(0, 60) || "anon";
  return path.join(process.cwd(), "tmp", "blueprint_bg", safe);
}

async function buildMobileV25ViewModel({
  displayName,
  birthText,
  rowsMain,
  rowsAngles,
  rowsExtra,
  blueprintText,
  bgImages: bgImagesInput,
  story: storyInput,
}) {
  const ascLon = calcAscLon(rowsAngles);
  const mcLon = calcMcLon(rowsAngles);
  const wheelRotationDeg = Number.isFinite(Number(ascLon)) ? 270 - Number(ascLon) : 0;
  const elementCounts = blueprintText?.master_chart?.element_balance || collectElementCounts(rowsMain || []);
  const modalityCounts = blueprintText?.master_chart?.modality_balance || collectModalityCounts(rowsMain || []);
  const dateLabel = birthText || "";
  const story = storyInput || buildStoryStub({
    rowsMain,
    rowsExtra,
    elementCounts,
    dateLabel,
  });
  const bgImages = bgImagesInput || await buildBlueprintV25BgImages({
    blueprint: blueprintText,
    rowsMain,
    rowsExtra,
    elementCounts,
    dateLabel,
    outDir: buildBgCacheDir({ displayName, birthText }),
    inline: true,
  });

  return {
    data: {
      blueprint: blueprintText || {},
      displayName,
      ownerName: displayName,
      birthText,
      story,
      bg_images: bgImages,
      elementCounts,
      modalityCounts,
      wheelRotationDeg,
      wheelAscLon: Number.isFinite(Number(ascLon)) ? Number(ascLon) : null,
      wheelMcLon: Number.isFinite(Number(mcLon)) ? Number(mcLon) : null,
    },
  };
}

function buildMobileViewModel({
  displayName,
  birthText,
  rowsMain,
  rowsAngles,
  rowsExtra,
  summary,
  element,
  modality,
  bodyTextByKey,
  closingText,
  angleTextByKey,
  nodeText,
  chironText,
  lilithText,
}) {
  const safeRowsMain = Array.isArray(rowsMain) ? rowsMain : [];
  const safeRowsExtra = Array.isArray(rowsExtra) ? rowsExtra : [];
  const safeRowsAngles = Array.isArray(rowsAngles) ? rowsAngles : [];

  return {
    cover: {
      displayName,
      birthText,
      rowsMain: safeRowsMain,
    },
    quickMap: {
      rowsMain: safeRowsMain,
      rowsExtra: safeRowsExtra,
      rowsAngles: safeRowsAngles,
    },
    structure: {
      element: element || { fire: 0, earth: 0, air: 0, water: 0 },
      modality: modality || { cardinal: 0, fixed: 0, mutable: 0 },
      summary: summary || {},
    },
    planetsIntro: {},
    planets: {
      rowsMain: safeRowsMain,
      rowsExtra: safeRowsExtra,
      rowsAngles: safeRowsAngles,
      bodyTextByKey,
      nodeText,
      chironText,
      lilithText,
      angleTextByKey,
    },
    closing: {
      closingText: closingText || "",
      rowsMain: safeRowsMain,
    },
  };
}

module.exports = {
  buildMobileViewModel,
  buildMobileV25ViewModel,
};
