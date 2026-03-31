"use strict";

const sharp = require("sharp");
const { buildSpaceBackground } = require("../../../shared/space_background");
const { fontFaceCss } = require("../assets/ig_fonts");
const { resolveColors } = require("../theme/ig_theme");

const CANVAS = {
  width: 1080,
  height: 1920,
};

function escapeXml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function baseSvg({ inner, space }) {
  const { width, height } = CANVAS;
  const bg = space || buildSpaceBackground({ width, height });
  const defs = `<style>${fontFaceCss()}</style>${bg.defs}`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs>${defs}</defs>`,
    bg.body,
    inner || "",
    `</svg>`,
  ].join("");
}

function normalizeTitleInput(title) {
  if (title && typeof title === "object") {
    const ja = title.ja || title.jp || title.title || "";
    const en = title.en || title.enTitle || "";
    return { ja, en };
  }
  const raw = String(title || "").trim();
  if (!raw) return { ja: "", en: "" };
  if (raw.includes("\n")) {
    const [ja, en] = raw.split("\n");
    return { ja: (ja || "").trim(), en: (en || "").trim() };
  }
  if (raw.includes(" / ")) {
    const [ja, en] = raw.split(" / ");
    return { ja: (ja || "").trim(), en: (en || "").trim() };
  }
  return { ja: raw, en: "" };
}

function buildTitleLayer({ title, colors }) {
  const resolved = colors || resolveColors();
  const { ja, en } = normalizeTitleInput(title);
  const x = CANVAS.width / 2;
  const hasEn = Boolean(en);
  const jaSize = hasEn ? 56 : 52;
  const enSize = 26;
  const jaTracking = 0.12;
  const enTracking = 0.16;
  const jaOpacity = Number.isFinite(resolved?.textTheme?.subtitle?.opacity) ? resolved.textTheme.subtitle.opacity : 0.82;
  const enOpacity = Math.min(jaOpacity, 0.7);
  const yJa = hasEn ? 210 : 220;
  const yEn = yJa + 42;

  if (!hasEn) {
    return `
      <text x="${x}" y="${yJa}" text-anchor="middle"
        fill="${resolved.textSub}" opacity="${jaOpacity}"
        font-size="${jaSize}" font-family="SoraTitle" letter-spacing="${jaTracking}em">
        ${escapeXml(ja)}
      </text>
    `.trim();
  }

  return `
    <text x="${x}" y="${yJa}" text-anchor="middle"
      fill="${resolved.textSub}" opacity="${jaOpacity}"
      font-size="${jaSize}" font-family="SoraTitle" letter-spacing="${jaTracking}em">
      ${escapeXml(ja)}
    </text>
    <text x="${x}" y="${yEn}" text-anchor="middle"
      fill="${resolved.textSub}" opacity="${enOpacity}"
      font-size="${enSize}" font-family="SoraBody" letter-spacing="${enTracking}em">
      ${escapeXml(en)}
    </text>
  `.trim();
}

function storyAvoidRegions({ index = 0 } = {}) {
  const { width, height } = CANVAS;
  const baseX = width * index;
  return [
    {
      x: baseX + width * 0.08,
      y: height * 0.28,
      w: width * 0.84,
      h: height * 0.56,
      weight: 1,
      feather: 70,
      slideIndex: index,
    },
  ];
}

async function renderStoryBackground({ title, space }) {
  const colors = resolveColors(space);
  const svg = baseSvg({
    inner: buildTitleLayer({ title, colors }),
    space,
  });
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

async function renderStoryBackgroundSet({
  story,
  dateLabel,
  titles = [
    { ja: "今日の空", en: "Today's Sky" },
    { ja: "今日の共鳴", en: "Today's Resonance" },
    { ja: "明日の空", en: "Tomorrow's Sky" },
  ],
  variants = ["story_today", "story_resonance", "story_tomorrow"],
} = {}) {
  const width = CANVAS.width;
  const height = CANVAS.height;
  const worldWidth = width * titles.length;
  const avoidRegions = titles.flatMap((_, i) => storyAvoidRegions({ index: i }));

  const baseArgs = { story, dateLabel, width, height };
  const buffers = [];

  for (let i = 0; i < titles.length; i++) {
    const space = buildSpaceBackground({
      ...baseArgs,
      variant: variants[i] || "story_today",
      worldWidth,
      offsetX: width * i,
      avoidRegions,
    });
    buffers.push(await renderStoryBackground({ title: titles[i], space }));
  }

  return buffers;
}

module.exports = {
  CANVAS,
  renderStoryBackground,
  renderStoryBackgroundSet,
};
