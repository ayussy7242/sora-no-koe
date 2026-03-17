"use strict";

const sharp = require("sharp");
const { buildSpaceBackground } = require("../../engine/shared/space_background");
const { fontFaceCss } = require("../../engine/channels/ig/assets/ig_fonts");
const { resolveColors } = require("../../engine/channels/ig/theme/ig_theme");

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

function buildTitleLayer({ title, colors }) {
  const resolved = colors || resolveColors();
  const x = CANVAS.width / 2;
  const y = 220;
  const size = 52;
  const tracking = 0.12;
  const opacity = Number.isFinite(resolved?.textTheme?.subtitle?.opacity) ? resolved.textTheme.subtitle.opacity : 0.82;

  return `
    <text x="${x}" y="${y}" text-anchor="middle"
      fill="${resolved.textSub}" opacity="${opacity}"
      font-size="${size}" font-family="SoraTitle" letter-spacing="${tracking}em">
      ${escapeXml(title)}
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
  titles = ["今日の空", "今日の共鳴", "明日の空"],
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
  renderStoryBackgroundSet,
};
