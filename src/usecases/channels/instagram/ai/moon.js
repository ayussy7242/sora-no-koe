"use strict";

const { createChatCompletion } = require("../../../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
  SORA_AI_USER_GUIDE_IG_MOON,
  SORA_AI_USER_GUIDE_IG_MOON_NIGHT_CAPTION,
} = require("../../../../content/prompts/sora/sora_core");
const { buildMoonStatus, buildMoonSignChangeState } = require("../../../../domain/moon");
const { formatDateYmdHm } = require("../../../../domain/astro/compute");
const { formatAspectDisplay } = require("../../../../presenters/format/format/common");
const { runAiTextPipeline, generateWithRetry } = require("../../../ai_text");
const { PRESETS } = require("../../../ai_text/presets");
const { resolveMaxRetries } = require("./utils");
const { safeTrim } = require("../../../../utils/text/normalize");

function countSentences(text) {
  return String(text || "")
    .split(/[。！？]/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}


function resolveMoonPhaseFamily(status) {
  const waxing = status?.waxing;
  const phaseName = safeTrim(status?.phaseName || "");
  if (phaseName === "新月") return "new";
  if (phaseName === "満月") return "full";
  if (phaseName === "上弦") return "waxing";
  if (phaseName === "下弦") return "waning";
  if (waxing === true) return "waxing";
  if (waxing === false) return "waning";
  return "";
}

function resolveSunMoonAspectValues({ dict, moonStatus } = {}) {
  const phaseDeg = Number.isFinite(Number(moonStatus?.info?.phaseDeg))
    ? Number(moonStatus.info.phaseDeg)
    : null;
  if (!Number.isFinite(phaseDeg)) return { angle: "", label: "" };

  const roundedAngle = Math.round(phaseDeg);
  const majorCandidates = [0, 60, 90, 120, 180];
  let nearest = majorCandidates[0];
  let minDiff = Math.abs(roundedAngle - nearest);
  for (const candidate of majorCandidates.slice(1)) {
    const diff = Math.abs(roundedAngle - candidate);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = candidate;
    }
  }
  const label = minDiff <= 15
    ? formatAspectDisplay({ dict, rawType: String(nearest), aspectDeg: nearest })?.label || ""
    : "";
  return {
    angle: `${roundedAngle}°`,
    label,
  };
}

function buildMoonFallback({ moonSign, phaseLabel, phaseFamily, variant, nextChangeText } = {}) {
  const sign = safeTrim(moonSign) || "—";
  const phase = safeTrim(phaseLabel) || "静かな月相";
  const key = String(variant || "").toLowerCase();
  if (key === "caption" || key === "night_caption" || key === "night-caption") {
    const familyLine = phaseFamily === "waxing"
      ? "満月へ向かう途中にあり 光がまだ広がる側です。"
      : phaseFamily === "waning"
        ? "満月を離れ 光を絞りながら新月側へ戻る途中です。"
        : "静かな輪郭のまま 夜の中に置かれています。";
    const nextLine = nextChangeText ? `${nextChangeText}。` : "";
    return `${sign}の${phase}です。\n${familyLine}\n${nextLine}`.trim();
  }
  return `${sign}の月が空にあり、${phase}の輪郭が静かに残ります。月は余白として、景色に溶け込むように置かれます。`;
}

function buildMoonChangeHint(change) {
  if (!change || !change.changeType) return "";
  if (change.changeType === "just_ingressed" && change?.sign?.label) {
    return `${change.sign.label}に入ったばかり`;
  }
  if (change.changeType === "imminent" && change?.next?.to?.label) {
    return `まもなく${change.next.to.label}へ移る`;
  }
  return "";
}

function resolveMoonGuide(variant) {
  const key = String(variant || "").toLowerCase();
  if (key === "caption" || key === "night_caption" || key === "night-caption") {
    return SORA_AI_USER_GUIDE_IG_MOON_NIGHT_CAPTION;
  }
  return SORA_AI_USER_GUIDE_IG_MOON;
}

function buildMoonPromptValues({ story, dict, asOfISO }) {
  const moonStatus = buildMoonStatus({ asOfISO, story, dict });
  const change = buildMoonSignChangeState({ asOfISO, dict });
  const moonSign = safeTrim(moonStatus?.signJa || "");
  const phaseLabel = safeTrim(moonStatus?.displayName || "");
  const phaseFamily = resolveMoonPhaseFamily(moonStatus);
  const moonChangeHint = safeTrim(buildMoonChangeHint(change));
  const nextChange = change?.next || null;
  const nextChangeText = nextChange?.date
    ? `${formatDateYmdHm(nextChange.date)}（${nextChange.to?.label || ""}へ）`
    : "";
  const nextChangeHours = Number.isFinite(Number(nextChange?.hoursAhead))
    ? Number(nextChange.hoursAhead).toFixed(1)
    : "";
  const sunSign = safeTrim(story?.public?.transit_signs?.sun?.sign_ja || "");
  const nextMoonSign = safeTrim(nextChange?.to?.label || "");
  const sunMoonAspect = resolveSunMoonAspectValues({ dict, moonStatus });

  return {
    moonSign,
    phaseLabel,
    phaseFamily,
    moonChangeHint,
    nextChangeText: safeTrim(nextChangeText),
    nextChangeHours: safeTrim(nextChangeHours),
    sunSign,
    nextMoonSign,
    sunMoonAspectLabel: safeTrim(sunMoonAspect.label),
    sunMoonAspectAngle: safeTrim(sunMoonAspect.angle),
  };
}

function sanitizeMoonAiText(text, values) {
  let out = String(text || "");
  const pairs = [
    ["MOON_SIGN", values?.moonSign || ""],
    ["PHASE_LABEL", values?.phaseLabel || ""],
    ["MOON_PHASE_FAMILY", values?.phaseFamily || ""],
    ["SUN_SIGN", values?.sunSign || ""],
    ["SUN_MOON_ASPECT_LABEL", values?.sunMoonAspectLabel || ""],
    ["SUN_MOON_ASPECT_ANGLE", values?.sunMoonAspectAngle || ""],
    ["MOON_CHANGE_HINT", values?.moonChangeHint || ""],
    ["NEXT_MOON_SIGN", values?.nextMoonSign || ""],
    ["NEXT_MOON_SIGN_CHANGE", values?.nextChangeText || ""],
    ["NEXT_MOON_SIGN_CHANGE_HOURS_AHEAD", values?.nextChangeHours || ""],
  ];

  for (const [token, value] of pairs) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\{\\{\\s*${escaped}\\s*\\}\\}`, "g"), value);
    out = out.replace(new RegExp(`\\$\\{\\s*${escaped}\\s*\\}`, "g"), value);
    out = out.replace(new RegExp(`\\b${escaped}\\b`, "g"), value);
  }

  return out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/（\s*へ）/g, "")
    .replace(/^[ \t]+|[ \t]+$/gm, "")
    .trim();
}

function buildIgMoonPrompt({ story, dict, asOfISO, variant }) {
  const values = buildMoonPromptValues({ story, dict, asOfISO });

  return [
    resolveMoonGuide(variant),
    "",
    "INPUT:",
    `MOON_SIGN: ${values.moonSign}`,
    `PHASE_LABEL: ${values.phaseLabel}`,
    `MOON_PHASE_FAMILY: ${values.phaseFamily}`,
    `SUN_SIGN: ${values.sunSign}`,
    `SUN_MOON_ASPECT_LABEL: ${values.sunMoonAspectLabel}`,
    `SUN_MOON_ASPECT_ANGLE: ${values.sunMoonAspectAngle}`,
    `MOON_CHANGE_HINT: ${values.moonChangeHint}`,
    `NEXT_MOON_SIGN: ${values.nextMoonSign}`,
    `NEXT_MOON_SIGN_CHANGE: ${values.nextChangeText}`,
    `NEXT_MOON_SIGN_CHANGE_HOURS_AHEAD: ${values.nextChangeHours}`,
  ].join("\n");
}

async function generateIgMoonText({ story, dict, openai, maxRetries = 2, asOfISO, variant }) {
  const apiKey = openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY missing" };

  const model = openai?.model || process.env.OPENAI_MODEL || "gpt-4o";
  const resolvedMaxRetries = resolveMaxRetries({ maxRetries, openaiMaxRetries: openai?.maxRetries });
  const variantKey = String(variant || "").toLowerCase();
  const isCaptionVariant = ["caption", "night_caption", "night-caption"].includes(variantKey);
  const maxTokens = isCaptionVariant ? 420 : 160;
  const requestedRetries = Number.isFinite(Number(maxRetries)) ? Number(maxRetries) : 2;
  const effectiveMaxRetries = isCaptionVariant ? Math.max(requestedRetries, 4) : requestedRetries;

  const values = buildMoonPromptValues({ story, dict, asOfISO });

  const result = await generateWithRetry({
    buildPrompt: () => buildIgMoonPrompt({ story, dict, asOfISO, variant }),
    buildRetryNote: () => {
      const key = String(variant || "").toLowerCase();
      if (key === "caption" || key === "night_caption" || key === "night-caption") {
        return "前回は条件外でした。240〜320文字で再出力。";
      }
      return "前回は条件外でした。「あなた」を避け、70〜100文字・2〜3文を目安に整えて再出力。";
    },
    validate: ({ raw }) => {
      const key = String(variant || "").toLowerCase();
      const isCaption = key === "caption" || key === "night_caption" || key === "night-caption";
      const preset = isCaption ? PRESETS.ig.moon_night_caption : PRESETS.ig.moon;
      const verdict = runAiTextPipeline({
        rawText: raw,
        preset,
        // IG caption は「AIの文面をそのまま出す」前提なので、文字数は厳密に縛らない
        overrides: isCaption ? { minChars: 0, maxChars: null } : {},
      });
      if (verdict.ok) return { ok: true, text: verdict.text, meta: verdict.meta, errors: verdict.errors };
      return { ok: false, reason: verdict.reason || "" };
    },
    createChatCompletion,
    openai: {
      apiKey,
      baseUrl: openai?.baseUrl,
      model,
      maxRetries: openai?.maxRetries,
    },
    maxRetries: Math.max(resolvedMaxRetries, effectiveMaxRetries),
    systemPrompt: SORA_AI_SYSTEM_PROMPT_COMMON,
    temperature: 0.4,
    maxTokens,
    context: { story, dict, asOfISO },
  });

  if (result.ok) {
    return {
      ok: true,
      text: sanitizeMoonAiText(result.text, values),
      model,
      attempts: result.attempts,
      last_text: result.lastText,
    };
  }

  const lastTextSanitized = sanitizeMoonAiText(result.lastText, values);
  if (isCaptionVariant && lastTextSanitized) {
    return {
      ok: true,
      text: lastTextSanitized,
      model,
      attempts: result.attempts,
      last_text: result.lastText,
      warning: result.reason || result.error || "accepted_last_text_after_retry",
    };
  }

  // フォールバック文は使わず、失敗は失敗として返す（captionは長さ制限を緩めているので基本通る想定）
  return {
    ok: false,
    error: result.error || "retry_exceeded",
    reason: result.reason,
    attempts: result.attempts,
    last_text: result.lastText,
  };
}

module.exports = {
  buildIgMoonPrompt,
  generateIgMoonText,
};
