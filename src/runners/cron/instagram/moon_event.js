"use strict";

const {
  detectMoonEventLocal: detectMoonEventLocalFromDomain,
  moonEventSpaceConfig,
} = require("../../../domain/moon");
const { toDateLocalJST, isYYYYMMDD } = require("../../../utils/time");
const { normalizeAspectType } = require("../../../utils/data/normalize");
const { addDaysToDateLocalJST } = require("../shared/utils");

function parseBool(v, fallback = false) {
  if (v === true) return true;
  if (v === false) return false;
  if (typeof v !== "string") return fallback;
  const t = v.trim().toLowerCase();
  if (!t) return fallback;
  return ["1", "true", "yes", "on"].includes(t);
}

function resolveMoonEventTargetDateLocal({ now, opts = {}, env = {} } = {}) {
  const baseDateLocal = isYYYYMMDD(opts.dateLocal) ? String(opts.dateLocal) : toDateLocalJST(now);
  const offsetRaw = opts.dateOffsetDays ?? opts.date_offset_days ?? opts.dateOffset ?? opts.date_offset;
  const offsetDays = Number.isFinite(Number(offsetRaw))
    ? Number(offsetRaw)
    : Number.isFinite(Number(env.IG_MOON_EVENT_DATE_OFFSET_DAYS))
      ? Number(env.IG_MOON_EVENT_DATE_OFFSET_DAYS)
      : 1;
  const targetDateLocal = addDaysToDateLocalJST(baseDateLocal, offsetDays);
  return { baseDateLocal, offsetDays, targetDateLocal };
}

function resolveMoonEventKind(opts = {}) {
  const eventKindRaw = opts.eventKind ?? opts.event_kind ?? opts.moonEventKind ?? opts.moon_event_kind ?? opts.kind;
  const fullFlag = parseBool(opts.full ?? opts.full_moon ?? opts.fullMoon ?? opts.moon_full, false);
  const newFlag = parseBool(opts.new ?? opts.new_moon ?? opts.newMoon ?? opts.moon_new, false);
  const eventKind = eventKindRaw
    ? String(eventKindRaw)
    : (fullFlag && !newFlag)
      ? "full"
      : (!fullFlag && newFlag)
        ? "new"
        : "";
  return { eventKind, fullFlag, newFlag };
}

function detectMoonEventLocal({ dateLocal, asOfISO, dict, forceNext = false, eventKind = "" }) {
  return detectMoonEventLocalFromDomain({
    dateLocal,
    asOfISO,
    dict,
    forceNext,
    eventKind,
  });
}

function resolveMoonEventSpaceConfig(event) {
  return moonEventSpaceConfig(event);
}

function buildMoonEventCaption(event) {
  if (!event) return "";
  const line1 = event.line1 || event.label || event.phaseName || "";
  const line2 = event.dateLabel || event.line2 || "";
  return [line1, line2].filter(Boolean).join("\n").trim();
}

function pickMoonResonanceAspect(story) {
  const skyTop = Array.isArray(story?.public?.sky_top) ? story.public.sky_top : [];
  const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
  const pool = [...skyTop, ...skyAll];
  if (!pool.length) return null;

  const moonHits = pool.filter((row) => {
    const aKey = String(row?.a || "").toLowerCase();
    const bKey = String(row?.b || "").toLowerCase();
    if (!(aKey === "moon" || bKey === "moon")) return false;
    const other = aKey === "moon" ? bKey : aKey;
    return other && other !== "sun";
  });
  if (!moonHits.length) return null;

  const majors = new Set(["conjunction", "sextile", "square", "trine", "opposition"]);
  const majorHits = moonHits.filter((row) => majors.has(normalizeAspectType(row?.type || row?.aspect)));
  const target = majorHits.length ? majorHits : moonHits;
  return target
    .map((row) => ({ row, orb: Number(row?.orb_deg) }))
    .filter((item) => Number.isFinite(item.orb))
    .sort((a, b) => a.orb - b.orb)[0]?.row || target[0] || null;
}

module.exports = {
  addDaysToDateLocalJST,
  resolveMoonEventTargetDateLocal,
  resolveMoonEventKind,
  detectMoonEventLocal,
  resolveMoonEventSpaceConfig,
  buildMoonEventCaption,
  pickMoonResonanceAspect,
};
