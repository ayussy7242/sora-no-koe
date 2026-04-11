"use strict";

const UNDERLAY_PRESETS = {
  halo_soft: {
    enabled: true,
    opacity: 0.10,
    radius: 0.74,
    spread: 1.70,
    blur: 52,
    centerOpacity: 0.78,
    midOpacity: 0.18,
  },
  halo_medium: {
    enabled: true,
    opacity: 0.15,
    radius: 0.78,
    spread: 1.85,
    blur: 60,
    centerOpacity: 0.82,
    midOpacity: 0.20,
  },
  halo_strong: {
    enabled: true,
    opacity: 0.20,
    radius: 0.86,
    spread: 2.05,
    blur: 70,
    centerOpacity: 0.85,
    midOpacity: 0.24,
  },
};

const NEBULA_DEFAULTS = {
  nebulaIntensity: 1,
  nebulaScale: 1,
  nebulaSpread: 1,
  nebulaArms: 1,
  coreGlowIntensity: 1,
  coreGlowRadius: 1,
  emissionColorBoost: 1,
  nebulaNoiseScale: 1,
  radialFlowStrength: 1,
};

const COSMIC_PRESETS = {
  cosmic_soft: {
    space: {
      ...NEBULA_DEFAULTS,
      starDensityScale: 0.92,
      milkyIntensityScale: 1.00,
      milkyThicknessScale: 0.96,
      milkyDustScale: 1.00,
      gasIntensityScale: 0.90,
      whiteMix: 0.04,
    },
    underlay: "halo_soft",
  },
  cosmic_default: {
    space: {
      ...NEBULA_DEFAULTS,
      starDensityScale: 1.15,
      milkyIntensityScale: 1.25,
      milkyThicknessScale: 1.10,
      milkyDustScale: 1.20,
      gasIntensityScale: 1.00,
      whiteMix: 0.06,
    },
    underlay: "halo_medium",
  },
  cosmic_vivid: {
    space: {
      ...NEBULA_DEFAULTS,
      starDensityScale: 1.55,
      milkyIntensityScale: 1.75,
      milkyThicknessScale: 1.45,
      milkyDustScale: 1.55,
      gasIntensityScale: 1.15,
      whiteMix: 0.08,
    },
    underlay: "halo_medium",
  },
  cosmic_haze: {
    space: {
      ...NEBULA_DEFAULTS,
      starDensityScale: 1.05,
      milkyIntensityScale: 1.10,
      milkyThicknessScale: 1.00,
      milkyDustScale: 1.10,
      gasIntensityScale: 1.20,
      whiteMix: 0.04,
    },
    underlay: "halo_soft",
  },
  cosmic_glow: {
    space: {
      ...NEBULA_DEFAULTS,
      starDensityScale: 1.20,
      milkyIntensityScale: 1.25,
      milkyThicknessScale: 1.08,
      milkyDustScale: 1.18,
      gasIntensityScale: 1.30,
      whiteMix: 0.05,
      nebulaIntensity: 1.15,
      emissionColorBoost: 1.10,
      coreGlowIntensity: 1.15,
    },
    underlay: "halo_medium",
  },
  cosmic_crimson: {
    space: {
      ...NEBULA_DEFAULTS,
      starDensityScale: 1.18,
      milkyIntensityScale: 1.10,
      milkyThicknessScale: 0.96,
      milkyDustScale: 1.15,
      gasIntensityScale: 1.35,
      whiteMix: 0.04,
      elementOverride: "fire",
      secondaryElementOverride: "water",
      nebulaIntensity: 1.15,
      emissionColorBoost: 1.10,
    },
    underlay: "halo_medium",
  },
  cosmic_dense: {
    space: {
      ...NEBULA_DEFAULTS,
      starDensityScale: 1.35,
      milkyIntensityScale: 1.30,
      milkyThicknessScale: 1.12,
      milkyDustScale: 1.28,
      gasIntensityScale: 1.08,
      whiteMix: 0.05,
      nebulaIntensity: 1.05,
    },
    underlay: "halo_medium",
  },
  warm_dense: {
    space: {
      ...NEBULA_DEFAULTS,
      starDensityScale: 1.75,
      milkyIntensityScale: 1.45,
      milkyThicknessScale: 1.10,
      milkyDustScale: 1.60,
      gasIntensityScale: 1.05,
      whiteMix: 0.06,
      elementOverride: "fire",
      secondaryElementOverride: "air",
    },
    underlay: "halo_medium",
  },
  warm_dense_plus: {
    space: {
      ...NEBULA_DEFAULTS,
      starDensityScale: 2.00,
      milkyIntensityScale: 1.65,
      milkyThicknessScale: 1.18,
      milkyDustScale: 1.85,
      gasIntensityScale: 1.12,
      whiteMix: 0.08,
      elementOverride: "fire",
      secondaryElementOverride: "air",
    },
    underlay: "halo_medium",
  },
  special_crimson: {
    space: {
      ...NEBULA_DEFAULTS,
      starDensityScale: 1.60,
      milkyIntensityScale: 1.50,
      milkyThicknessScale: 1.18,
      milkyDustScale: 1.60,
      gasIntensityScale: 1.30,
      whiteMix: 0.06,
      elementOverride: "fire",
      secondaryElementOverride: "air",
      nebulaIntensity: 1.60,
      nebulaScale: 1.25,
      nebulaSpread: 1.35,
      nebulaArms: 1.25,
      coreGlowIntensity: 1.50,
      coreGlowRadius: 1.20,
      emissionColorBoost: 1.25,
      nebulaNoiseScale: 1.15,
      radialFlowStrength: 1.25,
    },
    underlay: "halo_medium",
  },
  special_nebula: {
    space: {
      ...NEBULA_DEFAULTS,
      starDensityScale: 1.35,
      milkyIntensityScale: 1.30,
      milkyThicknessScale: 1.10,
      milkyDustScale: 1.45,
      gasIntensityScale: 1.40,
      whiteMix: 0.05,
      elementOverride: "water",
      secondaryElementOverride: "air",
      nebulaIntensity: 1.70,
      nebulaScale: 1.35,
      nebulaSpread: 1.45,
      nebulaArms: 1.30,
      coreGlowIntensity: 1.60,
      coreGlowRadius: 1.25,
      emissionColorBoost: 1.30,
      nebulaNoiseScale: 1.20,
      radialFlowStrength: 1.35,
    },
    underlay: "halo_medium",
  },
  special_bloom: {
    space: {
      ...NEBULA_DEFAULTS,
      starDensityScale: 1.25,
      milkyIntensityScale: 1.25,
      milkyThicknessScale: 1.05,
      milkyDustScale: 1.20,
      gasIntensityScale: 1.50,
      whiteMix: 0.08,
      elementOverride: "air",
      secondaryElementOverride: "water",
      nebulaIntensity: 1.50,
      nebulaScale: 1.20,
      nebulaSpread: 1.30,
      nebulaArms: 1.10,
      coreGlowIntensity: 1.80,
      coreGlowRadius: 1.35,
      emissionColorBoost: 1.35,
      nebulaNoiseScale: 1.05,
      radialFlowStrength: 1.10,
    },
    underlay: "halo_medium",
  },
  special_sparkle: {
    space: {
      ...NEBULA_DEFAULTS,
      starDensityScale: 2.20,
      milkyIntensityScale: 1.25,
      milkyThicknessScale: 1.05,
      milkyDustScale: 2.10,
      gasIntensityScale: 0.85,
      whiteMix: 0.03,
      nebulaIntensity: 0.90,
      emissionColorBoost: 0.90,
      coreGlowIntensity: 0.90,
      sparkleExtras: true,
      sparkleBoost: 1.8,
    },
    underlay: "halo_medium",
  },
  special_event_newmoon: {
    space: {
      ...NEBULA_DEFAULTS,
      starDensityScale: 1.35,
      milkyIntensityScale: 1.25,
      milkyThicknessScale: 1.05,
      milkyDustScale: 1.20,
      gasIntensityScale: 1.20,
      whiteMix: 0.06,
      nebulaIntensity: 1.25,
      nebulaScale: 1.10,
      nebulaSpread: 1.15,
      nebulaArms: 1.05,
      coreGlowIntensity: 1.20,
      coreGlowRadius: 1.10,
      emissionColorBoost: 1.15,
      nebulaNoiseScale: 1.05,
      radialFlowStrength: 1.10,
      moonEventKind: "new",
      moonEventStyle: "eclipse",
      moonEventIntensity: 1.2,
    },
    underlay: "halo_medium",
  },
};

function resolveUnderlayPreset(input) {
  if (!input) return null;
  if (typeof input === "object") return input;
  return UNDERLAY_PRESETS[input] || null;
}

function resolveCosmicPreset(name) {
  if (!name) return null;
  if (typeof name === "object" && name.space) return name;
  return COSMIC_PRESETS[name] || null;
}

function buildCosmicSpaceConfig(presetName, extra = null) {
  const preset = resolveCosmicPreset(presetName);
  if (!preset) return extra || null;
  return {
    ...(preset.space || {}),
    underlayPreset: preset.underlay || null,
    ...(extra || {}),
  };
}

function applySpaceConfigBoost(spaceConfig, { densityBoost = 1, underlayBoost = 1 } = {}) {
  if (!spaceConfig || typeof spaceConfig !== "object") return spaceConfig;
  const density = Number(densityBoost);
  const underlay = Number(underlayBoost);
  const out = { ...spaceConfig };
  if (Number.isFinite(density) && density !== 1) {
    ["starDensityScale", "milkyIntensityScale", "milkyThicknessScale", "milkyDustScale"].forEach((key) => {
      if (Number.isFinite(Number(out[key]))) {
        out[key] = Number(out[key]) * density;
      }
    });
  }
  if (Number.isFinite(underlay) && underlay !== 1) {
    const current = Number.isFinite(Number(out.underlayBoost)) ? Number(out.underlayBoost) : 1;
    out.underlayBoost = current * underlay;
  }
  return out;
}

module.exports = {
  UNDERLAY_PRESETS,
  COSMIC_PRESETS,
  resolveUnderlayPreset,
  resolveCosmicPreset,
  buildCosmicSpaceConfig,
  applySpaceConfigBoost,
};
