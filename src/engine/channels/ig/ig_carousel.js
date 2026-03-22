"use strict";

const fs = require("fs");
const path = require("path");
const { buildSpaceBackground } = require("../../shared/space_background");
const { CANVAS, formatDateLabel } = require("./renderers/shared");
const { buildSlide1Svg, renderSlide1, getAvoidRegions: getSlide1AvoidRegions } = require("./renderers/slide_1");
const { buildSlide2BaseSvg, renderSlide2, getAvoidRegions: getSlide2AvoidRegions } = require("./renderers/slide_2");
const { buildSlidePlacementsSvg, renderSlidePlacements, getAvoidRegions: getSlidePlacementsAvoidRegions } = require("./renderers/slide_placements");
const { buildSlide3Svg, renderSlide3, getAvoidRegions: getSlide3AvoidRegions } = require("./renderers/slide_3");
const { buildSlideMoonSvg, renderSlideMoon, getAvoidRegions: getSlideMoonAvoidRegions } = require("./renderers/slide_moon");
const { buildSlide4Svg, renderSlide4, getAvoidRegions: getSlide4AvoidRegions } = require("./renderers/slide_4");
const { buildSlide5Svg, renderSlide5, getAvoidRegions: getSlide5AvoidRegions } = require("./renderers/slide_5");

const SLIDE_RENDERERS = {
  slide1: { variant: "slide1", render: renderSlide1, getAvoidRegions: getSlide1AvoidRegions },
  cover: { variant: "slide1", render: renderSlide1, getAvoidRegions: getSlide1AvoidRegions },
  placements: { variant: "slide2", render: renderSlidePlacements, getAvoidRegions: getSlidePlacementsAvoidRegions },
  slidePlacements: { variant: "slide2", render: renderSlidePlacements, getAvoidRegions: getSlidePlacementsAvoidRegions },
  moon: { variant: "moon", render: renderSlideMoon, getAvoidRegions: getSlideMoonAvoidRegions },
  slideMoon: { variant: "moon", render: renderSlideMoon, getAvoidRegions: getSlideMoonAvoidRegions },
  chart: { variant: "slide2", render: renderSlide2, getAvoidRegions: getSlide2AvoidRegions },
  slide2: { variant: "slide2", render: renderSlide2, getAvoidRegions: getSlide2AvoidRegions },
  resonance: { variant: "slide3", render: renderSlide3, getAvoidRegions: getSlide3AvoidRegions },
  slide3: { variant: "slide3", render: renderSlide3, getAvoidRegions: getSlide3AvoidRegions },
  tsukiji: { variant: "slide4", render: renderSlide4, getAvoidRegions: getSlide4AvoidRegions },
  slide4: { variant: "slide4", render: renderSlide4, getAvoidRegions: getSlide4AvoidRegions },
  cta: { variant: "slide5", render: renderSlide5, getAvoidRegions: getSlide5AvoidRegions },
  slide5: { variant: "slide5", render: renderSlide5, getAvoidRegions: getSlide5AvoidRegions },
};

const FALLBACK_RENDERER = SLIDE_RENDERERS.slide1;

function resolveRenderer(kind) {
  return SLIDE_RENDERERS[kind] || FALLBACK_RENDERER;
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function buildAvoidKey(regions) {
  if (!Array.isArray(regions) || regions.length === 0) return "none";
  const raw = regions.map((r) => {
    const x = Math.round(Number(r?.x) || 0);
    const y = Math.round(Number(r?.y) || 0);
    const w = Math.round(Number(r?.w) || 0);
    const h = Math.round(Number(r?.h) || 0);
    const s = Math.round((Number.isFinite(Number(r?.weight)) ? Number(r.weight) : 1) * 100);
    const f = Math.round(Number(r?.feather) || 0);
    const k = r?.kind || "";
    return `${x},${y},${w},${h},${s},${f},${k}`;
  }).join("|");
  return hashString(raw);
}

function loadSpaceCache(cachePath) {
  try {
    if (!cachePath || !fs.existsSync(cachePath)) return null;
    const raw = fs.readFileSync(cachePath, "utf8");
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function saveSpaceCache(cachePath, space) {
  try {
    if (!cachePath || !space) return;
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(space), "utf8");
  } catch (_) {
    // ignore cache write errors
  }
}

function buildAvoidRegionsForSlides({ slides, width }) {
  if (!Array.isArray(slides) || !slides.length) return [];
  const regions = [];
  slides.forEach((item, index) => {
    const kind = item?.kind || "slide1";
    const data = item?.data || item || {};
    const renderer = resolveRenderer(kind);
    const getter = renderer?.getAvoidRegions;
    if (typeof getter !== "function") return;
    const localRegions = getter(data) || [];
    localRegions.forEach((region) => {
      if (!region) return;
      regions.push({
        ...region,
        x: (Number(region.x) || 0) + width * index,
        slideIndex: index,
      });
    });
  });
  return regions;
}

async function renderInstagramCarousel({
  slides,
  slide1,
  slidePlacements,
  slideMoon,
  slide2,
  slide3,
  slide4,
  slide5,
  backgroundCache = null,
} = {}) {
  if (Array.isArray(slides) && slides.length) {
    const firstStory = slides.map((s) => s?.data?.story || s?.story).find(Boolean) || null;
    const firstDateLabel = slides.map((s) => s?.data?.dateLabel || s?.dateLabel).find(Boolean) || "";
    const baseArgs = { story: firstStory, dateLabel: firstDateLabel, width: CANVAS.width, height: CANVAS.height };
    const worldWidth = CANVAS.width * slides.length;
    const avoidRegions = buildAvoidRegionsForSlides({ slides, width: CANVAS.width });
    const out = [];
    for (let i = 0; i < slides.length; i++) {
      const item = slides[i];
      const kind = item?.kind || "slide1";
      const data = item?.data || item || {};
      const renderer = resolveRenderer(kind);
      const space = (() => {
        if (data.space) return data.space;
        const cacheDir = backgroundCache?.dir || "";
        const force = backgroundCache?.force === true;
        if (cacheDir) {
          const localRegions = avoidRegions.filter((r) => r?.slideIndex === i);
          const avoidKey = buildAvoidKey(localRegions);
          const key = [firstDateLabel || "date", kind, i + 1, slides.length, renderer.variant, avoidKey].join("_");
          const cachePath = path.join(cacheDir, `${key}.json`);
          const cached = !force ? loadSpaceCache(cachePath) : null;
          if (cached) return cached;
          const built = buildSpaceBackground({
            ...baseArgs,
            variant: renderer.variant,
            worldWidth,
            offsetX: CANVAS.width * i,
            avoidRegions,
          });
          saveSpaceCache(cachePath, built);
          return built;
        }
        return buildSpaceBackground({
          ...baseArgs,
          variant: renderer.variant,
          worldWidth,
          offsetX: CANVAS.width * i,
          avoidRegions,
        });
      })();
      out.push(await renderer.render({ ...data, space }));
    }
    return out;
  }

  const story = slide2?.story || slide1?.story || slide3?.story || slide4?.story || null;
  const dateLabel = slide1?.dateLabel || slide2?.dateLabel || slide3?.dateLabel || slide4?.dateLabel || "";
  const baseArgs = { story, dateLabel, width: CANVAS.width, height: CANVAS.height };
  const slideOrder = [
    { key: "slide1", data: slide1 },
    { key: "placements", data: slidePlacements },
    { key: "slideMoon", data: slideMoon },
    { key: "slide2", data: slide2 },
    { key: "slide3", data: slide3 },
    { key: "slide4", data: slide4 },
    { key: "slide5", data: slide5 },
  ].filter((item) => item.data);
  const worldWidth = CANVAS.width * slideOrder.length;
  const avoidRegions = buildAvoidRegionsForSlides({
    slides: slideOrder.map((item) => ({ kind: item.key, data: item.data })),
    width: CANVAS.width,
  });

  const out = [];
  for (let i = 0; i < slideOrder.length; i++) {
    const item = slideOrder[i];
    const renderer = resolveRenderer(item.key);
    const space = (() => {
      if (item.data?.space) return item.data.space;
      const cacheDir = backgroundCache?.dir || "";
      const force = backgroundCache?.force === true;
      if (cacheDir) {
        const localRegions = avoidRegions.filter((r) => r?.slideIndex === i);
        const avoidKey = buildAvoidKey(localRegions);
        const key = [dateLabel || "date", item.key, i + 1, slideOrder.length, renderer.variant, avoidKey].join("_");
        const cachePath = path.join(cacheDir, `${key}.json`);
        const cached = !force ? loadSpaceCache(cachePath) : null;
        if (cached) return cached;
        const built = buildSpaceBackground({
          ...baseArgs,
          variant: renderer.variant,
          worldWidth,
          offsetX: CANVAS.width * i,
          avoidRegions,
        });
        saveSpaceCache(cachePath, built);
        return built;
      }
      return buildSpaceBackground({
        ...baseArgs,
        variant: renderer.variant,
        worldWidth,
        offsetX: CANVAS.width * i,
        avoidRegions,
      });
    })();
    out.push(await renderer.render({ ...item.data, space }));
  }
  return out;
}

module.exports = {
  buildSlide1Svg,
  buildSlide2BaseSvg,
  buildSlidePlacementsSvg,
  buildSlide3Svg,
  buildSlideMoonSvg,
  buildSlide4Svg,
  buildSlide5Svg,
  renderSlide1,
  renderSlide2,
  renderSlidePlacements,
  renderSlide3,
  renderSlideMoon,
  renderSlide4,
  renderSlide5,
  renderInstagramCarousel,
  formatDateLabel,
};
