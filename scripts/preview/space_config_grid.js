#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { buildSpaceBackground, buildSpaceSeedLabel } = require("../../src/engine/shared/space_background");
const { fontFaceCss } = require("../../src/engine/renderers/instagram/assets/fonts");

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

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function buildTileSvg({ width, height, story, seedLabel, spaceConfig, label }) {
  const bg = buildSpaceBackground({
    width,
    height,
    story,
    seedLabel,
    variant: "slide1",
    spaceConfig,
  });
  const labelHeight = 44;
  const padX = 16;
  const padY = 14;
  const labelText = String(label || "");
  const overlay = [
    `<rect x="0" y="0" width="${width}" height="${labelHeight}" fill="#050816" opacity="0.55"/>`,
    `<text x="${padX}" y="${padY + 18}" fill="#EDEEFF" font-size="16" font-family="SoraBodyMedium" letter-spacing="0.02em">`,
    labelText.replace(/&/g, "&amp;").replace(/</g, "&lt;"),
    `</text>`,
  ].join("");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs>${fontFaceCss()}${bg.defs || ""}</defs>`,
    bg.body || "",
    overlay,
    `</svg>`,
  ].join("");
}

async function renderTile(opts) {
  const svg = buildTileSvg(opts);
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const month = String(args.month || "2026-07").trim();
  const exportPath = path.resolve(
    process.cwd(),
    "tmp",
    "exports",
    month,
    "monthly_overview",
    `${month}.monthly_overview.export.v1.json`
  );

  let story = null;
  if (fs.existsSync(exportPath)) {
    const payload = readJson(exportPath);
    story = payload?.deck?.story || payload?.story || null;
  }

  const seedVariant = String(args.seedVariant || "").trim();
  const storyDateLocal = story?.meta?.date_local || story?.public?.date_local || `${month}-15`;
  const seedLabel = String(
    args.seed ||
    buildSpaceSeedLabel({
      seedVersion: "v2",
      channel: "ig",
      date: storyDateLocal,
      variant: seedVariant || "monthly_overview",
      prefixChannel: true,
    })
  );
  const tileW = Number(args.width || 360);
  const tileH = Number(args.height || 450);
  const gap = Number(args.gap || 18);
  const margin = Number(args.margin || 24);

  const rows = [
    { key: "starDensityScale", label: "Star Density", values: [0.8, 1.0, 1.3] },
    { key: "milkyIntensityScale", label: "Milky Intensity", values: [0.7, 1.0, 1.4] },
    { key: "milkyThicknessScale", label: "Milky Thickness", values: [0.7, 1.0, 1.3] },
    { key: "milkyDustScale", label: "Milky Dust", values: [0.7, 1.0, 1.5] },
    { key: "whiteMix", label: "White Mix", values: [0.1, 0.35, 0.6] },
  ];

  const cols = 3;
  const mode = String(args.mode || "grid").trim().toLowerCase();
  const overrideValues = String(args.values || "").trim();
  const overrideList = overrideValues
    ? overrideValues.split(",").map((v) => Number(v.trim())).filter((v) => Number.isFinite(v))
    : [];

  const canvasW = margin * 2 + cols * tileW + gap * (cols - 1);
  const canvasH = margin * 2 + rows.length * tileH + gap * (rows.length - 1);

  const composites = [];
  const outDir = args.outDir || path.resolve(process.cwd(), "tmp", "ig", "space_config_preview", month);
  ensureDir(outDir);

  if (mode === "single") {
    const targets = Array.isArray(args.keys) && args.keys.length
      ? args.keys
      : String(args.key || "").trim()
        ? [String(args.key).trim()]
        : rows.map((r) => r.key);

    for (const key of targets) {
      const row = rows.find((r) => r.key === key);
      if (!row) continue;
      const rowValues = overrideList.length ? overrideList : row.values;
      const colsSingle = Math.max(1, rowValues.length || 1);
      const localComposites = [];
      for (let c = 0; c < colsSingle; c++) {
        const value = rowValues[c];
        const spaceConfig = { [row.key]: value };
        const label = `${row.label} ${value}`;
        const buf = await renderTile({
          width: tileW,
          height: tileH,
          story,
          seedLabel,
          spaceConfig,
          label,
        });
        const left = margin + c * (tileW + gap);
        const top = margin;
        localComposites.push({ input: buf, left, top });
      }
      const localW = margin * 2 + colsSingle * tileW + gap * (colsSingle - 1);
      const localH = margin * 2 + tileH;
      const base = sharp({
        create: {
          width: localW,
          height: localH,
          channels: 4,
          background: "#050816",
        },
      });
      const outPath = path.join(outDir, `space_config_${row.key}.png`);
      await base.composite(localComposites).png({ compressionLevel: 9 }).toFile(outPath);
    }
    console.log("[space_config_grid] rendered", { outDir, month, seedLabel, mode: "single" });
    return;
  }

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < cols; c++) {
      const value = row.values[c];
      const spaceConfig = {
        [row.key]: value,
      };
      const label = `${row.label} ${value}`;
      const buf = await renderTile({
        width: tileW,
        height: tileH,
        story,
        seedLabel,
        spaceConfig,
        label,
      });
      const left = margin + c * (tileW + gap);
      const top = margin + r * (tileH + gap);
      composites.push({ input: buf, left, top });
    }
  }

  const base = sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 4,
      background: "#050816",
    },
  });

  const outPath = path.join(outDir, "space_config_grid.png");
  await base.composite(composites).png({ compressionLevel: 9 }).toFile(outPath);
  console.log("[space_config_grid] rendered", { outPath, month, seedLabel, mode: "grid" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
