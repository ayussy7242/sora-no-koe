"use strict";

const CANVAS = {
  width: 1080,
  height: 1920,
};

const SAFE = {
  top: 120,
  bottom: 220,
  left: 80,
  right: 80,
};

const LAYOUT = {
  headerHeight: 200,
  wheelAreaTarget: 1000,
  timelineHeight: 180,
  footerPadding: 80,
};

const TYPO = {
  titleSize: 64,
  dateSize: 36,
  timelineLabelSize: 18,
};

const COLORS = {
  text: "rgba(255,255,255,0.9)",
  textDim: "rgba(255,255,255,0.5)",
  active: "#ffffff",
  inactive: "rgba(255,255,255,0.2)",
};

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  if (Number.isFinite(min) && n < min) return min;
  if (Number.isFinite(max) && n > max) return max;
  return n;
}

function resolveContentFrame() {
  const x = SAFE.left;
  const y = SAFE.top;
  const width = CANVAS.width - SAFE.left - SAFE.right;
  const height = CANVAS.height - SAFE.top - SAFE.bottom;
  return { x, y, width, height };
}

function buildLayout() {
  const content = resolveContentFrame();
  const headerTop = content.y;
  const headerBottom = headerTop + LAYOUT.headerHeight;
  const timelineBottom = content.y + content.height;
  const timelineTop = timelineBottom - LAYOUT.timelineHeight;
  const wheelTop = headerBottom;
  const wheelBottom = timelineTop - LAYOUT.footerPadding;
  const wheelHeight = Math.max(0, wheelBottom - wheelTop);

  return {
    content,
    header: {
      top: headerTop,
      bottom: headerBottom,
      height: LAYOUT.headerHeight,
    },
    wheel: {
      top: wheelTop,
      bottom: wheelBottom,
      height: wheelHeight,
      target: LAYOUT.wheelAreaTarget,
    },
    timeline: {
      top: timelineTop,
      bottom: timelineBottom,
      height: LAYOUT.timelineHeight,
    },
    footerPadding: LAYOUT.footerPadding,
  };
}

function buildTimelineFrame(layout = buildLayout()) {
  const content = layout?.content || resolveContentFrame();
  return {
    x: content.x,
    y: layout.timeline.top,
    width: content.width,
    height: layout.timeline.height,
  };
}

module.exports = {
  CANVAS,
  SAFE,
  LAYOUT,
  TYPO,
  COLORS,
  clamp,
  resolveContentFrame,
  buildLayout,
  buildTimelineFrame,
};
