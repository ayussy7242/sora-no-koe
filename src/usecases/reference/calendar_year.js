"use strict";

const fs = require("fs");
const path = require("path");
const dictDefault = require("../../content/dict");
const { findNextMoonPhase, calcTransitLon } = require("../../domain/astro/compute");
const {
  fullMoonNameJaFromDate,
  fullMoonNameEnFromDate,
  isBlueMoon,
  isBlackMoon,
} = require("../../domain/moon/events");
const { signKeyFromLon } = require("../../domain/moon/labels");
const { ymdInTimeZone, dateTimePartsInTimeZone } = require("../../utils/time");

const DEFAULT_TIME_ZONE = "Asia/Tokyo";

function formatTimeInZone(date, timeZone) {
  const parts = dateTimePartsInTimeZone(date, timeZone);
  const hh = parts?.hour;
  const mm = parts?.minute;
  if (!hh || !mm) return null;
  return `${hh}:${mm}`;
}

function buildMoonEventEntry({ date, kind, dict, timeZone }) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const dateLocal = ymdInTimeZone(date, timeZone);
  const timeLocal = formatTimeInZone(date, timeZone);
  const lon = calcTransitLon("moon", date.toISOString());
  const signKey = signKeyFromLon(dict, lon);

  const base = {
    id: dateLocal ? `${dateLocal}-${kind}` : `${date.toISOString().slice(0, 10)}-${kind}`,
    date_local: dateLocal || null,
    time_local: timeLocal || null,
    sign_key: signKey || null,
  };

  if (kind === "full") {
    const specialNameJa = isBlueMoon(date) ? "ブルームーン" : "";
    const specialNameEn = isBlueMoon(date) ? "Blue Moon" : "";
    return {
      ...base,
      moon_name_ja: fullMoonNameJaFromDate(date) || null,
      moon_name_en: fullMoonNameEnFromDate(date) || null,
      special_name_ja: specialNameJa || null,
      special_name_en: specialNameEn || null,
    };
  }

  if (kind === "new") {
    const specialNameJa = isBlackMoon(date) ? "ブラックムーン" : "";
    const specialNameEn = isBlackMoon(date) ? "Black Moon" : "";
    return {
      ...base,
      moon_name_ja: null,
      moon_name_en: null,
      special_name_ja: specialNameJa || null,
      special_name_en: specialNameEn || null,
    };
  }

  return base;
}

function buildMoonEventsForYear({ year, kind, targetDeg, timeZone, dict }) {
  const y = Number(year);
  if (!Number.isFinite(y)) throw new Error("year is required");

  const tz = timeZone || DEFAULT_TIME_ZONE;
  const start = new Date(`${y}-01-01T00:00:00+09:00`);
  const end = new Date(`${y + 1}-01-01T00:00:00+09:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("invalid year for date range");
  }

  const items = [];
  let cursor = start.toISOString();

  for (let guard = 0; guard < 40; guard++) {
    const next = findNextMoonPhase(cursor, targetDeg);
    if (!(next instanceof Date) || Number.isNaN(next.getTime())) break;
    if (next.getTime() >= end.getTime()) break;

    const entry = buildMoonEventEntry({ date: next, kind, dict, timeZone: tz });
    if (entry) items.push(entry);

    const nextCursor = new Date(next.getTime() + 60 * 60 * 1000);
    cursor = nextCursor.toISOString();
  }

  return items;
}

function buildCalendarYearReference({ year, timeZone, dict } = {}) {
  const y = Number(year);
  if (!Number.isFinite(y)) throw new Error("year is required");
  const tz = timeZone || DEFAULT_TIME_ZONE;
  const useDict = dict || dictDefault;

  const full_moons = buildMoonEventsForYear({
    year: y,
    kind: "full",
    targetDeg: 180,
    timeZone: tz,
    dict: useDict,
  });

  const new_moons = buildMoonEventsForYear({
    year: y,
    kind: "new",
    targetDeg: 0,
    timeZone: tz,
    dict: useDict,
  });

  return {
    type: "calendar_year",
    version: "v1",
    year: y,
    time_zone: tz,
    generated_at_utc: new Date().toISOString(),
    full_moons,
    new_moons,
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
  if (Array.isArray(input)) return input.map((item) => applyTokensMap(item, tokens));
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

function buildCalendarYearDeck({ reference, template } = {}) {
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
    full_moons: Array.isArray(reference.full_moons) ? reference.full_moons : [],
    new_moons: Array.isArray(reference.new_moons) ? reference.new_moons : [],
  };

  if (Array.isArray(deck.slides)) {
    deck.slides = deck.slides.map((slide) => {
      if (!slide || !slide.source || !listByKey[slide.source]) return slide;
      const rows = listByKey[slide.source].map((ev) => ({
        date_local: ev.date_local,
        time_local: ev.time_local,
        sign_key: ev.sign_key,
        moon_name_ja: ev.moon_name_ja || null,
        moon_name_en: ev.moon_name_en || null,
        special_name_ja: ev.special_name_ja || null,
        special_name_en: ev.special_name_en || null,
      }));
      return { ...slide, rows };
    });
  }

  return deck;
}

module.exports = {
  buildCalendarYearReference,
  buildCalendarYearDeck,
};
