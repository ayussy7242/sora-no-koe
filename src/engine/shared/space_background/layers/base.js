"use strict";

const { clamp } = require("../utils");
const { ELEMENT_BASE_COLORS } = require("../constants");

function pickFallbackBaseColor(rand) {
  const baseList = ELEMENT_BASE_COLORS.mixed;
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  return pick(baseList);
}

function buildDeepSpaceLayer({ rand, width, height, baseColor, glowStrength = 0.12, idPrefix = "space" } = {}) {
  const base = baseColor || pickFallbackBaseColor(rand);
  const depth = clamp(glowStrength, 0.02, 0.12);
  const patchA = 0.08 + rand() * 0.12;
  const patchB = 0.1 + rand() * 0.14;
  const patchC = 0.06 + rand() * 0.12;
  const patchAId = `${idPrefix}-darkPatchA`;
  const patchBId = `${idPrefix}-darkPatchB`;
  const patchCId = `${idPrefix}-darkPatchC`;

  const defs = [
    `<radialGradient id="${patchAId}" cx="20%" cy="18%" r="48%">` +
      `<stop offset="0%" stop-color="#000000" stop-opacity="${(depth * 0.35).toFixed(3)}"/>` +
      `<stop offset="100%" stop-color="#000000" stop-opacity="0"/>` +
      `</radialGradient>`,
    `<radialGradient id="${patchBId}" cx="78%" cy="22%" r="42%">` +
      `<stop offset="0%" stop-color="#000000" stop-opacity="${(depth * 0.28).toFixed(3)}"/>` +
      `<stop offset="100%" stop-color="#000000" stop-opacity="0"/>` +
      `</radialGradient>`,
    `<radialGradient id="${patchCId}" cx="60%" cy="74%" r="50%">` +
      `<stop offset="0%" stop-color="#000000" stop-opacity="${(depth * 0.32).toFixed(3)}"/>` +
      `<stop offset="100%" stop-color="#000000" stop-opacity="0"/>` +
      `</radialGradient>`,
  ].join("");

  const body = [
    `<rect width="${width}" height="${height}" fill="${base}"/>`,
    `<rect width="${width}" height="${height}" fill="url(#${patchAId})" opacity="${patchA.toFixed(2)}"/>`,
    `<rect width="${width}" height="${height}" fill="url(#${patchBId})" opacity="${patchB.toFixed(2)}"/>`,
    `<rect width="${width}" height="${height}" fill="url(#${patchCId})" opacity="${patchC.toFixed(2)}"/>`,
  ].join("");

  return { defs, body };
}

function buildBaseColorNoiseLayer({ rand, width, height, idPrefix, color, opacity = 0.08 }) {
  if (!color) return { defs: "", body: "" };
  const noiseId = `${idPrefix}-baseNoise`;
  const maskId = `${idPrefix}-baseNoiseMask`;
  const freqX = (0.003 + rand() * 0.0025).toFixed(4);
  const freqY = (0.004 + rand() * 0.003).toFixed(4);

  const defs = [
    `<filter id="${noiseId}" x="-30%" y="-30%" width="160%" height="160%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${freqX} ${freqY}" numOctaves="2" seed="${Math.floor(rand() * 8000)}" result="noise"/>` +
      `<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.7 0" result="alpha"/>` +
      `<feGaussianBlur in="alpha" stdDeviation="18"/>` +
      `</filter>`,
    `<mask id="${maskId}" maskUnits="userSpaceOnUse">` +
      `<rect width="${width}" height="${height}" fill="white" filter="url(#${noiseId})"/>` +
      `</mask>`,
  ].join("");

  const body = `<rect width="${width}" height="${height}" fill="${color}" opacity="${clamp(opacity, 0.04, 0.12).toFixed(3)}" mask="url(#${maskId})"/>`;
  return { defs, body };
}

function buildDarkLaneLayer({ rand, width, height, stream, idPrefix, intensity = 0.22 }) {
  if (!stream) return { defs: "", body: "" };
  const angle = (Math.atan2(stream.y2 - stream.y1, stream.x2 - stream.x1) * 180) / Math.PI;
  const bandLength = stream.len * 1.05;
  const bandHeight = stream.thickness * 0.45;
  const cx = (stream.x1 + stream.x2) / 2;
  const cy = (stream.y1 + stream.y2) / 2;
  const noiseId = `${idPrefix}-darkLaneNoise`;
  const maskId = `${idPrefix}-darkLaneMask`;
  const freqX = (0.015 + rand() * 0.01).toFixed(3);
  const freqY = (0.05 + rand() * 0.03).toFixed(3);

  const defs = [
    `<filter id="${noiseId}" x="-30%" y="-30%" width="160%" height="160%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${freqX} ${freqY}" numOctaves="2" seed="${Math.floor(rand() * 9000)}" result="noise"/>` +
      `<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="alpha"/>` +
      `<feGaussianBlur in="alpha" stdDeviation="8"/>` +
      `</filter>`,
    `<mask id="${maskId}" maskUnits="userSpaceOnUse">` +
      `<rect width="${width}" height="${height}" fill="white" filter="url(#${noiseId})"/>` +
      `</mask>`,
  ].join("");

  const body = `<rect x="${(cx - bandLength / 2).toFixed(2)}" y="${(cy - bandHeight / 2).toFixed(2)}" width="${bandLength.toFixed(2)}" height="${bandHeight.toFixed(2)}" fill="#02030A" opacity="${clamp(intensity, 0.12, 0.3).toFixed(3)}" mask="url(#${maskId})" transform="rotate(${angle.toFixed(2)} ${cx.toFixed(2)} ${cy.toFixed(2)})"/>`;
  return { defs, body };
}

function buildMilkyBandLayer({ rand, width, height, idPrefix, stream, color = "#C6D4FF", intensity = 0.1 }) {
  if (!stream) {
    const edgeLeft = rand() < 0.5;
    const bandWidth = width * 0.12;
    const bandX = edgeLeft ? width * 0.04 : width * 0.84;
    const angle = edgeLeft ? -4 : 4;
    const bandId = `${idPrefix}-milkyBand`;
    const spineId = `${idPrefix}-milkySpine`;
    const fringeId = `${idPrefix}-milkyFringe`;
    const laneId = `${idPrefix}-milkyLane`;
    const noiseId = `${idPrefix}-milkyNoise`;
    const spineNoiseId = `${idPrefix}-milkySpineNoise`;
    const laneNoiseId = `${idPrefix}-milkyLaneNoise`;
    const maskId = `${idPrefix}-milkyMask`;
    const spineMaskId = `${idPrefix}-milkySpineMask`;
    const laneMaskId = `${idPrefix}-milkyLaneMask`;
    const bandHeight = height * 1.3;
    const spineHeight = bandHeight * 0.26;
    const fringeHeight = bandHeight * 1.5;
    const laneHeight = bandHeight * 0.18;
    const spineOffset = (rand() - 0.5) * bandWidth * 0.12;
    const laneOffset = (rand() - 0.5) * bandWidth * 0.22;

    const defs = [
      `<linearGradient id="${bandId}" x1="0" y1="0" x2="1" y2="0">` +
        `<stop offset="0%" stop-color="${color}" stop-opacity="0"/>` +
        `<stop offset="42%" stop-color="${color}" stop-opacity="0.32"/>` +
        `<stop offset="60%" stop-color="${color}" stop-opacity="0.26"/>` +
        `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>` +
        `</linearGradient>`,
      `<linearGradient id="${spineId}" x1="0" y1="0" x2="1" y2="0">` +
        `<stop offset="0%" stop-color="${color}" stop-opacity="0"/>` +
        `<stop offset="50%" stop-color="${color}" stop-opacity="0.65"/>` +
        `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>` +
        `</linearGradient>`,
      `<linearGradient id="${fringeId}" x1="0" y1="0" x2="1" y2="0">` +
        `<stop offset="0%" stop-color="${color}" stop-opacity="0"/>` +
        `<stop offset="50%" stop-color="${color}" stop-opacity="0.16"/>` +
        `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>` +
        `</linearGradient>`,
      `<filter id="${noiseId}" x="-30%" y="-30%" width="160%" height="160%">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.02 0.1" numOctaves="2" seed="${Math.floor(rand() * 9000)}" result="noise"/>` +
        `<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.8 0" result="alpha"/>` +
        `<feGaussianBlur in="alpha" stdDeviation="10"/>` +
        `</filter>`,
      `<filter id="${spineNoiseId}" x="-30%" y="-30%" width="160%" height="160%">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.035 0.16" numOctaves="2" seed="${Math.floor(rand() * 9000)}" result="noise"/>` +
        `<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.7 0" result="alpha"/>` +
        `<feGaussianBlur in="alpha" stdDeviation="6"/>` +
        `</filter>`,
      `<filter id="${laneNoiseId}" x="-30%" y="-30%" width="160%" height="160%">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.03 0.14" numOctaves="2" seed="${Math.floor(rand() * 9000)}" result="noise"/>` +
        `<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.85 0" result="alpha"/>` +
        `<feGaussianBlur in="alpha" stdDeviation="5"/>` +
        `</filter>`,
      `<mask id="${maskId}" maskUnits="userSpaceOnUse">` +
        `<rect width="${width}" height="${height}" fill="white" filter="url(#${noiseId})"/>` +
        `</mask>`,
      `<mask id="${spineMaskId}" maskUnits="userSpaceOnUse">` +
        `<rect width="${width}" height="${height}" fill="white" filter="url(#${spineNoiseId})"/>` +
        `</mask>`,
      `<mask id="${laneMaskId}" maskUnits="userSpaceOnUse">` +
        `<rect width="${width}" height="${height}" fill="white" filter="url(#${laneNoiseId})"/>` +
        `</mask>`,
    ].join("");

    const bandY = -height * 0.15;
    const body = [
      `<rect x="${bandX.toFixed(2)}" y="${bandY.toFixed(2)}" width="${bandWidth.toFixed(2)}" height="${bandHeight.toFixed(2)}" fill="url(#${fringeId})" opacity="${clamp(intensity * 0.8, 0.05, 0.16).toFixed(3)}" mask="url(#${maskId})" transform="rotate(${angle} ${width / 2} ${height / 2})"/>`,
      `<rect x="${bandX.toFixed(2)}" y="${bandY.toFixed(2)}" width="${bandWidth.toFixed(2)}" height="${bandHeight.toFixed(2)}" fill="url(#${bandId})" opacity="${clamp(intensity, 0.06, 0.22).toFixed(3)}" mask="url(#${maskId})" transform="rotate(${angle} ${width / 2} ${height / 2})"/>`,
      `<rect x="${(bandX + spineOffset).toFixed(2)}" y="${(bandY + (bandHeight - spineHeight) / 2).toFixed(2)}" width="${bandWidth.toFixed(2)}" height="${spineHeight.toFixed(2)}" fill="url(#${spineId})" opacity="${clamp(intensity * 0.9, 0.08, 0.24).toFixed(3)}" mask="url(#${spineMaskId})" transform="rotate(${angle} ${width / 2} ${height / 2})"/>`,
      `<rect x="${(bandX + laneOffset).toFixed(2)}" y="${(bandY + (bandHeight - laneHeight) / 2).toFixed(2)}" width="${bandWidth.toFixed(2)}" height="${laneHeight.toFixed(2)}" fill="#02030A" opacity="${clamp(intensity * 0.35, 0.05, 0.16).toFixed(3)}" mask="url(#${laneMaskId})" transform="rotate(${angle} ${width / 2} ${height / 2})"/>`,
    ].join("");

    return { defs, body };
  }

  const angle = (Math.atan2(stream.y2 - stream.y1, stream.x2 - stream.x1) * 180) / Math.PI;
  const bandLength = stream.len * 1.12;
  const bandHeight = stream.thickness * (0.78 + rand() * 0.18);
  const spineHeight = bandHeight * 0.32;
  const fringeHeight = bandHeight * 1.35;
  const laneHeight = bandHeight * 0.18;
  const cx = (stream.x1 + stream.x2) / 2;
  const cy = (stream.y1 + stream.y2) / 2;
  const bandId = `${idPrefix}-milkyBand`;
  const spineId = `${idPrefix}-milkySpine`;
  const fringeId = `${idPrefix}-milkyFringe`;
  const laneId = `${idPrefix}-milkyLane`;
  const noiseId = `${idPrefix}-milkyNoise`;
  const spineNoiseId = `${idPrefix}-milkySpineNoise`;
  const laneNoiseId = `${idPrefix}-milkyLaneNoise`;
  const maskId = `${idPrefix}-milkyMask`;
  const spineMaskId = `${idPrefix}-milkySpineMask`;
  const laneMaskId = `${idPrefix}-milkyLaneMask`;
  const spineOffset = (rand() - 0.5) * bandHeight * 0.18;
  const laneOffset = (rand() - 0.5) * bandHeight * 0.3;
  const spineCx = cx + stream.nx * spineOffset;
  const spineCy = cy + stream.ny * spineOffset;
  const laneCx = cx + stream.nx * laneOffset;
  const laneCy = cy + stream.ny * laneOffset;

  const defs = [
    `<linearGradient id="${bandId}" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="${color}" stop-opacity="0"/>` +
      `<stop offset="42%" stop-color="${color}" stop-opacity="0.22"/>` +
      `<stop offset="62%" stop-color="${color}" stop-opacity="0.18"/>` +
      `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>` +
      `</linearGradient>`,
    `<linearGradient id="${spineId}" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="${color}" stop-opacity="0"/>` +
      `<stop offset="50%" stop-color="${color}" stop-opacity="0.7"/>` +
      `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>` +
      `</linearGradient>`,
    `<linearGradient id="${fringeId}" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="${color}" stop-opacity="0"/>` +
      `<stop offset="50%" stop-color="${color}" stop-opacity="0.14"/>` +
      `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>` +
      `</linearGradient>`,
    `<filter id="${noiseId}" x="-30%" y="-30%" width="160%" height="160%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.018 0.08" numOctaves="2" seed="${Math.floor(rand() * 9000)}" result="noise"/>` +
      `<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.65 0" result="alpha"/>` +
      `<feGaussianBlur in="alpha" stdDeviation="8"/>` +
      `</filter>`,
    `<filter id="${spineNoiseId}" x="-30%" y="-30%" width="160%" height="160%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.03 0.14" numOctaves="2" seed="${Math.floor(rand() * 9000)}" result="noise"/>` +
      `<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.6 0" result="alpha"/>` +
      `<feGaussianBlur in="alpha" stdDeviation="6"/>` +
      `</filter>`,
    `<filter id="${laneNoiseId}" x="-30%" y="-30%" width="160%" height="160%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.028 0.12" numOctaves="2" seed="${Math.floor(rand() * 9000)}" result="noise"/>` +
      `<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.8 0" result="alpha"/>` +
      `<feGaussianBlur in="alpha" stdDeviation="5"/>` +
      `</filter>`,
    `<mask id="${maskId}" maskUnits="userSpaceOnUse">` +
      `<rect width="${width}" height="${height}" fill="white" filter="url(#${noiseId})"/>` +
      `</mask>`,
    `<mask id="${spineMaskId}" maskUnits="userSpaceOnUse">` +
      `<rect width="${width}" height="${height}" fill="white" filter="url(#${spineNoiseId})"/>` +
      `</mask>`,
    `<mask id="${laneMaskId}" maskUnits="userSpaceOnUse">` +
      `<rect width="${width}" height="${height}" fill="white" filter="url(#${laneNoiseId})"/>` +
      `</mask>`,
  ].join("");

  const body = [
    `<rect x="${(cx - bandLength / 2).toFixed(2)}" y="${(cy - fringeHeight / 2).toFixed(2)}" width="${bandLength.toFixed(2)}" height="${fringeHeight.toFixed(2)}" fill="url(#${fringeId})" opacity="${clamp(intensity * 0.7, 0.05, 0.16).toFixed(3)}" mask="url(#${maskId})" transform="rotate(${angle.toFixed(2)} ${cx.toFixed(2)} ${cy.toFixed(2)})"/>`,
    `<rect x="${(cx - bandLength / 2).toFixed(2)}" y="${(cy - bandHeight / 2).toFixed(2)}" width="${bandLength.toFixed(2)}" height="${bandHeight.toFixed(2)}" fill="url(#${bandId})" opacity="${clamp(intensity, 0.08, 0.24).toFixed(3)}" mask="url(#${maskId})" transform="rotate(${angle.toFixed(2)} ${cx.toFixed(2)} ${cy.toFixed(2)})"/>`,
    `<rect x="${(spineCx - bandLength / 2).toFixed(2)}" y="${(spineCy - spineHeight / 2).toFixed(2)}" width="${bandLength.toFixed(2)}" height="${spineHeight.toFixed(2)}" fill="url(#${spineId})" opacity="${clamp(intensity * 0.95, 0.1, 0.28).toFixed(3)}" mask="url(#${spineMaskId})" transform="rotate(${angle.toFixed(2)} ${spineCx.toFixed(2)} ${spineCy.toFixed(2)})"/>`,
    `<rect x="${(laneCx - bandLength / 2).toFixed(2)}" y="${(laneCy - laneHeight / 2).toFixed(2)}" width="${bandLength.toFixed(2)}" height="${laneHeight.toFixed(2)}" fill="#02030A" opacity="${clamp(intensity * 0.4, 0.05, 0.18).toFixed(3)}" mask="url(#${laneMaskId})" transform="rotate(${angle.toFixed(2)} ${laneCx.toFixed(2)} ${laneCy.toFixed(2)})"/>`,
  ].join("");

  return { defs, body };
}

function buildLongThemeLayer({ rand, width, height, color, intensity = 0.15, idPrefix = "space" }) {
  const offsetY = height * (0.15 + rand() * 0.5);
  const angle = -8 + rand() * 16;
  const gradId = `${idPrefix}-longBand`;
  const defs = `<linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0%" stop-color="${color}" stop-opacity="0"/>` +
    `<stop offset="50%" stop-color="${color}" stop-opacity="${intensity.toFixed(2)}"/>` +
    `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>` +
    `</linearGradient>`;
  const body = `<rect x="${-width * 0.2}" y="${offsetY.toFixed(2)}" width="${width * 1.4}" height="${height * 0.35}" fill="url(#${gradId})" transform="rotate(${angle.toFixed(1)} ${width / 2} ${height / 2})"/>`;
  return { defs, body };
}

module.exports = {
  buildDeepSpaceLayer,
  buildBaseColorNoiseLayer,
  buildMilkyBandLayer,
  buildDarkLaneLayer,
  buildLongThemeLayer,
};
