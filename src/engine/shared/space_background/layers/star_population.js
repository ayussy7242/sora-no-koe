"use strict";

const { clamp, lerp, hashString, mulberry32 } = require("../utils");
const { pickStarColorByTemperature } = require("./star_temperature");

let didLogProfileWeights = false;
const { placeAlongStream, placeInCluster, placeInDeepField, placeRandomSparse } = require("./star_placement");

function samplePowerLaw(rand, min, max, power) {
  const p = Number.isFinite(Number(power)) ? Number(power) : -1.4;
  const lo = Math.max(0.0001, min);
  const hi = Math.max(lo + 0.0001, max);
  if (Math.abs(p + 1) < 1e-6) {
    const u = rand();
    return lo * Math.pow(hi / lo, u);
  }
  const p1 = p + 1;
  const loP = Math.pow(lo, p1);
  const hiP = Math.pow(hi, p1);
  const u = rand();
  return Math.pow(loP + (hiP - loP) * u, 1 / p1);
}

function sampleStarSize({ rand, min, max, power }) {
  const size = samplePowerLaw(rand, min, max, power);
  return clamp(size, min, max);
}

const DEPTH_RATIOS_BASE = { far: 0.62, mid: 0.24, near: 0.1, hero: 0.04 };

function adjustDepthRatios(modality) {
  const ratios = { ...DEPTH_RATIOS_BASE };
  const mod = String(modality || "mixed");
  if (mod === "fixed") {
    ratios.near += 0.03;
    ratios.hero += 0.01;
    ratios.far -= 0.02;
    ratios.mid -= 0.02;
  } else if (mod === "mutable") {
    ratios.far += 0.04;
    ratios.mid += 0.02;
    ratios.near -= 0.03;
    ratios.hero -= 0.03;
  } else if (mod === "cardinal") {
    ratios.mid += 0.02;
    ratios.near += 0.02;
    ratios.far -= 0.03;
    ratios.hero -= 0.01;
  }
  const sum = ratios.far + ratios.mid + ratios.near + ratios.hero;
  return {
    far: ratios.far / sum,
    mid: ratios.mid / sum,
    near: ratios.near / sum,
    hero: ratios.hero / sum,
  };
}

function sampleStarCounts({ theme, densityScale = 1, totalStars = null, densityBias = 1 }) {
  const densityFactor = lerp(0.92, 1.12, clamp(theme?.concentration ?? 0.35, 0, 1));
  const base = totalStars != null ? totalStars : Math.round(1150 * densityScale * densityFactor * clamp(densityBias, 0.7, 1.4));
  const ratios = adjustDepthRatios(theme?.modality);
  const far = Math.max(0, Math.round(base * ratios.far));
  const mid = Math.max(0, Math.round(base * ratios.mid));
  const near = Math.max(0, Math.round(base * ratios.near));
  const hero = Math.max(1, Math.round(base * ratios.hero));
  return { total: base, depthCounts: { far, mid, near, hero } };
}

const PROFILE_WEIGHTS = {
  far: {
    dust: 0.26,
    micro: 0.5,
    small: 0.24,
  },
  mid: {
    micro: 0.24,
    small: 0.52,
    medium: 0.19,
    bright: 0.04,
    giant: 0.01,
  },
  near: {
    medium: 0.38,
    bright: 0.35,
    giant: 0.05,
    spark: 0.08,
    red: 0.14,
  },
  hero: {
    giant: 0.15,
    bright: 0.34,
    spark: 0.24,
    red: 0.27,
  },
};

const PROFILE_RULES = {
  dust: { size: [0.2, 0.4], brightness: [0.04, 0.1], spikes: 0, chroma: 0, bloom: 0 },
  micro: { size: [0.35, 0.65], brightness: [0.12, 0.22], spikes: 0, chroma: 0.02, bloom: 0.04 },
  small: { size: [0.7, 1.05], brightness: [0.195, 0.32], spikes: 0, chroma: 0.04, bloom: 0.08 },
  medium: { size: [1.0, 1.5], brightness: [0.29, 0.48], spikes: 0.06, chroma: 0.08, bloom: 0.16 },
  bright: { size: [1.8, 3.0], brightness: [0.52, 0.78], spikes: 0.22, chroma: 0.12, bloom: 0.28 },
  giant: { size: [2.8, 4.5], brightness: [0.8, 1.0], spikes: 0.36, chroma: 0.18, bloom: 0.38 },
  spark: { size: [1.2, 1.9], brightness: [0.65, 0.9], spikes: 0.45, chroma: 0.06, bloom: 0.12 },
  red: { size: [1.6, 2.4], brightness: [0.6, 0.85], spikes: 0.06, chroma: 0.1, bloom: 0.24 },
};

function pickWeighted(rand, weights) {
  const entries = Object.entries(weights || {});
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rand() * total;
  for (const [key, w] of entries) {
    if (roll < w) return key;
    roll -= w;
  }
  return entries[0]?.[0] || "small";
}

function normalizeWeights(weights) {
  const entries = Object.entries(weights || {});
  const total = entries.reduce((s, [, w]) => s + w, 0) || 1;
  const out = {};
  entries.forEach(([k, v]) => {
    out[k] = v / total;
  });
  return out;
}

function adjustProfileWeights(base, multipliers = {}) {
  const adjusted = {};
  Object.keys(base || {}).forEach((key) => {
    const mul = Number.isFinite(Number(multipliers[key])) ? Number(multipliers[key]) : 1;
    adjusted[key] = base[key] * mul;
  });
  return normalizeWeights(adjusted);
}

function pickSource(depth, rand, hasDeepRegions, hasClusters) {
  const options = {
    far: [
      { key: "deep", w: hasDeepRegions ? 0.55 : 0.0 },
      { key: "stream", w: 0.2 },
      { key: "random", w: 0.25 },
    ],
    mid: [
      { key: "stream", w: 0.35 },
      { key: "random", w: 0.3 },
      { key: "cluster", w: hasClusters ? 0.2 : 0.0 },
      { key: "deep", w: hasDeepRegions ? 0.15 : 0.0 },
    ],
    near: [
      { key: "cluster", w: hasClusters ? 0.45 : 0.0 },
      { key: "stream", w: 0.35 },
      { key: "random", w: 0.2 },
    ],
    hero: [
      { key: "cluster", w: hasClusters ? 0.55 : 0.0 },
      { key: "stream", w: 0.3 },
      { key: "random", w: 0.15 },
    ],
  };
  const list = options[depth] || options.mid;
  const total = list.reduce((s, v) => s + v.w, 0) || 1;
  let roll = rand() * total;
  for (const item of list) {
    if (roll < item.w) return item.key;
    roll -= item.w;
  }
  return "random";
}

function sampleStarSeed({ depth, profile, rand, colorWeights, tone }) {
  const rules = PROFILE_RULES[profile] || PROFILE_RULES.small;
  const power = depth === "far" ? -1.6 : depth === "mid" ? -1.4 : depth === "near" ? -1.1 : -0.8;
  const size = sampleStarSize({ rand, min: rules.size[0], max: rules.size[1], power });
  const brightness = lerp(rules.brightness[0], rules.brightness[1], rand());
  const pick = pickStarColorByTemperature(rand, colorWeights, tone);
  return {
    depth,
    profile,
    size,
    brightness,
    spikeStrength: rules.spikes,
    chromaStrength: rules.chroma,
    bloomStrength: rules.bloom,
    temp: pick.temp,
    color: pick.color,
    haloColor: pick.haloColor,
    outerHaloColor: pick.outerHaloColor,
  };
}

function placeStar({
  source,
  rand,
  width,
  height,
  stream,
  streamNodes,
  streamGaps,
  sphereClusters,
  regions,
  voids,
  avoidCenter,
  avoidCircles,
  avoidRect,
  avoidMask,
  densityAt,
  bias,
  preferLowDensity,
  returnRegion = false,
}) {
  if (source === "deep") {
    return placeInDeepField({ rand, regions: regions?.deepFieldRegions || [], width, height, voids, avoidRect, avoidMask });
  }
  if (source === "cluster") {
    return placeInCluster({ rand, clusters: regions?.anchorClusters || [], width, height, voids, avoidRect, avoidMask, returnRegion });
  }
  if (source === "stream") {
    return placeAlongStream({
      rand,
      width,
      height,
      stream,
      streamNodes,
      streamGaps,
      sphereClusters,
      voids,
      avoidCenter,
      avoidCircles,
      avoidRect,
      avoidMask,
      bias,
    });
  }
  return placeRandomSparse({ rand, width, height, densityAt, voids, avoidRect, avoidMask, preferLowDensity });
}

function placeInHeroRegion({ rand, region }) {
  if (!region) return null;
  const angle = rand() * Math.PI * 2;
  const radius = Math.sqrt(rand()) * region.r;
  return {
    x: region.x + Math.cos(angle) * radius,
    y: region.y + Math.sin(angle) * radius,
    source: "hero",
  };
}

function applyFlowTransport({ point, rand, flowField, width, height, avoidRect }) {
  if (!flowField || !point) return point;
  let x = point.x;
  let y = point.y;
  const start = { x, y };
  const steps = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < steps; i++) {
    const flow = flowField(x, y);
    if (!flow || flow.strength <= 0.02) break;
    const step = (22 + rand() * 50) * (0.35 + flow.strength * 0.65);
    const lateral = (rand() - 0.5) * step * 0.15;
    x += flow.dx * step - flow.dy * lateral;
    y += flow.dy * step + flow.dx * lateral;
    x = clamp(x, 0, width);
    y = clamp(y, 0, height);
  }
  if (avoidRect && x > avoidRect.x && x < avoidRect.x + avoidRect.w && y > avoidRect.y && y < avoidRect.y + avoidRect.h) {
    return point;
  }
  return { ...point, x, y };
}

function sampleStarPopulation({
  rand,
  theme,
  width,
  height,
  densityAt,
  colorFieldAt,
  extinctionAt,
  flowField,
  stream,
  streamNodes,
  streamGaps,
  sphereClusters,
  regions,
  heroRegions = [],
  voids,
  avoidCenter,
  avoidCircles,
  safeZone,
  textFieldMask,
  colorWeights,
  tone,
  densityScale = 1,
  totalStars = null,
  retroCount = 0,
  populationTheme = {},
}) {
  if (process.env.DEBUG_STAR_POP === "1" && !didLogProfileWeights) {
    didLogProfileWeights = true;
    console.log("[star_population] PROFILE_WEIGHTS", JSON.stringify(PROFILE_WEIGHTS, null, 2));
  }
  const counts = sampleStarCounts({
    theme,
    densityScale,
    totalStars,
    densityBias: populationTheme?.densityBias ?? 1,
  });
  const results = [];
  const worldSeed = String(theme?.seed || "sora-no-koe");
  const hasDeepRegions = (regions?.deepFieldRegions || []).length > 0;
  const hasClusters = (regions?.anchorClusters || []).length > 0;
  const extinctionStrength = clamp(populationTheme?.extinctionStrength ?? 0.2, 0.1, 0.6);
  const heroBoost = clamp(populationTheme?.heroBoost ?? 0.08, 0.04, 0.25);
  const streamAdhesion = clamp(populationTheme?.streamAdhesion ?? 0.5, 0.25, 0.95);
  const clusterTightness = clamp(populationTheme?.clusterTightness ?? 0.5, 0.25, 0.95);
  const isolatedBrightBias = clamp(populationTheme?.isolatedBrightBias ?? 0.16, 0.08, 0.5);
  const haloSoftness = clamp(populationTheme?.haloSoftness ?? 0.5, 0.2, 0.9);
  const softnessBias = (haloSoftness - 0.5) * 1.2;
  const bandWeights = {
    far: { dust: 0.1, micro: 0.55, small: 0.35 },
    mid: { micro: 0.35, small: 0.5, medium: 0.12, bright: 0.02, giant: 0.01 },
    near: { medium: 0.5, bright: 0.3, giant: 0.05, spark: 0.05, red: 0.1 },
  };
  const bandDepthRatios = { far: 0.55, mid: 0.35, near: 0.1, hero: 0 };

  const makeSeed = (depth, group, index) => hashString(`${worldSeed}_${group || "mix"}_${depth}_${index}`);

  const pushCompanion = (seed, starRand) => {
    if (retroCount <= 0) return;
    if (seed.profile !== "medium" && seed.profile !== "bright") return;
    if (starRand() > 0.12) return;
    const shift = 0.8 + starRand() * (0.4 + retroCount * 0.08);
    results.push({
      ...seed,
      x: seed.x + shift,
      y: seed.y - shift * 0.6,
      size: seed.size * 0.6,
      brightness: seed.brightness * 0.18,
      profile: "micro",
      depth: "far",
    });
  };

  const buildDepth = (depth, count, group = "mixed") => {
    const profileWeights = PROFILE_WEIGHTS[depth] || PROFILE_WEIGHTS.mid;
    for (let i = 0; i < count; i++) {
      const baseSeed = makeSeed(depth, group, i);
      const starRand = mulberry32(baseSeed);
      const placementRand = mulberry32(hashString(`${baseSeed}_place`));
      const propsRand = mulberry32(hashString(`${baseSeed}_props`));

      let chosenProfileWeights = profileWeights;
      let source = pickSource(depth, propsRand, hasDeepRegions, hasClusters);
      if (group === "deep") source = "deep";
      if (group === "stream") source = "stream";
      if (group === "band") source = "stream";
      if (group === "cluster") source = "cluster";
      if (group === "isolated") source = "random";
      if (group === "hero") source = "cluster";
      const avoidRect = (depth === "near" || depth === "hero") ? safeZone : null;
      let place = null;
      let regionType = null;
      if (depth === "hero" && heroRegions.length) {
        const region = heroRegions[i % heroRegions.length];
        place = placeInHeroRegion({ rand: placementRand, region });
        source = region?.type ? `hero-${region.type}` : "hero";
        regionType = region?.type || null;
      }
      if (depth === "hero" && regionType) {
        const heroWeightsByType = {
          cluster: { giant: 0.5, bright: 0.3, spark: 0.1, red: 0.1 },
          filament: { bright: 0.45, spark: 0.25, medium: 0.15, red: 0.15 },
          dustlane: { red: 0.45, medium: 0.25, bright: 0.15, spark: 0.15 },
        };
        chosenProfileWeights = heroWeightsByType[regionType] || profileWeights;
      }
      if (group === "band") {
        chosenProfileWeights = bandWeights[depth] || bandWeights.mid;
      } else if (group === "stream") {
        chosenProfileWeights = adjustProfileWeights(profileWeights, {
          dust: 0.8,
          micro: 1.35,
          small: 1.35,
          medium: 1.0,
          bright: 0.5,
          giant: 0.25,
          spark: 0.5,
          red: 0.5,
        });
      } else if (group === "cluster") {
        chosenProfileWeights = adjustProfileWeights(profileWeights, {
          dust: 0.55,
          micro: 1.15,
          small: 1.35,
          medium: 1.05,
          bright: 0.9,
          giant: 0.7,
          spark: 0.6,
          red: 1.0,
        });
      } else if (group === "isolated") {
        chosenProfileWeights = adjustProfileWeights(profileWeights, {
          small: 0.6,
          medium: 1.0,
          bright: 1.4,
          giant: 1.2,
          spark: 1.1,
        });
      }
      if (depth === "hero" || group === "hero") {
        const heroBoostWeight = 1 + heroBoost * 1.4;
        chosenProfileWeights = adjustProfileWeights(chosenProfileWeights, {
          bright: heroBoostWeight,
          giant: heroBoostWeight * 1.2,
          spark: heroBoostWeight,
        });
      }
      const softnessMultipliers = {
        dust: Math.max(0.2, 1 + softnessBias * 0.5),
        micro: Math.max(0.2, 1 + softnessBias * 0.35),
        small: Math.max(0.2, 1 + softnessBias * 0.2),
        medium: Math.max(0.2, 1 - softnessBias * 0.05),
        bright: Math.max(0.2, 1 - softnessBias * 0.35),
        giant: Math.max(0.2, 1 - softnessBias * 0.45),
        spark: Math.max(0.2, 1 - softnessBias * 0.3),
        red: Math.max(0.2, 1 - softnessBias * 0.15),
      };
      chosenProfileWeights = adjustProfileWeights(chosenProfileWeights, softnessMultipliers);
      const profile = pickWeighted(propsRand, chosenProfileWeights);
      if (!place) {
        const wantClusterRegion = source === "cluster" && (profile === "micro" || profile === "small");
        const bandBias = group === "band"
          ? { stream: 1.0, streamWidth: 0.7, cluster: 0.18, sphere: 0.05 }
          : undefined;
        place = placeStar({
          source,
          rand: placementRand,
          width,
          height,
          stream,
          streamNodes,
          streamGaps,
          sphereClusters,
          regions,
          voids,
          avoidCenter,
          avoidCircles,
          avoidRect,
          avoidMask: textFieldMask,
          densityAt,
          bias: group === "stream"
            ? { stream: 0.75 + streamAdhesion * 0.35, streamWidth: 1.0 + streamAdhesion * 0.3, cluster: 0.2, sphere: 0.06 }
            : bandBias,
          preferLowDensity: group === "isolated",
          returnRegion: wantClusterRegion,
        });
      }
      if (flowField && (group === "stream" || group === "cluster")) {
        place = applyFlowTransport({
          point: place,
          rand: placementRand,
          flowField,
          width,
          height,
          avoidRect,
        });
      }
      if (place?.region && (profile === "micro" || profile === "small")) {
        const region = place.region;
        const dx = place.x - region.x;
        const dy = place.y - region.y;
        const spread = 1.12 + propsRand() * 0.22;
        place.x = clamp(region.x + dx * spread, 0, width);
        place.y = clamp(region.y + dy * spread, 0, height);
      }

      const textMaskRaw = textFieldMask ? clamp(textFieldMask(place.x, place.y), 0, 1) : 0;
      const textMask = (profile === "micro" || profile === "small") ? textMaskRaw * 0.45 : textMaskRaw;
      const colorField = colorFieldAt ? clamp(colorFieldAt(place.x, place.y), 0, 1) : 0;
      if (textMask > 0.7 && (depth === "hero" || profile === "giant" || profile === "bright")) {
        continue;
      }
      const coreScale = (profile === "micro" || profile === "small") ? 0.2 : 0.35;
      const spikeScale = (profile === "micro" || profile === "small") ? 0.25 : 0.5;
      const chromaScale = (profile === "micro" || profile === "small") ? 0.3 : 0.6;
      const bloomScale = (profile === "micro" || profile === "small") ? 0.45 : 0.85;
      const coreAtten = clamp(1 - textMask * coreScale, 0.5, 1);
      const spikeAtten = clamp(1 - textMask * spikeScale, 0.4, 1);
      const chromaAtten = clamp(1 - textMask * chromaScale, 0.3, 1);
      const bloomAtten = clamp(1 - textMask * bloomScale, 0.2, 1);
      const seed = sampleStarSeed({
        depth,
        profile,
        rand: propsRand,
        colorWeights,
        tone,
      });
      const extinction = extinctionAt ? clamp(extinctionAt(place.x, place.y), 0, 1) : 0;
      const depthFactor = depth === "far" ? 1.4 : depth === "mid" ? 1.1 : depth === "near" ? 0.85 : 0.7;
      const atten = Math.exp(-extinction * depthFactor * (1.2 + extinctionStrength * 2));
      const colorBoost = (profile === "micro" || profile === "small" || profile === "medium")
        ? 1 + colorField * 0.18
        : 1;
      const star = {
        x: place.x,
        y: place.y,
        depth,
        temp: seed.temp,
        color: seed.color,
        haloColor: seed.haloColor,
        outerHaloColor: seed.outerHaloColor,
        size: seed.size * (group === "hero" ? (1 + heroBoost * 0.6) : 1),
        brightness: seed.brightness * atten * coreAtten * colorBoost * (group === "hero" ? (1 + heroBoost) : 1),
        spikeStrength: seed.spikeStrength * (1 - extinction * 0.35) * spikeAtten * (group === "hero" ? (1 + heroBoost * 0.5) : 1),
        chromaStrength: seed.chromaStrength * (1 - extinction * 0.25) * chromaAtten,
        bloomStrength: seed.bloomStrength * (1 - extinction * 0.4) * bloomAtten * (group === "hero" ? (1 + heroBoost * 0.6) : 1),
        profile,
        clusterId: source === "cluster" ? String(i % 32) : null,
        fieldSource: source,
        population: group,
      };
      results.push(star);
      pushCompanion(star, starRand);

      if (colorField > 0.45 && (profile === "micro" || profile === "small" || profile === "medium") && propsRand() < (0.18 + colorField * 0.22)) {
        const angle = propsRand() * Math.PI * 2;
        const jitter = 3 + propsRand() * 6;
        const cx = clamp(place.x + Math.cos(angle) * jitter, 0, width);
        const cy = clamp(place.y + Math.sin(angle) * jitter, 0, height);
        const textMask2 = textFieldMask ? clamp(textFieldMask(cx, cy), 0, 1) : 0;
        const textAtten2 = clamp(1 - textMask2 * 0.4, 0.6, 1);
        results.push({
          ...star,
          x: cx,
          y: cy,
          size: star.size * 0.65,
          brightness: star.brightness * 0.32 * textAtten2,
          spikeStrength: 0,
          bloomStrength: star.bloomStrength * 0.4,
          profile: "micro",
          population: "color-grain",
        });
      }

      if (source === "cluster" && (profile === "micro" || profile === "small") && propsRand() < 0.7) {
        const region = place?.region || null;
        const baseX = region ? region.x : star.x;
        const baseY = region ? region.y : star.y;
        const dx = star.x - baseX;
        const dy = star.y - baseY;
        const spread = 1.45 + propsRand() * 0.45;
        const outX = clamp(baseX + dx * spread, 0, width);
        const outY = clamp(baseY + dy * spread, 0, height);
        results.push({
          ...star,
          x: outX,
          y: outY,
          size: star.size * 0.85,
          brightness: star.brightness * 0.4,
          spikeStrength: 0,
          bloomStrength: star.bloomStrength * 0.5,
          profile: "micro",
          population: "cluster-outskirts",
        });
        if (propsRand() < 0.18) {
          const spread2 = 1.65 + propsRand() * 0.5;
          const outX2 = clamp(baseX + dx * spread2, 0, width);
          const outY2 = clamp(baseY + dy * spread2, 0, height);
          results.push({
            ...star,
            x: outX2,
            y: outY2,
            size: star.size * 0.75,
            brightness: star.brightness * 0.28,
            spikeStrength: 0,
            bloomStrength: star.bloomStrength * 0.45,
            profile: "micro",
            population: "cluster-outskirts",
          });
        }
      }
    }
  };

  const total = counts.total;
  const groupWeights = {
    deep: 0.24,
    stream: 0.34 + streamAdhesion * 0.18,
    cluster: 0.22 + clusterTightness * 0.22,
    hero: 0.05 + heroBoost * 0.12,
    isolated: 0.03 + isolatedBrightBias * 0.1,
  };
  const sumWeights = Object.values(groupWeights).reduce((s, v) => s + v, 0) || 1;
  const normalized = Object.entries(groupWeights).reduce((acc, [k, v]) => {
    acc[k] = v / sumWeights;
    return acc;
  }, {});
  const groupCounts = Object.entries(normalized).reduce((acc, [k, v]) => {
    acc[k] = Math.max(0, Math.round(total * v));
    return acc;
  }, {});
  const groupSum = Object.values(groupCounts).reduce((s, v) => s + v, 0);
  if (groupSum !== total) {
    const diff = total - groupSum;
    groupCounts.stream = Math.max(0, (groupCounts.stream || 0) + diff);
  }

  const groupDepthRatios = {
    deep: { far: 0.8, mid: 0.18, near: 0.02, hero: 0 },
    stream: { far: 0.55, mid: 0.32, near: 0.11, hero: 0.02 },
    cluster: { far: 0.18, mid: 0.45, near: 0.27, hero: 0.1 },
    hero: { far: 0.0, mid: 0.2, near: 0.35, hero: 0.45 },
    isolated: { far: 0.2, mid: 0.25, near: 0.35, hero: 0.2 },
  };

  const buildGroup = (groupKey) => {
    const count = groupCounts[groupKey] || 0;
    const ratios = groupDepthRatios[groupKey] || groupDepthRatios.stream;
    const far = Math.round(count * ratios.far);
    const mid = Math.round(count * ratios.mid);
    const near = Math.round(count * ratios.near);
    const hero = Math.max(0, Math.round(count * ratios.hero));
    if (far) buildDepth("far", far, groupKey);
    if (mid) buildDepth("mid", mid, groupKey);
    if (near) buildDepth("near", near, groupKey);
    if (hero) buildDepth("hero", hero, groupKey);
  };

  buildGroup("deep");
  buildGroup("stream");
  buildGroup("cluster");
  buildGroup("hero");
  buildGroup("isolated");

  const bandCount = Math.round(total * 0.16);
  if (bandCount > 0) {
    const far = Math.round(bandCount * bandDepthRatios.far);
    const mid = Math.round(bandCount * bandDepthRatios.mid);
    const near = Math.round(bandCount * bandDepthRatios.near);
    if (far) buildDepth("far", far, "band");
    if (mid) buildDepth("mid", mid, "band");
    if (near) buildDepth("near", near, "band");
  }

  return results;
}

module.exports = {
  samplePowerLaw,
  sampleStarSize,
  sampleStarCounts,
  sampleStarPopulation,
  sampleStarSeed,
};
