#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { buildSpaceBackground } = require("../../src/engine/shared/space_background");
const { ELEMENT_PALETTES } = require("../../src/engine/shared/space_background/constants");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function buildStory({ topElement, secondaryElement, dateLocal }) {
  const counts = { fire: 0, water: 0, air: 0, earth: 0 };
  if (counts[topElement] !== undefined) counts[topElement] = 10;
  if (counts[secondaryElement] !== undefined) counts[secondaryElement] = 8;
  Object.keys(counts).forEach((k) => {
    if (counts[k] === 0) counts[k] = 4;
  });

  return {
    meta: { date_local: dateLocal },
    public: {
      sky_strata: {
        top_element: topElement,
        top_modality: "mutable",
        element_count: counts,
      },
    },
  };
}

function normalizeElementList(input) {
  if (!input) return [];
  return String(input)
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

function pickElementColor(key, fallback) {
  const palette = ELEMENT_PALETTES?.[key];
  if (palette?.nebula?.length) return palette.nebula[palette.nebula.length - 1];
  return fallback;
}

function buildQuadMixLayer({ idPrefix, width, height, opacity = 0.55 }) {
  const fire = pickElementColor("fire", "#FF5A3C");
  const water = pickElementColor("water", "#4DA6FF");
  const air = pickElementColor("air", "#52E5C0");
  const earth = pickElementColor("earth", "#D4A93A");
  const defs = [
    `<radialGradient id="${idPrefix}-fire" cx="20%" cy="18%" r="60%">` +
      `<stop offset="0%" stop-color="${fire}" stop-opacity="0.95"/>` +
      `<stop offset="70%" stop-color="${fire}" stop-opacity="0"/>` +
    `</radialGradient>`,
    `<radialGradient id="${idPrefix}-air" cx="80%" cy="16%" r="58%">` +
      `<stop offset="0%" stop-color="${air}" stop-opacity="0.9"/>` +
      `<stop offset="70%" stop-color="${air}" stop-opacity="0"/>` +
    `</radialGradient>`,
    `<radialGradient id="${idPrefix}-water" cx="18%" cy="82%" r="62%">` +
      `<stop offset="0%" stop-color="${water}" stop-opacity="0.9"/>` +
      `<stop offset="70%" stop-color="${water}" stop-opacity="0"/>` +
    `</radialGradient>`,
    `<radialGradient id="${idPrefix}-earth" cx="82%" cy="82%" r="62%">` +
      `<stop offset="0%" stop-color="${earth}" stop-opacity="0.95"/>` +
      `<stop offset="70%" stop-color="${earth}" stop-opacity="0"/>` +
    `</radialGradient>`,
    `<linearGradient id="${idPrefix}-sweep" x1="0%" y1="10%" x2="100%" y2="90%">` +
      `<stop offset="0%" stop-color="${fire}" stop-opacity="0.35"/>` +
      `<stop offset="35%" stop-color="${air}" stop-opacity="0.35"/>` +
      `<stop offset="65%" stop-color="${water}" stop-opacity="0.35"/>` +
      `<stop offset="100%" stop-color="${earth}" stop-opacity="0.35"/>` +
    `</linearGradient>`,
  ].join("");
  const body = [
    `<rect width="${width}" height="${height}" fill="url(#${idPrefix}-sweep)" opacity="${(opacity * 0.55).toFixed(2)}"/>`,
    `<circle cx="${width * 0.2}" cy="${height * 0.18}" r="${Math.max(width, height) * 0.45}" fill="url(#${idPrefix}-fire)" opacity="${opacity.toFixed(2)}"/>`,
    `<circle cx="${width * 0.82}" cy="${height * 0.18}" r="${Math.max(width, height) * 0.42}" fill="url(#${idPrefix}-air)" opacity="${opacity.toFixed(2)}"/>`,
    `<circle cx="${width * 0.18}" cy="${height * 0.82}" r="${Math.max(width, height) * 0.48}" fill="url(#${idPrefix}-water)" opacity="${opacity.toFixed(2)}"/>`,
    `<circle cx="${width * 0.82}" cy="${height * 0.82}" r="${Math.max(width, height) * 0.46}" fill="url(#${idPrefix}-earth)" opacity="${opacity.toFixed(2)}"/>`,
  ].join("");
  return { defs, body };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const width = Number(args.width || 2500);
  const height = Number(args.height || 1686);
  const outDir = args.outDir || path.join(process.cwd(), "tmp", "space_bg");
  const seedLabel = String(args.seed || "colorful-spectrum");
  const variant = String(args.variant || "slide1");
  const worldWidth = Number(args.worldWidth || 0) || null;
  const topElement = String(args.topElement || "fire");
  const secondaryElement = String(args.secondaryElement || "air");
  const dateLocal = String(args.date || "2024-06-21");
  const pngOnly = ["1", "true", "yes", "on"].includes(String(args.pngOnly || "false").toLowerCase());
  const blendElements = normalizeElementList(args.blendElements);
  const blendMode = String(args.blendMode || "screen");
  const blendOpacity = Number.isFinite(Number(args.blendOpacity)) ? Number(args.blendOpacity) : 0.7;
  const saturation = Number.isFinite(Number(args.saturation)) ? Number(args.saturation) : null;
  const brightness = Number.isFinite(Number(args.brightness)) ? Number(args.brightness) : null;
  const quadMix = ["1", "true", "yes", "on"].includes(String(args.quadMix || "false").toLowerCase());
  const quadMixOpacity = Number.isFinite(Number(args.quadMixOpacity)) ? Number(args.quadMixOpacity) : 0.55;

  ensureDir(outDir);

  const renderSvg = (story, seedSuffix = "") => {
    const bg = buildSpaceBackground({
      width,
      height,
      seedLabel: seedSuffix ? `${seedLabel}-${seedSuffix}` : seedLabel,
      variant,
      worldWidth: worldWidth || undefined,
      story,
    });
    const quadLayer = quadMix
      ? buildQuadMixLayer({
        idPrefix: `quad-${seedSuffix || seedLabel}`,
        width,
        height,
        opacity: quadMixOpacity,
      })
      : null;
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `<defs>${bg.defs}${quadLayer ? quadLayer.defs : ""}</defs>`,
      bg.body,
      quadLayer ? `<g>${quadLayer.body}</g>` : "",
      `</svg>`,
    ].join("");
  };

  const baseName = blendElements.length
    ? `space_bg_blend_${blendElements.join("-")}_${width}x${height}`
    : `space_bg_${topElement}_${secondaryElement}_${width}x${height}`;
  const svgPath = path.join(outDir, `${baseName}.svg`);
  const pngPath = path.join(outDir, `${baseName}.png`);

  if (blendElements.length) {
    const buffers = [];
    for (let i = 0; i < blendElements.length; i++) {
      const elem = blendElements[i];
      const next = blendElements[(i + 1) % blendElements.length];
      const story = buildStory({ topElement: elem, secondaryElement: next, dateLocal });
      const svg = renderSvg(story, elem);
      const buf = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
      buffers.push(buf);
    }
    let pipeline = sharp(buffers[0]);
    if (buffers.length > 1) {
      pipeline = pipeline.composite(
        buffers.slice(1).map((buf) => ({
          input: buf,
          blend: blendMode,
          opacity: blendOpacity,
        }))
      );
    }
    if (saturation != null || brightness != null) {
      pipeline = pipeline.modulate({
        saturation: saturation != null ? saturation : 1,
        brightness: brightness != null ? brightness : 1,
      });
    }
    await pipeline.png({ compressionLevel: 9 }).toFile(pngPath);
  } else {
    const story = buildStory({ topElement, secondaryElement, dateLocal });
    const svg = renderSvg(story);
    if (!pngOnly) {
      fs.writeFileSync(svgPath, svg, "utf8");
    }
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(pngPath);
  }

  if (!pngOnly && !blendElements.length) {
    process.stdout.write(`${svgPath}\n`);
  }
  process.stdout.write(`${pngPath}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
