"use strict";

const sharp = require("sharp");
const { buildSoraWheelSvg } = require("../../../../engine/graphics/sora_wheel");
const { fontFaceCss } = require("../../../../engine/renderers/instagram/assets/fonts");
const { escapeXml } = require("../../../../utils/data/xml");
const {
  CANVAS,
  SAFE,
  LAYOUT,
  TYPO,
  COLORS,
  clamp,
  buildLayout,
  resolveContentFrame,
} = require("./shared");
const { buildTimelineSvg } = require("./timeline");
const { buildMonthlySpace } = require("./background");

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

function formatMonthTitle(month) {
  const [yRaw, mRaw] = String(month || "").split("-");
  const year = Number(yRaw);
  const monthIndex = Number(mRaw) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return String(month || "");
  if (monthIndex < 0 || monthIndex >= MONTH_NAMES.length) return String(month || "");
  return `${MONTH_NAMES[monthIndex]} ${year}`;
}

function baseSvg(inner, space) {
  const { width, height } = CANVAS;
  const bg = space || buildMonthlySpace({ width, height }).space;
  const defs = `<style>${fontFaceCss()}</style>${bg?.defs || ""}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs>${defs}</defs>`,
    bg?.body || "",
    inner || "",
    `</svg>`,
  ].join("");
}

function overlaySvg(inner) {
  const { width, height } = CANVAS;
  const defs = `<style>${fontFaceCss()}</style>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs>${defs}</defs>`,
    inner || "",
    `</svg>`,
  ].join("");
}

function buildHeaderSvg({ title, yOffset = 0 }) {
  const layout = buildLayout();
  const centerX = CANVAS.width / 2;
  const y = layout.header.top + Math.round(TYPO.titleSize * 1.1) + Math.round(yOffset);
  if (!title) return "";
  return `<text x="${centerX}" y="${y}" text-anchor="middle" fill="${COLORS.text}" font-size="${TYPO.titleSize}" font-family="SoraTitle" letter-spacing="0.08em">${escapeXml(title)}</text>`;
}

function buildDayLabelSvg({ dayLabel }) {
  if (!dayLabel) return "";
  const layout = buildLayout();
  const x = CANVAS.width - SAFE.right;
  const y = layout.timeline.bottom - Math.round(TYPO.dateSize * 0.2);
  const dayColor = "rgba(255,255,255,0.72)";
  return `<text x="${x}" y="${y}" text-anchor="end" fill="${dayColor}" font-size="${TYPO.dateSize}" font-family="SoraTitle" letter-spacing="0.08em">${escapeXml(dayLabel)}</text>`;
}

function resolveWheelPlacement(layout) {
  const content = resolveContentFrame();
  const maxSize = Math.min(content.width, layout.wheel.height, LAYOUT.wheelAreaTarget);
  const minSize = Math.max(0, Math.round(layout.wheel.height * 0.72));
  const wheel = clamp(Math.round(maxSize * 1.02), minSize, Math.round(layout.wheel.height * 0.985));
  const left = Math.round(content.x + (content.width - wheel) / 2);
  const top = Math.round(layout.wheel.top + (layout.wheel.height - wheel) / 2);
  return { wheel, left, top };
}

function buildOutroSvg({ title, subtitle } = {}) {
  const centerX = CANVAS.width / 2;
  const titleText = title || "";
  const subtitleText = subtitle || "";
  const titleSize = Math.round(TYPO.titleSize * 0.9);
  const subSize = Math.max(20, Math.round(TYPO.titleSize * 0.42));
  const gap = Math.round(subSize * 1.4);
  const centerY = CANVAS.height * 0.5;
  const titleY = Math.round(centerY - gap * 0.2);
  const subY = Math.round(titleY + gap);
  const parts = [];
  if (titleText) {
    parts.push(
      `<text x="${centerX}" y="${titleY}" text-anchor="middle" fill="${COLORS.text}" font-size="${titleSize}" font-family="SoraTitle" letter-spacing="0.08em">${escapeXml(titleText)}</text>`
    );
  }
  if (subtitleText) {
    parts.push(
      `<text x="${centerX}" y="${subY}" text-anchor="middle" fill="${COLORS.textDim}" font-size="${subSize}" font-family="SoraTitle" letter-spacing="0.14em">${escapeXml(subtitleText)}</text>`
    );
  }
  return parts.join("");
}

async function renderMonthlyOverviewFrame({
  story,
  month,
  title,
  dayLabel,
  totalDays,
  activeDay,
  wheelInput,
  space,
  spaceConfig,
  seedLabel,
  variant,
  backgroundBuffer,
  backgroundPath,
} = {}) {
  if (!story) throw new Error("renderMonthlyOverviewFrame: story required");

  const layout = buildLayout();
  const headerTitle = title || formatMonthTitle(month);
  const headerSvg = buildHeaderSvg({ title: headerTitle, yOffset: 24 });
  const timelineSvg = buildTimelineSvg({
    totalDays,
    activeDay,
    x: layout.content.x,
    y: layout.timeline.top,
    width: layout.content.width,
    height: layout.timeline.height,
  });
  const daySvg = buildDayLabelSvg({ dayLabel });

  let base = null;
  if (backgroundBuffer) {
    base = sharp(backgroundBuffer);
  } else if (backgroundPath) {
    base = sharp(backgroundPath);
  } else {
    const spaceBuilt = space || buildMonthlySpace({
      month,
      width: CANVAS.width,
      height: CANVAS.height,
      spaceConfig,
      seedLabel,
      variant,
    }).space;
    const backgroundSvg = baseSvg("", spaceBuilt);
    base = sharp(Buffer.from(backgroundSvg));
  }

  const overlay = overlaySvg([headerSvg, timelineSvg, daySvg].join(""));

  const { wheel, left, top } = resolveWheelPlacement(layout);
  const dateLabel = wheelInput?.dateLabel || "";
  const wheelSvg = buildSoraWheelSvg({
    story,
    dateLabel,
    size: wheel,
    showAspects: true,
    showHouses: false,
    ascLonDeg: null,
    mcLonDeg: null,
  });

  const composed = base.composite([
    { input: Buffer.from(overlay), top: 0, left: 0 },
    { input: Buffer.from(wheelSvg), top, left },
  ]);
  return composed.png({ compressionLevel: 9 }).toBuffer();
}

async function renderMonthlyOverviewOutroFrame({
  month,
  title,
  subtitle = "Sky Structure",
  space,
  spaceConfig,
  seedLabel,
  variant,
  backgroundBuffer,
  backgroundPath,
} = {}) {
  const headerTitle = title || formatMonthTitle(month);
  let base = null;
  if (backgroundBuffer) {
    base = sharp(backgroundBuffer);
  } else if (backgroundPath) {
    base = sharp(backgroundPath);
  } else {
    const spaceBuilt = space || buildMonthlySpace({
      month,
      width: CANVAS.width,
      height: CANVAS.height,
      spaceConfig,
      seedLabel,
      variant,
    }).space;
    const backgroundSvg = baseSvg("", spaceBuilt);
    base = sharp(Buffer.from(backgroundSvg));
  }

  const overlay = overlaySvg(buildOutroSvg({ title: headerTitle, subtitle }));
  const composed = base.composite([{ input: Buffer.from(overlay), top: 0, left: 0 }]);
  return composed.png({ compressionLevel: 9 }).toBuffer();
}

module.exports = {
  renderMonthlyOverviewFrame,
  renderMonthlyOverviewOutroFrame,
  formatMonthTitle,
  resolveWheelPlacement,
  buildHeaderSvg,
  buildDayLabelSvg,
  buildOutroSvg,
};
