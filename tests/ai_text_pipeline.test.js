"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { runAiTextPipeline } = require("../src/usecases/ai_text");
const { PRESETS } = require("../src/usecases/ai_text/presets");
const aiTextLimits = require("../src/usecases/ai_text/limits");
const blueprintLimits = require("../src/usecases/pdf/blueprint/generation/limits");
const relationLimits = require("../src/usecases/pdf/relation/generation/limits");

const ROOT = path.resolve(__dirname, "..");

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

test("IG/X AI generators route validation through runAiTextPipeline", () => {
  const files = [
    "src/usecases/channels/ig/ig_carousel_caption_ai.js",
    "src/usecases/channels/ig/ig_moon_ai.js",
    "src/usecases/channels/ig/ig_moon_event_ai.js",
    "src/usecases/channels/ig/ig_observation_ai.js",
    "src/usecases/channels/ig/ig_resonance_ai.js",
    "src/usecases/channels/ig/ig_sky_overview_ai.js",
    "src/usecases/channels/ig/ig_tsukiji_structure_ai.js",
    "src/usecases/channels/ig/story/generate_texts.js",
    "src/usecases/channels/x/x_ai_common.js",
  ];

  for (const file of files) {
    const content = read(file);
    assert.ok(
      content.includes("runAiTextPipeline"),
      `${file} should reference runAiTextPipeline`
    );
  }
});

test("IG AI generators reference PRESETS for validation rules", () => {
  const files = [
    "src/usecases/channels/ig/ig_carousel_caption_ai.js",
    "src/usecases/channels/ig/ig_moon_ai.js",
    "src/usecases/channels/ig/ig_moon_event_ai.js",
    "src/usecases/channels/ig/ig_observation_ai.js",
    "src/usecases/channels/ig/ig_resonance_ai.js",
    "src/usecases/channels/ig/ig_sky_overview_ai.js",
    "src/usecases/channels/ig/ig_tsukiji_structure_ai.js",
    "src/usecases/channels/ig/story/generate_texts.js",
  ];

  for (const file of files) {
    const content = read(file);
    assert.ok(
      content.includes("PRESETS"),
      `${file} should reference PRESETS`
    );
  }
});

test("PDF/Relation limits are wired to ai_text limits", () => {
  assert.deepEqual(blueprintLimits.LIMITS_V2, aiTextLimits.LIMITS_V2);
  assert.deepEqual(relationLimits.PROMPT_LIMITS, aiTextLimits.RELATION_PROMPT_LIMITS);
});

test("runAiTextPipeline parses JSON outputs and reports failures", () => {
  const ok = runAiTextPipeline({
    rawText: "```json\n{\"foo\": \"bar\", \"n\": 1}\n```",
    preset: { outputType: "json" },
  });

  assert.equal(ok.ok, true);
  assert.equal(ok.meta.json.foo, "bar");
  assert.equal(ok.meta.json.n, 1);

  const bad = runAiTextPipeline({
    rawText: "```json\n{foo: }\n```",
    preset: { outputType: "json" },
  });

  assert.equal(bad.ok, false);
  assert.ok(bad.errors.length > 0);
  assert.equal(bad.shouldRetry, true);
});

test("runAiTextPipeline respects preset rules (tsukiji)", () => {
  const verdict = runAiTextPipeline({
    rawText: "構造：静かな流れがゆっくり続く",
    preset: PRESETS.ig.tsukiji_structure,
  });

  assert.equal(verdict.ok, true);

  const bad = runAiTextPipeline({
    rawText: "今日の構造：静か",
    preset: PRESETS.ig.tsukiji_structure,
  });

  assert.equal(bad.ok, false);
  assert.ok(bad.errors.length > 0);
});

function repeatChar(len, ch = "あ") {
  return new Array(len).fill(ch).join("");
}

function makeSentences(count, sentenceLen) {
  const sentences = [];
  for (let i = 0; i < count; i += 1) {
    sentences.push(repeatChar(sentenceLen));
  }
  return `${sentences.join("。")}。`;
}

function expectOkPreset({ preset, rawText, label }) {
  const verdict = runAiTextPipeline({ rawText, preset });
  assert.equal(verdict.ok, true, `${label} should pass`);
  return verdict;
}

test("runAiTextPipeline accepts all IG/X/PDF/Relation presets with sample outputs", () => {
  const cases = [
    {
      label: "ig.sky_overview",
      preset: PRESETS.ig.sky_overview,
      rawText: makeSentences(2, 45), // ~92 chars
    },
    {
      label: "ig.observation",
      preset: PRESETS.ig.observation,
      rawText: repeatChar(12),
    },
    {
      label: "ig.moon",
      preset: PRESETS.ig.moon,
      rawText: makeSentences(2, 25), // ~52 chars
    },
    {
      label: "ig.resonance",
      preset: PRESETS.ig.resonance,
      rawText: makeSentences(3, 45), // ~138 chars
    },
    {
      label: "ig.carousel_caption",
      preset: PRESETS.ig.carousel_caption,
      rawText: makeSentences(3, 35), // ~108 chars
    },
    {
      label: "ig.carousel_observation",
      preset: PRESETS.ig.carousel_observation,
      rawText: `${repeatChar(18)}\n${repeatChar(18)}`,
    },
    {
      label: "ig.tsukiji_structure",
      preset: PRESETS.ig.tsukiji_structure,
      rawText: "構造：静かな流れが続く",
    },
    {
      label: "ig.moon_event_placement",
      preset: PRESETS.ig.moon_event_placement,
      rawText: makeSentences(3, 40), // ~123 chars
    },
    {
      label: "ig.moon_event_sun_moon",
      preset: PRESETS.ig.moon_event_sun_moon,
      rawText: makeSentences(3, 40),
    },
    {
      label: "ig.moon_event_resonance",
      preset: PRESETS.ig.moon_event_resonance,
      rawText: makeSentences(3, 40),
    },
    {
      label: "ig.moon_event_air",
      preset: PRESETS.ig.moon_event_air,
      rawText: makeSentences(3, 40),
    },
    {
      label: "ig.story_today",
      preset: PRESETS.ig.story_today,
      rawText: makeSentences(2, 30), // ~62 chars
    },
    {
      label: "ig.story_resonance",
      preset: PRESETS.ig.story_resonance,
      rawText: makeSentences(2, 40), // ~82 chars
    },
    {
      label: "ig.story_tomorrow",
      preset: PRESETS.ig.story_tomorrow,
      rawText: makeSentences(3, 35), // ~108 chars
    },
    {
      label: "x.base",
      preset: PRESETS.x.base,
      rawText: `${repeatChar(40)} #tag1 #tag2`,
    },
    {
      label: "pdf.blueprint_v2",
      preset: PRESETS.pdf.blueprint_v2,
      rawText: "{\"ok\":true,\"value\":1}",
    },
    {
      label: "relation.prompt_limits",
      preset: PRESETS.relation.prompt_limits,
      rawText: "{\"ok\":true,\"value\":2}",
    },
  ];

  for (const item of cases) {
    expectOkPreset(item);
  }
});
