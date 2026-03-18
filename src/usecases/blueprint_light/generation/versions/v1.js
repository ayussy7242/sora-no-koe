"use strict";

/**
 * Legacy v1 generator (kept for compatibility).
 * If only v2 is used, this can be retired later.
 */
const { createChatCompletion } = require("../../../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_BLUEPRINT_LIGHT,
  BLUEPRINT_LIGHT_USER_PROMPT_TEMPLATE,
} = require("../../../../content/prompts/sora/sora_ai_prompts");
const { extractJson, parseJsonWithRepair } = require("../json_utils");
const {
  normalizeParagraph,
  coerceText,
  normalizedLength,
  splitSentences,
  tidyConsolidatedText,
  isTooShort,
} = require("../text_utils");
const {
  hasTemplateReuse,
  collectTemplatePhraseHits,
  collectRepeatedSentences,
  collectSourceTexts,
} = require("../retry_rules");

const REQUIRED_BODY_KEYS = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
];
const REQUIRED_ANGLE_KEYS = ["asc", "mc", "ic", "dc"];

const MAX_TOKENS_ALL_BATCH = 5000;
const MIN_BODY_CHARS = 80;
const MIN_SUMMARY_CHARS = 0;
const MIN_CLOSING_CHARS = 90;
const PLANET_CORE_MAP = Object.freeze({
  sun: "自己表現",
  moon: "感情",
  mercury: "言葉",
  venus: "好意",
  mars: "推進",
  jupiter: "拡大",
  saturn: "構造",
  uranus: "更新",
  neptune: "理想",
  pluto: "深度",
  chiron: "傷",
  lilith: "衝動",
  south_node: "慣性",
  north_node: "方向",
  asc: "入口",
  mc: "表舞台",
  ic: "根",
  dc: "関係",
});

const SIGN_INFO_MAP = Object.freeze({
  牡羊座: { element: "火", modality: "活動" },
  牡牛座: { element: "地", modality: "不動" },
  双子座: { element: "風", modality: "柔軟" },
  蟹座: { element: "水", modality: "活動" },
  獅子座: { element: "火", modality: "不動" },
  乙女座: { element: "地", modality: "柔軟" },
  天秤座: { element: "風", modality: "活動" },
  蠍座: { element: "水", modality: "不動" },
  射手座: { element: "火", modality: "柔軟" },
  山羊座: { element: "地", modality: "活動" },
  水瓶座: { element: "風", modality: "不動" },
  魚座: { element: "水", modality: "柔軟" },
});

function hasTooShortSections(source, { minChars = MIN_BODY_CHARS, ratio = 0.5 } = {}) {
  const texts = collectSourceTexts(source);
  if (!texts.length) return false;
  let short = 0;
  for (const text of texts) {
    if (normalizedLength(text) < minChars) short += 1;
  }
  return short / texts.length >= ratio;
}

function ensureCountsLine(text, countsLine) {
  const line = String(countsLine || "").trim();
  if (!line) return String(text || "").trim();
  const raw = String(text || "").trim();
  if (!raw) return line;
  const lines = raw.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (lines[0] === line) return lines.join("\n");
  const filtered = lines.filter((l) => l !== line);
  return [line, ...filtered].join("\n");
}

function buildSimpleBundle(input) {
  const summary = input?.kernel?.summary || {};
  const element = summary?.element || {};
  const modality = summary?.modality || {};

  const bodiesKernel = Array.isArray(input?.kernel?.bodies) ? input.kernel.bodies : [];
  const anglesKernel = Array.isArray(input?.kernel?.angles) ? input.kernel.angles : [];
  const chironKernel = input?.kernel?.chiron || null;
  const lilithKernel = input?.kernel?.lilith || null;
  const nodesKernel = input?.kernel?.nodes || {};

  const bodies = bodiesKernel.map((body) => {
    const sign = body?.kernel?.meta?.sign_ja || "";
    const signInfo = SIGN_INFO_MAP[sign] || {};
    const phase = body?.kernel?.degree_phase_v2?.name || body?.kernel?.degree_phase?.key || "";
    return {
      key: body?.key || "",
      label: body?.kernel?.meta?.label || body?.kernel?.meta?.key || body?.key || "",
      sign,
      degree: body?.kernel?.meta?.deg ?? "",
      phase,
      element: signInfo.element || "",
      modality: signInfo.modality || "",
    };
  });

  const angles = anglesKernel.map((angle) => {
    const sign = angle?.kernel?.meta?.sign_ja || "";
    const signInfo = SIGN_INFO_MAP[sign] || {};
    const phase = angle?.kernel?.degree_phase_v2?.name || angle?.kernel?.degree_phase?.key || "";
    return {
      key: angle?.key || "",
      label: angle?.kernel?.meta?.label || angle?.kernel?.meta?.key || angle?.key || "",
      sign,
      degree: angle?.kernel?.meta?.deg ?? "",
      phase,
      element: signInfo.element || "",
      modality: signInfo.modality || "",
    };
  });

  const nodes = {
    south: nodesKernel?.south
      ? (() => {
          const sign = nodesKernel?.south?.kernel?.meta?.sign_ja || "";
          const signInfo = SIGN_INFO_MAP[sign] || {};
          const phase = nodesKernel?.south?.kernel?.degree_phase_v2?.name || nodesKernel?.south?.kernel?.degree_phase?.key || "";
          return {
            label: nodesKernel?.south?.kernel?.meta?.label || nodesKernel?.south?.kernel?.meta?.key || "南ノード",
            sign,
            degree: nodesKernel?.south?.kernel?.meta?.deg ?? "",
            phase,
            element: signInfo.element || "",
            modality: signInfo.modality || "",
          };
        })()
      : null,
    north: nodesKernel?.north
      ? (() => {
          const sign = nodesKernel?.north?.kernel?.meta?.sign_ja || "";
          const signInfo = SIGN_INFO_MAP[sign] || {};
          const phase = nodesKernel?.north?.kernel?.degree_phase_v2?.name || nodesKernel?.north?.kernel?.degree_phase?.key || "";
          return {
            label: nodesKernel?.north?.kernel?.meta?.label || nodesKernel?.north?.kernel?.meta?.key || "北ノード",
            sign,
            degree: nodesKernel?.north?.kernel?.meta?.deg ?? "",
            phase,
            element: signInfo.element || "",
            modality: signInfo.modality || "",
          };
        })()
      : null,
  };

  const chiron = chironKernel
    ? (() => {
        const sign = chironKernel?.kernel?.meta?.sign_ja || "";
        const signInfo = SIGN_INFO_MAP[sign] || {};
        const phase = chironKernel?.kernel?.degree_phase_v2?.name || chironKernel?.kernel?.degree_phase?.key || "";
        return {
          label: chironKernel?.kernel?.meta?.label || chironKernel?.kernel?.meta?.key || "キロン",
          sign,
          degree: chironKernel?.kernel?.meta?.deg ?? "",
          phase,
          element: signInfo.element || "",
          modality: signInfo.modality || "",
        };
      })()
    : null;
  const lilith = lilithKernel
    ? (() => {
        const sign = lilithKernel?.kernel?.meta?.sign_ja || "";
        const signInfo = SIGN_INFO_MAP[sign] || {};
        const phase = lilithKernel?.kernel?.degree_phase_v2?.name || lilithKernel?.kernel?.degree_phase?.key || "";
        return {
          label: lilithKernel?.kernel?.meta?.label || lilithKernel?.kernel?.meta?.key || "リリス",
          sign,
          degree: lilithKernel?.kernel?.meta?.deg ?? "",
          phase,
          element: signInfo.element || "",
          modality: signInfo.modality || "",
        };
      })()
    : null;

  const signCounts = bodies.reduce((acc, item) => {
    const sign = String(item?.sign || "").trim();
    if (!sign) return acc;
    acc[sign] = (acc[sign] || 0) + 1;
    return acc;
  }, {});
  const dominantSigns = Object.entries(signCounts)
    .sort((a, b) => b[1] - a[1])
    .filter(([, count]) => count >= 2)
    .map(([sign]) => sign);
  const stelliumSigns = Object.entries(signCounts)
    .filter(([, count]) => count >= 3)
    .map(([sign]) => sign);

  const angleSigns = anglesKernel.reduce((acc, angle) => {
    const key = String(angle?.key || "").trim().toLowerCase();
    const sign = String(angle?.kernel?.meta?.sign_ja || "").trim();
    if (!key || !sign) return acc;
    acc[key] = sign;
    return acc;
  }, {});

  return {
    summary: {
      element: {
        counts_line: element?.counts_line || "",
        counts: element?.counts || {},
        dominant: element?.dominant || [],
        missing: element?.missing || [],
        order_hint: element?.order_hint || "",
        residue_hint: element?.residue_hint || "",
      },
      modality: {
        counts_line: modality?.counts_line || "",
        counts: modality?.counts || {},
        dominant: modality?.dominant || [],
        missing: modality?.missing || [],
        order_hint: modality?.order_hint || "",
        residue_hint: modality?.residue_hint || "",
      },
    },
    bodies,
    angles,
    nodes,
    chiron,
    lilith,
    closing: {
      elements: element?.counts || {},
      element_dominant: element?.dominant || [],
      element_missing: element?.missing || [],
      modalities: modality?.counts || {},
      modality_dominant: modality?.dominant || [],
      modality_missing: modality?.missing || [],
      dominant_signs: dominantSigns,
      stellium_signs: stelliumSigns,
      bodies_signs: bodies.reduce((acc, item) => {
        if (!item?.key || !item?.sign) return acc;
        acc[item.key] = item.sign;
        return acc;
      }, {}),
      angles: angleSigns,
      nodes: {
        south: nodes?.south?.sign || "",
        north: nodes?.north?.sign || "",
      },
    },
    focus: {
      dominant_signs: dominantSigns,
      dominant_houses: (() => {
        const houseCounts = input?.kernel?.houses?.counts || {};
        return Object.entries(houseCounts)
          .map(([house, count]) => ({ house: Number(house), count: Number(count) }))
          .sort((a, b) => (b.count - a.count) || (a.house - b.house))
          .slice(0, 3)
          .map((row) => `${row.house}H`);
      })(),
      element_dominant: element?.dominant || [],
      modality_dominant: modality?.dominant || [],
      core_axis: {
        sun: bodies.find((row) => row.key === "sun") || null,
        moon: bodies.find((row) => row.key === "moon") || null,
        asc: angles.find((row) => row.key === "asc") || null,
      },
    },
  };
}

function buildAllBatchPromptSimple({ input, retryNote = "" }) {
  const header = BLUEPRINT_LIGHT_USER_PROMPT_TEMPLATE;

  const payload = buildSimpleBundle(input);
  const note = retryNote ? `\n\n【追加指示】${retryNote}\n` : "";
  return `${header}${note}\nINPUT:\n${JSON.stringify(payload || {}, null, 2)}`;
}

async function generateAllBatchSimple({ apiKey, baseUrl, model, input, retryNote = "" }) {
  const prompt = buildAllBatchPromptSimple({ input, retryNote });
  const content = await createChatCompletion({
    apiKey,
    baseUrl,
    model,
    messages: [
      { role: "system", content: SORA_AI_SYSTEM_PROMPT_BLUEPRINT_LIGHT },
      { role: "user", content: prompt },
    ],
    temperature: 0.9,
    maxTokens: MAX_TOKENS_ALL_BATCH,
  });
  if (content === "__RETRY__") return { ok: false, reason: "retry" };
  const jsonText = extractJson(content);
  if (!jsonText) return { ok: false, reason: "json_extract_failed" };
  const parsed = parseJsonWithRepair(jsonText);
  if (!parsed.ok) return { ok: false, reason: "json_parse_failed", error: parsed.error };
  if (!parsed.data || typeof parsed.data !== "object") return { ok: false, reason: "shape_invalid" };
  return { ok: true, data: parsed.data };
}

function buildSummaryExampleLines(kernel, label = "") {
  const dominant = Array.isArray(kernel?.dominant) ? kernel.dominant : [];
  const missing = Array.isArray(kernel?.missing) ? kernel.missing : [];
  const orderHint = String(kernel?.order_hint || "").trim();
  const residueHint = String(kernel?.residue_hint || "").trim();

  if (label === "element") {
    const lines = [];
    if (dominant.length && missing.length) {
      if (missing.includes("風")) {
        lines.push(`${dominant.join("と")}が多く、${missing.join("・")}が存在しない構造。`);
      } else {
        lines.push(`${dominant.join("と")}が多く、${missing.join("・")}が欠ける構造。`);
      }
    } else if (dominant.length) {
      lines.push(`${dominant.join("と")}が多い構造。`);
    } else if (missing.length) {
      lines.push(`${missing.join("・")}が欠ける構造。`);
    }

    let reaction = "出来事や人の反応は「意味」より先に、感触として入ってきやすい。";
    if (orderHint.includes("感触")) reaction = "出来事や人の反応は「意味」より先に、感触・重さ・気配として入ってきやすい。";
    if (orderHint.includes("動き")) reaction = "出来事や反応は「意味」より先に、動き・勢いとして立ち上がりやすい。";
    if (orderHint.includes("揺らぎ")) reaction = "出来事や反応は「意味」より先に、揺らぎや気配として立ち上がりやすい。";
    lines.push(reaction);

    let orderLine = "理解してから感じるのではなく、感じてしまったあとに、言葉を探す。";
    if (orderHint.includes("動き")) orderLine = "考えてから動くのではなく、動いてから理由を探す。";
    if (orderHint.includes("揺らぎ")) orderLine = "整えてから動くのではなく、揺れが先に立つ。";
    lines.push(orderLine);

    if (missing.includes("風")) {
      lines.push("空気を説明する側というより、空気の中に最初から入ってしまう側の反応。");
    } else if (missing.includes("火")) {
      lines.push("点火を待つ側に寄る反応。");
    } else if (missing.includes("地")) {
      lines.push("着地を探しながら動く反応。");
    } else if (missing.includes("水")) {
      lines.push("余韻より先に輪郭を立てる反応。");
    } else if (residueHint) {
      lines.push(`${residueHint}。`);
    }
    return lines.filter(Boolean);
  }

  if (label === "modality") {
    const lines = [];
    if (dominant.length && missing.length) {
      lines.push(`${dominant.join("と")}が強く、${missing.join("・")}が欠ける。`);
    } else if (dominant.length) {
      lines.push(`${dominant.join("と")}が強い。`);
    } else if (missing.length) {
      lines.push(`${missing.join("・")}が欠ける。`);
    }
    lines.push("動き出しの圧と、留まり続ける圧が同時に強い。");
    lines.push("一度鳴った感触は、簡単には消えない。");
    lines.push("切り替えは「調整」ではなく、一度止まり、位相ごと変わる形で起きやすい。");
    return lines.filter(Boolean);
  }

  return [];
}

function buildSummaryExampleText(kernel, label = "") {
  const lines = [];
  const counts = String(kernel?.counts_line || "").trim();
  if (counts) lines.push(counts);
  const bodyLines = buildSummaryExampleLines(kernel, label);
  for (const line of bodyLines) {
    lines.push(line.endsWith("。") ? line : `${line}。`);
  }
  return lines.filter(Boolean).join("\n");
}

function normalizeSummaryText(text, kernel, label) {
  let out = normalizeParagraph(coerceText(text));
  if (!out || out.includes("[object Object]")) {
    return buildSummaryExampleText(kernel, label);
  }
  // 禁止語の除去は行わない（プロンプト側で禁止）
  out = out.replace(/モダリティ|モード/gi, "三区分");
  if (!out) return buildSummaryExampleText(kernel, label);
  out = tidyConsolidatedText(out, { minSentences: 3, maxSentences: 5 });
  return ensureCountsLine(out, kernel?.counts_line || "");
}

function normalizeClosingText(text, { minSentences = 3, maxSentences = 5, minChars = MIN_CLOSING_CHARS } = {}) {
  let out = normalizeParagraph(coerceText(text));
  if (!out) return "";
  // 禁止語の除去は行わない（プロンプト側で禁止）
  out = out.replace(/モダリティ|モード/gi, "三区分");
  if (!out) return "";
  out = tidyConsolidatedText(out, { minSentences, maxSentences });
  if (isTooShort(out, minChars)) return out;
  return out;
}

function hashString(seed) {
  const str = String(seed || "");
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash >>> 0;
}

function pickOne(list, seed) {
  if (!Array.isArray(list) || !list.length) return "";
  const idx = Math.abs(seed) % list.length;
  return String(list[idx] || "").trim();
}

function buildFallbackText(core, seedKey) {
  const seed = hashString(seedKey || core);
  const lead = pickOne([
    `${core}が場の軸になる。`,
    `${core}は静かな基準として置かれる。`,
    `${core}は内側で先に働き、外側で形になる。`,
  ], seed) || `${core}が場の軸になる。`;
  const order = pickOne([
    "流れが整ってから輪郭が出る。",
    "手触りが先に来て、あとで意味が結ばれる。",
    "形ができてから理由が追う。",
  ], seed + 3) || "流れが整ってから輪郭が出る。";
  const residue = pickOne([
    "重さがゆっくり残る。",
    "響きが長く続く。",
    "痕が静かに残る。",
  ], seed + 7) || "重さがゆっくり残る。";
  return `${lead}${order}${residue}`;
}

function normalizeSectionText(text, { minSentences = 2, maxSentences = 4, minChars = MIN_BODY_CHARS } = {}) {
  let out = normalizeParagraph(coerceText(text));
  if (!out) return "";
  // 禁止語の除去は行わない（プロンプト側で禁止）
  out = out.replace(/モダリティ|モード/gi, "三区分");
  if (!out) return "";
  out = tidyConsolidatedText(out, { minSentences, maxSentences });
  if (isTooShort(out, minChars)) return out;
  return out;
}


function hasAllRequiredKeys(source) {
  const bodies = source?.bodies || {};
  const angles = source?.angles || {};
  const nodes = source?.nodes || {};
  const bodiesOk = REQUIRED_BODY_KEYS.every((k) => typeof bodies[k] === "string" && bodies[k].trim());
  const anglesOk = REQUIRED_ANGLE_KEYS.every((k) => typeof angles[k] === "string" && angles[k].trim());
  const nodesOk =
    typeof nodes?.south === "string" &&
    nodes.south.trim() &&
    typeof nodes?.north === "string" &&
    nodes.north.trim();
  const chironOk = typeof source?.chiron === "string" && source.chiron.trim();
  const lilithOk = typeof source?.lilith === "string" && source.lilith.trim();
  const summaryOk = typeof source?.summary?.element === "string" && typeof source?.summary?.modality === "string";
  const natalOk = typeof source?.natal_observation === "string" && source.natal_observation.trim();
  const closingOk = typeof source?.closing_summary === "string" && source.closing_summary.trim();
  return bodiesOk && anglesOk && nodesOk && chironOk && lilithOk && summaryOk && closingOk;
}

async function generateBlueprintLightText({ env, input }) {
  const apiKey = env?.OPENAI_API_KEY || process.env.OPENAI_API_KEY || "";
  if (!apiKey) return { ok: false, reason: "no_api_key" };
  const model =
    env?.OPENAI_MODEL_BLUEPRINT_LIGHT ||
    process.env.OPENAI_MODEL_BLUEPRINT_LIGHT ||
    "gpt-4o";
  const baseUrl = process.env.OPENAI_BASE_URL || env?.OPENAI_BASE_URL || "https://api.openai.com/v1";

  const bodyItems = Array.isArray(input?.kernel?.bodies) ? input.kernel.bodies : [];
  const angleItems = Array.isArray(input?.kernel?.angles) ? input.kernel.angles : [];

  let batch = await generateAllBatchSimple({ apiKey, baseUrl, model, input });
  if (!batch?.ok || !hasAllRequiredKeys(batch.data)) {
    batch = await generateAllBatchSimple({
      apiKey,
      baseUrl,
      model,
      input,
      retryNote: "JSONの全キー（summary/bodies/angles/nodes/chiron/lilith）を必ず出力すること。",
    });
  }
  if (batch?.ok && hasAllRequiredKeys(batch.data) && hasTemplateReuse(batch.data)) {
    const repeated = collectRepeatedSentences(batch.data);
    const repeatedNote = repeated.length ? `以下の文の再利用は禁止: ${repeated.join(" / ")}` : "";
    batch = await generateAllBatchSimple({
      apiKey,
      baseUrl,
      model,
      input,
      retryNote:
        `各項目で動詞と語感を変える。sign/phase/element/modality は必要な範囲で1回入れてよい。文型の使い回しは禁止。${repeatedNote}`,
    });
  }
  if (batch?.ok && hasAllRequiredKeys(batch.data)) {
    const templateHits = collectTemplatePhraseHits(batch.data, { minRepeat: 1 });
    if (templateHits.length) {
      batch = await generateAllBatchSimple({
        apiKey,
        baseUrl,
        model,
        input,
        retryNote:
          "同じフレーズや同じ文型の繰り返しが出ているため、別の語彙と流れで書き直すこと。",
      });
    }
  }
  if (batch?.ok && hasAllRequiredKeys(batch.data)) {
    const templateHits = collectTemplatePhraseHits(batch.data, { minRepeat: 1 });
    if (templateHits.length) {
      batch = await generateAllBatchSimple({
        apiKey,
        baseUrl,
        model,
        input,
        retryNote:
          "テンプレ的な言い回しを使わず、語尾・動詞・順序を全て変えて書き直すこと。",
      });
    }
  }
  if (batch?.ok && hasAllRequiredKeys(batch.data) && hasTemplateReuse(batch.data)) {
    batch = await generateAllBatchSimple({
      apiKey,
      baseUrl,
      model,
      input,
      retryNote:
        "テンプレの再利用は禁止。各本文は固有の語彙で書く。sign/phase/element/modality は必要な範囲で1回入れてよい。",
    });
  }
  if (batch?.ok && hasAllRequiredKeys(batch.data) && hasTooShortSections(batch.data)) {
    batch = await generateAllBatchSimple({
      apiKey,
      baseUrl,
      model,
      input,
      retryNote:
        "短すぎるので厚みを足す。各本文は2〜4文、80〜180字を目安にする。断片の羅列は禁止。",
    });
  }
  if (!batch?.ok) return { ok: false, reason: batch.reason || "ai_failed" };

  const source = batch.data || {};
  const summaryKernel = input?.kernel?.summary || {};
  const summaryBlocks = {
    element: normalizeSummaryText(source?.summary?.element || "", summaryKernel?.element || {}, "element"),
    modality: normalizeSummaryText(source?.summary?.modality || "", summaryKernel?.modality || {}, "modality"),
  };

  const closingTextRaw = normalizeClosingText(source?.closing_summary || "");
  const pickSummaryBody = (text) => {
    const lines = String(text || "")
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!lines.length) return "";
    const body = lines.length > 1 ? lines.slice(1).join(" ") : lines[0];
    return body;
  };
  const closingText = closingTextRaw
    ? closingTextRaw
    : [pickSummaryBody(summaryBlocks.element), pickSummaryBody(summaryBlocks.modality)]
        .filter(Boolean)
        .join(" ");

  const bodies = bodyItems.map((body) => {
    const key = body?.key || "";
    const core = PLANET_CORE_MAP[key] || "構造";
    let text = normalizeSectionText(source?.bodies?.[key] || "");
    if (!text) text = buildFallbackText(core, `bodies.${key}`);
    return {
      key,
      text,
      fact_line: body?.fact_line || body?.kernel?.meta?.fact_line || "",
    };
  });

  const angles = angleItems.map((angle) => {
    const key = angle?.key || "";
    const core = PLANET_CORE_MAP[key] || "構造";
    let text = normalizeSectionText(source?.angles?.[key] || "");
    if (!text) text = buildFallbackText(core, `angles.${key}`);
    return {
      key,
      text,
      fact_line: angle?.fact_line || angle?.kernel?.meta?.fact_line || "",
    };
  });

  const chironCore = PLANET_CORE_MAP.chiron || "構造";
  const lilithCore = PLANET_CORE_MAP.lilith || "構造";
  const southCore = PLANET_CORE_MAP.south_node || "構造";
  const northCore = PLANET_CORE_MAP.north_node || "構造";

  let chironText = normalizeSectionText(source?.chiron || "");
  if (!chironText) chironText = buildFallbackText(chironCore, "chiron");

  let lilithText = normalizeSectionText(source?.lilith || "");
  if (!lilithText) lilithText = buildFallbackText(lilithCore, "lilith");

  let southNodeText = normalizeSectionText(source?.nodes?.south || "");
  if (!southNodeText) southNodeText = buildFallbackText(southCore, "nodes.south");

  let northNodeText = normalizeSectionText(source?.nodes?.north || "");
  if (!northNodeText) northNodeText = buildFallbackText(northCore, "nodes.north");

  const data = {
    version: "blueprint_light_v1",
    sections: [
      {
        id: "summary",
        blocks: [
          { id: "element", text: summaryBlocks.element },
          { id: "modality", text: summaryBlocks.modality },
        ],
      },
      {
        id: "bodies",
        items: bodies,
      },
      {
        id: "chiron",
        text: chironText,
      },
      {
        id: "lilith",
        text: lilithText,
      },
      {
        id: "nodes",
        south: { text: southNodeText },
        north: { text: northNodeText },
      },
      {
        id: "angles",
        items: angles,
      },
      {
        id: "closing_summary",
        title: "⑧ 全体の統括",
        text: closingText || "",
      },
    ],
    footer: {
      echo: "星は語る。解釈はあなたのもの🌃",
      note: "ソラのこえ / BLUEPRINT LIGHT v1",
    },
  };

  return { ok: true, data };
}

module.exports = Object.freeze({
  generateBlueprintLightText,
});
