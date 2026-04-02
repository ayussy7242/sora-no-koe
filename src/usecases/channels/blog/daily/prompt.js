"use strict";

const { SORA_AI_SYSTEM_PROMPT_COMMON } = require("../../../../content/prompts/sora/sora_core");
const { BLOG_BLOCKS_USER_GUIDE } = require("../../../../content/prompts/blog/blocks");
const { BLOG_MOON_EVENT_GUIDE } = require("../../../../content/prompts/blog/moon_event");
const { formatDateYmd } = require("../../../../domain/astro/compute");
const { normalizeSignKey } = require("../../../../domain/canonical");
const { BLOG_STRUCT_BODY_ORDER } = require("./constants");
const { moonEventRelationInfo, moonEventAxisWordsJa, moonEventKindLabelJa } = require("../../../../domain/moon");
const {
  formatDateDotsFromLocal,
  formatElementCount,
  formatModalityCount,
  formatSignConcentration,
  getTransitInfo,
  formatSignDegree,
  aspectLabelForLong,
} = require("./output");

function systemPrompt() {
  return SORA_AI_SYSTEM_PROMPT_COMMON;
}

function userPrompt({ dateLocal, dataBlock }) {
  return [
    BLOG_BLOCKS_USER_GUIDE,
    "",
    `日付: ${dateLocal}`,
    "",
    "INPUT:",
    dataBlock,
  ].join("\n");
}

function resolveMoonEventPromptInput({ story, dateLocal, event }) {
  if (!event) return null;
  const asOfISO = story?.meta?.as_of || new Date().toISOString();
  const dateDots = formatDateDotsFromLocal(dateLocal)
    || formatDateYmd(new Date(asOfISO)).replace(/-/g, ".");

  const sun = getTransitInfo(story, "sun");
  const moon = getTransitInfo(story, "moon");
  const sunSignDeg = sun.signKey ? formatSignDegree(sun.signKey, sun.lonDeg) : (sun.signJa || "—");
  const moonSignDeg = moon.signKey ? formatSignDegree(moon.signKey, moon.lonDeg) : (moon.signJa || "—");

  const phaseLabel = event?.phaseName || moonEventKindLabelJa(event?.kind) || "";
  const relationInfo = moonEventRelationInfo(event);
  const aspectKey = relationInfo?.aspectKey || "";
  const aspectDeg = Number.isFinite(Number(relationInfo?.deg)) ? Number(relationInfo.deg) : null;
  const aspectLabel = aspectLabelForLong(aspectKey, aspectDeg);
  const axisWords = moonEventAxisWordsJa(event) || "";

  const strata = story?.public?.sky_strata || {};
  const elements = formatElementCount(strata.element_count || {});
  const modalities = formatModalityCount(strata.modality_count || {});

  const signCounts = {};
  const transit = story?.public?.transit_signs || {};
  BLOG_STRUCT_BODY_ORDER.forEach((key) => {
    const signKey = normalizeSignKey(transit?.[key]?.sign_key || "");
    if (!signKey) return;
    signCounts[signKey] = (signCounts[signKey] || 0) + 1;
  });
  const distribution = formatSignConcentration(signCounts);

  return {
    dateDots,
    phaseLabel,
    sun,
    moon,
    sunSignDeg,
    moonSignDeg,
    aspectLabel,
    aspectDeg,
    axisWords,
    elements,
    modalities,
    distribution,
  };
}

function buildMoonEventPrompt({ story, dateLocal, event }) {
  const input = resolveMoonEventPromptInput({ story, dateLocal, event });
  if (!input) return "";

  const inputLines = [
    `DATE_DOTS: ${input.dateDots}`,
    `PHASE: ${input.phaseLabel}`,
    `SUN_SIGN: ${input.sun.signJa || "—"}`,
    `MOON_SIGN: ${input.moon.signJa || "—"}`,
    `SUN_SIGN_DEG: ${input.sunSignDeg}`,
    `MOON_SIGN_DEG: ${input.moonSignDeg}`,
    `ASPECT: ${input.aspectLabel} ${Number.isFinite(Number(input.aspectDeg)) ? `${input.aspectDeg}°` : ""}`.trim(),
    `AXIS_WORDS: ${input.axisWords || "—"}`,
    `ELEMENTS: ${input.elements}`,
    `MODALITIES: ${input.modalities}`,
    `DISTRIBUTION: ${input.distribution || "—"}`,
  ];

  return [
    BLOG_MOON_EVENT_GUIDE,
    "",
    "INPUT:",
    inputLines.join("\n"),
  ].join("\n");
}

function stripAiLogs(text) {
  if (!text) return text;
  let out = String(text);
  out = out.replace(/<p>[^<]*日本語校正フェーズ[^<]*<\/p>\s*/g, "");
  out = out.replace(/<p>[^<]*以下が修正後の本文です[^<]*<\/p>\s*/g, "");
  out = out.replace(/<p>[^<]*日本語校正[^<]*<\/p>\s*/g, "");
  out = out.replace(/^.*日本語校正フェーズ.*$/gim, "");
  out = out.replace(/^.*以下が修正後の本文です.*$/gim, "");
  out = out.replace(/^.*日本語校正.*$/gim, "");
  out = out.replace(/これその配置のまま/g, "");
  out = out.replace(/置かれているされる/g, "置かれている");
  out = out.replace(/残っているする/g, "残っている");
  out = out.replace(/されるする/g, "される");
  out = out.replace(/しているする/g, "している");
  out = out.replace(/してるする/g, "してる");
  out = out.replace(/残るする/g, "残る");
  // strip fenced code markers (``` / ```html) while keeping inner text
  out = out.replace(/```[a-zA-Z0-9_-]*\s*\n/g, "");
  out = out.replace(/\n```/g, "\n");
  out = out.replace(/```/g, "");
  return out.trim();
}

module.exports = {
  systemPrompt,
  userPrompt,
  buildMoonEventPrompt,
  resolveMoonEventPromptInput,
  stripAiLogs,
};
