"use strict";

const { CANVAS, escapeXml, textBlock, richTextLine, baseSvg, renderSvgToPng } = require("../common/shared");
const { resolveColors } = require("../../theme");
const { buildHeaderBlock } = require("./shared");
const { calcTransitLon, absAngularDistance } = require("../../../../../domain/astro/compute");
const { buildMoonPhaseGlyph } = require("../../../../shared/moon_glyph");

const GRID = {
  marginX: 64,
  bottomMargin: 96,
  weekdayHeight: 44,
  cellPadX: 10,
  cellPadY: 10,
  dateSize: 22,
  phaseSize: 24,
  lineSize: 18,
  lineHeight: 24,
  gridRadius: 14,
};

function truncateLine(line, maxChars) {
  const text = String(line || "");
  if (!text) return "";
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;
  return `${chars.slice(0, Math.max(0, maxChars - 1)).join("")}…`;
}

function buildMoonGlyph({ dateLocal, x, y, size, colors }) {
  if (!dateLocal) return "";
  const iso = `${dateLocal}T12:00:00+09:00`;
  const sunLon = calcTransitLon("sun", iso);
  const moonLon = calcTransitLon("moon", iso);
  if (!Number.isFinite(Number(sunLon)) || !Number.isFinite(Number(moonLon))) return "";
  const phaseDeg = ((Number(moonLon) - Number(sunLon) + 360) % 360);
  const phaseAngle = absAngularDistance(moonLon, sunLon);
  const illumination = Number.isFinite(Number(phaseAngle))
    ? (1 - Math.cos((Number(phaseAngle) * Math.PI) / 180)) / 2
    : 0.5;
  const waxing = phaseDeg < 180;
  return buildMoonPhaseGlyph({
    id: `moon-${dateLocal}`,
    x,
    y,
    size,
    illumination,
    waxing,
    lightColor: colors.textSub,
    darkColor: "#050816",
  });
}

function buildLineSvg({ line, x, y, size, color, align = "start" }) {
  return richTextLine({
    x,
    y,
    text: line,
    size,
    color,
    fontFamily: "SoraBody",
    anchor: align === "middle" ? "middle" : "start",
  });
}

function buildGrid({ calendar, colors, headerBottomY }) {
  const rows = Math.max(4, Number(calendar?.rows) || 5);
  const cols = Math.max(1, Number(calendar?.cols) || 7);
  const weekdays = Array.isArray(calendar?.weekdays) ? calendar.weekdays : ["日", "月", "火", "水", "木", "金", "土"];

  const gridX = GRID.marginX;
  const gridY = headerBottomY;
  const gridWidth = CANVAS.width - GRID.marginX * 2;
  const gridHeight = CANVAS.height - gridY - GRID.bottomMargin;
  const cellWidth = gridWidth / cols;
  const cellHeight = (gridHeight - GRID.weekdayHeight) / rows;

  const stroke = colors.line;
  const strokeOpacity = 0.26;
  const strokeWidth = 1;

  const parts = [];
  parts.push(
    `<rect x="${gridX}" y="${gridY}" width="${gridWidth}" height="${gridHeight}" rx="${GRID.gridRadius}" ry="${GRID.gridRadius}" fill="#FFFFFF" fill-opacity="0.05"/>`
  );
  parts.push(
    `<rect x="${gridX}" y="${gridY}" width="${gridWidth}" height="${gridHeight}" rx="${GRID.gridRadius}" ry="${GRID.gridRadius}" fill="none" stroke="${stroke}" stroke-opacity="${strokeOpacity}" stroke-width="${strokeWidth}"/>`
  );

  const yWeek = gridY + GRID.weekdayHeight;
  parts.push(
    `<line x1="${gridX}" y1="${yWeek}" x2="${gridX + gridWidth}" y2="${yWeek}" stroke="${stroke}" stroke-opacity="${strokeOpacity}" stroke-width="${strokeWidth}"/>`
  );

  for (let r = 1; r < rows; r++) {
    const y = yWeek + r * cellHeight;
    parts.push(
      `<line x1="${gridX}" y1="${y}" x2="${gridX + gridWidth}" y2="${y}" stroke="${stroke}" stroke-opacity="${strokeOpacity}" stroke-width="${strokeWidth}"/>`
    );
  }

  for (let c = 1; c < cols; c++) {
    const x = gridX + c * cellWidth;
    parts.push(
      `<line x1="${x}" y1="${gridY}" x2="${x}" y2="${gridY + gridHeight}" stroke="${stroke}" stroke-opacity="${strokeOpacity}" stroke-width="${strokeWidth}"/>`
    );
  }

  const weekdayY = gridY + GRID.weekdayHeight * 0.7;
  for (let c = 0; c < cols; c++) {
    const label = weekdays[c] || "";
    const x = gridX + c * cellWidth + cellWidth / 2;
    parts.push(
      `<text x="${x}" y="${weekdayY}" text-anchor="middle" fill="${colors.textDim}" font-size="${GRID.dateSize}" font-family="SoraTitle" letter-spacing="0.16em">${escapeXml(label)}</text>`
    );
  }

  const cellMap = new Map();
  (calendar?.cells || []).forEach((cell) => {
    if (cell && Number.isFinite(Number(cell.row)) && Number.isFinite(Number(cell.col))) {
      cellMap.set(`${cell.row}-${cell.col}`, cell);
    }
  });

  let firstWeekday = 0;
  for (const cell of cellMap.values()) {
    if (Number(cell.day) === 1 && Number.isFinite(Number(cell.col))) {
      firstWeekday = Number(cell.col);
      break;
    }
  }
  const monthLabel = String(calendar?.month || "");
  const [mYear, mMonth] = monthLabel.split("-").map((v) => Number(v));
  const monthEndDay = Number.isFinite(mYear) && Number.isFinite(mMonth)
    ? new Date(mYear, mMonth, 0).getDate()
    : 31;
  const monthStartLabel = monthLabel ? `${monthLabel}-01` : "";
  const monthEndLabel = monthLabel ? `${monthLabel}-${String(monthEndDay).padStart(2, "0")}` : "";

  const retroBars = [];
  const retroRowTopY = new Map();
  const retroBarColors = [colors.textMain, "#9DCFFF", "#8DE5C3"];
  const retroItems = Array.isArray(calendar?.retrogrades) ? calendar.retrogrades : [];
  retroItems.forEach((retro, idx) => {
    const startRaw = retro?.start_local;
    const endRaw = retro?.end_local;
    const start = (monthStartLabel && startRaw && startRaw > monthStartLabel) ? startRaw : monthStartLabel || startRaw;
    const end = (monthEndLabel && endRaw && endRaw < monthEndLabel) ? endRaw : monthEndLabel || endRaw;
    if (!start || !end) return;
    const startDay = Number(start.slice(8, 10));
    const endDay = Number(end.slice(8, 10));
    if (!Number.isFinite(startDay) || !Number.isFinite(endDay)) return;
    const startIndex = firstWeekday + (startDay - 1);
    const endIndex = firstWeekday + (endDay - 1);
    const startRow = Math.floor(startIndex / cols);
    const endRow = Math.floor(endIndex / cols);
    const barColor = retroBarColors[idx % retroBarColors.length];
    const barOffset = (idx % retroBarColors.length) * 4;
    for (let row = startRow; row <= endRow; row++) {
      const segStartCol = row === startRow ? startIndex % cols : 0;
      const segEndCol = row === endRow ? endIndex % cols : cols - 1;
      const x1 = gridX + segStartCol * cellWidth + 10;
      const x2 = gridX + (segEndCol + 1) * cellWidth - 10;
      const y = yWeek + row * cellHeight + cellHeight - 6 - barOffset;
      retroBars.push(
        `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${barColor}" stroke-opacity="0.55" stroke-width="3" stroke-linecap="round"/>`
      );
      const rowTop = retroRowTopY.get(row);
      if (!Number.isFinite(rowTop) || y < rowTop) {
        retroRowTopY.set(row, y);
      }
    }
  });

  parts.push(retroBars.join(""));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cellMap.get(`${r}-${c}`) || null;
      const day = cell?.day;
      if (!day) continue;
      const cellX = gridX + c * cellWidth;
      const cellY = yWeek + r * cellHeight;

      const isInMonth = cell?.in_month !== false;
      const dateX = cellX + GRID.cellPadX;
      const dateY = cellY + GRID.cellPadY + GRID.dateSize;
      parts.push(
        `<text x="${dateX}" y="${dateY}" fill="${isInMonth ? colors.textMain : colors.textDim}" fill-opacity="${isInMonth ? 1 : 0.45}" font-size="${GRID.dateSize}" font-family="SoraBodyMedium" letter-spacing="0.04em">${escapeXml(String(day))}</text>`
      );

      if (!isInMonth) continue;

      const phaseX = cellX + cellWidth - GRID.cellPadX - GRID.phaseSize;
      const phaseY = cellY + GRID.cellPadY + 2;
      const moonGlyph = buildMoonGlyph({
        dateLocal: cell.date_local,
        x: phaseX,
        y: phaseY,
        size: GRID.phaseSize,
        colors,
      });
      if (moonGlyph) parts.push(moonGlyph);

      const phaseLines = (cell?.phase_lines || []).map((line) => truncateLine(line, 12)).filter(Boolean).slice(0, 3);
      const contentTop = cellY + GRID.cellPadY + Math.max(GRID.dateSize, GRID.phaseSize) + 6;
      const rowRetroY = retroRowTopY.get(r);
      const contentBottom = Number.isFinite(rowRetroY)
        ? Math.max(contentTop + GRID.lineHeight, rowRetroY - 6)
        : cellY + cellHeight - GRID.cellPadY;
      const contentCenter = contentTop + (contentBottom - contentTop) / 2;
      if (phaseLines.length) {
        const centerX = cellX + cellWidth / 2;
        const phaseLineHeight = GRID.lineHeight + 4;
        const phaseBlockHeight = phaseLineHeight * (phaseLines.length - 1);
        const centerY = contentCenter - phaseBlockHeight / 2;
        parts.push(
          textBlock({
            x: centerX,
            y: centerY,
            lines: phaseLines,
            size: GRID.lineSize,
            lineHeight: phaseLineHeight,
            color: colors.textSub,
            fontFamily: "SoraBodyMedium",
            letterSpacing: 0.02,
            anchor: "middle",
          })
        );
      }

      const lineLimit = phaseLines.length > 0 ? 0 : 3;
      const lines = (cell?.lines || []).map((line) => truncateLine(line, 10)).filter(Boolean).slice(0, lineLimit);
      if (lines.length) {
        const align = cell?.lines_align === "center" ? "middle" : "start";
        const linesX = align === "middle" ? cellX + cellWidth / 2 : cellX + GRID.cellPadX;
        const blockHeight = GRID.lineHeight * (lines.length - 1);
        const linesY = contentCenter - blockHeight / 2;
        lines.forEach((line, i) => {
          const y = linesY + i * GRID.lineHeight;
          parts.push(buildLineSvg({
            line,
            x: linesX,
            y,
            size: GRID.lineSize,
            color: colors.textSub,
            align,
          }));
        });
      }
    }
  }

  return parts.join("");
}

function getAvoidRegions(data = {}) {
  const header = data?.header || {};
  const colors = resolveColors(data?.space);
  const { bottomY } = buildHeaderBlock({ header, colors });

  const gridY = bottomY;
  const gridX = GRID.marginX;
  const gridWidth = CANVAS.width - GRID.marginX * 2;
  const gridHeight = CANVAS.height - gridY - GRID.bottomMargin;

  return [
    { x: 0, y: 0, w: CANVAS.width, h: gridY, weight: 1, feather: 10, kind: "header" },
    { x: gridX, y: gridY, w: gridWidth, h: gridHeight, weight: 1, feather: 8, kind: "grid" },
  ];
}

function buildSlide1Svg(data = {}) {
  const calendar = data.calendar || {};
  const colors = resolveColors(data.space);
  const { svg: headerSvg, bottomY } = buildHeaderBlock({ header: data.header, colors });
  const gridSvg = buildGrid({ calendar, colors, headerBottomY: bottomY });
  const inner = [headerSvg, gridSvg].join("");
  return baseSvg(inner, data.space);
}

async function renderSlide1(data) {
  const svg = buildSlide1Svg(data);
  return renderSvgToPng(svg);
}

module.exports = {
  buildSlide1Svg,
  getAvoidRegions,
  getTextFields: getAvoidRegions,
  renderSlide1,
};
