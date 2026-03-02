"use strict";

const { normalizeBodyKey } = require("../domain/canonical");

const { swisseph } = require("../../config/swisseph");

function jdUtFromIso(asOfISO) {
  const d = new Date(asOfISO);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const hour =
    d.getUTCHours() +
    d.getUTCMinutes() / 60 +
    d.getUTCSeconds() / 3600 +
    d.getUTCMilliseconds() / 3600000;
  return swisseph.swe_julday(y, m, day, hour, swisseph.SE_GREG_CAL);
}

function isRetrograde(bodyKey, asOfISO) {
  if (!swisseph) return false;
  const jdUt = jdUtFromIso(asOfISO);
  if (!Number.isFinite(Number(jdUt))) return false;

  const map = {
    sun: swisseph.SE_SUN,
    moon: swisseph.SE_MOON,
    mercury: swisseph.SE_MERCURY,
    venus: swisseph.SE_VENUS,
    mars: swisseph.SE_MARS,
    jupiter: swisseph.SE_JUPITER,
    saturn: swisseph.SE_SATURN,
    uranus: swisseph.SE_URANUS,
    neptune: swisseph.SE_NEPTUNE,
    pluto: swisseph.SE_PLUTO,
    chiron: swisseph.SE_CHIRON,
    lilith: swisseph.SE_MEAN_APOG,
    north_node: swisseph.SE_TRUE_NODE ?? swisseph.SE_MEAN_NODE,
    south_node: swisseph.SE_TRUE_NODE ?? swisseph.SE_MEAN_NODE,
  };
  const id = map[normalizeBodyKey(bodyKey)];
  if (id == null) return false;

  const flags = swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SPEED;
  const out = swisseph.swe_calc_ut(jdUt, id, flags);
  if (!out || out.error) return false;
  const speed = typeof out.longitudeSpeed === "number" ? out.longitudeSpeed : out.data?.[3];
  return Number.isFinite(Number(speed)) ? Number(speed) < 0 : false;
}

function buildRetrogradeMap(asOfISO, keys = []) {
  const out = {};
  for (const k of keys) {
    out[k] = isRetrograde(k, asOfISO);
  }
  return out;
}

module.exports = { isRetrograde, buildRetrogradeMap };
