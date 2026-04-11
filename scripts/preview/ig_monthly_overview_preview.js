#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { renderInstagramCarousel } = require("../../src/engine/renderers/instagram/carousel");
const { writeLocalCarousel } = require("../../src/runners/cron/instagram/io");

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const month = String(args.month || "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("--month is required (e.g., --month 2026-04)");
  }

  const exportPath = args.export || path.resolve(
    process.cwd(),
    "tmp",
    "exports",
    month,
    "monthly_overview",
    `${month}.monthly_overview.export.v1.json`
  );
  if (!fs.existsSync(exportPath)) {
    throw new Error(`export not found: ${exportPath}`);
  }

  const payload = readJson(exportPath);
  const deck = payload.deck || payload;
  const header = deck.header || null;
  const dateLabel = deck.data?.month || payload.month || month;
  const spaceConfig = deck.spaceConfig || payload.spaceConfig || null;
  const seedVariant = deck.seedVariant || payload.seedVariant || null;
  const story = deck.story || payload.story || null;
  const slides = (deck.slides || []).map((slide) => ({
    kind: slide.type || "slide1",
    data: {
      ...slide,
      header: slide.header || header,
      dateLabel,
      story,
    },
  }));

  const buffers = await renderInstagramCarousel({
    slides,
    slideSet: deck.layout_key || "monthly_overview",
    spaceConfig,
    seedVariant,
  });

  const outDir = args.outDir || path.resolve(process.cwd(), "tmp", "ig", "monthly_overview", month);
  const localPaths = writeLocalCarousel({ buffers, outDir, prefix: "monthly" });
  console.log("[monthly_overview] rendered", { outDir, slides: localPaths.length });
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
