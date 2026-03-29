"use strict";

const fs = require("fs");
const path = require("path");
const env = require("../../src/config/env");
const { renderBlogEyecatchJpeg } = require("../../src/engine/renderers/blog/blog_eyecatch");
const { buildDailyEyecatchLines } = require("../../src/usecases/channels/blog/blog_daily");

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

function formatTodayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateJa(date) {
  const parts = String(date || "").split("-");
  if (parts.length !== 3) return String(date || "");
  const y = parts[0];
  const m = String(Number(parts[1]) || parts[1]);
  const d = String(Number(parts[2]) || parts[2]);
  return `${y}年${m}月${d}日の星の配置`;
}

function loadStoryFromFile(filePath) {
  if (!filePath) return null;
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return null;
  const raw = fs.readFileSync(resolved, "utf8");
  const parsed = JSON.parse(raw);
  if (parsed && typeof parsed === "object" && parsed.story) return parsed.story;
  return parsed;
}

function loadStoryFromDefaults() {
  const candidates = [
    path.join(process.cwd(), "tmp", "stories", "story_today.json"),
    path.join(process.cwd(), "tmp", "stories", "story.json"),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const story = loadStoryFromFile(p);
    if (story) return story;
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = String(args.date || formatTodayLocal());
  const preset = args.preset || "C";
  const bgMode = args.bgMode || (args.space ? "space" : env.BLOG_EYECATCH_BG_MODE || "image");
  const bgVariant = args.bgVariant || "slide1";
  const story = loadStoryFromFile(args.story || args.storyPath || null) || loadStoryFromDefaults();

  let line1 = args.line1;
  let line2 = args.line2;
  let line3 = args.line3;
  if ((args.autoLines || story) && !line1 && !line2 && !line3 && story) {
    const lines = buildDailyEyecatchLines(story, date);
    line1 = lines.line1;
    line2 = lines.line2;
    line3 = lines.line3;
  } else {
    if (!line1) line1 = formatDateJa(date);
    if (!line2) line2 = "今日のソラ";
    if (!line3) line3 = "";
  }

  const bgPath = args.bg || env.BLOG_EYECATCH_BG_PATH || null;
  const outDir = args.outDir || path.join(process.cwd(), "public", "blog-eyecatch");
  const outPath = args.out
    ? path.resolve(args.out)
    : path.join(outDir, `${date}.jpg`);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  if (String(args.verbose || "").toLowerCase() === "true" || args.verbose) {
    console.log("[eyecatch] bgMode:", bgMode, "story:", story ? "loaded" : "none");
  }

  const rendered = await renderBlogEyecatchJpeg({
    bgPath,
    bgMode,
    bgVariant,
    story,
    dateLabel: date,
    line1,
    line2,
    line3,
    preset,
  });
  if (!rendered?.ok || !rendered.buffer) {
    console.error("[eyecatch] failed:", rendered?.error || "unknown");
    process.exit(1);
  }

  fs.writeFileSync(outPath, rendered.buffer);
  console.log(`[eyecatch] saved: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
