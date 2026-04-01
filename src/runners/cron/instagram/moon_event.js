"use strict";

const { buildNextMoonEvents, orderedMoonEvents, formatMoonEventDisplay } = require("../../../domain/moon");
const { toDateLocalJST, isYYYYMMDD } = require("../../../utils/time");
const { normalizeAspectType } = require("../../../utils/data/normalize");

function parseBool(v, fallback = false) {
  if (v === true) return true;
  if (v === false) return false;
  if (typeof v !== "string") return fallback;
  const t = v.trim().toLowerCase();
  if (!t) return fallback;
  return ["1", "true", "yes", "on"].includes(t);
}

function addDaysToDateLocalJST(dateLocal, offsetDays) {
  if (!isYYYYMMDD(dateLocal)) return dateLocal;
  const base = new Date(`${dateLocal}T00:00:00+09:00`);
  if (Number.isNaN(base.getTime())) return dateLocal;
  const shiftMs = Number(offsetDays) * 86400000;
  if (!Number.isFinite(shiftMs) || shiftMs === 0) return dateLocal;
  const shifted = new Date(base.getTime() + shiftMs);
  return toDateLocalJST(shifted);
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
  const events = buildNextMoonEvents(asOfISO, dict);
  const candidates = [events?.new, events?.full].filter((ev) => ev?.date instanceof Date);
  const normalizedKind = String(eventKind || "").toLowerCase();

  if (normalizedKind === "new" || normalizedKind === "full") {
    const picked = events?.[normalizedKind];
    if (!picked?.date) return null;
    if (forceNext) return formatMoonEventDisplay(picked);
    if (!dateLocal) return null;
    return toDateLocalJST(picked.date) === dateLocal ? formatMoonEventDisplay(picked) : null;
  }

  if (dateLocal) {
    for (const ev of candidates) {
      const evDateLocal = toDateLocalJST(ev.date);
      if (evDateLocal === dateLocal) {
        return formatMoonEventDisplay(ev);
      }
    }
  }

  if (forceNext) {
    const ordered = orderedMoonEvents(events);
    if (ordered.length) return formatMoonEventDisplay(ordered[0]);
  }

  return null;
}

function resolveMoonEventSpaceConfig(event) {
  if (!event || !event.kind) return null;
  if (event.kind === "full") {
    return {
      starDensityScale: 0.38,
      milkyIntensityScale: 0.6,
      milkyThicknessScale: 0.75,
      milkyDustScale: 0.6,
      whiteMix: 0.45,
      moonEventKind: "full",
      moonEventStyle: "halo",
      moonEventCenter: "center",
      moonEventIntensity: 1.35,
    };
  }
  if (event.kind === "new") {
    return {
      starDensityScale: 2.1,
      milkyIntensityScale: 1.55,
      milkyThicknessScale: 1.25,
      milkyDustScale: 1.6,
      whiteMix: 0.45,
      moonEventKind: "new",
      moonEventStyle: "eclipse",
      moonEventCenter: "center",
      moonEventIntensity: 1.15,
    };
  }
  return null;
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
