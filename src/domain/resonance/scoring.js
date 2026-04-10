"use strict";

function scoreByOrb(orb) {
  if (!Number.isFinite(Number(orb))) return 0;
  const v = Number(orb);
  if (v <= 0.3) return 5;
  if (v <= 0.7) return 3;
  if (v <= 1.2) return 2;
  if (v <= 2.0) return 1;
  return 0;
}

function scoreByBodies({ isCorePair, isCoreAny } = {}) {
  if (isCorePair) return 3;
  if (isCoreAny) return 2;
  return 0;
}

function scoreByAspect({ isMajorAspect, aspectDeg } = {}) {
  if (Number.isFinite(Number(aspectDeg))) {
    const deg = Math.round(Number(aspectDeg));
    if (deg === 0 || deg === 90 || deg === 180) return 4;
    if (deg === 120) return 3;
    if (deg === 60) return 2;
    return 0;
  }
  return isMajorAspect ? 3 : 0;
}

function scoreBySkyTop(inSkyTop) {
  return inSkyTop ? 2 : 0;
}

function scoreByRarity({ isMajorAspect, orb } = {}) {
  if (!Number.isFinite(Number(orb))) return 0;
  if (!isMajorAspect && Number(orb) <= 0.2) return 1;
  return 0;
}

function scoreByLuminaries({ hasSun, hasMoon, isSunMoonPair } = {}) {
  if (isSunMoonPair) return 2;
  if (hasSun || hasMoon) return 1;
  return 0;
}

module.exports = {
  scoreByOrb,
  scoreByBodies,
  scoreByAspect,
  scoreBySkyTop,
  scoreByRarity,
  scoreByLuminaries,
};
