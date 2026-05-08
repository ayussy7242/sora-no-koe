"use strict";

const { createChatCompletion } = require("../../../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
  SORA_AI_USER_GUIDE_IG_MONTHLY_CAPTION,
} = require("../../../../content/prompts/sora/sora_core");
const { runAiTextPipeline, generateWithRetry } = require("../../../ai_text");
const { PRESETS } = require("../../../ai_text/presets");
const { resolveMaxRetries } = require("./utils");
const { aspectInfo, signJa } = require("../../../../presenters/format/format/common");
const { bodyLabelJa } = require("../../../../presenters/shared/text/tokens");
const { normalizeBodyKey } = require("../../../../domain/canonical");

function formatMonthDot(month) {
  const [y, m] = String(month || "").split("-");
  if (!y || !m) return String(month || "");
  return `${y}.${m}`;
}

function formatPhaseLine({ item, dict }) {
  if (!item?.date_local) return "";
  const sign = signJa(dict, item.sign_key || "");
  const label = item.label || "";
  const moonName = item.moon_name_en || item.moon_name_ja || "";
  return [item.date_local, sign, label, moonName].filter(Boolean).join(" ");
}

function formatRetroLine({ item, dict }) {
  if (!item?.start_local || !item?.end_local) return "";
  const body = bodyLabelJa(dict, normalizeBodyKey(item.planet_key || "")) || item.planet_key || "";
  const signStart = signJa(dict, item.sign_key_start || "");
  const signEnd = signJa(dict, item.sign_key_end || "");
  const signLabel = signStart && signEnd && signStart !== signEnd ? `${signStart}→${signEnd}` : (signStart || signEnd || "");
  return [body, item.start_local, "〜", item.end_local, signLabel].filter(Boolean).join(" ");
}

function formatIngressLine({ item, dict }) {
  if (!item?.date_local) return "";
  const body = bodyLabelJa(dict, normalizeBodyKey(item.planet_key || "")) || item.planet_key || "";
  const sign = signJa(dict, item.sign_key || "");
  return [item.date_local, body, "→", sign].filter(Boolean).join(" ");
}

function formatAspectLine({ item, dict }) {
  if (!item?.date_local) return "";
  const a = bodyLabelJa(dict, normalizeBodyKey(item.a || "")) || item.a || "";
  const b = bodyLabelJa(dict, normalizeBodyKey(item.b || "")) || item.b || "";
  const aSign = signJa(dict, item.a_sign_key || "") || "";
  const bSign = signJa(dict, item.b_sign_key || "") || "";
  const info = aspectInfo(dict, item.aspect_key || item.type || "", item.aspect_deg);
  const aspectLabel = info?.label_ja || String(item.aspect_key || item.type || "").trim();
  const deg = Number.isFinite(Number(info?.deg)) ? `${Number(info.deg)}°` : "";
  return [item.date_local, a, aSign, aspectLabel, deg, b, bSign].filter(Boolean).join(" ");
}

function phaseEmoji(phaseKey) {
  const map = {
    full: "🌕",
    new: "🌑",
    first_quarter: "🌓",
    last_quarter: "🌗",
  };
  return map[phaseKey] || "🌙";
}

function ingressEmoji(planetKey) {
  const map = {
    sun: "🌞",
    moon: "🌙",
    mercury: "💬",
    venus: "💞",
    mars: "🔥",
    jupiter: "✨",
    saturn: "🪨",
    uranus: "🌪️",
    neptune: "🌊",
    pluto: "🌀",
  };
  return map[planetKey] || "✦";
}

function aspectEmoji(aspectKey) {
  const map = {
    conjunction: "⚡️",
    sextile: "✨",
    square: "⚡️",
    trine: "△",
    opposition: "☍",
  };
  return map[aspectKey] || "✦";
}

function phaseEventLabel({ item, dict }) {
  const sign = signJa(dict, item?.sign_key || "");
  const emoji = phaseEmoji(item?.phase_key);
  if (item?.phase_key === "full") {
    return [sign, "満月", emoji].filter(Boolean).join(" ");
  }
  if (item?.phase_key === "new") {
    return [sign, "新月", emoji].filter(Boolean).join(" ");
  }
  if (item?.phase_key === "first_quarter") {
    return [sign, "上弦の月", emoji].filter(Boolean).join(" ");
  }
  if (item?.phase_key === "last_quarter") {
    return [sign, "下弦の月", emoji].filter(Boolean).join(" ");
  }
  return [sign, item?.label || item?.phase_key || "", emoji].filter(Boolean).join(" ");
}

function retroEventLabel({ item, dict }) {
  const body = bodyLabelJa(dict, normalizeBodyKey(item?.planet_key || "")) || item?.planet_key || "";
  const emoji = "↺";
  if (item?.kind === "end") return `${body} 順行戻り ${emoji}`.trim();
  return `${body} 逆行開始 ${emoji}`.trim();
}

function ingressEventLabel({ item, dict }) {
  const body = bodyLabelJa(dict, normalizeBodyKey(item?.planet_key || "")) || item?.planet_key || "";
  const sign = signJa(dict, item?.sign_key || "");
  const emoji = ingressEmoji(item?.planet_key);
  return [body, "→", sign, emoji].filter(Boolean).join(" ");
}

function aspectEventLabel({ item, dict }) {
  const a = bodyLabelJa(dict, normalizeBodyKey(item?.a || "")) || item?.a || "";
  const b = bodyLabelJa(dict, normalizeBodyKey(item?.b || "")) || item?.b || "";
  const info = aspectInfo(dict, item?.aspect_key || item?.type || "", item?.aspect_deg);
  const label = info?.label_ja || String(item?.aspect_key || item?.type || "").trim();
  const emoji = aspectEmoji(item?.aspect_key || item?.type || "");
  return [a, "×", b, label, emoji].filter(Boolean).join(" ");
}

function comparePromptAspects(a, b) {
  const orbA = Number(a?.orb_deg);
  const orbB = Number(b?.orb_deg);
  if (Number.isFinite(orbA) && Number.isFinite(orbB) && orbA !== orbB) return orbA - orbB;
  const degA = Number(a?.aspect_deg);
  const degB = Number(b?.aspect_deg);
  if (Number.isFinite(degA) && Number.isFinite(degB) && degA !== degB) return degA - degB;
  return String(a?.date_local || "").localeCompare(String(b?.date_local || ""));
}

function buildAspectPeaksForPrompt(aspects = []) {
  const picked = new Map();
  aspects.forEach((aspect) => {
    if (!aspect?.a || !aspect?.b || !aspect?.aspect_key) return;
    const key = `${aspect.a}|${aspect.b}|${aspect.aspect_key}`;
    const prev = picked.get(key);
    if (!prev || comparePromptAspects(aspect, prev) < 0) picked.set(key, aspect);
  });
  return Array.from(picked.values());
}

function compressAspectTimeline(aspects = []) {
  const byDate = new Map();
  buildAspectPeaksForPrompt(aspects).forEach((aspect) => {
    if (!aspect?.date_local) return;
    const prev = byDate.get(aspect.date_local);
    if (!prev || comparePromptAspects(aspect, prev) < 0) byDate.set(aspect.date_local, aspect);
  });
  return Array.from(byDate.values()).sort((a, b) => String(a?.date_local || "").localeCompare(String(b?.date_local || "")));
}

function buildMonthlyEventTimeline({ reference, dict }) {
  const byDate = new Map();
  const push = (dateLocal, type, item, label) => {
    if (!dateLocal || !label) return;
    const row = byDate.get(dateLocal) || [];
    row.push({ type, label, item });
    byDate.set(dateLocal, row);
  };

  const phases = Array.isArray(reference?.moon?.phases) ? reference.moon.phases : [];
  const phaseByDate = new Map();
  phases.forEach((item) => {
    if (item?.date_local) phaseByDate.set(item.date_local, item);
  });

  const retrogrades = Array.isArray(reference?.retrogrades) ? reference.retrogrades : [];
  const retroByDate = new Map();
  retrogrades.forEach((item) => {
    if (item?.start_local) {
      const entry = { ...item, kind: "start" };
      const list = retroByDate.get(item.start_local) || [];
      list.push(entry);
      retroByDate.set(item.start_local, list);
    }
    if (item?.end_local && String(item.end_local || "").slice(0, 7) === String(reference?.month || "")) {
      const entry = { ...item, kind: "end" };
      const list = retroByDate.get(item.end_local) || [];
      list.push(entry);
      retroByDate.set(item.end_local, list);
    }
  });

  const ingresses = Array.isArray(reference?.sign_ingresses) ? reference.sign_ingresses : [];
  const ingressByDate = new Map();
  ingresses.forEach((item) => {
    const list = ingressByDate.get(item?.date_local) || [];
    list.push(item);
    ingressByDate.set(item?.date_local, list);
  });

  phases.forEach((item) => {
    push(item?.date_local, "phase", item, phaseEventLabel({ item, dict }));
  });
  retroByDate.forEach((items, dateLocal) => {
    items.forEach((item) => {
      push(dateLocal, item.kind === "end" ? "retrograde_end" : "retrograde_start", item, retroEventLabel({ item, dict }));
    });
  });
  ingressByDate.forEach((items, dateLocal) => {
    items.forEach((item) => {
      push(dateLocal, "sign_ingress", item, ingressEventLabel({ item, dict }));
    });
  });

  const aspectRuns = compressAspectTimeline(Array.isArray(reference?.aspects) ? reference.aspects : []);
  aspectRuns.forEach((item) => {
      const dateLocal = item?.date_local;
      if (!dateLocal) return;
      if (String(item?.aspect_key || item?.type || "") !== "conjunction") return;
      const hasIngress = (ingressByDate.get(dateLocal) || []).length > 0;
      const hasRetro = (retroByDate.get(dateLocal) || []).length > 0;
      const phase = phaseByDate.get(dateLocal);
      const phaseKey = String(phase?.phase_key || "");
      const blocksAspect = hasIngress || hasRetro || phaseKey === "full" || phaseKey === "new";
      if (blocksAspect) return;
      push(dateLocal, "aspect", item, aspectEventLabel({ item, dict }));
    });

  return Array.from(byDate.entries())
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([dateLocal, items]) => ({
      date_local: dateLocal,
      items: items.map((row) => row.label).filter(Boolean),
    }));
}

function buildCaptionPrompt({ month, reference, dict }) {
  const phases = Array.isArray(reference?.moon?.phases) ? reference.moon.phases : [];
  const retrogrades = Array.isArray(reference?.retrogrades) ? reference.retrogrades : [];
  const ingresses = Array.isArray(reference?.sign_ingresses) ? reference.sign_ingresses : [];
  const aspects = Array.isArray(reference?.aspects) ? reference.aspects : [];
  const timeline = buildMonthlyEventTimeline({ reference, dict });

  const phaseLines = phases.map((p) => formatPhaseLine({ item: p, dict })).filter(Boolean);
  const retroLines = retrogrades.map((r) => formatRetroLine({ item: r, dict })).filter(Boolean);
  const ingressLines = ingresses.map((r) => formatIngressLine({ item: r, dict })).filter(Boolean);
  const aspectLines = aspects.map((a) => formatAspectLine({ item: a, dict })).filter(Boolean);
  const timelineLines = timeline.map((entry) => `${entry.date_local}: ${entry.items.join(" | ")}`);

  return [
    SORA_AI_USER_GUIDE_IG_MONTHLY_CAPTION,
    "",
    "INPUT:",
    `MONTH: ${month}`,
    `TITLE_LINE: ⭐️ ${formatMonthDot(month)} 今月の星カレンダー`,
    `TIMELINE: ${timelineLines.join(" || ")}`,
    `PHASES: ${phaseLines.join(" | ")}`,
    `RETROGRADES: ${retroLines.join(" | ")}`,
    `SIGN_INGRESSES: ${ingressLines.join(" | ")}`,
    `ASPECTS: ${aspectLines.join(" | ")}`,
  ].join("\n");
}

function buildCaptionFallback({ month, reference, dict }) {
  const lines = [];
  const fulls = (reference?.moon?.phases || []).filter((p) => p.phase_key === "full");
  const news = (reference?.moon?.phases || []).filter((p) => p.phase_key === "new");
  fulls.forEach((p) => {
    lines.push([p.date_local, signJa(dict, p.sign_key || ""), "満月", p.moon_name_en || p.moon_name_ja || ""].filter(Boolean).join(" "));
  });
  news.forEach((p) => {
    lines.push([p.date_local, signJa(dict, p.sign_key || ""), "新月"].filter(Boolean).join(" "));
  });
  (reference?.sign_ingresses || []).slice(0, 4).forEach((i) => {
    const body = bodyLabelJa(dict, normalizeBodyKey(i.planet_key || "")) || i.planet_key || "";
    lines.push([i.date_local, body, "→", signJa(dict, i.sign_key || "")].filter(Boolean).join(" "));
  });
  (reference?.retrogrades || []).slice(0, 3).forEach((r) => {
    const body = bodyLabelJa(dict, normalizeBodyKey(r.planet_key || "")) || r.planet_key || "";
    lines.push([body, r.start_local, "〜", r.end_local].filter(Boolean).join(" "));
  });
  const tags = buildCaptionHashtags({ reference, dict });
  return [lines.filter(Boolean).slice(0, 10).join("\n"), tags].filter(Boolean).join("\n");
}

function buildCaptionHashtags({ reference, dict }) {
  const tags = new Set();
  const add = (t) => {
    const v = String(t || "").trim();
    if (!v) return;
    tags.add(v.startsWith("#") ? v : `#${v}`);
  };
  add("ソラのこえ");
  add("今月の空");
  add("月相");
  add("逆行");
  add("星座移動");

  const phases = Array.isArray(reference?.moon?.phases) ? reference.moon.phases : [];
  phases.forEach((p) => {
    const sign = signJa(dict, p.sign_key || "");
    if (sign) add(sign);
  });
  (reference?.retrogrades || []).forEach((r) => {
    const body = bodyLabelJa(dict, normalizeBodyKey(r.planet_key || "")) || "";
    if (body) add(body);
  });
  (reference?.sign_ingresses || []).forEach((i) => {
    const body = bodyLabelJa(dict, normalizeBodyKey(i.planet_key || "")) || "";
    if (body) add(body);
  });

  return Array.from(tags).slice(0, 10).join(" ");
}

const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

function endsWithEmoji(text) {
  const chars = Array.from(String(text || ""));
  if (!chars.length) return false;
  return EMOJI_REGEX.test(chars[chars.length - 1]);
}

function endsWithSentencePunctuation(text) {
  const t = String(text || "").trim();
  return t.endsWith("。") || t.endsWith("！") || t.endsWith("？");
}

function hasValidLineEnding(line) {
  const t = String(line || "").trim();
  if (!t) return true;
  if (t.startsWith("#")) return true;
  if (endsWithEmoji(t) || endsWithSentencePunctuation(t)) return true;
  const last = Array.from(t).slice(-1)[0] || "";
  const invalidParticles = new Set(["が","を","に","へ","と","で","から","まで","より","や","の","も","は","へ","と","、"]);
  return !invalidParticles.has(last);
}

async function generateIgMonthlyCaptionText({ month, reference, dict, openai, maxRetries = 2, forceAi = false }) {
  const apiKey = openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY missing" };

  const model = openai?.model || process.env.OPENAI_MODEL || "gpt-4o";
  let resolvedMaxRetries = resolveMaxRetries({ maxRetries, openaiMaxRetries: openai?.maxRetries });
  if (forceAi) resolvedMaxRetries = Math.max(resolvedMaxRetries, 4);

  const titleLine = `⭐️ ${formatMonthDot(month)} 今月の星カレンダー`;
  const maxBodyChars = 1000;

  const result = await generateWithRetry({
    buildPrompt: () => buildCaptionPrompt({ month, reference, dict }),
    buildRetryNote: () =>
      "条件外でした。TIMELINEの全項目を落とさず、各説明は短く、文末は必ず「。」か絵文字で閉じ、まとめは3〜4文で意味と力学が読める明るい締めにして、全体を1000文字以内で再出力してください。",
    validate: ({ raw }) => {
      const verdict = runAiTextPipeline({
        rawText: raw,
        preset: PRESETS.ig.monthly_caption,
        overrides: { maxChars: maxBodyChars },
      });
      if (!verdict.ok) return { ok: false, reason: verdict.reason || "" };
      const text = String(verdict.text || "");
      if (!text.includes("今月の空模様のまとめ")) return { ok: false, reason: "missing_summary" };
      const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
      if (lines.some((line) => !hasValidLineEnding(line))) return { ok: false, reason: "invalid_line_ending" };
      return { ok: true, text: verdict.text };
    },
    createChatCompletion,
    openai: {
      apiKey,
      baseUrl: openai?.baseUrl,
      model,
      maxRetries: openai?.maxRetries,
    },
    maxRetries: resolvedMaxRetries,
    systemPrompt: SORA_AI_SYSTEM_PROMPT_COMMON,
    temperature: 0.4,
    maxTokens: 700,
    context: { month, reference },
  });

  if (result.ok) return { ok: true, text: result.text, model, attempts: result.attempts, last_text: result.lastText };

  if (String(result.error || "").includes("missing") || String(result.error || "").startsWith("openai_error:")) {
    if (forceAi) {
      return { ok: false, error: result.error || "retry_exceeded", reason: result.reason, attempts: result.attempts, last_text: result.lastText };
    }
    return { ok: false, error: result.error || "retry_exceeded", reason: result.reason, attempts: result.attempts, last_text: result.lastText };
  }

  const fallback = buildCaptionFallback({ month, reference, dict });
  return {
    ok: !forceAi,
    text: fallback,
    model,
    fallback: true,
    reason: result.reason || "",
    fallback_reason: result.reason || result.error || "",
    attempts: result.attempts,
    last_text: result.lastText,
  };
}

module.exports = {
  generateIgMonthlyCaptionText,
  formatMonthDot,
  buildCaptionPrompt,
  buildMonthlyEventTimeline,
  buildCaptionFallback,
  buildCaptionHashtags,
};
