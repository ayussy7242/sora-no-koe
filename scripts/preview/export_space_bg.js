#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { buildSpaceBackground } = require("../../src/engine/shared/space_background");

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const width = Number(args.width || 2500);
  const height = Number(args.height || 1686);
  const outDir = args.outDir || path.join(process.cwd(), "tmp", "space_bg");
  const seedLabel = String(args.seed || "colorful-spectrum");
  const variant = String(args.variant || "slide1");
  const topElement = String(args.topElement || "fire");
  const secondaryElement = String(args.secondaryElement || "air");
  const dateLocal = String(args.date || "2024-06-21");

  ensureDir(outDir);

  const story = buildStory({ topElement, secondaryElement, dateLocal });
  const bg = buildSpaceBackground({
    width,
    height,
    seedLabel,
    variant,
    story,
  });

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs>${bg.defs}</defs>`,
    bg.body,
    `</svg>`,
  ].join("");

  const baseName = `space_bg_${width}x${height}`;
  const svgPath = path.join(outDir, `${baseName}.svg`);
  const pngPath = path.join(outDir, `${baseName}.png`);

  fs.writeFileSync(svgPath, svg, "utf8");
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(pngPath);

  process.stdout.write(`${svgPath}\n${pngPath}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
