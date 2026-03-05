"use strict";

const fs = require("fs");
const path = require("path");
const env = require("../src/config/env");
const { renderBlogEyecatchJpeg } = require("../src/integrations/media/blog_eyecatch");

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = String(args.date || "2026-03-03");
  const line1 = args.line1 || "2026年3月3日の星の配置";
  const line2 = args.line2 || "魚座太陽 × 乙女座満月";
  const line3 = args.line3 || "";
  const preset = args.preset || "C";

  const bgPath = args.bg || env.BLOG_EYECATCH_BG_PATH || null;
  const outDir = args.outDir || path.join(process.cwd(), "public", "blog-eyecatch");
  const outPath = path.join(outDir, `${date}.jpg`);

  fs.mkdirSync(outDir, { recursive: true });

  const rendered = await renderBlogEyecatchJpeg({
    bgPath,
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
