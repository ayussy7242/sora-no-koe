"use strict";

const { LOGO_SPEC } = require("../../../../shared/typography");

const IG_TYPOGRAPHY_TOKENS = Object.freeze({
  header: {
    tracking: 0.12,
  },
  subLabel: {
    tracking: 0.19,
  },
  footer: {
    swipeTracking: 0.12,
  },
  rightFooter: {
    tracking: LOGO_SPEC.letterSpacingEm,
  },
  cover: {
    brandTracking: LOGO_SPEC.letterSpacingEm,
    taglineTracking: 0.22,
    midTracking: 0.14,
    observation: {
      tracking: 0.04,
    },
    pressure: {
      tracking: 0.12,
    },
  },
  chart: {
    footerLabelTracking: 0.16,
    subLabelTracking: 0.14,
  },
  placements: {
    listTracking: 0.02,
  },
  resonance: {
    lineTracking: 0.04,
    xTracking: 0.12,
    aspectTracking: 0.06,
    bodyTracking: 0.02,
  },
  moon: {
    phaseLabelTracking: 0.06,
    signTracking: 0.06,
    infoTracking: 0.06,
    observationTracking: 0.02,
    nextLabelTracking: 0.12,
    nextTracking: 0.04,
  },
  tsukiji: {
    lineTracking: 0.04,
    xTracking: 0.12,
    structureTracking: 0.06,
    tableTracking: 0.08,
  },
  cta: {
    ornamentTracking: 0.3,
    ctaTracking: 0.04,
    subTracking: 0.06,
    miniCtaTracking: 0.14,
    headerTracking: 0.12,
    altCtaTracking: 0.02,
    altSubTracking: 0.04,
  },
});

module.exports = { IG_TYPOGRAPHY_TOKENS };
