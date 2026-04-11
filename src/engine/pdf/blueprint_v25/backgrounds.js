"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const { pathToFileURL } = require("url");
const { buildSpaceBackground } = require("../../shared/space_background");
const { SIGN_KEYS } = require("../blueprint_light/shared");
const { PAGE_WIDTH, PAGE_HEIGHT } = require("./wireframe");

const BG_IMAGE_KEYS = ["sys", "obs", "asp", "pat"];

function signIndexFromKey(key) {
  const idx = SIGN_KEYS.indexOf(String(key || ""));
  return idx >= 0 ? idx : null;
}

function lonFromRow(row) {
  const key = row?.meta?.sign_key || row?.meta?.signKey || "";
  const deg = Number(row?.meta?.deg);
  if (!Number.isFinite(deg)) return null;
  const idx = signIndexFromKey(key);
  if (idx === null) return null;
  return idx * 30 + deg;
}

function pickTopTwoFromCounts(counts = {}) {
  const entries = Object.entries(counts).sort((a, b) => (b[1] || 0) - (a[1] || 0));
  const top = entries[0]?.[0] || "mixed";
  const secondary = entries[1]?.[0] || top;
  return { top, secondary };
}

function buildStoryStub({ rowsMain = [], rowsExtra = [], elementCounts = {}, dateLabel = "" } = {}) {
  const transit_signs = {};
  rowsMain.forEach((row) => {
    const lon = lonFromRow(row);
    if (lon === null) return;
    transit_signs[row.key] = { lon_deg: lon };
  });
  rowsExtra.forEach((row) => {
    if (!["chiron", "lilith"].includes(row.key)) return;
    const lon = lonFromRow(row);
    if (lon === null) return;
    transit_signs[row.key] = { lon_deg: lon };
  });

  const { top, secondary } = pickTopTwoFromCounts(elementCounts || {});
  return {
    meta: { date_local: dateLabel || "" },
    public: {
      date_local: dateLabel || "",
      sky_strata: {
        top_element: top,
        element_count: {
          fire: elementCounts?.fire ?? 0,
          earth: elementCounts?.earth ?? 0,
          air: elementCounts?.air ?? 0,
          water: elementCounts?.water ?? 0,
        },
      },
      transit_signs,
    },
  };
}

function buildCacheKey({ rowsMain = [], rowsExtra = [], elementCounts = {}, dateLabel = "", natalHash = "" } = {}) {
  const safeRows = (rows) =>
    rows
      .map((row) => ({
        key: row?.key || "",
        sign: row?.meta?.sign_key || "",
        deg: Number(row?.meta?.deg ?? null),
        min: Number(row?.meta?.min ?? null),
      }))
      .filter((row) => row.key && row.sign);
  const payload = {
    natalHash: natalHash || "",
    elementCounts: {
      fire: elementCounts?.fire ?? 0,
      earth: elementCounts?.earth ?? 0,
      air: elementCounts?.air ?? 0,
      water: elementCounts?.water ?? 0,
    },
    main: safeRows(rowsMain),
    extra: safeRows(rowsExtra.filter((row) => ["chiron", "lilith"].includes(row?.key))),
    dateLabel: dateLabel || "",
  };
  const raw = JSON.stringify(payload);
  return crypto.createHash("sha1").update(raw).digest("hex");
}

function readCacheMeta(dir) {
  try {
    const metaPath = path.join(dir, "bg_meta.json");
    if (!fs.existsSync(metaPath)) return null;
    return JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch (_e) {
    return null;
  }
}

function writeCacheMeta(dir, meta) {
  const metaPath = path.join(dir, "bg_meta.json");
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");
}

function buildCachedUrls(dir, keys = BG_IMAGE_KEYS) {
  const variants = keys;
  const out = {};
  for (const key of variants) {
    const filePath = path.join(dir, `bg_${key}.png`);
    if (!fs.existsSync(filePath)) return null;
    out[key] = pathToFileURL(filePath).toString();
  }
  return out;
}

function pruneBgCache(rootDir, { ttlDays = 7 } = {}) {
  try {
    if (!fs.existsSync(rootDir)) return;
    const now = Date.now();
    const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    entries.forEach((entry) => {
      if (!entry.isDirectory()) return;
      const dirPath = path.join(rootDir, entry.name);
      try {
        const stat = fs.statSync(dirPath);
        const age = now - stat.mtimeMs;
        if (age > ttlMs) {
          fs.rmSync(dirPath, { recursive: true, force: true });
        }
      } catch (_e) {
        // ignore
      }
    });
  } catch (_e) {
    // ignore cleanup errors
  }
}

function hashToUnit(seed) {
  const hash = crypto.createHash("sha1").update(String(seed || "")).digest("hex");
  const slice = hash.slice(0, 8);
  const num = parseInt(slice, 16);
  if (!Number.isFinite(num)) return 0;
  return (num % 10000) / 10000;
}

async function buildBlueprintV25BgImages({
  blueprint = {},
  rowsMain = [],
  rowsExtra = [],
  elementCounts = {},
  dateLabel = "",
  natalHash = "",
  seedLabel = "",
  spaceConfig = null,
  outDir,
  inline = false,
} = {}) {
  const rootDir = path.join(process.cwd(), "tmp", "blueprint_bg");
  pruneBgCache(rootDir, { ttlDays: 7 });
  const dir = outDir || rootDir;
  fs.mkdirSync(dir, { recursive: true });

  const cacheKey = buildCacheKey({ rowsMain, rowsExtra, elementCounts, dateLabel, natalHash });
  const cached = readCacheMeta(dir);
  if (cached?.cacheKey === cacheKey) {
    const cachedUrls = buildCachedUrls(dir, BG_IMAGE_KEYS);
    if (cachedUrls) {
      if (!inline) return cachedUrls;
      const inlined = {};
      Object.entries(cachedUrls).forEach(([key, url]) => {
        const filePath = path.join(dir, `bg_${key}.png`);
        if (fs.existsSync(filePath)) {
          const buf = fs.readFileSync(filePath);
          inlined[key] = `data:image/png;base64,${buf.toString("base64")}`;
        }
      });
      if (Object.keys(inlined).length) return inlined;
    }
  }

  const story = buildStoryStub({ rowsMain, rowsExtra, elementCounts, dateLabel });
  const worldWidth = Math.round(PAGE_WIDTH * 2.4);
  const variants = [
    { key: "sys", variant: "slide1" },
    { key: "obs", variant: "slide2" },
    { key: "asp", variant: "slide3" },
    { key: "pat", variant: "slide1" },
  ];

  const out = {};
  for (const v of variants) {
    const unit = hashToUnit(`${cacheKey}-${v.key}`);
    const offsetX = Math.round(unit * Math.max(0, worldWidth - PAGE_WIDTH));
    const bg = buildSpaceBackground({
      story,
      dateLabel,
      seedLabel,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      variant: v.variant,
      worldWidth,
      offsetX,
      spaceConfig,
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}"><defs>${bg.defs || ""}</defs>${bg.body || ""}</svg>`;
    const filePath = path.join(dir, `bg_${v.key}.png`);
    const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(filePath, png);
    if (inline) {
      out[v.key] = `data:image/png;base64,${png.toString("base64")}`;
    } else {
      out[v.key] = pathToFileURL(filePath).toString();
    }
  }

  writeCacheMeta(dir, { cacheKey, created_at: new Date().toISOString() });
  return out;
}

module.exports = { buildBlueprintV25BgImages, buildStoryStub, BG_IMAGE_KEYS, buildCacheKey };
