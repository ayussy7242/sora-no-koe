"use strict";

const { CANVAS, escapeXml, richTextLine, baseSvg, renderSvgToPng } = require("../common/shared");
const { buildSectionHeader } = require("../common/header");
const { resolveColors } = require("../../theme");
const { buildHeaderBlock } = require("./shared");

const LAYOUT = {
  marginX: 88,
  bottomMargin: 96,
  dateSize: 28,
  labelSize: 30,
  dateColumnWidth: 124,
  sameDayGap: 22,
  dateGap: 36,
  tableRadius: 14,
};

function formatDateLabel(dateLocal) {
  if (!dateLocal) return "";
  const raw = String(dateLocal);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return `${raw.slice(5, 7)}/${raw.slice(8, 10)}`;
}

function buildTimeline({ events, title, colors, headerBottomY }) {
  const list = Array.isArray(events) ? events : [];
  const hasTitle = Boolean(title);
  const sectionY = headerBottomY + 24;
  const headerSvg = hasTitle
    ? buildSectionHeader({
        label: title,
        x: LAYOUT.marginX,
        y: sectionY,
        lineWidth: 280,
        colors,
      })
    : "";

  const listTop = hasTitle ? sectionY + 42 : headerBottomY + 46;
  const tableTop = listTop - LAYOUT.labelSize;
  const topPad = listTop - tableTop;
  const tableX = LAYOUT.marginX;
  const tableWidth = CANVAS.width - LAYOUT.marginX * 2;
  const columnX = tableX + LAYOUT.dateColumnWidth;
  const labelX = columnX + 28;

  const grouped = [];
  list.forEach((event) => {
    const date = event?.date_local || "";
    const label = event?.label || "";
    if (!date || !label) return;
    const last = grouped[grouped.length - 1];
    if (last && last.date_local === date) {
      if (last.labels.length < 3) last.labels.push(label);
    } else {
      grouped.push({ date_local: date, labels: [label] });
    }
  });

  const rows = [];
  let cursorY = listTop + LAYOUT.labelSize;
  let contentBottom = cursorY;
  grouped.forEach((group) => {
    const dateLabel = formatDateLabel(group.date_local);
    const textOpacity = 0.9;

    if (dateLabel) {
      const dateX = LAYOUT.marginX + LAYOUT.dateColumnWidth / 2;
      rows.push(
        `<text x="${dateX}" y="${cursorY}" text-anchor="middle" fill="${colors.textDim}" font-size="${LAYOUT.dateSize}" font-family="SoraTitle" letter-spacing="0.08em">${escapeXml(dateLabel)}</text>`
      );
    }
    if (group.labels.length) {
      rows.push(
        richTextLine({
          x: labelX,
          y: cursorY,
          text: group.labels[0],
          size: LAYOUT.labelSize,
          color: colors.textSub,
          fontFamily: "SoraBody",
          anchor: "start",
        }).replace("<text ", `<text opacity="${textOpacity}" `)
      );
    }

    let localY = cursorY;
    for (let i = 1; i < group.labels.length; i++) {
      localY += LAYOUT.sameDayGap + LAYOUT.labelSize;
      rows.push(
        richTextLine({
          x: labelX,
          y: localY,
          text: group.labels[i],
          size: LAYOUT.labelSize,
          color: colors.textSub,
          fontFamily: "SoraBody",
          anchor: "start",
        }).replace("<text ", `<text opacity="${textOpacity}" `)
      );
    }

    contentBottom = localY + LAYOUT.labelSize;
    cursorY = localY + LAYOUT.dateGap + LAYOUT.labelSize;
  });

  const bottomPad = Math.max(10, Math.round(topPad * 0.6));
  const tableBottom = Math.min(CANVAS.height - bottomPad, contentBottom + bottomPad);
  const tableHeight = Math.max(0, tableBottom - tableTop);

  const tableLines = [
    `<rect x="${tableX}" y="${tableTop}" width="${tableWidth}" height="${tableHeight}" rx="${LAYOUT.tableRadius}" ry="${LAYOUT.tableRadius}" fill="none" stroke="${colors.line}" stroke-opacity="0.1" stroke-width="1"/>`,
    `<line x1="${columnX}" y1="${tableTop}" x2="${columnX}" y2="${tableTop + tableHeight}" stroke="${colors.line}" stroke-opacity="0.08" stroke-width="1"/>`,
  ].join("");

  return `${headerSvg}${tableLines}${rows.join("")}`;
}

function getAvoidRegions(data = {}) {
  const header = data?.header || {};
  const colors = resolveColors(data?.space);
  const { bottomY } = buildHeaderBlock({ header, colors });

  const listTop = bottomY + 24;
  return [
    { x: 0, y: 0, w: CANVAS.width, h: listTop, weight: 1, feather: 10, kind: "header" },
    { x: LAYOUT.marginX, y: listTop, w: CANVAS.width - LAYOUT.marginX * 2, h: CANVAS.height - listTop - LAYOUT.bottomMargin, weight: 1, feather: 8, kind: "timeline" },
  ];
}

function buildSlide2Svg(data = {}) {
  const colors = resolveColors(data.space);
  const { svg: headerSvg, bottomY } = buildHeaderBlock({ header: data.header, colors });
  const timelineSvg = buildTimeline({
    events: data.events,
    title: data.title,
    colors,
    headerBottomY: bottomY,
  });
  const inner = [headerSvg, timelineSvg].join("");
  return baseSvg(inner, data.space);
}

async function renderSlide2(data) {
  const svg = buildSlide2Svg(data);
  return renderSvgToPng(svg);
}

module.exports = {
  buildSlide2Svg,
  getAvoidRegions,
  getTextFields: getAvoidRegions,
  renderSlide2,
};
