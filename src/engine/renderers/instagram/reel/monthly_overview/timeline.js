"use strict";

const { COLORS, clamp, buildTimelineFrame } = require("./shared");

function normalizeTotalDays(totalDays) {
  const n = Math.round(Number(totalDays));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

function normalizeActiveDay(activeDay, totalDays) {
  const total = normalizeTotalDays(totalDays);
  if (total <= 0) return 0;
  const day = Math.round(Number(activeDay));
  if (!Number.isFinite(day)) return 1;
  return clamp(day, 1, total);
}

function buildTimelineSvg({
  totalDays,
  activeDay,
  x,
  y,
  width,
  height,
  colors,
} = {}) {
  const total = normalizeTotalDays(totalDays);
  if (total <= 0) return "";

  const active = normalizeActiveDay(activeDay, total);
  const frame = {
    x: Number.isFinite(Number(x)) ? Number(x) : null,
    y: Number.isFinite(Number(y)) ? Number(y) : null,
    width: Number.isFinite(Number(width)) ? Number(width) : null,
    height: Number.isFinite(Number(height)) ? Number(height) : null,
  };
  const fallback = buildTimelineFrame();
  const fx = frame.x != null ? frame.x : fallback.x;
  const fy = frame.y != null ? frame.y : fallback.y;
  const fw = frame.width != null ? frame.width : fallback.width;
  const fh = frame.height != null ? frame.height : fallback.height;

  const palette = { ...COLORS, ...(colors || {}) };
  const padX = Math.max(24, Math.round(fw * 0.03));
  const lineY = fy + fh * 0.5;
  const lineWidth = clamp(Math.round(fh * 0.015), 1, 3);
  const tickSmall = clamp(Math.round(fh * 0.08), 4, 10);
  const tickActive = clamp(Math.round(fh * 0.22), 14, 28);
  const left = fx + padX;
  const right = fx + fw - padX;
  const span = Math.max(1, right - left);

  const parts = [];
  parts.push(
    `<line x1="${left}" y1="${lineY}" x2="${right}" y2="${lineY}" stroke="${palette.inactive}" stroke-width="${lineWidth}" stroke-linecap="round"/>`
  );

  for (let i = 0; i < total; i += 1) {
    const ratio = total === 1 ? 0.5 : i / (total - 1);
    const px = left + ratio * span;
    const isActive = i + 1 === active;
    const tickHeight = isActive ? tickActive : tickSmall;
    const stroke = isActive ? palette.active : palette.inactive;
    const strokeWidth = isActive ? lineWidth + 1 : Math.max(1, lineWidth);
    const y1 = lineY - tickHeight * 0.5;
    const y2 = lineY + tickHeight * 0.5;
    parts.push(
      `<line x1="${px}" y1="${y1}" x2="${px}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`
    );
    if (isActive) {
      const r = Math.max(2, Math.round(lineWidth + 1));
      parts.push(`<circle cx="${px}" cy="${lineY}" r="${r}" fill="${stroke}"/>`);
    }
  }

  return `<g class="timeline-band">${parts.join("")}</g>`;
}

module.exports = {
  buildTimelineSvg,
  normalizeTotalDays,
  normalizeActiveDay,
};
