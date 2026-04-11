"use strict";

const fs = require("fs");
const path = require("path");
const dictDefault = require("../../content/dict");
const { isRetrograde } = require("../../domain/astro/retrograde");
const { calcTransitLon, absAngularDistance } = require("../../domain/astro/compute");
const { signKeyFromLon } = require("../../domain/moon/labels");
const { asOfIsoFromDateLocalJST, toDateLocalJST } = require("../../utils/time");

const DEFAULT_TIME_ZONE = "Asia/Tokyo";
const RETROGRADE_PLANETS = ["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
const SHADOW_SCAN_DAYS = 360;
const STATION_SCAN_DAYS = 420;

function addDaysDateLocalJST(dateLocal, offsetDays) {
  const base = new Date(`${dateLocal}T00:00:00+09:00`);
  if (Number.isNaN(base.getTime())) return dateLocal;
  const shiftMs = Number(offsetDays) * 86400000;
  if (!Number.isFinite(shiftMs) || shiftMs === 0) return dateLocal;
  const shifted = new Date(base.getTime() + shiftMs);
  return toDateLocalJST(shifted);
}

function isRetrogradeOnDateLocal(planetKey, dateLocal) {
  const iso = asOfIsoFromDateLocalJST(dateLocal);
  if (!iso) return false;
  return isRetrograde(planetKey, iso);
}

function findRetrogradeStartDateLocal({ planetKey, fromLocal, maxDays = STATION_SCAN_DAYS }) {
  let cursor = fromLocal;
  for (let i = 0; i < maxDays; i += 1) {
    const prev = addDaysDateLocalJST(cursor, -1);
    if (!isRetrogradeOnDateLocal(planetKey, prev)) return cursor;
    cursor = prev;
  }
  return fromLocal;
}

function findRetrogradeEndDateLocal({ planetKey, fromLocal, maxDays = STATION_SCAN_DAYS }) {
  let cursor = fromLocal;
  for (let i = 0; i < maxDays; i += 1) {
    const next = addDaysDateLocalJST(cursor, 1);
    if (!isRetrogradeOnDateLocal(planetKey, next)) return cursor;
    cursor = next;
  }
  return fromLocal;
}

function findClosestDateLocalForLon({ planetKey, targetLon, startLocal, endLocalExclusive }) {
  if (!Number.isFinite(Number(targetLon))) return null;
  let cursor = startLocal;
  let guard = 0;
  let best = { date: null, dist: Infinity };
  while (cursor < endLocalExclusive && guard < SHADOW_SCAN_DAYS + 5) {
    const iso = asOfIsoFromDateLocalJST(cursor);
    if (iso) {
      const lon = calcTransitLon(planetKey, iso);
      if (Number.isFinite(Number(lon))) {
        const dist = absAngularDistance(lon, targetLon);
        if (Number.isFinite(Number(dist)) && dist < best.dist) {
          best = { date: cursor, dist };
        }
      }
    }
    cursor = addDaysDateLocalJST(cursor, 1);
    guard += 1;
  }
  return best.date;
}

function buildRetrogradeWindowsForYear({ year, planetKey }) {
  const y = Number(year);
  if (!Number.isFinite(y)) throw new Error("year is required");
  const startLocal = `${y}-01-01`;
  const endLocal = `${y}-12-31`;

  const windows = [];
  let cursor = startLocal;
  let prev = null;
  let windowStart = null;

  for (let guard = 0; guard < 370; guard++) {
    const retro = isRetrogradeOnDateLocal(planetKey, cursor);

    if (retro && !windowStart) windowStart = cursor;
    if (!retro && windowStart) {
      const isCarryIn = windowStart === startLocal
        ? isRetrogradeOnDateLocal(planetKey, addDaysDateLocalJST(startLocal, -1))
        : false;
      const endHit = prev || cursor;
      const isCarryOut = endHit === endLocal
        ? isRetrogradeOnDateLocal(planetKey, addDaysDateLocalJST(endLocal, 1))
        : false;
      windows.push({
        start_local: windowStart,
        end_local: endHit,
        is_carry_in: isCarryIn,
        is_carry_out: isCarryOut,
      });
      windowStart = null;
    }

    if (cursor === endLocal) break;
    prev = cursor;
    cursor = addDaysDateLocalJST(cursor, 1);
  }

  if (windowStart) {
    const isCarryIn = windowStart === startLocal
      ? isRetrogradeOnDateLocal(planetKey, addDaysDateLocalJST(startLocal, -1))
      : false;
    const isCarryOut = isRetrogradeOnDateLocal(planetKey, addDaysDateLocalJST(endLocal, 1));
    windows.push({
      start_local: windowStart,
      end_local: endLocal,
      is_carry_in: isCarryIn,
      is_carry_out: isCarryOut,
    });
  }

  return windows;
}

function buildRetrogradesYearReference({ year, timeZone, dict } = {}) {
  const y = Number(year);
  if (!Number.isFinite(y)) throw new Error("year is required");
  const tz = timeZone || DEFAULT_TIME_ZONE;
  const useDict = dict || dictDefault;

  const items = [];
  for (const planetKey of RETROGRADE_PLANETS) {
    const windows = buildRetrogradeWindowsForYear({ year: y, planetKey });
    windows.forEach((window, idx) => {
      const stationStartLocal = window.is_carry_in
        ? findRetrogradeStartDateLocal({ planetKey, fromLocal: window.start_local })
        : window.start_local;
      const stationEndLocal = window.is_carry_out
        ? findRetrogradeEndDateLocal({ planetKey, fromLocal: window.end_local })
        : window.end_local;

      const startIso = asOfIsoFromDateLocalJST(stationStartLocal);
      const endIso = asOfIsoFromDateLocalJST(stationEndLocal);
      const startLon = startIso ? calcTransitLon(planetKey, startIso) : null;
      const endLon = endIso ? calcTransitLon(planetKey, endIso) : null;
      const signStart = signKeyFromLon(useDict, startLon);
      const signEnd = signKeyFromLon(useDict, endLon);

      const shadowStartLocal = startLon != null
        ? findClosestDateLocalForLon({
          planetKey,
          targetLon: startLon,
          startLocal: addDaysDateLocalJST(stationStartLocal, -SHADOW_SCAN_DAYS),
          endLocalExclusive: addDaysDateLocalJST(stationStartLocal, 1),
        })
        : null;
      const shadowEndLocal = endLon != null
        ? findClosestDateLocalForLon({
          planetKey,
          targetLon: endLon,
          startLocal: stationEndLocal,
          endLocalExclusive: addDaysDateLocalJST(stationEndLocal, SHADOW_SCAN_DAYS + 1),
        })
        : null;

      items.push({
        id: `${y}-${planetKey}-${idx + 1}`,
        planet_key: planetKey,
        start_local: window.start_local,
        end_local: window.end_local,
        sign_key_start: signStart || null,
        sign_key_end: signEnd || null,
        shadow_start_local: shadowStartLocal || null,
        shadow_end_local: shadowEndLocal || null,
        station_retrograde_local: stationStartLocal || null,
        station_direct_local: stationEndLocal || null,
        is_carry_in: window.is_carry_in === true,
        is_carry_out: window.is_carry_out === true,
        note: null,
      });
    });
  }

  items.sort((a, b) => {
    const aKey = `${a.start_local || ""}-${a.planet_key || ""}`;
    const bKey = `${b.start_local || ""}-${b.planet_key || ""}`;
    return aKey.localeCompare(bKey);
  });

  return {
    type: "retrogrades_year",
    version: "v1",
    year: y,
    time_zone: tz,
    generated_at_utc: new Date().toISOString(),
    items,
  };
}

function applyTokensMap(input, tokens) {
  if (typeof input === "string") {
    let out = input;
    for (const [key, value] of Object.entries(tokens || {})) {
      out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
    }
    return out;
  }
  if (Array.isArray(input)) {
    return input.map((item) => applyTokensMap(item, tokens));
  }
  if (input && typeof input === "object") {
    const out = {};
    for (const [key, value] of Object.entries(input)) {
      out[key] = applyTokensMap(value, tokens);
    }
    return out;
  }
  return input;
}

function loadHeaderTemplate() {
  const p = path.resolve(process.cwd(), "src/content/templates/instagram/header.v1.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function buildRetrogradesYearDeck({ reference, template } = {}) {
  if (!reference || typeof reference !== "object") {
    throw new Error("reference is required");
  }
  const base = template && typeof template === "object" ? template : {};
  const deckBase = JSON.parse(JSON.stringify(base));
  const deck = applyTokensMap(deckBase, { year: reference.year });
  deck.type = deck.type || "carousel_deck";
  deck.version = deck.version || "v1";
  deck.data = {
    ...(deck.data || {}),
    year: reference.year,
    time_zone: reference.time_zone,
  };

  const headerText = deck.header_text || {};
  const headerTemplate = loadHeaderTemplate();
  deck.header = applyTokensMap(headerTemplate, {
    brand: "ソラのこえ",
    primary: headerText.primary || "",
    secondary: headerText.secondary || "",
    sub_en: headerText.sub_en || "",
  });
  delete deck.header_text;

  const listByKey = {
    retrogrades: Array.isArray(reference.items) ? reference.items : [],
  };

  if (Array.isArray(deck.slides)) {
    deck.slides = deck.slides.map((slide) => {
      if (!slide || !slide.source || !listByKey[slide.source]) return slide;
      const rows = listByKey[slide.source].map((ev) => ({
        planet_key: ev.planet_key,
        start_local: ev.start_local,
        end_local: ev.end_local,
        sign_key_start: ev.sign_key_start,
        sign_key_end: ev.sign_key_end,
        shadow_start_local: ev.shadow_start_local ?? null,
        shadow_end_local: ev.shadow_end_local ?? null,
        note: ev.note ?? null,
      }));
      return { ...slide, rows };
    });
  }

  return deck;
}

module.exports = {
  buildRetrogradesYearReference,
  buildRetrogradesYearDeck,
};
