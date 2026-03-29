#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { generateDailyDraft } = require("../../src/usecases/channels/blog/blog_daily");

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

function loadStoryFromFile(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return null;
  const raw = fs.readFileSync(resolved, "utf8");
  const parsed = JSON.parse(raw);
  if (parsed && typeof parsed === "object" && parsed.story) return parsed.story;
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dateLocal = String(args.date || formatTodayLocal());
  const storyPath = args.story || path.join(process.cwd(), "tmp", "stories", "story_today.json");
  const outPath = args.out
    ? path.resolve(args.out)
    : path.join(process.cwd(), "public", "blog-preview", `${dateLocal}.html`);

  const story = loadStoryFromFile(storyPath);
  if (!story) {
    console.error("[blog_preview] story not found:", storyPath);
    process.exit(1);
  }

  const html = await generateDailyDraft({
    story,
    dateLocal,
    openai: { noAi: true },
  });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, String(html || ""), "utf8");
  console.log(`[blog_preview] saved: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
