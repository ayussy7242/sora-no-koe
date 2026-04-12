"use strict";

const path = require("path");
const { toDateLocalJST, asOfIsoFromDateLocalJST, formatDateLabel } = require("../../../utils/time");

const DEFAULT_TIME_ZONE = "Asia/Tokyo";
const DEFAULT_OUTPUT_BASE_DIR = path.join(process.cwd(), "dist", "instagram", "monthly_overview_reel");
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

function normalizeMonthInput(month, fallbackDate = new Date()) {
  const raw = String(month || "").trim();
  if (!raw) {
    const ymd = toDateLocalJST(fallbackDate);
    return ymd ? ymd.slice(0, 7) : "";
  }
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(0, 7);
  return "";
}

function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function buildDateLocalsForMonth(month) {
  const [yRaw, mRaw] = String(month || "").split("-");
  const year = Number(yRaw);
  const monthNum = Number(mRaw);
  if (!Number.isFinite(year) || !Number.isFinite(monthNum)) return [];
  if (monthNum < 1 || monthNum > 12) return [];
  const total = daysInMonth(year, monthNum - 1);
  const mm = String(monthNum).padStart(2, "0");
  const out = [];
  for (let d = 1; d <= total; d += 1) {
    out.push(`${year}-${mm}-${String(d).padStart(2, "0")}`);
  }
  return out;
}

function formatDayLabel(dateLocal) {
  const parts = String(dateLocal || "").split("-");
  if (parts.length !== 3) return "";
  const mm = parts[1] || "";
  const dd = parts[2] || "";
  if (!mm || !dd) return "";
  return `${mm}.${dd}`;
}

function formatMonthLabelEn(month) {
  const [yRaw, mRaw] = String(month || "").split("-");
  const year = Number(yRaw);
  const monthNum = Number(mRaw);
  if (!Number.isFinite(year) || !Number.isFinite(monthNum)) return String(month || "");
  const idx = monthNum - 1;
  if (idx < 0 || idx >= MONTH_NAMES.length) return String(month || "");
  return `${MONTH_NAMES[idx]} ${year}`;
}

function buildMonthlyOverviewReelCaption({ month } = {}) {
  const label = formatMonthLabelEn(month);
  return [
    `The sky of ${label},`,
    "placed as a flow of time.",
    "",
    "Sky Structure",
  ].join("\n");
}

function extractMonthDayNumber(dateLocal) {
  const parts = String(dateLocal || "").split("-");
  if (parts.length !== 3) return { monthNumber: null, dayNumber: null };
  const monthNumber = Number(parts[1]);
  const dayNumber = Number(parts[2]);
  return {
    monthNumber: Number.isFinite(monthNumber) ? monthNumber : null,
    dayNumber: Number.isFinite(dayNumber) ? dayNumber : null,
  };
}

function buildMonthlyOverviewReelPlan({
  month,
  timezone = DEFAULT_TIME_ZONE,
  outputBaseDir = DEFAULT_OUTPUT_BASE_DIR,
  highlightDateLocal = null,
} = {}) {
  const normalizedMonth = normalizeMonthInput(month);
  if (!/^\d{4}-\d{2}$/.test(normalizedMonth)) {
    throw new Error("month must be YYYY-MM");
  }

  const dateLocals = buildDateLocalsForMonth(normalizedMonth);
  const totalDays = dateLocals.length;
  const outputDir = path.join(outputBaseDir, normalizedMonth);
  const bgSeed = { month: normalizedMonth, timezone };

  const days = dateLocals.map((dateLocal, idx) => {
    const asOfISO = asOfIsoFromDateLocalJST(dateLocal);
    const { monthNumber, dayNumber } = extractMonthDayNumber(dateLocal);
    return {
      dateLocal,
      asOfISO,
      dayIndex: idx + 1,
      totalDays,
      dayLabel: formatDayLabel(dateLocal),
      dayNumber,
      monthNumber,
      wheelInput: {
        dateLocal,
        asOfISO,
        dateLabel: formatDateLabel(dateLocal),
      },
      isHighlighted: highlightDateLocal ? dateLocal === highlightDateLocal : false,
    };
  });

  return {
    month: normalizedMonth,
    timezone,
    outputDir,
    bgSeed,
    totalDays,
    days,
    caption: buildMonthlyOverviewReelCaption({ month: normalizedMonth }),
  };
}

module.exports = {
  buildMonthlyOverviewReelPlan,
  normalizeMonthInput,
  buildDateLocalsForMonth,
  formatDayLabel,
  formatMonthLabelEn,
  buildMonthlyOverviewReelCaption,
  extractMonthDayNumber,
};
