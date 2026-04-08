#!/usr/bin/env node
"use strict";

const { loadEnvChain } = require("../../src/utils/env_file");
const { createChatCompletion } = require("../../src/integrations/openai/openai_client");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
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
  const envPath = args.env || "config/.env";
  loadEnvChain([envPath, "config/.env.local"]);

  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const model = process.env.OPENAI_MODEL || "gpt-4o";

  const content = await createChatCompletion({
    apiKey,
    baseUrl,
    model,
    messages: [
      { role: "system", content: "You are a ping test." },
      { role: "user", content: "Reply with just: ok" },
    ],
    temperature: 0,
    maxTokens: 10,
    timeoutMs: 20000,
    maxRetries: 0,
  });

  console.log(content);
}

main().catch((err) => {
  console.error(err?.message || String(err));
  process.exit(1);
});
