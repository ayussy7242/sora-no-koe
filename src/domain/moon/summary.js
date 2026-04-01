"use strict";

const dictDefault = require("../../content/dict");
const { swisseph } = require("../../config/swisseph");
const { jdUtFromIso, calcTransitLon, absAngularDistance } = require("../astro/compute");
const { SYNODIC_MONTH_DAYS, KM_PER_AU } = require("./constants");
const {
  astroPhaseFromDeg,
  moonPhaseSymbolFromDeg,
  moonPhaseInfo,
  waNameFromMoonAge,
  formatMoonPhaseLabel,
  normalizeMoonPhaseByIllumination,
} = require("./phase");
const { signLabelJa, signKeyFromLon, degInSignFromLon } = require("./labels");

function calcMoonDistanceKm(asOfISO) {
  if (!swisseph) return null;
  const jdUt = jdUtFromIso(asOfISO);
  if (!Number.isFinite(Number(jdUt))) return null;
  const flags = swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SPEED;
  const out = swisseph.swe_calc_ut(jdUt, swisseph.SE_MOON, flags);
  if (!out || out.error) return null;
  const distAu = typeof out.distance === "number" ? out.distance : out.data?.[2];
  if (!Number.isFinite(Number(distAu))) return null;
  return Number(distAu) * KM_PER_AU;
}

function buildTodayMoonInfo({ asOfISO, story, dict }) {
  const useDict = dict || dictDefault;
  const sunLon = calcTransitLon("sun", asOfISO);
  const moonLon = calcTransitLon("moon", asOfISO);
  const phaseDeg = Number.isFinite(Number(sunLon)) && Number.isFinite(Number(moonLon))
    ? ((Number(moonLon) - Number(sunLon) + 360) % 360)
    : null;
  const phaseAngle = Number.isFinite(Number(sunLon)) && Number.isFinite(Number(moonLon))
    ? absAngularDistance(moonLon, sunLon)
    : null;
  const illumination = Number.isFinite(Number(phaseAngle))
    ? (1 - Math.cos((Number(phaseAngle) * Math.PI) / 180)) / 2
    : null;
  const phase = normalizeMoonPhaseByIllumination(moonPhaseInfo(phaseDeg), illumination);
  const moonAge = Number.isFinite(Number(phaseDeg)) ? (Number(phaseDeg) / 360) * SYNODIC_MONTH_DAYS : null;
  const moonSign = story?.public?.moon?.sign_ja || signLabelJa(useDict, story?.public?.moon?.sign_key);
  const moonSignKey = signKeyFromLon(useDict, moonLon);
  const moonSignLabel = moonSign || (moonSignKey ? signLabelJa(useDict, moonSignKey) : "");
  const moonDegInSign = degInSignFromLon(moonLon);
  return {
    phaseDeg,
    phase,
    moonAge,
    moonSign: moonSignLabel,
    moonSignKey,
    moonDegInSign,
    illumination,
  };
}

function buildMoonStatus({ asOfISO, story, dict, info }) {
  const useDict = dict || dictDefault;
  const moonInfo = info || buildTodayMoonInfo({ asOfISO, story, dict: useDict });
  if (!moonInfo) return null;

  const phase = moonInfo.phase || astroPhaseFromDeg(moonInfo.phaseDeg);
  let phaseName = phase?.name || "—";
  let phaseSymbol = phase?.symbol || moonPhaseSymbolFromDeg(moonInfo.phaseDeg);
  const waNameRaw = waNameFromMoonAge(moonInfo.moonAge);
  let waName = waNameRaw && waNameRaw !== phaseName ? waNameRaw : "";

  // 新月・満月のときは月相名を優先しつつ、晦のみ補足表示する
  if (phaseName === "新月") {
    waName = waNameRaw === "晦" ? "晦" : "";
  } else if (phaseName === "満月") {
    waName = "";
  }

  const signJa = moonInfo.moonSign || "—";
  const moonAge = Number.isFinite(Number(moonInfo.moonAge)) ? Number(moonInfo.moonAge) : null;
  const illumination = Number.isFinite(Number(moonInfo.illumination)) ? Number(moonInfo.illumination) : null;

  const phaseLabel = formatMoonPhaseLabel({ phaseName, waName });
  const line1 = `${phaseSymbol} ${phaseLabel}｜${signJa}`.trim();
  const moonAgeText = Number.isFinite(moonAge) ? moonAge.toFixed(1) : "—";
  const illuminationPct = Number.isFinite(illumination) ? Math.round(illumination * 100) : null;
  const line2 = illuminationPct != null
    ? `月齢 ${moonAgeText}｜照度 ${illuminationPct}%`
    : `月齢 ${moonAgeText}`;

  return {
    info: moonInfo,
    phaseSymbol,
    phaseName,
    waName,
    signJa,
    moonAge,
    illumination,
    phaseLabel,
    line1,
    line2,
  };
}

function formatTodayMoonLines({ asOfISO, story, dict }) {
  const info = buildTodayMoonInfo({ asOfISO, story, dict });
  const lines = [];
  const display = buildMoonStatus({ asOfISO, story, dict, info });
  if (display?.line1) lines.push(display.line1);
  if (display?.line2) lines.push(display.line2);
  return { lines, info: display?.info || info, display };
}

module.exports = {
  calcMoonDistanceKm,
  buildTodayMoonInfo,
  buildMoonStatus,
  formatTodayMoonLines,
};
