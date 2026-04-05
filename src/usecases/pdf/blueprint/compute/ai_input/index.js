"use strict";

const { buildNatalAspects } = require("../natal_aspects");
const { buildElementKernel, buildModalityKernel, buildElementBiasTerms, buildModalityBiasTerms } = require("./balance");
const { buildKernelForItem } = require("./kernel");
const { buildHouseEmphasis, buildHouseEmphasisFromCusps, normalizeCuspsFromNatalCache } = require("./house");
const { applyFactLinesToAiData, buildFactLine, prependFactLine } = require("./facts");
const { mapAiContent } = require("./map");

function buildAiInput({ displayName, rowsMain, rowsAngles, rowsExtra, element, modality, dict, longitudes, identity, cusps, houseSystem }) {
  const elementKernel = buildElementKernel(element || {});
  const modalityKernel = buildModalityKernel(modality || {});
  const elementBiasTerms = buildElementBiasTerms(element || {});
  const modalityBiasTerms = buildModalityBiasTerms(modality || {});
  const houseEmphasis =
    buildHouseEmphasisFromCusps({ rowsMain, rowsExtra, cusps, dict, system: houseSystem }) ||
    buildHouseEmphasis({ rowsMain, rowsExtra, rowsAngles, dict }) ||
    {};
  const ascRow = (rowsAngles || []).find((row) => row?.key === "asc");
  if (ascRow?.meta?.sign_key && !houseEmphasis.asc_sign_key) houseEmphasis.asc_sign_key = ascRow.meta.sign_key;
  if (ascRow?.meta?.sign_ja && !houseEmphasis.asc_sign_ja) houseEmphasis.asc_sign_ja = ascRow.meta.sign_ja;
  const houseNoByKey = new Map((houseEmphasis.placements || []).map((row) => [row.key, row.house_no]));

  const bodies = rowsMain.map((row) => ({
    key: row.key,
    kernel: buildKernelForItem({
      key: row.key,
      label: row.label,
      sign: row.meta?.sign_ja || "",
      signKey: row.meta?.sign_key || "",
      deg: row.meta?.deg ?? null,
      houseNo: houseNoByKey.get(row.key),
      elementBias: elementBiasTerms,
      modalityBias: modalityBiasTerms,
      dict,
    }),
  }));

  const angles = rowsAngles.map((row) => ({
    key: row.key,
    kernel: buildKernelForItem({
      key: row.key,
      label: row.label,
      sign: row.meta?.sign_ja || "",
      signKey: row.meta?.sign_key || "",
      deg: row.meta?.deg ?? null,
      houseNo: houseNoByKey.get(row.key),
      elementBias: elementBiasTerms,
      modalityBias: modalityBiasTerms,
      dict,
    }),
  }));

  const extraMap = rowsExtra.reduce((acc, row) => {
    acc[row.key] = row;
    return acc;
  }, {});
  const chironRow = extraMap.chiron || null;
  const lilithRow = extraMap.lilith || null;
  const southNodeRow = extraMap.south_node || null;
  const northNodeRow = extraMap.north_node || null;

  const kernel = {
    summary: {
      element: { ...elementKernel, bias_tokens: elementBiasTerms },
      modality: { ...modalityKernel, bias_tokens: modalityBiasTerms },
    },
    bodies,
    chiron: chironRow
      ? {
          key: "chiron",
          kernel: buildKernelForItem({
            key: "chiron",
            label: chironRow.label,
            sign: chironRow.meta?.sign_ja || "",
            signKey: chironRow.meta?.sign_key || "",
            deg: chironRow.meta?.deg ?? null,
            houseNo: houseNoByKey.get("chiron"),
            elementBias: elementBiasTerms,
            modalityBias: modalityBiasTerms,
            dict,
          }),
        }
      : null,
    lilith: lilithRow
      ? {
          key: "lilith",
          kernel: buildKernelForItem({
            key: "lilith",
            label: lilithRow.label,
            sign: lilithRow.meta?.sign_ja || "",
            signKey: lilithRow.meta?.sign_key || "",
            deg: lilithRow.meta?.deg ?? null,
            houseNo: houseNoByKey.get("lilith"),
            elementBias: elementBiasTerms,
            modalityBias: modalityBiasTerms,
            dict,
          }),
        }
      : null,
    nodes: {
      south: southNodeRow
        ? {
            key: "south_node",
            kernel: buildKernelForItem({
              key: "south_node",
              label: southNodeRow.label,
              sign: southNodeRow.meta?.sign_ja || "",
              signKey: southNodeRow.meta?.sign_key || "",
              deg: southNodeRow.meta?.deg ?? null,
              houseNo: houseNoByKey.get("south_node"),
              elementBias: elementBiasTerms,
              modalityBias: modalityBiasTerms,
              dict,
            }),
          }
        : null,
      north: northNodeRow
        ? {
            key: "north_node",
            kernel: buildKernelForItem({
              key: "north_node",
              label: northNodeRow.label,
              sign: northNodeRow.meta?.sign_ja || "",
              signKey: northNodeRow.meta?.sign_key || "",
              deg: northNodeRow.meta?.deg ?? null,
              houseNo: houseNoByKey.get("north_node"),
              elementBias: elementBiasTerms,
              modalityBias: modalityBiasTerms,
              dict,
            }),
          }
        : null,
    },
    angles,
    houses: houseEmphasis,
    aspects: buildNatalAspects({ longitudes, rowsMain, dict, max: 5 }),
  };

  return {
    product: "blueprint_light_v1",
    tone: "静か・誠実・やわらかいが曖昧すぎない",
    longitudes,
    rules: {
      no_prediction: true,
      no_advice: true,
      no_commands: true,
      no_fear: true,
      no_fortune: true,
    },
    identity: {
      name: "",
      birth_date: identity?.birth_date || "",
      birth_time: identity?.birth_time || "",
      birth_place: identity?.birth_place || "",
    },
    user: {
      display_name: "",
    },
    kernel,
  };
}

module.exports = {
  buildAiInput,
  mapAiContent,
  applyFactLinesToAiData,
  buildFactLine,
  prependFactLine,
  normalizeCuspsFromNatalCache,
};
