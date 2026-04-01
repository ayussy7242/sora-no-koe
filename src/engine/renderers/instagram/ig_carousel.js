"use strict";

const fs = require("fs");
const path = require("path");
const { buildSpaceBackground, buildSpaceSeedLabel } = require("../../shared/space_background");
const { isSpaceDebug } = require("../../shared/space_background/utils");
const { CANVAS, formatDateLabel } = require("./slides/common/shared");
const SLIDE_SETS = require("./slides");

const DEFAULT_SET_KEY = "daily";
const DEFAULT_SET = SLIDE_SETS[DEFAULT_SET_KEY];
const {
  slide1,
  slide2,
  slide3,
  slide4,
  slide5,
  slideMoon,
  placements,
} = DEFAULT_SET;
const { buildSlide1Svg, renderSlide1, getAvoidRegions: getSlide1AvoidRegions } = slide1;
const { buildSlide2BaseSvg, renderSlide2, getAvoidRegions: getSlide2AvoidRegions } = slide2;
const { buildSlidePlacementsSvg, renderSlidePlacements, getAvoidRegions: getSlidePlacementsAvoidRegions } = placements;
const { buildSlide3Svg, renderSlide3, getAvoidRegions: getSlide3AvoidRegions } = slide3;
const { buildSlideMoonSvg, renderSlideMoon, getAvoidRegions: getSlideMoonAvoidRegions } = slideMoon;
const { buildSlide4Svg, renderSlide4, getAvoidRegions: getSlide4AvoidRegions } = slide4;
const { buildSlide5Svg, renderSlide5, getAvoidRegions: getSlide5AvoidRegions } = slide5;

const SLIDE_RENDERER_CACHE = new Map();

function buildSlideRenderers(setKey) {
  const set = SLIDE_SETS[setKey] || SLIDE_SETS[DEFAULT_SET_KEY];
  const s1 = set.slide1;
  const s2 = set.slide2;
  const s3 = set.slide3;
  const s4 = set.slide4;
  const s5 = set.slide5;
  const sMoon = set.slideMoon;
  const sPlacements = set.placements;

  return {
    slide1: { variant: "slide1", render: s1.renderSlide1, getAvoidRegions: s1.getAvoidRegions },
    cover: { variant: "slide1", render: s1.renderSlide1, getAvoidRegions: s1.getAvoidRegions },
    placements: { variant: "slide2", render: sPlacements.renderSlidePlacements, getAvoidRegions: sPlacements.getAvoidRegions },
    slidePlacements: { variant: "slide2", render: sPlacements.renderSlidePlacements, getAvoidRegions: sPlacements.getAvoidRegions },
    moon: { variant: "moon", render: sMoon.renderSlideMoon, getAvoidRegions: sMoon.getAvoidRegions },
    slideMoon: { variant: "moon", render: sMoon.renderSlideMoon, getAvoidRegions: sMoon.getAvoidRegions },
    chart: { variant: "slide2", render: s2.renderSlide2, getAvoidRegions: s2.getAvoidRegions },
    slide2: { variant: "slide2", render: s2.renderSlide2, getAvoidRegions: s2.getAvoidRegions },
    resonance: { variant: "slide3", render: s3.renderSlide3, getAvoidRegions: s3.getAvoidRegions },
    slide3: { variant: "slide3", render: s3.renderSlide3, getAvoidRegions: s3.getAvoidRegions },
    tsukiji: { variant: "slide4", render: s4.renderSlide4, getAvoidRegions: s4.getAvoidRegions },
    slide4: { variant: "slide4", render: s4.renderSlide4, getAvoidRegions: s4.getAvoidRegions },
    cta: { variant: "slide5", render: s5.renderSlide5, getAvoidRegions: s5.getAvoidRegions },
    slide5: { variant: "slide5", render: s5.renderSlide5, getAvoidRegions: s5.getAvoidRegions },
  };
}

function getSlideRenderers(setKey) {
  const key = String(setKey || DEFAULT_SET_KEY);
  if (SLIDE_RENDERER_CACHE.has(key)) return SLIDE_RENDERER_CACHE.get(key);
  const built = buildSlideRenderers(key);
  SLIDE_RENDERER_CACHE.set(key, built);
  return built;
}

function resolveRenderer(kind, renderers) {
  const map = renderers || getSlideRenderers(DEFAULT_SET_KEY);
  return map[kind] || map.slide1;
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

function buildSpaceConfigKey(spaceConfig) {
  if (!spaceConfig || typeof spaceConfig !== "object") return "default";
  const entries = [
    ["starDensityScale", spaceConfig.starDensityScale],
    ["milkyIntensityScale", spaceConfig.milkyIntensityScale],
    ["milkyThicknessScale", spaceConfig.milkyThicknessScale],
    ["milkyDustScale", spaceConfig.milkyDustScale],
    ["whiteMix", spaceConfig.whiteMix],
    ["moonEventKind", spaceConfig.moonEventKind],
    ["moonEventStyle", spaceConfig.moonEventStyle],
    ["moonEventCenter", spaceConfig.moonEventCenter],
    ["moonEventIntensity", spaceConfig.moonEventIntensity],
  ]
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => {
      const num = Number(v);
      if (Number.isFinite(num)) return `${k}:${num.toFixed(3)}`;
      return `${k}:${String(v)}`;
    });
  if (!entries.length) return "default";
  return hashString(entries.join("|"));
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

function buildAvoidRegionsForSlides({ slides, width, renderers }) {
  if (!Array.isArray(slides) || !slides.length) return [];
  const regions = [];
  slides.forEach((item, index) => {
    const kind = item?.kind || "slide1";
    const data = item?.data || item || {};
    const renderer = resolveRenderer(kind, renderers);
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
  slideSet = DEFAULT_SET_KEY,
  seedVariant,
  onSlide,
  spaceConfig = null,
} = {}) {
  const useCallback = typeof onSlide === "function";
  if (Array.isArray(slides) && slides.length) {
    const slideSetKey = slideSet || DEFAULT_SET_KEY;
    const renderers = getSlideRenderers(slideSetKey);
    const debug = isSpaceDebug();
    const firstStory = slides.map((s) => s?.data?.story || s?.story).find(Boolean) || null;
    const firstDateLabel = slides.map((s) => s?.data?.dateLabel || s?.dateLabel).find(Boolean) || "";
    const seedDate = firstStory?.meta?.date_local || firstStory?.public?.date_local || firstDateLabel || "";
    const seedLabel = buildSpaceSeedLabel({
      seedVersion: "v2",
      channel: "ig",
      date: seedDate,
      variant: String(seedVariant || slideSetKey || DEFAULT_SET_KEY),
      prefixChannel: true,
    });
    const baseArgs = {
      story: firstStory,
      dateLabel: firstDateLabel,
      seedLabel,
      width: CANVAS.width,
      height: CANVAS.height,
      spaceConfig,
    };
    const worldWidth = CANVAS.width * slides.length;
    const avoidRegions = buildAvoidRegionsForSlides({ slides, width: CANVAS.width, renderers });
    const spaceConfigKey = buildSpaceConfigKey(spaceConfig);
    const out = [];
    for (let i = 0; i < slides.length; i++) {
      const item = slides[i];
      const kind = item?.kind || "slide1";
      const data = item?.data || item || {};
      const renderer = resolveRenderer(kind, renderers);
      const space = (() => {
        if (data.space) return data.space;
        const cacheDir = backgroundCache?.dir || "";
        const force = backgroundCache?.force === true;
        if (cacheDir) {
          const localRegions = avoidRegions.filter((r) => r?.slideIndex === i);
          const avoidKey = buildAvoidKey(localRegions);
          const key = [firstDateLabel || "date", slideSetKey, kind, i + 1, slides.length, renderer.variant, avoidKey, spaceConfigKey].join("_");
          const cachePath = path.join(cacheDir, `${key}.json`);
          const cached = !force ? loadSpaceCache(cachePath) : null;
          if (cached) {
            if (debug) console.log("[space] disk_cache", { hit: true, key, seedLabel });
            return cached;
          }
          if (debug) console.log("[space] disk_cache", { hit: false, key, seedLabel });
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
      const buffer = await renderer.render({ ...data, space });
      if (useCallback) {
        await onSlide({ index: i, total: slides.length, buffer, kind, data, slideSet: slideSetKey });
      } else {
        out.push(buffer);
      }
    }
    return useCallback ? { ok: true, count: slides.length } : out;
  }

  const story = slide2?.story || slide1?.story || slide3?.story || slide4?.story || null;
  const dateLabel = slide1?.dateLabel || slide2?.dateLabel || slide3?.dateLabel || slide4?.dateLabel || "";
  const seedDate = story?.meta?.date_local || story?.public?.date_local || dateLabel || "";
  const slideOrder = [
    { key: "slide1", data: slide1 },
    { key: "placements", data: slidePlacements },
    { key: "slideMoon", data: slideMoon },
    { key: "slide2", data: slide2 },
    { key: "slide3", data: slide3 },
    { key: "slide4", data: slide4 },
    { key: "slide5", data: slide5 },
  ].filter((item) => item.data);
  const slideSetKey = slideSet || DEFAULT_SET_KEY;
  const seedLabel = buildSpaceSeedLabel({
    seedVersion: "v2",
    channel: "ig",
    date: seedDate,
    variant: String(seedVariant || slideSetKey || DEFAULT_SET_KEY),
    prefixChannel: true,
  });
    const baseArgs = { story, dateLabel, seedLabel, width: CANVAS.width, height: CANVAS.height, spaceConfig };
    const renderers = getSlideRenderers(slideSetKey);
    const debug = isSpaceDebug();
    const worldWidth = CANVAS.width * slideOrder.length;
    const avoidRegions = buildAvoidRegionsForSlides({
      slides: slideOrder.map((item) => ({ kind: item.key, data: item.data })),
      width: CANVAS.width,
      renderers,
    });
    const spaceConfigKey = buildSpaceConfigKey(spaceConfig);

  const out = [];
  for (let i = 0; i < slideOrder.length; i++) {
    const item = slideOrder[i];
    const renderer = resolveRenderer(item.key, renderers);
    const space = (() => {
      if (item.data?.space) return item.data.space;
      const cacheDir = backgroundCache?.dir || "";
      const force = backgroundCache?.force === true;
      if (cacheDir) {
        const localRegions = avoidRegions.filter((r) => r?.slideIndex === i);
        const avoidKey = buildAvoidKey(localRegions);
        const key = [dateLabel || "date", slideSetKey, item.key, i + 1, slideOrder.length, renderer.variant, avoidKey, spaceConfigKey].join("_");
        const cachePath = path.join(cacheDir, `${key}.json`);
        const cached = !force ? loadSpaceCache(cachePath) : null;
        if (cached) {
          if (debug) console.log("[space] disk_cache", { hit: true, key, seedLabel });
          return cached;
        }
        if (debug) console.log("[space] disk_cache", { hit: false, key, seedLabel });
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
    const buffer = await renderer.render({ ...item.data, space });
    if (useCallback) {
      await onSlide({ index: i, total: slideOrder.length, buffer, kind: item.key, data: item.data, slideSet: slideSetKey });
    } else {
      out.push(buffer);
    }
  }
  return useCallback ? { ok: true, count: slideOrder.length } : out;
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
