"use strict";

/**
 * dict/index.js — Unified Dict Loader (V2 primary, V1 fallback)
 *
 * ✅ policy
 * - V2を正本 (ASPECTS_V2 / PLANETS_V2 / SIGNS_V2 / BLEND_V2)
 * - V1は互換の保険 (ASPECTS_V1 / PLANETS_V1 / SIGNS_V1 / BLEND_V1 / SIGN_FLAVOR_V1 etc.)
 * - render側は “dictから引く” だけに寄せる
 */

function safeRequire(path) {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(path);
  } catch (_) {
    return null;
  }
}

function pick(v2, v1) {
  return v2 || v1 || null;
}

const modAspectsV2 = safeRequire("./aspects.v2");
const modAspectsV1 = safeRequire("./aspects.v1");

const modPlanetsV2 = safeRequire("./planets.v2");
const modPlanetsV1 = safeRequire("./planets.v1");

const modSignsV2 = safeRequire("./signs.v2");
const modSignsV1 = safeRequire("./signs.v1");

const modBlendV2 = safeRequire("./blend.v2");
const modBlendV1 = safeRequire("./blend.v1");

const modPointsV1 = safeRequire("./points.v1");
const modResonanceV1 = safeRequire("./resonance.v1");

const modHousesV1 = safeRequire("./houses.v1");
const modElementsV1 = safeRequire("./elements.v1");
const modModalitiesV1 = safeRequire("./modalities.v1");
const modOrbRulesV1 = safeRequire("./orb_rules.v1");
const modToneVariantsV1 = safeRequire("./tone_variants.v1");
const modSoarStyleV1 = safeRequire("./soar_style.v1");

const ASPECTS_V2 = modAspectsV2?.ASPECTS_V2 || null;
const ASPECTS_V1 = modAspectsV1?.ASPECTS_V1 || null;

const PLANETS_V2 = modPlanetsV2?.PLANETS_V2 || null;
const PLANETS_V1 = modPlanetsV1?.PLANETS_V1 || null;

const SIGNS_V2 = modSignsV2?.SIGNS_V2 || null;
const SIGNS_V1 = modSignsV1?.SIGNS_V1 || null;

const BLEND_V2 = modBlendV2?.BLEND_V2 || null;
const BLEND_V1 = modBlendV1?.BLEND_V1 || null;

// 任意で使う：古い sign_flavor はV1に居る想定
const modSignFlavorV1 = safeRequire("./sign_flavor.v1");
const SIGN_FLAVOR_V1 = modSignFlavorV1?.SIGN_FLAVOR_V1 || null;

const modGrammarsV1 = safeRequire("./grammars.v1");
const GRAMmars_V1 = modGrammarsV1?.GRAMmars_V1 || null;

// その他V1資材
const POINTS_V1 = modPointsV1?.POINTS_V1 || null;
const RESONANCE_V1 = modResonanceV1?.RESONANCE_V1 || null;
const HOUSES_V1 = modHousesV1?.HOUSES_V1 || null;
const ELEMENTS_V1 = modElementsV1?.ELEMENTS_V1 || null;
const MODALITIES_V1 = modModalitiesV1?.MODALITIES_V1 || null;
const ORB_RULES_V1 = modOrbRulesV1?.ORB_RULES_V1 || null;
const TONE_VARIANTS_V1 = modToneVariantsV1?.TONE_VARIANTS_V1 || null;
const SOAR_STYLE_V1 = modSoarStyleV1?.SOAR_STYLE_V1 || null;

/**
 * ✅ Unified accessors (renderが迷わないための“正規窓口”)
 * - dict.ASPECTS : V2優先 / V1 fallback
 * - dict.PLANETS : V2優先 / V1 fallback
 * - dict.SIGNS   : V2優先 / V1 fallback
 * - dict.BLEND   : V2優先 / V1 fallback
 */
const DICT = Object.freeze({
  // primary
  ASPECTS: pick(ASPECTS_V2, ASPECTS_V1),
  PLANETS: pick(PLANETS_V2, PLANETS_V1),
  SIGNS: pick(SIGNS_V2, SIGNS_V1),
  BLEND: pick(BLEND_V2, BLEND_V1),

  // raw exports (必要なときだけ直参照)
  ASPECTS_V2,
  ASPECTS_V1,
  PLANETS_V2,
  PLANETS_V1,
  SIGNS_V2,
  SIGNS_V1,
  BLEND_V2,
  BLEND_V1,
  
  // legacy assets
  SIGN_FLAVOR_V1,
  GRAMmars_V1,

  POINTS_V1,
  RESONANCE_V1,
  HOUSES_V1,
  ELEMENTS_V1,
  MODALITIES_V1,
  ORB_RULES_V1,
  TONE_VARIANTS_V1,
  SOAR_STYLE_V1,
});

module.exports = DICT;
