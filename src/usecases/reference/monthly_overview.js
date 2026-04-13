"use strict";

const fs = require("fs");
const path = require("path");
const dictDefault = require("../../content/dict");
const { findNextMoonPhase, calcTransitLon, absAngularDistance } = require("../../domain/astro/compute");
const { signKeyFromLon: signKeyFromLonDict } = require("../../domain/moon/labels");
const { signKeyFromLon } = require("../../domain/astro/signs");
const { buildRetrogradesYearReference } = require("./retrogrades_year");
const { moonEventNameInfo } = require("../../domain/moon/events");
const { moonPhaseInfo, moonPhaseLabelFromKey } = require("../../domain/moon/phase");
const {
  ymdInTimeZone,
  dateTimePartsInTimeZone,
  asOfIsoFromDateLocalJST,
  toDateLocalJST,
} = require("../../utils/time");
const { bodyGlyph, bodyLabelJa, signLabelJa } = require("../../presenters/shared/text/tokens");

const DEFAULT_TIME_ZONE = "Asia/Tokyo";
const SIGN_INGRESS_PLANETS = [
  "sun",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
];
const ASPECT_PLANETS = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
];
const ASPECT_ORB_LIMIT = 2;
const ASPECT_MAX_ITEMS = 0;
const PEAK_MAX_ITEMS = 3;
const HIGHLIGHT_MAX_ITEMS = 6;
const HIGHLIGHT_RETRO_LIMIT = 2;
const HIGHLIGHT_INGRESS_LIMIT = 2;
const HIGHLIGHT_ASPECT_LIMIT = 1;
const HIGHLIGHT_PEAK_LIMIT = 1;

function formatTimeInZone(date, timeZone) {
  const parts = dateTimePartsInTimeZone(date, timeZone);
  const hh = parts?.hour;
  const mm = parts?.minute;
  if (!hh || !mm) return null;
  return `${hh}:${mm}`;
}

function nextMonthStr(month) {
  const [yRaw, mRaw] = String(month).split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  let ny = y;
  let nm = m + 1;
  if (nm > 12) {
    nm = 1;
    ny += 1;
  }
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

function formatMonthLabel(month) {
  const [yRaw, mRaw] = String(month).split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return String(month || "");
  return `${y}年${m}月`;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatMonthLabelEn(month) {
  const [yRaw, mRaw] = String(month).split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return String(month || "");
  const idx = m - 1;
  if (idx < 0 || idx >= MONTH_NAMES.length) return String(month || "");
  return `${MONTH_NAMES[idx]} ${y}`;
}

function addDaysDateLocalJST(dateLocal, offsetDays) {
  const base = new Date(`${dateLocal}T00:00:00+09:00`);
  if (Number.isNaN(base.getTime())) return dateLocal;
  const shiftMs = Number(offsetDays) * 86400000;
  if (!Number.isFinite(shiftMs) || shiftMs === 0) return dateLocal;
  const shifted = new Date(base.getTime() + shiftMs);
  return toDateLocalJST(shifted);
}

function daysInMonth(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return 0;
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function weekdayIndexJst(dateLocal) {
  const d = new Date(`${dateLocal}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return 0;
  return d.getUTCDay();
}

function dailyPhaseIcon(dateLocal) {
  const iso = asOfIsoFromDateLocalJST(dateLocal);
  if (!iso) return "🌙";
  const sunLon = calcTransitLon("sun", iso);
  const moonLon = calcTransitLon("moon", iso);
  if (!Number.isFinite(Number(sunLon)) || !Number.isFinite(Number(moonLon))) return "🌙";
  const phaseDeg = ((Number(moonLon) - Number(sunLon) + 360) % 360);
  const info = moonPhaseInfo(phaseDeg);
  return info?.symbol || "🌙";
}

function monthRange(month) {
  const startLocal = `${month}-01`;
  const nextMonth = nextMonthStr(month);
  const endLocal = nextMonth ? `${nextMonth}-01` : null;
  return { startLocal, endLocal };
}

function listDateLocalsInRange(startLocal, endLocalExclusive) {
  const list = [];
  if (!startLocal || !endLocalExclusive) return list;
  let cursor = startLocal;
  let guard = 0;
  while (cursor < endLocalExclusive && guard < 40) {
    list.push(cursor);
    cursor = addDaysDateLocalJST(cursor, 1);
    guard += 1;
  }
  return list;
}

function isDateInRange(dateLocal, startLocal, endLocalExclusive) {
  if (!dateLocal || !startLocal || !endLocalExclusive) return false;
  return dateLocal >= startLocal && dateLocal < endLocalExclusive;
}

function signLabelShort(dict, signKey) {
  const label = signLabelJa(dict, signKey) || "";
  return label.replace(/座$/, "");
}

function planetLabel(dict, planetKey) {
  const glyph = bodyGlyph(planetKey);
  const name = bodyLabelJa(dict, planetKey);
  return `${glyph ? `${glyph} ` : ""}${name || planetKey}`.trim();
}

function formatPhaseLinesForCalendar(phase) {
  if (!phase) return [];
  const key = phase.phase_key || "";
  if (key === "full") {
    const sign = signLabelJa(dictDefault, phase.sign_key) || "";
    const nameRaw = phase.moon_name_en || phase.moon_name_ja || phase.label || "";
    const name = String(nameRaw).replace(/\s+/g, "");
    const phaseLabel = moonPhaseLabelFromKey("full");
    if (name) return [sign, phaseLabel, name].filter(Boolean);
    return [sign, phaseLabel].filter(Boolean);
  }
  if (key === "new") {
    const sign = signLabelJa(dictDefault, phase.sign_key) || "";
    return [sign, moonPhaseLabelFromKey("new")].filter(Boolean);
  }
  if (key === "first_quarter") return [moonPhaseLabelFromKey("first_quarter", { withMoon: true })];
  if (key === "last_quarter") return [moonPhaseLabelFromKey("last_quarter", { withMoon: true })];
  return [];
}

function formatRetroLines(dict, planetKey, kind) {
  const label = planetLabel(dict, planetKey);
  if (kind === "start") return [label, "逆行開始"];
  if (kind === "end") return [label, "順行戻り"];
  return [label, "逆行"];
}

function formatIngressLine(dict, planetKey, signKey, { short = true } = {}) {
  const planet = planetLabel(dict, planetKey);
  const sign = short ? signLabelShort(dict, signKey) : signLabelJa(dict, signKey);
  return `${planet} → ${sign}`.trim();
}

function formatAspectLine(dict, aspect) {
  if (!aspect) return "";
  const map = {
    conjunction: "コンジャンクション",
    sextile: "セクスタイル",
    square: "スクエア",
    trine: "トライン",
    opposition: "オポジション",
  };
  const label = map[aspect.aspect_key] || aspect.aspect_key || "アスペクト";
  const a = bodyLabelJa(dict, aspect.a);
  const b = bodyLabelJa(dict, aspect.b);
  return `${a} ${label} ${b}`.trim();
}

function aspectLabelJa(dict, aspectKey) {
  const fromDict = dict?.ASPECTS_V2?.major?.[aspectKey]?.label_ja;
  return fromDict || aspectKey || "アスペクト";
}

function aspectSymbol(aspectKey) {
  const map = {
    conjunction: "☌",
    sextile: "⚹",
    square: "□",
    trine: "△",
    opposition: "☍",
  };
  return map[aspectKey] || "✶";
}

function aspectSymbolLabel(dict, aspectKey) {
  const symbol = aspectSymbol(aspectKey);
  const label = aspectLabelJa(dict, aspectKey);
  return `${symbol} ${label}`.trim();
}

function planetLabelWithSign(dict, planetKey, dateLocal) {
  const planet = planetLabel(dict, planetKey);
  const iso = asOfIsoFromDateLocalJST(dateLocal);
  if (!iso) return planet;
  const lon = calcTransitLon(planetKey, iso);
  const signKey = signKeyFromLon(lon);
  const sign = signLabelJa(dict, signKey);
  return [planet, sign].filter(Boolean).join(" ");
}

function planetGlyphWithSign(dict, planetKey, dateLocal) {
  const glyph = bodyGlyph(planetKey);
  const iso = asOfIsoFromDateLocalJST(dateLocal);
  if (!iso) return glyph || planetKey;
  const lon = calcTransitLon(planetKey, iso);
  const signKey = signKeyFromLon(lon);
  const sign = signLabelJa(dict, signKey);
  return [glyph || planetKey, sign].filter(Boolean).join(" ");
}

function formatPhaseTimelineLabel(dict, phase) {
  if (!phase) return "";
  const sign = signLabelJa(dict, phase.sign_key) || "";
  let base = "";
  if (phase.phase_key === "full") {
    const name = phase.moon_name_en || phase.moon_name_ja || phase.label || "";
    const phaseLabel = moonPhaseLabelFromKey("full");
    base = name ? `${phaseLabel} ${name}` : phaseLabel;
    return [sign, base].filter(Boolean).join(" ").trim();
  } else if (phase.phase_key === "new") {
    base = moonPhaseLabelFromKey("new");
    return [sign, base].filter(Boolean).join(" ").trim();
  } else if (phase.phase_key === "first_quarter") {
    base = moonPhaseLabelFromKey("first_quarter", { withMoon: true });
    return [base, sign].filter(Boolean).join(" ").trim();
  } else if (phase.phase_key === "last_quarter") {
    base = moonPhaseLabelFromKey("last_quarter", { withMoon: true });
    return [base, sign].filter(Boolean).join(" ").trim();
  } else {
    base = phase.label || phase.phase_key || "";
    return [sign, base].filter(Boolean).join(" ").trim();
  }
}

function parsePeakNote(note) {
  const raw = String(note || "");
  const [a, b, aspect_key] = raw.split("-");
  if (!a || !b || !aspect_key) return null;
  return { a, b, aspect_key };
}

function buildMoonEventEntry({ date, timeZone, dict }) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const dateLocal = ymdInTimeZone(date, timeZone);
  const timeLocal = formatTimeInZone(date, timeZone);
  const lon = calcTransitLon("moon", date.toISOString());
  const signKey = signKeyFromLonDict(dict, lon);
  return {
    date_local: dateLocal || null,
    time_local: timeLocal || null,
    sign_key: signKey || null,
  };
}

function collectMoonPhasesInMonth({ month, targetDeg, phaseKey, labelJa, timeZone, dict }) {
  const { startLocal, endLocal } = monthRange(month);
  const startIso = asOfIsoFromDateLocalJST(startLocal);
  const endIso = asOfIsoFromDateLocalJST(endLocal);
  if (!startIso || !endIso) return [];

  const items = [];
  let cursor = startIso;
  for (let guard = 0; guard < 8; guard++) {
    const next = findNextMoonPhase(cursor, targetDeg);
    if (!(next instanceof Date) || Number.isNaN(next.getTime())) break;
    if (next.toISOString() >= endIso) break;
    const base = buildMoonEventEntry({ date: next, timeZone, dict });
    if (base?.date_local?.startsWith(month)) {
      const isFull = phaseKey === "full";
      const nameInfo = isFull ? moonEventNameInfo({ kind: "full", date: next }) : null;
      const nameJa = isFull ? (nameInfo?.displayNameJa || nameInfo?.moonNameJa || "") : "";
      const nameEn = isFull ? (nameInfo?.displayNameEn || nameInfo?.moonNameEn || "") : "";
      items.push({
        ...base,
        phase_key: phaseKey,
        label: labelJa || null,
        moon_name_ja: isFull ? (nameJa || null) : null,
        moon_name_en: isFull ? (nameEn || null) : null,
      });
    }
    cursor = new Date(next.getTime() + 60 * 60 * 1000).toISOString();
  }
  return items;
}

function pickMoonEventInMonth({ month, targetDeg, timeZone, dict }) {
  const startLocal = `${month}-01`;
  const nextMonth = nextMonthStr(month);
  if (!nextMonth) return null;

  const endLocal = `${nextMonth}-01`;
  const startIso = asOfIsoFromDateLocalJST(startLocal);
  const endIso = asOfIsoFromDateLocalJST(endLocal);
  if (!startIso || !endIso) return null;

  let cursor = startIso;
  for (let guard = 0; guard < 6; guard++) {
    const next = findNextMoonPhase(cursor, targetDeg);
    if (!(next instanceof Date) || Number.isNaN(next.getTime())) return null;
    if (next.toISOString() >= endIso) return null;
    const entry = buildMoonEventEntry({ date: next, timeZone, dict });
    if (entry?.date_local?.startsWith(month)) return entry;
    cursor = new Date(next.getTime() + 60 * 60 * 1000).toISOString();
  }
  return null;
}

function filterRetrogradesForMonth({ items, startLocal, endLocal }) {
  return (items || [])
    .map((item) => {
      const start = item?.start_local || "";
      const end = item?.end_local || "";
      const shadowStart = item?.shadow_start_local || "";
      const shadowEnd = item?.shadow_end_local || "";
      if (!start || !end) return null;

      const overlapRetro = end >= startLocal && start < endLocal;
      const overlapShadow = shadowStart && shadowEnd
        ? shadowEnd >= startLocal && shadowStart < endLocal
        : false;

      if (!overlapRetro && !overlapShadow) return null;

      const activeStart = overlapRetro ? (start < startLocal ? startLocal : start) : null;
      const activeEnd = overlapRetro ? (end >= endLocal ? addDaysDateLocalJST(endLocal, -1) : end) : null;
      const isCarryIn = overlapRetro && start < startLocal;
      const isCarryOut = overlapRetro && end >= endLocal;
      const isShadowOnly = !overlapRetro && overlapShadow;

      return {
        ...item,
        active_in_month_start: activeStart,
        active_in_month_end: activeEnd,
        is_carry_in: isCarryIn,
        is_carry_out: isCarryOut,
        is_shadow_only_in_month: isShadowOnly,
      };
    })
    .filter(Boolean);
}

function buildSignIngressesForMonth({ month, planets }) {
  const { startLocal, endLocal } = monthRange(month);
  const dates = listDateLocalsInRange(startLocal, endLocal);
  const out = [];
  const prevSign = {};

  for (const dateLocal of dates) {
    const iso = asOfIsoFromDateLocalJST(dateLocal);
    if (!iso) continue;
    for (const planet of planets) {
      const lon = calcTransitLon(planet, iso);
      const signKey = signKeyFromLon(lon);
      const prev = prevSign[planet];
      if (prev && signKey && signKey !== prev) {
        out.push({ planet_key: planet, date_local: dateLocal, sign_key: signKey });
      }
      if (signKey) prevSign[planet] = signKey;
    }
  }

  return out;
}

function buildMonthlyAspects({ month, planets, aspects, orbLimit, maxItems }) {
  const { startLocal, endLocal } = monthRange(month);
  const dates = listDateLocalsInRange(startLocal, endLocal);
  const candidates = new Map();

  for (const dateLocal of dates) {
    const iso = asOfIsoFromDateLocalJST(dateLocal);
    if (!iso) continue;
    const lonMap = {};
    for (const planet of planets) {
      const lon = calcTransitLon(planet, iso);
      if (Number.isFinite(Number(lon))) lonMap[planet] = lon;
    }
    const keys = Object.keys(lonMap);
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = keys[i];
        const b = keys[j];
        const dist = absAngularDistance(lonMap[a], lonMap[b]);
        for (const aspect of aspects) {
          const orb = Math.abs(Number(dist) - Number(aspect.deg));
          if (!Number.isFinite(orb) || orb > orbLimit) continue;
          const key = `${dateLocal}|${a}|${b}|${aspect.key}`;
          const prev = candidates.get(key);
          if (!prev || orb < prev.orb_deg) {
            candidates.set(key, {
              date_local: dateLocal,
              a,
              b,
              aspect_key: aspect.key,
              aspect_deg: aspect.deg,
              orb_deg: Number(orb.toFixed(2)),
            });
          }
        }
      }
    }
  }

  const list = Array.from(candidates.values());
  list.sort((a, b) => {
    if (a.date_local !== b.date_local) return String(a.date_local).localeCompare(String(b.date_local));
    return Number(a.orb_deg) - Number(b.orb_deg);
  });
  if (!Number.isFinite(Number(maxItems)) || Number(maxItems) <= 0) return list;
  return list.slice(0, maxItems);
}

function buildPeaksFromAspects(aspects, maxItems) {
  const out = [];
  const seen = new Set();
  for (const aspect of aspects || []) {
    const dateLocal = aspect?.date_local;
    if (!dateLocal || seen.has(dateLocal)) continue;
    out.push({
      date_local: dateLocal,
      label: "aspect_peak",
      note: `${aspect.a}-${aspect.b}-${aspect.aspect_key}`,
    });
    seen.add(dateLocal);
    if (out.length >= maxItems) break;
  }
  return out;
}

function buildAspectPeaksForCalendar(aspects) {
  const picked = new Map();
  (aspects || []).forEach((aspect) => {
    if (!aspect?.a || !aspect?.b || !aspect?.aspect_key) return;
    const key = `${aspect.a}|${aspect.b}|${aspect.aspect_key}`;
    const prev = picked.get(key);
    if (!prev || Number(aspect.orb_deg) < Number(prev.orb_deg)) {
      picked.set(key, aspect);
    }
  });
  return Array.from(picked.values());
}

function buildHighlights({
  newMoon,
  fullMoon,
  retrogrades,
  signIngests,
  aspects,
  peaks,
  startLocal,
  endLocal,
}) {
  const base = [];
  if (newMoon?.date_local) base.push({ label: "new_moon", date_local: newMoon.date_local });
  if (fullMoon?.date_local) base.push({ label: "full_moon", date_local: fullMoon.date_local });

  const retroEvents = [];
  for (const r of retrogrades || []) {
    if (isDateInRange(r?.start_local, startLocal, endLocal)) {
      retroEvents.push({
        label: "retrograde_start",
        date_local: r.start_local,
        planet_key: r.planet_key,
        start_local: r.start_local,
        end_local: r.end_local,
      });
    }
    if (isDateInRange(r?.end_local, startLocal, endLocal)) {
      retroEvents.push({
        label: "retrograde_end",
        date_local: r.end_local,
        planet_key: r.planet_key,
        start_local: r.start_local,
        end_local: r.end_local,
      });
    }
  }
  retroEvents.sort((a, b) => String(a.date_local).localeCompare(String(b.date_local)));

  const ingressSorted = [...(signIngests || [])].sort((a, b) => String(a.date_local).localeCompare(String(b.date_local)));

  const aspectSorted = [...(aspects || [])].sort((a, b) => Number(a.orb_deg) - Number(b.orb_deg));
  const aspectPicked = aspectSorted.slice(0, HIGHLIGHT_ASPECT_LIMIT).map((aspect) => ({
    label: "aspect",
    date_local: aspect.date_local,
    note: `${aspect.a}-${aspect.b}-${aspect.aspect_key}`,
  }));

  const peakSorted = [...(peaks || [])].sort((a, b) => String(a.date_local).localeCompare(String(b.date_local)));
  const peakPicked = peakSorted.slice(0, HIGHLIGHT_PEAK_LIMIT).map((peak) => ({
    label: "peak",
    date_local: peak.date_local,
    note: peak.note || null,
  }));

  const reservedCount = base.length + aspectPicked.length + peakPicked.length;
  let remaining = Math.max(0, HIGHLIGHT_MAX_ITEMS - reservedCount);

  const retroPicked = retroEvents.slice(0, Math.min(HIGHLIGHT_RETRO_LIMIT, remaining));
  remaining -= retroPicked.length;

  const ingressPicked = ingressSorted
    .slice(0, Math.min(HIGHLIGHT_INGRESS_LIMIT, remaining))
    .map((ingress) => ({
      label: "sign_ingress",
      date_local: ingress.date_local,
      planet_key: ingress.planet_key,
    }));

  const out = [
    ...base,
    ...retroPicked,
    ...ingressPicked,
    ...aspectPicked,
    ...peakPicked,
  ];

  return out.slice(0, HIGHLIGHT_MAX_ITEMS);
}

function buildMonthlyOverviewReference({ month, timeZone, dict } = {}) {
  const monthStr = String(month || "").trim();
  if (!/^\d{4}-\d{2}$/.test(monthStr)) throw new Error("month must be YYYY-MM");

  const tz = timeZone || DEFAULT_TIME_ZONE;
  const useDict = dict || dictDefault;
  const { startLocal, endLocal } = monthRange(monthStr);
  if (!startLocal || !endLocal) throw new Error("invalid month range");

  const phases = [
    ...collectMoonPhasesInMonth({ month: monthStr, targetDeg: 0, phaseKey: "new", labelJa: moonPhaseLabelFromKey("new"), timeZone: tz, dict: useDict }),
    ...collectMoonPhasesInMonth({ month: monthStr, targetDeg: 90, phaseKey: "first_quarter", labelJa: moonPhaseLabelFromKey("first_quarter"), timeZone: tz, dict: useDict }),
    ...collectMoonPhasesInMonth({ month: monthStr, targetDeg: 180, phaseKey: "full", labelJa: moonPhaseLabelFromKey("full"), timeZone: tz, dict: useDict }),
    ...collectMoonPhasesInMonth({ month: monthStr, targetDeg: 270, phaseKey: "last_quarter", labelJa: moonPhaseLabelFromKey("last_quarter"), timeZone: tz, dict: useDict }),
  ].sort((a, b) => String(a.date_local).localeCompare(String(b.date_local)));

  const newMoon = phases.find((p) => p.phase_key === "new") || null;
  const fullMoon = phases.find((p) => p.phase_key === "full") || null;
  if (!newMoon || !fullMoon) {
    throw new Error(`moon events not found for month: ${monthStr}`);
  }

  const year = Number(monthStr.split("-")[0]);
  const retroYear = buildRetrogradesYearReference({ year, timeZone: tz, dict: useDict });
  const retrogrades = filterRetrogradesForMonth({
    items: retroYear.items,
    startLocal,
    endLocal,
  });

  const sign_ingresses = buildSignIngressesForMonth({
    month: monthStr,
    planets: SIGN_INGRESS_PLANETS,
  });

  const aspectDefs = Object.values(useDict?.ASPECTS_V2?.major || {}).map((item) => ({
    key: item?.key,
    deg: item?.deg,
  })).filter((item) => item.key && Number.isFinite(Number(item.deg)));

  const aspects = buildMonthlyAspects({
    month: monthStr,
    planets: ASPECT_PLANETS,
    aspects: aspectDefs,
    orbLimit: ASPECT_ORB_LIMIT,
    maxItems: ASPECT_MAX_ITEMS,
  });

  const peaks = buildPeaksFromAspects(aspects, PEAK_MAX_ITEMS);
  const highlights = buildHighlights({
    newMoon,
    fullMoon,
    retrogrades,
    signIngests: sign_ingresses,
    aspects,
    peaks,
    startLocal,
    endLocal,
  });

  const title = `${formatMonthLabel(monthStr)}の空模様`;
  const summary_tags = ["save", "monthly_ref"];

  return {
    type: "monthly_overview",
    version: "v1",
    month: monthStr,
    time_zone: tz,
    generated_at_utc: new Date().toISOString(),
    title,
    summary_tags,
    moon: {
      new_moon: newMoon,
      full_moon: fullMoon,
      phases,
    },
    retrogrades,
    sign_ingresses,
    aspects,
    peaks,
    highlights,
  };
}

function applyTokens(input, tokens) {
  if (typeof input === "string") {
    let out = input;
    for (const [key, value] of Object.entries(tokens || {})) {
      out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
    }
    return out;
  }
  if (Array.isArray(input)) {
    return input.map((item) => applyTokens(item, tokens));
  }
  if (input && typeof input === "object") {
    const out = {};
    for (const [key, value] of Object.entries(input)) {
      out[key] = applyTokens(value, tokens);
    }
    return out;
  }
  return input;
}

function loadHeaderTemplate() {
  const p = path.resolve(process.cwd(), "src/content/templates/instagram/header.v1.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function buildMonthlyOverviewDeck({ reference, template } = {}) {
  if (!reference || typeof reference !== "object") {
    throw new Error("reference is required");
  }
  const useDict = dictDefault;
  const base = template && typeof template === "object" ? template : {};
  const deckBase = JSON.parse(JSON.stringify(base));
  const monthLabel = formatMonthLabel(reference.month);
  const monthLabelEn = formatMonthLabelEn(reference.month);
  const monthDot = reference.month.replace("-", ".");
  const tokenMap = {
    month: reference.month,
    month_label: monthLabel,
    month_label_en: monthLabelEn,
    month_dot: monthDot,
  };
  const deck = applyTokens(deckBase, tokenMap);
  const { startLocal, endLocal } = monthRange(reference.month);

  deck.type = deck.type || "carousel_deck";
  deck.version = deck.version || "v1";
  deck.data = {
    ...(deck.data || {}),
    month: reference.month,
    time_zone: reference.time_zone,
  };

  const headerText = deck.header_text || {};
  const headerTemplate = loadHeaderTemplate();
  deck.header = applyTokens(headerTemplate, {
    ...tokenMap,
    brand: "ソラのこえ",
    primary: headerText.primary || "",
    secondary: headerText.secondary || "",
    sub_en: headerText.sub_en || "",
  });
  delete deck.header_text;

  const listByKey = {
    highlights: Array.isArray(reference.highlights) ? reference.highlights : [],
    moon: [reference.moon?.new_moon, reference.moon?.full_moon].filter(Boolean),
    phases: Array.isArray(reference.moon?.phases) ? reference.moon.phases : [],
    retrogrades: Array.isArray(reference.retrogrades) ? reference.retrogrades : [],
    sign_ingresses: Array.isArray(reference.sign_ingresses) ? reference.sign_ingresses : [],
    aspects: Array.isArray(reference.aspects) ? reference.aspects : [],
    peaks: Array.isArray(reference.peaks) ? reference.peaks : [],
  };

  if (Array.isArray(deck.slides)) {
    const builtSlides = [];
    deck.slides.forEach((slide) => {
      if (!slide) return;
      if (slide.type === "calendar") {
        const [y, m] = reference.month.split("-");
        const totalDays = daysInMonth(y, m);
        const firstWeekday = weekdayIndexJst(`${reference.month}-01`);
        const rawRows = Math.ceil((firstWeekday + totalDays) / 7);
        const rows = Math.max(5, rawRows);
        const cols = 7;
        const gridSize = rows * cols;
        const cells = Array.from({ length: gridSize }, (_, i) => ({
          row: Math.floor(i / cols),
          col: i % cols,
          date_local: null,
          day: null,
          weekday: i % cols,
          phase_icon: "",
          lines: [],
        }));

        const dates = listDateLocalsInRange(startLocal, endLocal);
        const phaseByDate = new Map();
        listByKey.phases.forEach((p) => {
          if (p?.date_local) phaseByDate.set(p.date_local, p);
        });

        const retroStartByDate = new Map();
        const retroEndByDate = new Map();
        listByKey.retrogrades.forEach((r) => {
          if (r?.start_local && isDateInRange(r.start_local, startLocal, endLocal)) {
            retroStartByDate.set(r.start_local, r);
          }
          if (r?.end_local && isDateInRange(r.end_local, startLocal, endLocal)) {
            retroEndByDate.set(r.end_local, r);
          }
        });

        const ingressByDate = new Map();
        listByKey.sign_ingresses.forEach((ingress) => {
          if (!ingress?.date_local) return;
          const list = ingressByDate.get(ingress.date_local) || [];
          list.push(ingress);
          ingressByDate.set(ingress.date_local, list);
        });

        const aspectByDate = new Map();
        const aspectPeaks = buildAspectPeaksForCalendar(listByKey.aspects);
        aspectPeaks.forEach((aspect) => {
          if (!aspect?.date_local) return;
          const current = aspectByDate.get(aspect.date_local);
          if (!current || Number(aspect.orb_deg) < Number(current.orb_deg)) {
            aspectByDate.set(aspect.date_local, aspect);
          }
        });

        dates.forEach((dateLocal, idx) => {
          const day = Number(dateLocal.slice(8, 10));
          const weekday = weekdayIndexJst(dateLocal);
          const gridIndex = firstWeekday + (day - 1);
          if (gridIndex < 0 || gridIndex >= cells.length) return;
          const cell = cells[gridIndex];
          cell.date_local = dateLocal;
          cell.day = day;
          cell.weekday = weekday;
          cell.phase_icon = dailyPhaseIcon(dateLocal);

          const items = [];
          let seq = 0;
          const pushItem = (priority, line) => {
            if (!line) return;
            items.push({ priority, seq, line });
            seq += 1;
          };
          const phase = phaseByDate.get(dateLocal);
          let phaseLineCount = 0;
          if (phase) {
            cell.phase_key = phase.phase_key || null;
            cell.phase_lines = formatPhaseLinesForCalendar(phase);
            phaseLineCount = Array.isArray(cell.phase_lines) ? cell.phase_lines.length : 0;
          }

          const retroStart = retroStartByDate.get(dateLocal);
          if (retroStart) {
            const lines = formatRetroLines(useDict, retroStart.planet_key, "start");
            lines.forEach((line) => pushItem(2, line));
          }
          const retroEnd = retroEndByDate.get(dateLocal);
          if (retroEnd) {
            const lines = formatRetroLines(useDict, retroEnd.planet_key, "end");
            lines.forEach((line) => pushItem(2, line));
          }

          const ingressList = ingressByDate.get(dateLocal) || [];
          ingressList.forEach((ingress) => {
            const planet = planetLabel(useDict, ingress.planet_key);
            const sign = signLabelJa(useDict, ingress.sign_key);
            pushItem(3, planet);
            pushItem(3, `→ ${sign}`);
          });

          items.sort((a, b) => (a.priority - b.priority) || (a.seq - b.seq));
          let lines = items.map((item) => item.line).filter(Boolean).slice(0, 2);
          let linesAlign = "left";
          if (lines.length === 0 && phaseLineCount <= 1) {
            const hasIngress = ingressByDate.has(dateLocal);
            if (!hasIngress) {
              const aspect = aspectByDate.get(dateLocal);
              if (aspect) {
                const aLine = planetGlyphWithSign(useDict, aspect.a, aspect.date_local);
                const bLine = planetGlyphWithSign(useDict, aspect.b, aspect.date_local);
                const symbol = aspectSymbol(aspect.aspect_key);
                const deg = Number.isFinite(Number(aspect.aspect_deg)) ? Math.round(Number(aspect.aspect_deg)) : null;
                const symbolLabel = deg != null ? `${symbol} ${deg}°` : symbol;
                lines = [aLine, symbolLabel, bLine].filter(Boolean).slice(0, 3);
                linesAlign = "center";
              }
            }
          }
          cell.lines = lines;
          cell.lines_align = linesAlign;
        });

        builtSlides.push({
          ...slide,
          calendar: {
            month: reference.month,
            week_start: "sun",
            weekdays: ["日", "月", "火", "水", "木", "金", "土"],
            rows,
            cols,
            phases: listByKey.phases,
            retrogrades: listByKey.retrogrades.map((r) => ({
              planet_key: r.planet_key,
              start_local: r.active_in_month_start || r.start_local,
              end_local: r.active_in_month_end || r.end_local,
              station_retrograde_local: r.station_retrograde_local || null,
              station_direct_local: r.station_direct_local || null,
              is_carry_in: r.is_carry_in === true,
              is_carry_out: r.is_carry_out === true,
            })),
            sign_ingresses: listByKey.sign_ingresses,
            cells,
          },
        });
        return;
      }

      if (slide.type === "timeline") {
        const events = [];
        listByKey.phases.forEach((p) => {
          events.push({
            date_local: p.date_local,
            kind: "phase",
            phase_key: p.phase_key || null,
            label: formatPhaseTimelineLabel(useDict, p),
            sign_key: p.sign_key || null,
          });
        });

        listByKey.retrogrades.forEach((r) => {
          if (isDateInRange(r.start_local, startLocal, endLocal)) {
          events.push({
            date_local: r.start_local,
            kind: "retrograde_start",
            planet_key: r.planet_key,
            label: formatRetroLines(useDict, r.planet_key, "start").join(" "),
          });
          }
          if (isDateInRange(r.end_local, startLocal, endLocal)) {
          events.push({
            date_local: r.end_local,
            kind: "retrograde_end",
            planet_key: r.planet_key,
            label: formatRetroLines(useDict, r.planet_key, "end").join(" "),
          });
          }
        });

        listByKey.sign_ingresses.forEach((ingress) => {
          events.push({
            date_local: ingress.date_local,
            kind: "sign_ingress",
            planet_key: ingress.planet_key,
            sign_key: ingress.sign_key,
            label: formatIngressLine(useDict, ingress.planet_key, ingress.sign_key, { short: false }),
          });
        });

        listByKey.aspects.forEach((aspect) => {
          const aLabel = planetLabelWithSign(useDict, aspect.a, aspect.date_local);
          const bLabel = planetLabelWithSign(useDict, aspect.b, aspect.date_local);
          const symbol = aspectSymbol(aspect.aspect_key);
          const deg = Number.isFinite(Number(aspect.aspect_deg)) ? Math.round(Number(aspect.aspect_deg)) : null;
          const mid = deg != null ? `${symbol} ${deg}°` : symbol;
          const label = [aLabel, mid, bLabel].filter(Boolean).join("　");
          events.push({
            date_local: aspect.date_local,
            kind: "aspect",
            a: aspect.a,
            b: aspect.b,
            aspect_key: aspect.aspect_key,
            label,
          });
        });

        // peaks are intentionally omitted from timeline to keep the log clean

        const kindOrder = {
          phase: 1,
          retrograde_start: 2,
          retrograde_end: 3,
          sign_ingress: 4,
          aspect: 5,
          peak: 6,
        };
        events.sort((a, b) => {
          if (a.date_local !== b.date_local) return String(a.date_local).localeCompare(String(b.date_local));
          return (kindOrder[a.kind] || 99) - (kindOrder[b.kind] || 99);
        });

        const limit = Number(slide.limit) || 0;
        const chunkSize = limit > 0 ? limit : events.length || 1;
        if (!events.length) {
          builtSlides.push({ ...slide, events: [] });
          return;
        }
        for (let i = 0; i < events.length; i += chunkSize) {
          const chunk = events.slice(i, i + chunkSize);
          const id = i === 0 ? slide.id : `${slide.id}_${Math.floor(i / chunkSize) + 1}`;
          builtSlides.push({
            ...slide,
            id,
            title: i === 0 ? slide.title : "",
            events: chunk,
          });
        }
        return;
      }

      if (slide.source && listByKey[slide.source]) {
        const rows = listByKey[slide.source].map((item) => ({ ...item }));
        builtSlides.push({ ...slide, rows });
        return;
      }

      builtSlides.push(slide);
    });
    deck.slides = builtSlides;
  }

  return deck;
}

module.exports = {
  buildMonthlyOverviewReference,
  buildMonthlyOverviewDeck,
};
