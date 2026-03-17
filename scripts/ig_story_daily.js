#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(dest, buf);
}

async function main() {
  const base = argValue("--base", "http://localhost:8080");
  const dateLocal = argValue("--date", "");
  const dryRun = hasFlag("--dryRun") || hasFlag("--dry_run") || argValue("--dryRun", "") === "1";
  const outDir = argValue("--outDir", "");
  const printJson = hasFlag("--print_json");

  const token = process.env.CRON_TOKEN;
  if (!token) throw new Error("CRON_TOKEN is required");

  const url = new URL("/cron/ig/story/daily", base);
  if (dateLocal) url.searchParams.set("date_local", dateLocal);
  if (dryRun) url.searchParams.set("dryRun", "1");

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-token": token,
    },
    body: JSON.stringify({}),
  });

  const json = await res.json();
  if (printJson) {
    console.log(JSON.stringify(json, null, 2));
  } else {
    console.log(`[ig_story_daily] ok=${json.ok} date=${json.date_local} dryRun=${json.dry_run}`);
  }

  if (outDir && json?.images) {
    await ensureDir(outDir);
    const entries = Object.entries(json.images);
    for (const [key, urlStr] of entries) {
      const file = path.join(outDir, `sora_story_${key}_${json.date_local}.png`);
      await download(urlStr, file);
      console.log(`[ig_story_daily] saved ${file}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
