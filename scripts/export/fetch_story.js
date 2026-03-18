#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

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

function buildUrl({ base, date, outputs, igAi }) {
  const url = new URL("/stories", base);
  if (date) url.searchParams.set("date_local", date);
  if (date) url.searchParams.set("datetime_local", `${date}T12:00:00`);
  url.searchParams.set("format", "json");
  url.searchParams.set("outputs", outputs ? "1" : "0");
  if (igAi !== null) url.searchParams.set("ig_ai", igAi ? "1" : "0");
  return url.toString();
}

function stripOutputs(payload) {
  if (!payload || typeof payload !== "object") return null;
  const story = payload.story && typeof payload.story === "object" ? payload.story : null;
  if (!story) return null;
  const outputs = story.outputs && typeof story.outputs === "object" ? story.outputs : null;
  if (!outputs) return null;
  delete story.outputs;
  return outputs;
}

function buildOutputsPayload(basePayload, outputs) {
  if (!outputs) return null;
  return {
    ok: basePayload?.ok ?? true,
    saved: basePayload?.saved ?? false,
    doc_id: basePayload?.doc_id ?? null,
    meta: basePayload?.meta ?? null,
    outputs,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = args.date || args.date_local || "";
  const base = args.base || "http://localhost:8080";
  const outPath = args.out || "tmp/stories/story.json";
  const outOutputsPath = args.out_outputs || null;
  const outputs = args.outputs === undefined ? true : ["1", "true", "yes", "on"].includes(String(args.outputs));
  const igAi = args.ig_ai === undefined ? true : ["1", "true", "yes", "on"].includes(String(args.ig_ai));

  if (!date) {
    console.error("[fetch_story] --date YYYY-MM-DD is required");
    process.exit(1);
  }

  const url = buildUrl({ base, date, outputs, igAi });
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[fetch_story] failed: ${res.status} ${res.statusText}`);
    if (text) console.error(text.slice(0, 400));
    process.exit(1);
  }

  const json = await res.json();
  const outputsObj = stripOutputs(json);
  const resolvedOutPath = path.resolve(outPath);
  fs.mkdirSync(path.dirname(resolvedOutPath), { recursive: true });
  fs.writeFileSync(resolvedOutPath, JSON.stringify(json, null, 2), "utf8");
  console.log(`[fetch_story] saved: ${resolvedOutPath}`);

  const wantsOutputsFile = outputsObj && path.basename(resolvedOutPath) === "story.json";
  if (wantsOutputsFile) {
    const outputsPayload = buildOutputsPayload(json, outputsObj);
    const target =
      outOutputsPath
        ? path.resolve(outOutputsPath)
        : path.join(path.dirname(resolvedOutPath), "story_outputs.json");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(outputsPayload, null, 2), "utf8");
    console.log(`[fetch_story] saved: ${target}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
