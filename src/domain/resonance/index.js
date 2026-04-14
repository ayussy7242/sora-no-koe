"use strict";

const {
  resolveResonanceMode,
  splitResonancePools,
  pickResonanceAspectFromPool,
  pickPreferredResonanceAspect,
  pickPrimaryResonanceAspect,
  listResonanceCandidates,
  buildResonanceKey,
} = require("./candidates");

const {
  listImportantResonances,
  classifyImportantResonanceKinds,
  scoreImportantResonance,
} = require("./importance");

const {
  pickFromImportantList,
  applyLineBias,
  applyInstagramBias,
  applyXBias,
  pickResonanceForX,
  pickResonanceForInstagram,
  pickResonanceForLine,
} = require("./channel_policy");

const { pickResonanceDailyRepresentative } = require("./daily_representative");

const { REASONS } = require("./reasons");

module.exports = {
  resolveResonanceMode,
  splitResonancePools,
  pickResonanceAspectFromPool,
  pickPreferredResonanceAspect,
  pickPrimaryResonanceAspect,
  listResonanceCandidates,
  buildResonanceKey,
  listImportantResonances,
  classifyImportantResonanceKinds,
  scoreImportantResonance,
  pickFromImportantList,
  applyLineBias,
  applyInstagramBias,
  applyXBias,
  pickResonanceForX,
  pickResonanceForInstagram,
  pickResonanceForLine,
  pickResonanceDailyRepresentative,
  REASONS,
};
