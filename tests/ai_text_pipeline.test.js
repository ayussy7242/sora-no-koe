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

function charCount(text) {
  return Array.from(String(text || "")).length;
}

function resolveTargetLen(preset) {
  const min = Number.isFinite(Number(preset?.minChars)) ? Number(preset.minChars) : null;
  const max = Number.isFinite(Number(preset?.maxChars)) ? Number(preset.maxChars) : null;
  if (min != null && max != null) {
    const mid = Math.floor((min + max) / 2);
    return Math.min(max, Math.max(min, mid));
  }
  if (min != null) return min + 2;
  if (max != null) return Math.min(max, 80);
  return 40;
}

function buildSentenceText(preset, sentenceCount) {
  const min = Number.isFinite(Number(preset?.minChars)) ? Number(preset.minChars) : null;
  const max = Number.isFinite(Number(preset?.maxChars)) ? Number(preset.maxChars) : null;
  const count = Number.isFinite(Number(sentenceCount)) ? Number(sentenceCount) : 2;
  let target = resolveTargetLen(preset);
  if (max != null) target = Math.min(target, max);
  if (min != null) target = Math.max(target, min);

  const punctuationLen = count; // "。" between sentences + trailing "。"
  let perLen = Math.max(1, Math.floor((target - punctuationLen) / count));
  let text = makeSentences(count, perLen);
  while (max != null && charCount(text) > max && perLen > 1) {
    perLen -= 1;
    text = makeSentences(count, perLen);
  }
  return text;
}

function buildLineText(preset, lineCount) {
  const min = Number.isFinite(Number(preset?.minChars)) ? Number(preset.minChars) : null;
  const max = Number.isFinite(Number(preset?.maxChars)) ? Number(preset.maxChars) : null;
  const count = Number.isFinite(Number(lineCount)) ? Number(lineCount) : 2;
  let target = resolveTargetLen(preset);
  if (max != null) target = Math.min(target, max);
  if (min != null) target = Math.max(target, min);

  const newlineLen = count - 1;
  let perLen = Math.max(1, Math.floor((target - newlineLen) / count));
  let lines = new Array(count).fill(repeatChar(perLen));
  let text = lines.join("\n");
  while (max != null && charCount(text) > max && perLen > 1) {
    perLen -= 1;
    lines = new Array(count).fill(repeatChar(perLen));
    text = lines.join("\n");
  }
  return text;
}

function buildTextForPreset(preset) {
  if (preset?.outputType === "json") {
    return "{\"ok\":true,\"value\":1}";
  }
  if (preset?.mustStartWith) {
    const prefix = String(preset.mustStartWith || "");
    const min = Number.isFinite(Number(preset?.minChars)) ? Number(preset.minChars) : null;
    const max = Number.isFinite(Number(preset?.maxChars)) ? Number(preset.maxChars) : null;
    let target = resolveTargetLen(preset);
    if (max != null) target = Math.min(target, max);
    if (min != null) target = Math.max(target, min);
    const prefixLen = charCount(prefix);
    const bodyLen = Math.max(1, target - prefixLen);
    const maxBodyLen = max != null ? Math.max(1, max - prefixLen) : bodyLen;
    return `${prefix}${repeatChar(Math.min(bodyLen, maxBodyLen))}`;
  }
  if (preset?.lineCount?.min) {
    return buildLineText(preset, preset.lineCount.min);
  }
  if (preset?.sentenceCount?.min) {
    return buildSentenceText(preset, preset.sentenceCount.min);
  }
  return repeatChar(resolveTargetLen(preset));
}

function expectOkPreset({ preset, rawText, label }) {
  const verdict = runAiTextPipeline({ rawText, preset });
  assert.equal(verdict.ok, true, `${label} should pass`);
  return verdict;
}

test("runAiTextPipeline accepts all IG/X/PDF/Relation presets with sample outputs", () => {
  const cases = [
    { label: "ig.sky_overview", preset: PRESETS.ig.sky_overview },
    { label: "ig.observation", preset: PRESETS.ig.observation },
    { label: "ig.moon", preset: PRESETS.ig.moon },
    { label: "ig.resonance", preset: PRESETS.ig.resonance },
    { label: "ig.carousel_caption", preset: PRESETS.ig.carousel_caption },
    { label: "ig.carousel_observation", preset: PRESETS.ig.carousel_observation },
    { label: "ig.tsukiji_structure", preset: PRESETS.ig.tsukiji_structure },
    { label: "ig.moon_event_placement", preset: PRESETS.ig.moon_event_placement },
    { label: "ig.moon_event_sun_moon", preset: PRESETS.ig.moon_event_sun_moon },
    { label: "ig.moon_event_resonance", preset: PRESETS.ig.moon_event_resonance },
    { label: "ig.moon_event_air", preset: PRESETS.ig.moon_event_air },
    { label: "ig.story_today", preset: PRESETS.ig.story_today },
    { label: "ig.story_resonance", preset: PRESETS.ig.story_resonance },
    { label: "ig.story_tomorrow", preset: PRESETS.ig.story_tomorrow },
    { label: "x.base", preset: PRESETS.x.base },
    { label: "pdf.blueprint_v2", preset: PRESETS.pdf.blueprint_v2 },
    { label: "relation.prompt_limits", preset: PRESETS.relation.prompt_limits },
  ];

  for (const item of cases) {
    const rawText = buildTextForPreset(item.preset);
    expectOkPreset({ ...item, rawText });
  }
});
