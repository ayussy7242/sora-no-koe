#!/usr/bin/env node
"use strict";

require("../_load_env");

const fs = require("fs");
const path = require("path");
const {
  buildXResonancePrompt,
  generateXResonanceAiText,
  pickPrimaryResonanceAspect,
} = require("../../src/usecases/channels/x/ai/resonance");
const dict = require("../../src/content/dict");

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

function unwrapStory(payload) {
  if (payload && typeof payload === "object" && payload.story) return payload.story;
  return payload;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const storyPath = args.story || "tmp/stories/story.json";
  const outPath = args.out || "";

  if (!fs.existsSync(storyPath)) {
    console.error(`[x-ai] story not found: ${storyPath}`);
    process.exit(1);
  }

  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    console.error("[x-ai] OPENAI_API_KEY is not set");
    process.exit(1);
  }

  const payload = readJson(storyPath);
  const story = unwrapStory(payload);
  const resonanceMode = args["resonance-mode"] || args.resonance_mode || null;
  const aspect = pickPrimaryResonanceAspect({ story, dict, resonanceMode }) || null;

  if (args["dump-prompt"] || args.prompt) {
    if (!aspect) {
      console.error("[x-ai] resonance aspect missing");
      process.exit(1);
    }
    const prompt = buildXResonancePrompt({ story, dict, aspect });
    console.log(prompt);
    return;
  }

  const res = await generateXResonanceAiText({
    story,
    dict,
    resonanceMode,
    openai: {
      apiKey,
      baseUrl: process.env.OPENAI_BASE_URL,
      model: process.env.OPENAI_MODEL,
    },
  });

  if (!res.ok) {
    console.error("[x-ai] error:", res.error, res.reason ? `(reason=${res.reason})` : "");
    if (res.last_text) {
      console.error("[x-ai] last_output:\n" + res.last_text);
    }
    process.exit(1);
  }

  if (outPath) {
    const full = path.resolve(outPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, res.text, "utf8");
    console.log(`[x-ai] saved: ${full} (len=${res.text.length})`);
  } else {
    console.log(res.text);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
