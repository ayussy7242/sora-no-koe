"use strict";

const { signJa } = require("../../../presenters/format/format/line_common");

function countChars(text) {
  return Array.from(String(text || "")).length;
}

function hasForbidden(text) {
  const t = String(text || "");
  const forbidden = /(すべき|した方がいい|するといい|してください|必ず|確実|運命|使命|アドバイス|促されるでしょう)/;
  return forbidden.test(t);
}

function findSplitIndex(chars, maxChars, marks, maxOverflow = 2, minSplitChars = 6) {
  const splitMarks = new Set(marks);
  const candidates = [];
  for (let i = 0; i < chars.length; i++) {
    if (!splitMarks.has(chars[i])) continue;
    const idx = i + 1;
    if (idx < minSplitChars) continue;
    candidates.push(idx);
  }

  const before = candidates.filter((i) => i <= maxChars);
  if (before.length) return before[before.length - 1];

  const after = candidates.filter((i) => i <= maxChars + maxOverflow);
  if (after.length) return after[0];

  return null;
}

function collapseBlankRuns(lines) {
  const out = [];
  let blankRun = 0;
  const flushBlanks = () => {
    if (blankRun <= 0) return;
    if (blankRun >= 3) {
      out.push("");
    } else {
      for (let i = 0; i < blankRun; i++) out.push("");
    }
    blankRun = 0;
  };

  for (const line of lines) {
    const isBlank = !String(line || "").trim();
    if (isBlank) {
      blankRun += 1;
      continue;
    }
    flushBlanks();
    out.push(line);
  }
  flushBlanks();

  return out;
}

function isEmojiLine(line, maxChars = 4) {
  const t = String(line || "").trim();
  if (!t) return false;
  const chars = Array.from(t);
  if (chars.length < 1 || chars.length > maxChars) return false;
  return chars.every((ch) => /\p{Extended_Pictographic}/u.test(ch));
}

function mergeTrailingEmojiLines(lines, maxChars = 4) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isEmojiLine(line, maxChars)) {
      const hasPrev = out.length > 0 && String(out[out.length - 1] || "").trim();
      const next = lines[i + 1];
      const hasNextText = next && String(next || "").trim() && !isEmojiLine(next, maxChars);
      if (hasPrev && !hasNextText) {
        let emoji = String(line || "").trim();
        i += 1;
        while (i < lines.length && isEmojiLine(lines[i], maxChars)) {
          emoji += String(lines[i] || "").trim();
          i += 1;
        }
        out[out.length - 1] = `${out[out.length - 1]}${emoji}`;
        continue;
      }
    }
    out.push(line);
    i += 1;
  }
  return out;
}

function formatXAiText(text, opts = {}) {
  const maxLineChars = Number.isFinite(Number(opts.maxLineChars)) ? Number(opts.maxLineChars) : 20;
  const mergeEmoji = opts.mergeEmoji !== false;

  const normalizedText = String(text || "")
    .replace(/\r\n/g, "\n")
    // 絵文字直後の「。」は削る
    .replace(/(\p{Extended_Pictographic}\uFE0F?)。/gu, "$1")
    // 絵文字直前の「。」は削る
    .replace(/[。．.]\s*(?=\p{Extended_Pictographic})/gu, "")
    // 絵文字の直後に改行が無い場合は改行を入れる
    .replace(/(\p{Extended_Pictographic}\uFE0F?)(?!\n)(?=\S)/gu, "$1\n");

  const rawLines = normalizedText.split("\n");

  const normalized = collapseBlankRuns(rawLines);

  const out = [];
  for (const line of normalized) {
    const isBlank = !String(line || "").trim();
    if (isBlank) {
      out.push("");
      continue;
    }
    const trimmed = String(line || "").trim();
    const chars = Array.from(trimmed);
    let rest = trimmed;
    while (true) {
      const restChars = Array.from(rest);
      if (restChars.length <= maxLineChars) {
        out.push(rest);
        break;
      }
      let splitAt = findSplitIndex(restChars, maxLineChars, ["、"]);
      let splitMark = "、";
      if (splitAt == null) {
        splitAt = findSplitIndex(restChars, maxLineChars, ["。"]);
        splitMark = "。";
      }
      if (splitAt == null) {
        out.push(rest);
        break;
      }
      const left = restChars.slice(0, splitAt).join("").trim();
      const right = restChars.slice(splitAt).join("").trim();
      if (!left || !right) {
        out.push(rest);
        break;
      }
      out.push(left);
      if (splitMark === "。") out.push("");
      rest = right;
    }
  }

  const merged = mergeEmoji ? mergeTrailingEmojiLines(out) : out;
  return merged.join("\n").trim();
}

function validateXAiText(text, opts = {}) {
  const t = formatXAiText(text, opts);
  if (!t) return { ok: false, reason: "empty" };
  if (t.includes("あなた")) return { ok: false, reason: "has_you" };
  if (hasForbidden(t)) return { ok: false, reason: "has_forbidden" };
  const len = countChars(t);
  const minChars = Number.isFinite(Number(opts.minChars)) ? Number(opts.minChars) : 60;
  const maxChars = Number.isFinite(Number(opts.maxChars)) ? Number(opts.maxChars) : 180;
  if (len < minChars) return { ok: false, reason: `too_short:${len}` };
  if (len > maxChars) return { ok: false, reason: `too_long:${len}` };
  return { ok: true, text: t, len };
}

function clampText(text, maxChars) {
  const max = Number.isFinite(Number(maxChars)) ? Number(maxChars) : null;
  const t = String(text || "").trim();
  if (!max) return t;
  const chars = Array.from(t);
  if (chars.length <= max) return t;
  return chars.slice(0, max).join("");
}

function stripTrailingPeriod(text) {
  return String(text || "").replace(/[。．.]\s*$/u, "");
}

function getSunMoonLabels({ story, dict }) {
  const transit = story?.public?.transit_signs || {};
  const sunKey = transit?.sun?.sign_key || "";
  const moonKey = transit?.moon?.sign_key || "";
  const sun = transit?.sun?.sign_ja || (sunKey ? signJa(dict, sunKey) : "") || "";
  const moon = transit?.moon?.sign_ja || (moonKey ? signJa(dict, moonKey) : "") || "";
  return { sun, moon };
}

function buildMorningFallback({ story, dict, maxChars }) {
  const { sun, moon } = getSunMoonLabels({ story, dict });
  const line1 = "朝の空は静かに動き始めています🌅";
  const line2 = (sun && moon)
    ? `太陽は${sun}、月は${moon}にあり、流れの輪郭が立ち上がっています🌌`
    : "空の配置がゆっくりと形を持ち始めています🌌";
  const line3 = "空にはまだ静かな余白が残っています🌿";
  const text = [line1, "", line2, "", line3].join("\n");
  return clampText(text, maxChars);
}

function buildNightFallback({ story, dict, maxChars, nextHint }) {
  const { sun, moon } = getSunMoonLabels({ story, dict });
  const line1 = "夜の空は静かに深まっています🌙";
  const line2 = (sun && moon)
    ? `太陽は${sun}、月は${moon}にあり、今日の気配が残る配置です🌌`
    : (moon ? `月は${moon}にあり、夜の質感がゆるやかに続きます🌌` : "夜の質感がゆるやかに続きます🌌");
  const hintText = stripTrailingPeriod(nextHint || "空は次の流れへ向かっています");
  const line3 = `${hintText}🌊`;
  const text = [line1, "", line2, "", line3].join("\n");
  return clampText(text, maxChars);
}

function buildResonanceFallback({ story, dict, maxChars, aspect }) {
  const raw = aspect?.raw || story?.meta?.x_source?.resonance_aspect || {};
  const aSign = aspect?.aSign || raw?.a_sign_ja || signJa(dict, raw?.a_sign_key || "");
  const bSign = aspect?.bSign || raw?.b_sign_ja || signJa(dict, raw?.b_sign_key || "");
  const pair = [aSign, bSign].filter(Boolean).join("と");

  const line1 = "空に小さな交差が生まれています🌌";
  const line2 = pair
    ? `${pair}の間で、静かな張力が残っています🌊`
    : "静かな張力が空に残っています🌊";
  const line3 = "空の振動がゆっくり広がっています✨";
  const text = [line1, "", line2, "", line3].join("\n");
  return clampText(text, maxChars);
}

function buildGenericFallback({ maxChars }) {
  const text = "空の流れを静かに観測します。";
  return clampText(text, maxChars);
}

function fallbackFactory(args = {}) {
  const channel = args.channel || "";
  switch (channel) {
    case "x_morning":
      return buildMorningFallback(args);
    case "x_night":
      return buildNightFallback(args);
    case "x_resonance":
      return buildResonanceFallback(args);
    default:
      return buildGenericFallback(args);
  }
}

function truncateToMaxChars(text, maxChars) {
  const max = Number.isFinite(Number(maxChars)) ? Number(maxChars) : null;
  if (!max) return String(text || "").trim();
  const chars = Array.from(String(text || "").trim());
  if (chars.length <= max) return chars.join("");
  return chars.slice(0, max).join("");
}

function buildRetryNote({ reason, template, minChars, maxChars, channel }) {
  if (typeof template === "function") {
    return template({ reason, minChars, maxChars, channel });
  }
  const base = String(template || "前回は条件外でした（${reason}）。条件に合わせて整えて再出力。");
  return base
    .replace(/\$\{reason\}/g, String(reason || "unknown"))
    .replace(/\$\{minChars\}/g, String(minChars ?? ""))
    .replace(/\$\{maxChars\}/g, String(maxChars ?? ""))
    .replace(/\$\{channel\}/g, String(channel || ""));
}

async function generateXAiWithRetry(opts = {}) {
  const channel = opts.channel || "";
  const prompt = String(opts.prompt || "").trim();
  const minChars = Number.isFinite(Number(opts.minChars)) ? Number(opts.minChars) : undefined;
  const maxChars = Number.isFinite(Number(opts.maxChars)) ? Number(opts.maxChars) : undefined;
  const maxTokens = Number.isFinite(Number(opts.maxTokens)) ? Number(opts.maxTokens) : 160;
  const temperature = Number.isFinite(Number(opts.temperature)) ? Number(opts.temperature) : 0.5;
  const maxRetries = Number.isFinite(Number(opts.maxRetries)) ? Number(opts.maxRetries) : 5;
  const fallbackFn = typeof opts.fallbackFactory === "function" ? opts.fallbackFactory : null;
  const fallbackContext = opts.fallbackContext || {};
  const story = opts.story;
  const dict = opts.dict;

  const openai = opts.openai || {};
  const apiKey = openai.apiKey || process.env.OPENAI_API_KEY;
  const baseUrl = openai.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = openai.model || process.env.OPENAI_MODEL || "gpt-4o";
  const systemPrompt = opts.systemPrompt || "";
  const create = opts.createChatCompletion;

  const finalizeFallback = (fallbackText, reason) => {
    const formatted = formatXAiText(fallbackText || "", { maxLineChars: opts.maxLineChars });
    const trimmed = truncateToMaxChars(formatted, maxChars);
    const safeText = trimmed || "空の流れを静かに観測します。";
    return {
      ok: true,
      text: safeText,
      model: model || null,
      fallback: true,
      fallback_reason: reason || "",
    };
  };

  if (!apiKey) {
    if (fallbackFn) {
      return finalizeFallback(
        fallbackFn({ channel, story, dict, maxChars, error: "OPENAI_API_KEY missing", errorReason: "OPENAI_API_KEY missing", ...fallbackContext }),
        "OPENAI_API_KEY missing"
      );
    }
    return { ok: false, error: "OPENAI_API_KEY missing" };
  }
  if (typeof create !== "function") {
    if (fallbackFn) {
      return finalizeFallback(
        fallbackFn({ channel, story, dict, maxChars, error: "createChatCompletion missing", errorReason: "createChatCompletion missing", ...fallbackContext }),
        "createChatCompletion missing"
      );
    }
    return { ok: false, error: "createChatCompletion missing" };
  }
  if (!prompt) {
    if (fallbackFn) {
      return finalizeFallback(
        fallbackFn({ channel, story, dict, maxChars, error: "prompt empty", errorReason: "prompt empty", ...fallbackContext }),
        "prompt empty"
      );
    }
    return { ok: false, error: "prompt empty" };
  }

  let retryNote = "";
  let lastReason = "";
  let lastText = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const userPrompt = prompt +
      (retryNote ? `\n\nRETRY_NOTE: ${retryNote}` : "") +
      (lastText ? `\n\nPREV_OUTPUT:\n${lastText}\n\n上の出力を条件に合わせて整えて再出力。` : "");

    const text = await create({
      apiKey,
      baseUrl,
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      maxTokens,
    });

    const verdict = validateXAiText(text, { minChars, maxChars });
    if (verdict.ok) return { ok: true, text: verdict.text, model, len: verdict.len };

    lastReason = verdict.reason || "";
    lastText = String(text || "").trim();
    retryNote = buildRetryNote({
      reason: lastReason,
      template: opts.retryNoteTemplate,
      minChars,
      maxChars,
      channel,
    });
  }

  if (fallbackFn) {
    return finalizeFallback(
      fallbackFn({
        channel,
        story,
        dict,
        maxChars,
        error: "retry_exceeded",
        errorReason: lastReason,
        lastText,
        minChars,
        ...fallbackContext,
      }),
      lastReason || "retry_exceeded"
    );
  }

  return { ok: false, error: "retry_exceeded", reason: lastReason, last_text: lastText };
}

module.exports = {
  formatXAiText,
  validateXAiText,
  generateXAiWithRetry,
  fallbackFactory,
};
