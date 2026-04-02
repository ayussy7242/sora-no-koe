"use strict";

const {
  SIGN_TRAIT_MAP,
  DEGREE_PHASE_MAP,
  PHASE_MOTION_BASE,
  PLANET_MOTION_HINTS,
  SIGN_FIELD_MAP,
  SENSE_TOKENS,
  FUNCTION_WORDS_MAP,
  RESIDUE_BASE_MAP,
  RESIDUE_VERB_TOKENS,
  LINE3_ENDINGS_MAP,
  LINE3_SIGNATURES_MAP,
  LINE3_SIGNATURE_TAGS_MAP,
} = require("./constants");
const {
  asArray,
  normalizeTraitTokens,
  normalizeCoreTokens,
  getSoraCore,
  getSoraPlanetSlotTokens,
  getSoraPlanetCoreTokens,
  getSoraSignCoreTokens,
  getSoraDegreePhase,
  getSignFlavorTokens,
  getSignFlavorRoleCoreTokens,
} = require("./tokens");
const { buildFactLine } = require("./facts");

function buildSignTraitAll({ dict, signKey, signJa, bodyKey }) {
  const fallback = SIGN_TRAIT_MAP[signJa] || [];
  const flavor = getSignFlavorTokens(dict, signKey, bodyKey);
  const modern = getSoraSignCoreTokens(dict, signKey);
  return normalizeTraitTokens([...fallback, ...flavor, ...modern]);
}

function pickDegreeBand(deg) {
  if (deg == null || Number.isNaN(deg)) return "P3";
  if (deg >= 29) return "P5";
  if (deg >= 20) return "P4";
  if (deg >= 10) return "P3";
  return "P1";
}

function hashString(seed) {
  const str = String(seed || "");
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash >>> 0;
}

function pickN(list, count, seed) {
  if (!Array.isArray(list) || list.length === 0 || count <= 0) return [];
  if (list.length <= count) return [...new Set(list)];
  const chosen = [];
  const step = 7;
  let idx = seed % list.length;
  let guard = 0;
  while (chosen.length < count && guard < list.length * 2) {
    const item = list[idx];
    if (item && !chosen.includes(item)) chosen.push(item);
    idx = (idx + step) % list.length;
    guard += 1;
  }
  return chosen;
}

function buildStructureLine(functionWords, signTraits, seed) {
  const f = Array.isArray(functionWords) && functionWords.length ? functionWords[0] : "性質";
  const s = Array.isArray(signTraits) && signTraits.length ? signTraits[0] : "向き";
  const templates = [
    `${f}と${s}が同じ方向を向く配置。`,
    `${f}が${s}側へ寄る配置。`,
    `${f}が${s}に置かれる配置。`,
  ];
  const idx = Math.abs(seed) % templates.length;
  return templates[idx];
}

function buildKernelForItem({ key, sign, signKey, deg, label, houseNo, elementBias, modalityBias, dict }) {
  const seed = hashString(`${key}|${sign}|${deg ?? ""}`);
  const phaseKey = pickDegreeBand(deg);
  const degreePhase = DEGREE_PHASE_MAP[phaseKey] || DEGREE_PHASE_MAP.P3;
  const soraPhase = getSoraDegreePhase(dict, deg);
  const modernFunction = getSoraPlanetCoreTokens(dict, key);
  const functionPool = Array.from(
    new Set([...(FUNCTION_WORDS_MAP[key] || []), ...modernFunction])
  );
  const functionWords = pickN(functionPool, 2, seed);
  const signFlavorTokens = getSignFlavorTokens(dict, signKey, key);
  const signTraitAll = buildSignTraitAll({ dict, signKey, signJa: sign, bodyKey: key });
  const signTraitPrimary = signFlavorTokens && signFlavorTokens.length ? signFlavorTokens : signTraitAll;
  const signTraits = pickN(signTraitAll, 2, seed + 11);
  const signRoleCore = getSignFlavorRoleCoreTokens(dict, signKey, key);
  const motionPool = [
    ...(PLANET_MOTION_HINTS[key] || []),
    ...(PHASE_MOTION_BASE[phaseKey] || []),
  ];
  const phaseMotion = pickN(motionPool, 2, seed + 23);
  const signFieldPool = SIGN_FIELD_MAP[sign] || [];
  const signField = pickN(signFieldPool, 1, seed + 29);
  const residueBase = pickN(RESIDUE_BASE_MAP[key] || [], 1, seed + 31);
  const senseToken = pickN(SENSE_TOKENS, 1, seed + 53);
  const residueVerbAll = RESIDUE_VERB_TOKENS || [];
  const residueVerb = pickN(residueVerbAll, 1, seed + 47);
  const line3EndingsPool = LINE3_ENDINGS_MAP[key] || LINE3_ENDINGS_MAP.default;
  const line3Ending = pickN(line3EndingsPool, 1, seed + 71)[0];
  const line3SignaturesPool = LINE3_SIGNATURES_MAP[key] || LINE3_SIGNATURES_MAP.default;
  const line3TagsPool = LINE3_SIGNATURE_TAGS_MAP[key] || LINE3_SIGNATURE_TAGS_MAP.default;
  const elementBiasWords = pickN(elementBias || [], 2, seed + 37);
  const modalityBiasWords = pickN(modalityBias || [], 2, seed + 41);
  const orderPatterns = [
    { id: "A", guide: "段階→機能→残り方" },
    { id: "B", guide: "機能→段階→残り方" },
    { id: "C", guide: "段階→残り方→機能" },
  ];
  const orderPattern = orderPatterns[seed % orderPatterns.length];

  const structureLine =
    label && sign ? buildFactLine({ key, meta: { sign_ja: sign, deg }, label }) : "";
  const slotMaterials = {
    role: getSoraPlanetSlotTokens(dict, key, "role"),
    appear: getSoraPlanetSlotTokens(dict, key, "appear"),
    impact: getSoraPlanetSlotTokens(dict, key, "impact"),
    order: getSoraPlanetSlotTokens(dict, key, "order"),
    residue: getSoraPlanetSlotTokens(dict, key, "residue"),
    stance: getSoraPlanetSlotTokens(dict, key, "stance"),
  };
  const signCore = getSoraCore(dict)?.meaning?.signs?.[String(signKey || "").toLowerCase()] || null;
  const signMaterials = {
    cores: getSoraSignCoreTokens(dict, signKey),
    color: normalizeCoreTokens(asArray(signCore?.color)),
    verbs: normalizeCoreTokens(asArray(signCore?.verbs)),
    lens: normalizeCoreTokens(asArray(signCore?.lens)),
    order_bias: normalizeCoreTokens(asArray(signCore?.order_bias)),
    residue_bias: normalizeCoreTokens(asArray(signCore?.residue_bias)),
    contrasts: normalizeCoreTokens(asArray(signCore?.contrasts)),
  };
  return {
    meta: {
      key,
      label: label || "",
      sign_ja: sign || "",
      sign_key: signKey || "",
      deg: deg ?? null,
      house_no: Number.isFinite(Number(houseNo)) ? Number(houseNo) : null,
    },
    function: functionWords,
    sign_trait: signTraits,
    sign_trait_primary: signTraitPrimary,
    sign_trait_all: signTraitAll,
    sign_role_core: signRoleCore,
    degree_phase: { key: degreePhase.key, anchor: degreePhase.anchor || [] },
    degree_phase_v2: soraPhase,
    phase_motion: phaseMotion,
    phase_motion_all: motionPool,
    sign_field: signField,
    structure_line: structureLine || buildStructureLine(functionWords, signTraits, seed + 61),
    sense_token: senseToken,
    residue_base: residueBase,
    residue_verb: residueVerb,
    residue_verb_all: residueVerbAll,
    line3_endings: line3EndingsPool,
    line3_ending: line3Ending,
    line3_signatures: line3SignaturesPool,
    line3_tags: line3TagsPool,
    slots: slotMaterials,
    sign_materials: signMaterials,
    element_bias: elementBiasWords,
    modality_bias: modalityBiasWords,
    order_pattern: orderPattern.id,
    order_guide: orderPattern.guide,
  };
}

module.exports = {
  buildSignTraitAll,
  pickDegreeBand,
  hashString,
  pickN,
  buildStructureLine,
  buildKernelForItem,
};
