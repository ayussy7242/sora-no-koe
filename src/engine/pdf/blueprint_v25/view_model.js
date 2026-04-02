"use strict";

const { buildSoraWheelSvg } = require("../../graphics/sora_wheel");
const { buildSpaceSvg } = require("./bg");
const { wrapZodiacGlyphs } = require("./zodiac");
const { escapeHtml } = require("./utils");
const { buildPlanetPages, buildLayerPages, buildDeepAxisPages, buildAspectPages } = require("./layout");

function buildWireframeViewModel({ data = {}, base, useSpace = true, usableHeight } = {}) {
  if (!base) throw new Error("wireframe base data missing");

  const strongBg = buildSpaceSvg({ variant: "slide1", enabled: useSpace });
  const midBg = buildSpaceSvg({ variant: "slide3", enabled: useSpace });
  const bgImages = data?.bg_images || data?.bgImages || null;
  const fallbackKey = (key) => {
    if (key === "sys" || key === "pat") return "strong";
    if (key === "asp") return "medium";
    if (key === "obs") return "faint";
    return null;
  };
  const renderBg = (key, fallbackSvg) => {
    const src = bgImages?.[key] || (fallbackKey(key) ? bgImages?.[fallbackKey(key)] : null);
    if (src) {
      return `<div class="bg-space"><img class="bg-img" src="${src}" alt="space background"/></div>`;
    }
    return `<div class="bg-space">${fallbackSvg}</div>`;
  };

  const p = { ...base };
  if (p.angleMeta) {
    const stripAxisLabel = (value) => {
      const raw = String(value || "");
      const match = raw.match(/^(ASC|MC|IC|DC)\s*｜\s*(.+)$/i);
      return match ? match[2] : raw;
    };
    p.angleMetaInlineHtml = Object.fromEntries(
      Object.entries(p.angleMeta).map(([key, value]) => [
        key,
        wrapZodiacGlyphs(escapeHtml(stripAxisLabel(value))),
      ]),
    );
  }

  const natalWheelMarkup = p.natalWheelSvg
    ? `<div class="wheel-svg">${p.natalWheelSvg}</div>`
    : `<div class="wheel" style="width: 92%; height: auto; aspect-ratio: 1 / 1;"></div>`;
  const dominantSignRows = Array.isArray(p.dominantSigns) ? p.dominantSigns : [];
  const northNodeSymbol = p.nodeSigns?.find((row) => row.glyph === "☊")?.symbol || "☊";
  const southNodeSymbol = p.nodeSigns?.find((row) => row.glyph === "☋")?.symbol || "☋";

  const buildAspectSvg = () => {
    if (!p.aspectWheelAspects?.length) return "";
    const story = data?.story || data?.kernel?.story;
    if (!story) return "";
    const size = 630;
    const svg = buildSoraWheelSvg({
      story,
      size,
      rotationDeg: p.wheelRotationDeg || 0,
      showAspects: true,
      showHouses: false,
      aspects: p.aspectWheelAspects,
      ascLonDeg: p.wheelAscLon,
      mcLonDeg: p.wheelMcLon,
    });
    return `<div style="margin-top:16px; width:120%;">${svg}</div>`;
  };

  const plnPages = buildPlanetPages({ p, usableHeight });
  const layPages = buildLayerPages({ p, usableHeight });
  const depPages = buildDeepAxisPages({ p, usableHeight });
  const aspPages = buildAspectPages({ p, usableHeight });

  return {
    p,
    renderBg,
    strongBg,
    midBg,
    natalWheelMarkup,
    dominantSignRows,
    buildAspectSvg,
    northNodeSymbol,
    southNodeSymbol,
    plnPages,
    layPages,
    depPages,
    aspPages,
  };
}

module.exports = {
  buildWireframeViewModel,
};
