"use strict";

const dict = require("../../dict");
const { createChatCompletion } = require("./openai_client");
const { buildBlogBlocks, blocksToInput } = require("./story_blocks");
const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
} = require("../prompts/sora_ai_prompts");
const {
  BLOG_BLOCKS_USER_GUIDE,
  BLOG_BLOCK_SECTION_GUIDE,
  BLOG_BLOCK_ITEM_GUIDE,
  BLOG_STRUCT_HOUSE_GUIDE,
  BLOG_STRUCT_ELEMENT_GUIDE,
  BLOG_LONG_OVERVIEW_GUIDE,
  BLOG_LONG_POSITION_GUIDE,
  BLOG_LONG_RESONANCE_GUIDE,
  BLOG_LONG_HOUSE_GUIDE,
  BLOG_LONG_ELEMENTS_GUIDE,
  BLOG_LONG_RETRO_GUIDE,
  BLOG_LONG_AFTERTASTE_GUIDE,
} = require("../prompts/blog_blocks");
const { SPEC } = require("../config/sora_spec");
const { buildRetrogradeMap } = require("../astro/retrograde");
const { weightForBody } = require("../domain/touch_point_scoring");
const {
  computeTokyoAscDeg,
  signIndexFromKey,
  houseNumberForSignIndex,
  findTransitTransitWindow,
  formatDateYmd,
  formatDateYmdHm,
  calcTransitLon,
} = require("../domain/astro_compute");
const { bodyGlyph, bodyLabelJa, signLabelJa, signGlyph } = require("../presenter/render_tokens");
const { normalizeBodyKey, normalizeSignKey, normalizeAspectKey } = require("../domain/canonical");
const {
  formatTodayMoonLines,
  formatNextMoonLines,
  orderedMoonEvents,
} = require("../domain/moon_info");

const BLOG_BANNED_TERMS = [
  "あなた",
  "あなたは",
  "あなたが",
  "必ず",
  "確実",
  "逃れられない",
  "絶対",
  "運命",
  "使命",
  "すべき",
  "した方がいい",
  "したほうがいい",
  "しよう",
  "求められる",
  "必要",
  "可能性",
  "かもしれない",
  "調整",
  "安定感",
  "バランス",
  "うまく",
  "成功",
  "失敗",
  "成長",
  "癒し",
  "学び",
  "導き",
  "目覚め",
  "示唆",
  "問われる",
  "大事",
  "正しい",
  "間違い",
  "べき",
  "示す",
  "意味する",
  "促す",
  "影響する",
  "課題",
];

function findBannedTerm(text) {
  const s = String(text || "");
  if (!s) return "";
  for (const t of BLOG_BANNED_TERMS) {
    if (t && s.includes(t)) return t;
  }
  return "";
}

function normalizeAspectType(raw) {
  const x = String(raw || "").trim().toLowerCase();
  if (!x) return "";
  const base = x.replace(/_\d+$/, "");
  const map = {
    inconjunct: "quincunx_150",
    quincunx: "quincunx_150",
    semisquare: "semi_square_45",
    semi_square: "semi_square_45",
    sesquisquare: "sesqui_square_135",
    sesqui_square: "sesqui_square_135",
  };
  return map[base] || base;
}

const ASPECTS_META = {
  ...(dict?.ASPECTS_V2?.major || {}),
  ...(dict?.ASPECTS_V2?.deep_space || {}),
  ...(dict?.ASPECTS_V2?.craft_space || {}),
};

const ASPECTS_MAJOR_KEYS = new Set(Object.keys(dict?.ASPECTS_V2?.major || {}));
const ASPECTS_DEEP_KEYS = new Set(Object.keys(dict?.ASPECTS_V2?.deep_space || {}));
const ASPECTS_CRAFT_KEYS = new Set(Object.keys(dict?.ASPECTS_V2?.craft_space || {}));
const ASPECTS_RARE_PRI = new Set([
  "quintile_72",
  "biquintile_144",
  "septile_51",
  "biseptile_102",
  "triseptile_154",
  "sesqui_square_135",
]);

const ASPECT_QUALITY_MAP = Object.freeze({
  conjunction: ["密度", "重なり", "厚み", "濃度", "合流"],
  opposition: ["張り", "対照", "揺れ", "鏡", "間"],
  square: ["ざらつき", "圧", "ひずみ", "引っかかり", "張り"],
  trine: ["ほどけ", "風通し", "抜け", "ゆるみ", "余白"],
  sextile: ["通路", "ひらき", "空白", "ゆるみ", "交点"],
  semi_square_45: ["ざらつき", "引っかかり", "端差", "張り", "圧"],
  sesqui_square_135: ["圧", "引っかかり", "蓄積", "調整", "摩耗"],
  quincunx_150: ["ずれ", "未調整", "折れ", "違和感", "端差"],
  semi_sextile_30: ["にじみ", "余白", "境目", "滲点", "ゆらぎ"],
  quintile_72: ["工夫", "編み直し", "妙技", "ひらめき", "端差"],
  biquintile_144: ["調律", "余白", "抜け", "響き", "整え直し"],
  novile_40: ["静けさ", "ゆるみ", "余白", "ほどけ", "にじみ"],
  binovile_80: ["静けさ", "ゆるみ", "余白", "ほどけ", "にじみ"],
  quadranovile_160: ["静けさ", "ゆるみ", "余白", "ほどけ", "にじみ"],
  decile_36: ["伸び", "抜け", "ひらき", "工夫", "通り"],
  tridecile_108: ["伸び", "抜け", "ひらき", "工夫", "通り"],
  // aliases / family keys
  inconjunct: ["ずれ", "未調整", "折れ", "違和感", "端差"],
  quincunx: ["ずれ", "未調整", "折れ", "違和感", "端差"],
  semisquare: ["ざらつき", "引っかかり", "端差", "張り", "圧"],
  sesquisquare: ["圧", "引っかかり", "蓄積", "調整", "摩耗"],
  semisextile: ["にじみ", "余白", "境目", "滲点", "ゆらぎ"],
  quintile: ["工夫", "編み直し", "妙技", "ひらめき", "端差"],
  biquintile: ["調律", "余白", "抜け", "響き", "整え直し"],
  novile: ["静けさ", "ゆるみ", "余白", "ほどけ", "にじみ"],
  binovile: ["静けさ", "ゆるみ", "余白", "ほどけ", "にじみ"],
  trinovile: ["静けさ", "ゆるみ", "余白", "ほどけ", "にじみ"],
  quadranovile: ["静けさ", "ゆるみ", "余白", "ほどけ", "にじみ"],
  decile: ["伸び", "抜け", "ひらき", "工夫", "通り"],
  tridecile: ["伸び", "抜け", "ひらき", "工夫", "通り"],
  septile_family: ["縁", "響き", "余韻", "隔たり", "引力"],
  septile: ["縁", "響き", "余韻", "隔たり", "引力"],
  biseptile: ["縁", "響き", "余韻", "隔たり", "引力"],
  triseptile: ["縁", "響き", "余韻", "隔たり", "引力"],
});

const ASPECT_QUALITY_BUCKETS = Object.freeze({
  yin: ["ざらつき", "にじみ", "引っかかり", "ひずみ", "圧", "張り"],
  harmony: ["余白", "通路", "交点", "調律", "ゆるみ", "空白"],
  yang: ["抜け", "風通し", "ひらき", "伸び", "ほどけ", "通り"],
});

function hash32(input) {
  const s = String(input || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function uniqList(list) {
  const out = [];
  const seen = new Set();
  for (const item of list || []) {
    const v = String(item || "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function splitCoreWords(core) {
  return String(core || "")
    .split(/[・/／,]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickBySeed(list, seed, count = 1) {
  const arr = Array.isArray(list) ? [...list] : [];
  if (!arr.length) return [];
  const out = [];
  const used = new Set();
  for (let i = 0; i < count; i++) {
    const idx = (seed + i * 7) % arr.length;
    const v = arr[idx];
    if (used.has(v)) continue;
    used.add(v);
    out.push(v);
  }
  return out;
}

function signJa(signKey) {
  const k = String(signKey || "").toLowerCase();
  return dict?.SIGNS_V2?.signs?.[k]?.label_ja || signKey || "";
}

function signElement(signKey) {
  const k = String(signKey || "").toLowerCase();
  return dict?.SIGNS_V2?.signs?.[k]?.element || "";
}

function elementBucket(element) {
  if (element === "fire") return "yang";
  if (element === "air") return "harmony";
  if (element === "earth" || element === "water") return "yin";
  return "harmony";
}

function fusionTokensFor(signKey, bodyKey) {
  const sKey = String(signKey || "").toLowerCase();
  const bKey = String(bodyKey || "").toLowerCase();
  const s = dict?.SIGN_FLAVOR_V1?.signs?.[sKey];
  const sp = s?.by_body?.[bKey];
  const f = sp?.fusion;
  if (!f) return [];
  return uniqList([
    ...(f.A || []),
    ...(f.B || []),
    ...(f.expression || []),
    ...(f.process || []),
    ...(f.clarity || []),
    ...(f.tendency || []),
  ]);
}

function aspectMeta(typeRaw) {
  const key = normalizeAspectType(typeRaw);
  return ASPECTS_META?.[key] || null;
}

const ASPECT_TONE_HARD = new Set([
  "square",
  "opposition",
  "quincunx_150",
  "inconjunct",
  "semi_square_45",
  "sesqui_square_135",
  "semisquare",
  "sesquisquare",
  "quincunx",
  "septile",
  "biseptile",
  "triseptile",
  "septile_family",
]);
const ASPECT_TONE_SOFT = new Set([
  "trine",
  "sextile",
  "semi_sextile_30",
  "quintile_72",
  "biquintile_144",
  "novile_40",
  "binovile_80",
  "trinovile_120",
  "quadranovile_160",
  "decile_36",
  "tridecile_108",
  "semi_sextile",
  "quintile",
  "biquintile",
  "novile",
  "binovile",
  "trinovile",
  "quadranovile",
  "decile",
  "tridecile",
]);

function aspectToneBucket(typeRaw) {
  const key = normalizeAspectType(typeRaw);
  if (ASPECT_TONE_HARD.has(key)) return "yin";
  if (ASPECT_TONE_SOFT.has(key)) return "yang";
  return "harmony";
}

function aspectQualityLabel(typeRaw, seed) {
  const key = normalizeAspectType(typeRaw);
  const bucket = aspectToneBucket(typeRaw);
  const pool = uniqList([
    ...(ASPECT_QUALITY_BUCKETS[bucket] || []),
    ...(ASPECT_QUALITY_MAP[key] || []),
  ]);
  return pickBySeed(pool, seed, 1)[0] || "余白";
}

function getAspectByType(typeRaw) {
  return aspectMeta(typeRaw);
}

function isRareAspect(typeRaw) {
  const key = normalizeAspectType(typeRaw);
  return ASPECTS_DEEP_KEYS.has(key) || ASPECTS_CRAFT_KEYS.has(key);
}

function aspectRoleSentence(typeRaw) {
  const meta = aspectMeta(typeRaw);
  if (!meta) return "";
  if (meta.role_line) return meta.role_line;
  const core = String(meta.core || "").trim();
  if (!core) return "";
  return `${core}が残る角度`;
}

function aspectRoleEcho(typeRaw) {
  const meta = aspectMeta(typeRaw);
  if (!meta) return "同じ質感が別の層にも残る";
  const core = String(meta.core || "").trim();
  if (!core) return "同じ質感が別の層にも残る";
  return `${core}の質感が、別の層にも静かに残る`;
}

function pickTripletByBucket(items, bucketFn, order, seed) {
  const out = [];
  const used = new Set();
  const sorted = [...items].sort((a, b) => (a?.orb_deg ?? 99) - (b?.orb_deg ?? 99));
  for (const bucket of order) {
    const hit = sorted.find((x) => !used.has(x) && bucketFn(x) === bucket);
    if (hit) {
      used.add(hit);
      out.push(hit);
    }
  }
  for (const x of sorted) {
    if (out.length >= 3) break;
    if (used.has(x)) continue;
    used.add(x);
    out.push(x);
  }
  if (out.length > 3) return out.slice(0, 3);
  if (out.length < 3 && items.length) {
    const fill = pickBySeed(items, hash32(seed || "fill"), 3);
    for (const x of fill) {
      if (out.length >= 3) break;
      if (!out.includes(x)) out.push(x);
    }
  }
  return out;
}

function pickSecondaryAspect(all, primary) {
  const primaryKey = normalizeAspectType(primary?.type);
  const primarySig = `${primary?.a}-${primary?.b}-${primaryKey}`;

  const others = all.filter((x) => {
    const key = normalizeAspectType(x?.type);
    const sig = `${x?.a}-${x?.b}-${key}`;
    return sig !== primarySig;
  });

  const byOrb = [...others].sort((a, b) => (a?.orb_deg ?? 99) - (b?.orb_deg ?? 99));

  // 1) rare (deep/craft)
  const rare = byOrb.find((x) => isRareAspect(x?.type));
  if (rare) return rare;

  // 2) priority set (quintile / septile / sesqui, etc.)
  const pri = byOrb.find((x) => ASPECTS_RARE_PRI.has(normalizeAspectType(x?.type)));
  if (pri) return pri;

  // 3) different aspect type from primary
  const diff = byOrb.find((x) => normalizeAspectType(x?.type) !== primaryKey);
  if (diff) return diff;

  return null;
}

function dominantLabel(strata) {
  const elemCount = strata?.element_count || {};
  const modCount = strata?.modality_count || {};

  const pickTop = (obj) => {
    const entries = Object.entries(obj).filter(([k]) => k !== "unknown");
    if (!entries.length) return { key: "", top: 0, second: 0 };
    entries.sort((a, b) => b[1] - a[1]);
    return { key: entries[0][0], top: entries[0][1], second: entries[1]?.[1] ?? 0 };
  };

  const e = pickTop(elemCount);
  const m = pickTop(modCount);
  const clear =
    (e.top >= 5 || (e.top - e.second) >= 2) &&
    (m.top >= 5 || (m.top - m.second) >= 2);

  if (!clear) return "";

  const elemJa = dict?.ELEMENTS_V1?.elements?.[e.key]?.label_ja || "";
  const modJa = dict?.MODALITIES_V1?.modalities?.[m.key]?.label_ja || "";
  return [elemJa, modJa].filter(Boolean).join("×");
}

function aspectLabelWithDeg(typeRaw) {
  const meta = aspectMeta(typeRaw);
  if (!meta) return String(typeRaw || "");
  const deg = Number.isFinite(meta.deg) ? `${meta.deg}°` : "";
  return deg ? `${meta.label_ja}（${deg}）` : meta.label_ja;
}

function pickList(list, limit = 3) {
  if (!Array.isArray(list) || list.length === 0) return [];
  return list.slice(0, limit);
}

function planetTouch(planetKey) {
  const key = String(planetKey || "").toLowerCase();
  const p = dict?.SOAR_STYLE_V1?.planets?.[key];
  return pickList(p?.touch, 3);
}

function signTouch(signKey) {
  const key = String(signKey || "").toLowerCase();
  const s = dict?.SOAR_STYLE_V1?.signs?.[key];
  return pickList(s?.touch, 3);
}

function aspectVoice(typeRaw) {
  const key = normalizeAspectType(typeRaw);
  const v = dict?.ASPECTS_V2?.voice_templates?.[key];
  if (!v) return [];
  const parts = [v.touch, v.gap, v.rest].flat().filter(Boolean);
  return pickList(parts, 4);
}

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

function buildDailyTitle(story, dateLocal) {
  const fallback = `今日のソラ｜${dateLocal}`;
  const top = story?.public?.sky_top?.[0];
  if (!top) return fallback;

  const aspect = getAspectByType(top.type);
  const label = aspect?.label_ja;
  const deg = top?.aspect_deg;
  const seed = hash32(`${dateLocal}-${normalizeAspectType(top.type)}-title`);
  const quality = aspectQualityLabel(top.type, seed);

  if (!label || !deg || !quality) return fallback;

  const strata = story?.public?.sky_strata || {};
  const dom = dominantLabel(strata);
  const domLabel = dom ? `${dom} ` : "";

  return `今日のソラ｜${dateLocal} ― ${domLabel}${label}（${deg}°）：${quality}`;
}

async function generateDailyDraft({ story, dateLocal, openai }) {
  const blocks = buildBlogBlocks(story, { dateLocal });
  const dataBlock = blocksToInput(blocks);

  const noAi =
    openai?.noAi === true ||
    process.env.BLOG_NO_AI === "1" ||
    process.env.BLOG_PREVIEW === "1";
  if (noAi) {
    return renderBlocksPreview(blocks);
  }

  const mode = String(openai?.mode || process.env.BLOG_GEN_MODE || "single").toLowerCase();
  const modelMain =
    openai?.modelBlog ||
    openai?.model ||
    process.env.OPENAI_MODEL_BLOG ||
    process.env.OPENAI_MODEL ||
    "gpt-4o";
  const modelParts =
    openai?.modelBlogParts ||
    process.env.OPENAI_MODEL_BLOG_PARTS ||
    modelMain;

  const closing = "これは占いではありません。\n星は答えを示さず、構造だけを置いています。\n星は語る。解釈はあなたのもの🌃";

  const buildMessages = (userContent, retryNote = "") => [
    { role: "system", content: systemPrompt() },
    {
      role: "user",
      content: retryNote ? `${userContent}\n\n【NG修正】${retryNote}` : userContent,
    },
  ];

  const runWithRetry = async ({ userContent, model, maxTokens = 2200 }) => {
    const runOnce = async (retryNote = "") =>
      createChatCompletion({
        apiKey: openai.apiKey,
        baseUrl: openai.baseUrl,
        model,
        messages: buildMessages(userContent, retryNote),
        temperature: 0.7,
        maxTokens,
      });

    const text = await runOnce();
    const cleaned = softenText(text);
    const banned = findBannedTerm(cleaned);
    if (banned) {
      const retryText = await runOnce(
        `禁止語「${banned}」を含めない。未来断定/指示/救済/運命固定/絶対語/本文の「あなた」を避ける。`
      );
      return softenText(retryText);
    }
    return cleaned;
  };

  const appendStructureLog = async (body) => {
    const log = await buildStructureLogHtml({
      story,
      dateLocal,
      runWithRetry,
      modelParts,
      enableAi: Boolean(openai?.apiKey),
    });
    const merged = [body, log].filter(Boolean).join("\n\n");
    return enforceSingleClosing(merged, closing);
  };

  if (mode === "long_v2") {
    const html = await generateLongV2({
      story,
      dateLocal,
      runWithRetry,
      modelMain,
      modelParts,
    });
    return enforceSingleClosing(html, closing);
  }

  if (mode === "block") {
    const parts = [];
    for (const block of blocks) {
      const blockInput = blocksToInput([block]);
      const content = [
        BLOG_BLOCKS_USER_GUIDE,
        "",
        `日付: ${dateLocal}`,
        "",
        "INPUT:",
        blockInput,
      ].join("\n");
      const html = await runWithRetry({ userContent: content, model: modelParts, maxTokens: 1400 });
      parts.push(html.trim());
    }
    return appendStructureLog(parts.join("\n\n").trim());
  }

  if (mode === "item") {
    const out = [];
    for (const block of blocks) {
      const facts = Array.isArray(block?.facts) && block.facts.length
        ? `FACTS:\n- ${block.facts.join("\n- ")}`
        : "FACTS: none";
      const headerPrompt = [
        BLOG_BLOCK_SECTION_GUIDE,
        "",
        `日付: ${dateLocal}`,
        "",
        `BLOCK_TITLE: ${block.title}`,
        facts,
      ].join("\n");
      const headerHtml = await runWithRetry({ userContent: headerPrompt, model: modelParts, maxTokens: 800 });
      out.push(headerHtml.trim());

      const items = Array.isArray(block?.items) ? block.items : [];
      if (block.itemsAsH3 && items.length) {
        for (let i = 0; i < items.length; i++) {
          const title = `${i + 1}. ${items[i]}`;
          const itemPrompt = [
            BLOG_BLOCK_ITEM_GUIDE,
            "",
            `日付: ${dateLocal}`,
            "",
            `BLOCK_TITLE: ${block.title}`,
            `H3_TITLE: ${title}`,
            facts,
          ].join("\n");
          const itemHtml = await runWithRetry({ userContent: itemPrompt, model: modelParts, maxTokens: 700 });
          out.push(itemHtml.trim());
        }
      } else if (items.length) {
        for (let i = 0; i < items.length; i++) {
          const title = `${block.title} ${i + 1}`;
          const itemPrompt = [
            BLOG_BLOCK_ITEM_GUIDE,
            "",
            `日付: ${dateLocal}`,
            "",
            `BLOCK_TITLE: ${block.title}`,
            `H3_TITLE: ${title}`,
            facts,
          ].join("\n");
          const itemHtml = await runWithRetry({ userContent: itemPrompt, model: modelParts, maxTokens: 600 });
          out.push(itemHtml.trim());
        }
      }
    }
    return appendStructureLog(out.join("\n\n").trim());
  }

  const baseUser = userPrompt({ dateLocal, dataBlock });
  const text = await runWithRetry({ userContent: baseUser, model: modelMain, maxTokens: 2200 });
  return appendStructureLog(text);
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderBlocksPreview(blocks = []) {
  const out = [];
  blocks.forEach((block) => {
    if (block?.title) out.push(`<h2>${escapeHtml(block.title)}</h2>`);
    if (Array.isArray(block?.facts) && block.facts.length) {
      out.push(`<p>${escapeHtml(block.facts.join(" / "))}</p>`);
    }
    if (Array.isArray(block?.items) && block.items.length) {
      if (block.itemsAsH3) {
        block.items.forEach((item, idx) => {
          out.push(`<h3>${idx + 1}. ${escapeHtml(item)}</h3>`);
        });
      } else {
        block.items.forEach((item) => {
          out.push(`<p>${escapeHtml(item)}</p>`);
        });
      }
    }
  });
  return out.join("\n");
}

const BLOG_STRUCT_BODY_ORDER = [
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
  "lilith",
  "chiron",
];

const BLOG_STRUCT_SIGN_ORDER =
  dict?.SIGNS_V2?.order ||
  dict?.SIGNS?.order || [
    "aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces",
  ];

const BLOG_STRUCT_TSUKIJI_MIN_DAYS = 30;
const BLOG_STRUCT_TSUKIJI_ORB = SPEC?.orb?.paid ?? 3.0;
const BLOG_STRUCT_TSUKIJI_MAX = 3;

function buildHouseRowsPublic(story, asOfISO) {
  const transitSigns = story?.public?.transit_signs || {};
  const ascDeg = asOfISO ? computeTokyoAscDeg(asOfISO) : null;
  const ascIndex = Number.isFinite(Number(ascDeg))
    ? Math.floor((((Number(ascDeg) % 360) + 360) % 360) / 30)
    : null;

  const retroMap = buildRetrogradeMap(asOfISO, BLOG_STRUCT_BODY_ORDER);

  const buckets = new Map();
  for (let h = 1; h <= 12; h++) {
    const signKey = ascIndex != null ? BLOG_STRUCT_SIGN_ORDER[(ascIndex + h - 1) % 12] : null;
    buckets.set(h, {
      houseNo: h,
      signKey,
      signJa: signKey ? signLabelJa(dict, signKey) : "",
      signGlyph: signKey ? signGlyph(signKey) : "",
      items: [],
      score: 0,
    });
  }

  BLOG_STRUCT_BODY_ORDER.forEach((key) => {
    const signKeyRaw = transitSigns?.[key]?.sign_key || "";
    const signKey = normalizeSignKey(signKeyRaw || "");
    const signIndex = signIndexFromKey(dict, signKey || "");
    if (signIndex < 0 || ascIndex == null) return;
    const houseNo = houseNumberForSignIndex(signIndex, ascIndex);
    const bucket = buckets.get(houseNo);
    if (!bucket) return;

    const bodyLabel = bodyLabelJa(dict, key) || key;
    const glyph = bodyGlyph(key);
    const retro = retroMap[key] ? SPEC.retro.suffix : "";
    const entry = `${glyph ? `${glyph}` : ""}${bodyLabel}${retro}`.trim();

    bucket.items.push(entry);
    bucket.score += weightForBody(key);
  });

  const rows = Array.from(buckets.values());
  rows.sort((a, b) => (b.score - a.score) || (a.houseNo - b.houseNo));
  return { rows, retroMap };
}

function formatHouseLogLine(row) {
  const signText = `${row.signGlyph || ""}${row.signJa || ""}`.trim() || "—";
  const bodiesRaw = row.items.length ? row.items.join(" ") : "—";
  const bodies = bodiesRaw.replace(/\(R\)/g, "（R）");
  const score = Number.isFinite(Number(row.score)) ? Number(row.score).toFixed(2) : "0.00";
  return `第${row.houseNo}ハウス｜${signText}｜${bodies}｜score ${score}`;
}

function buildTsukijiRowsPublic(story, asOfISO) {
  const longLogs = Array.isArray(story?.public?.kinjitsu_long) ? story.public.kinjitsu_long : [];
  if (longLogs.length) {
    return longLogs.map((row) => ({
      aKey: normalizeBodyKey(row?.a || ""),
      bKey: normalizeBodyKey(row?.b || ""),
      aSignKey: row?.a_sign_key || "",
      bSignKey: row?.b_sign_key || "",
      aSignJa: row?.a_sign_ja || "",
      bSignJa: row?.b_sign_ja || "",
      aspect: normalizeAspectKey(row?.aspect || row?.type, row?.aspect_deg),
      aspectDeg: Number(row?.aspect_deg),
      orb: Number(row?.now_orb),
      start: row?.start_at ? new Date(row.start_at) : null,
      peak: row?.peak_at ? new Date(row.peak_at) : null,
      end: row?.end_at ? new Date(row.end_at) : null,
      durationDays: Number(row?.duration_days),
    })).filter((r) => r.aKey && r.bKey);
  }

  const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
  const now = new Date(asOfISO || new Date().toISOString());
  if (Number.isNaN(now.getTime())) return [];

  const rows = [];
  const seen = new Set();

  skyAll.forEach((row) => {
    const orb = Number(row?.orb_deg);
    if (!Number.isFinite(orb) || orb > BLOG_STRUCT_TSUKIJI_ORB) return;
    const aKey = normalizeBodyKey(row?.a || "");
    const bKey = normalizeBodyKey(row?.b || "");
    if (!aKey || !bKey) return;

    const sig = [aKey, bKey].sort().join("|");
    if (seen.has(sig)) return;
    seen.add(sig);

    const aspectDeg = Number(row?.aspect_deg);
    if (!Number.isFinite(aspectDeg)) return;

    const window = findTransitTransitWindow({
      aKey,
      bKey,
      aspectDeg,
      asOfISO: asOfISO || new Date().toISOString(),
      maxDays: 400,
      orbLimit: BLOG_STRUCT_TSUKIJI_ORB,
    });
    if (!window?.start || !window?.end) return;
    const durationDays = Math.ceil((window.end.getTime() - window.start.getTime()) / 86400000);
    if (durationDays < BLOG_STRUCT_TSUKIJI_MIN_DAYS) return;
    if (!(window.start <= now && now <= window.end)) return;

    rows.push({
      aKey,
      bKey,
      aSignKey: row?.a_sign_key || "",
      bSignKey: row?.b_sign_key || "",
      aSignJa: row?.a_sign_ja || "",
      bSignJa: row?.b_sign_ja || "",
      aspect: normalizeAspectKey(row?.type || row?.aspect, aspectDeg),
      aspectDeg,
      orb,
      start: window.start,
      peak: window.peak,
      end: window.end,
      durationDays,
    });
  });

  rows.sort((a, b) => a.orb - b.orb);
  return rows.slice(0, BLOG_STRUCT_TSUKIJI_MAX);
}

function buildKinjitsuRowsPublic(story) {
  const items = Array.isArray(story?.public?.kinjitsu_short)
    ? story.public.kinjitsu_short
    : (Array.isArray(story?.public?.kinjitsu) ? story.public.kinjitsu : []);
  return items
    .filter((it) => Number.isFinite(Number(it?.now_orb)))
    .sort((a, b) => Number(a.now_orb) - Number(b.now_orb))
    .slice(0, 5);
}

function buildElementLinesPublic(story) {
  const strata = story?.public?.sky_strata || {};
  const e = strata.element_count || {};
  const m = strata.modality_count || {};
  const elementLine = `🔥${e.fire || 0} 🪨${e.earth || 0} 💨${e.air || 0} 💧${e.water || 0}`;
  const modalityLine = `🏃${m.cardinal || 0} 🧱${m.fixed || 0} 🌿${m.mutable || 0}`;
  return { elementLine, modalityLine };
}

async function buildStructureLogHtml({ story, dateLocal, runWithRetry, modelParts, enableAi }) {
  const asOfISO = story?.meta?.as_of || new Date().toISOString();

  const sections = [];

  // Houses
  const { rows: houseRows } = buildHouseRowsPublic(story, asOfISO);
  sections.push("<h2>🏠 はうす（全ハウス）</h2>");
  houseRows.forEach((row) => {
    sections.push(`<p>${escapeHtml(formatHouseLogLine(row))}</p>`);
  });

  for (const row of houseRows) {
    const title = `第${row.houseNo}ハウス`;
    let body = "この領域に圧が集まり、動きの重さが残っている。";
    if (enableAi) {
      const prompt = [
        BLOG_STRUCT_HOUSE_GUIDE,
        "",
        `日付: ${dateLocal}`,
        `HOUSE: ${title}｜${row.signGlyph || ""}${row.signJa || ""}`.trim(),
        `BODIES: ${row.items.length ? row.items.join(" ") : "—"}`,
        `SCORE: ${Number(row.score || 0).toFixed(2)}`,
      ].join("\n");
      body = await runWithRetry({ userContent: prompt, model: modelParts, maxTokens: 200 });
    }
    sections.push(`<h3>${escapeHtml(title)}</h3>`);
    sections.push(`<p>${escapeHtml(body)}</p>`);
  }

  // Tsukiji (long-term)
  const tsukijiRows = buildTsukijiRowsPublic(story, asOfISO);
  sections.push("<h2>🌙 つきじ（継続接近ログ）</h2>");
  if (!tsukijiRows.length) {
    sections.push("<p>該当なし</p>");
  } else {
    const retroMap = buildRetrogradeMap(asOfISO, Array.from(new Set(tsukijiRows.flatMap((r) => [r.aKey, r.bKey]))));
    tsukijiRows.forEach((row) => {
      const aLabel = `${bodyGlyph(row.aKey)}${bodyLabelJa(dict, row.aKey)}${retroMap[row.aKey] ? SPEC.retro.suffix : ""}`;
      const bLabel = `${bodyGlyph(row.bKey)}${bodyLabelJa(dict, row.bKey)}${retroMap[row.bKey] ? SPEC.retro.suffix : ""}`;
      const aSign = row.aSignJa || signLabelJa(dict, row.aSignKey);
      const bSign = row.bSignJa || signLabelJa(dict, row.bSignKey);
      const aspectLabel = row.aspect ? row.aspect : "";
      const degText = Number.isFinite(Number(row.aspectDeg)) ? `${Math.round(row.aspectDeg)}°` : "";
      const orbText = Number.isFinite(Number(row.orb)) ? `orb ${row.orb.toFixed(1)}°` : "";
      const startText = row.start ? formatDateYmd(row.start) : "-";
      const peakText = row.peak ? formatDateYmd(row.peak) : "-";
      const endText = row.end ? formatDateYmd(row.end) : "-";
      const durationText = Number.isFinite(Number(row.durationDays)) ? `継続：約${row.durationDays}日` : "";
      const line = [
        `(T) ${aLabel}（${aSign}）`,
        `× (T) ${bLabel}（${bSign}）`,
        `${aspectLabel} ${degText}｜${orbText}`.trim(),
        `開始 ${startText}`,
        `ピーク ${peakText}`,
        `終了予定 ${endText}`,
        durationText,
      ].join("<br>");
      sections.push(`<p>${escapeHtml(line).replace(/&lt;br&gt;/g, "<br>")}</p>`);
    });
  }

  // Elements / modalities
  const { elementLine, modalityLine } = buildElementLinesPublic(story);
  sections.push("<h2>🔥 元素／三区分（T）</h2>");
  sections.push(`<p>${escapeHtml(elementLine)}</p>`);
  sections.push(`<p>${escapeHtml(modalityLine)}</p>`);
  if (enableAi) {
    const prompt = [
      BLOG_STRUCT_ELEMENT_GUIDE,
      "",
      `日付: ${dateLocal}`,
      `ELEMENTS: ${elementLine}`,
      `MODALITIES: ${modalityLine}`,
    ].join("\n");
    const comment = await runWithRetry({ userContent: prompt, model: modelParts, maxTokens: 160 });
    sections.push(`<p>${escapeHtml(comment)}</p>`);
  }

  // Kinjitsu
  const kinjitsuRows = buildKinjitsuRowsPublic(story);
  sections.push("<h2>📅 近日（接近予定）</h2>");
  if (!kinjitsuRows.length) {
    sections.push("<p>該当なし</p>");
  } else {
    kinjitsuRows.forEach((row) => {
      const aKey = normalizeBodyKey(row?.a || "");
      const bKey = normalizeBodyKey(row?.b || "");
      const aLabel = `${bodyGlyph(aKey)}${bodyLabelJa(dict, aKey)}`;
      const bLabel = `${bodyGlyph(bKey)}${bodyLabelJa(dict, bKey)}`;
      const aSign = row?.a_sign_ja || signLabelJa(dict, row?.a_sign_key);
      const bSign = row?.b_sign_ja || signLabelJa(dict, row?.b_sign_key);
      const aspectLabel = row?.aspect ? row.aspect : "";
      const degText = Number.isFinite(Number(row?.aspect_deg)) ? `${Math.round(row.aspect_deg)}°` : "";
      const orbText = Number.isFinite(Number(row?.now_orb)) ? `現在 orb ${Number(row.now_orb).toFixed(1)}°` : "";
      const startText = row?.start_at ? formatDateYmd(new Date(row.start_at)) : "-";
      const peakText = row?.peak_at ? formatDateYmdHm(new Date(row.peak_at)) : (row?.peak_label ? row.peak_label : "-");
      const endText = row?.end_at ? formatDateYmd(new Date(row.end_at)) : "-";
      const line = [
        `(T) ${aLabel}（${aSign}）`,
        `× (T) ${bLabel}（${bSign}）`,
        `${aspectLabel} ${degText}`.trim(),
        `開始 ${startText}`,
        `最接近 ${peakText}`,
        `終了予定 ${endText}`,
        orbText,
      ].filter(Boolean).join("<br>");
      sections.push(`<p>${escapeHtml(line).replace(/&lt;br&gt;/g, "<br>")}</p>`);
    });
  }

  const todayMoon = formatTodayMoonLines({ asOfISO, story, dict });
  todayMoon.lines.forEach((line) => sections.push(`<p>${escapeHtml(line)}</p>`));

  const nextMoon = formatNextMoonLines({ asOfISO, dict });
  nextMoon.lines.forEach((line) => sections.push(`<p>${escapeHtml(line)}</p>`));

  return sections.join("\n");
}

function formatSignDegree(signKey, lonDeg) {
  const signJa = signLabelJa(dict, signKey) || signKey || "";
  if (!Number.isFinite(Number(lonDeg))) return signJa;
  const deg = ((Number(lonDeg) % 30) + 30) % 30;
  return `${signJa} ${deg.toFixed(0)}°`.trim();
}

function aspectLabelForLong(aspectKey, aspectDeg) {
  const key = normalizeAspectKey(aspectKey, aspectDeg);
  const meta =
    dict?.ASPECTS_V2?.major?.[key] ||
    dict?.ASPECTS_V2?.deep_space?.[key] ||
    dict?.ASPECTS_V2?.craft_space?.[key] ||
    null;
  if (meta?.label_ja) return meta.label_ja;
  return key || String(aspectKey || "");
}

function calcOrbAt(aKey, bKey, aspectDeg, asOfISO) {
  const lonA = calcTransitLon(aKey, asOfISO);
  const lonB = calcTransitLon(bKey, asOfISO);
  if (!Number.isFinite(Number(lonA)) || !Number.isFinite(Number(lonB))) return null;
  const dist = Math.abs(((lonA - lonB + 540) % 360) - 180);
  return Math.abs(dist - aspectDeg);
}

function aspectTrend(aKey, bKey, aspectDeg, asOfISO) {
  const nowOrb = calcOrbAt(aKey, bKey, aspectDeg, asOfISO);
  if (!Number.isFinite(Number(nowOrb))) return "";
  const later = new Date(new Date(asOfISO).getTime() + 12 * 3600 * 1000).toISOString();
  const laterOrb = calcOrbAt(aKey, bKey, aspectDeg, later);
  if (!Number.isFinite(Number(laterOrb))) return "";
  return laterOrb < nowOrb ? "接近中" : "離脱中";
}

function splitIntoParagraphs(text) {
  const s = String(text || "").trim();
  if (!s) return [];
  const parts = s.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) return parts;

  const chunks = s.split(/。/).map((p, i, arr) => {
    const t = String(p || "").trim();
    if (!t) return "";
    return i < arr.length - 1 ? `${t}。` : t;
  }).filter(Boolean);

  if (chunks.length >= 3) {
    const mid = Math.ceil(chunks.length / 2);
    return [chunks.slice(0, mid).join(""), chunks.slice(mid).join("")].filter(Boolean);
  }
  return [s];
}

function pushParagraphs(lines, text) {
  const paras = splitIntoParagraphs(text);
  if (!paras.length) return;
  paras.forEach((p) => {
    lines.push(`<p>${escapeHtml(p)}</p>`);
  });
}

async function generateLongV2({ story, dateLocal, runWithRetry, modelMain, modelParts }) {
  const pub = story?.public || {};
  const asOfISO = story?.meta?.as_of || new Date().toISOString();
  const dateLabel = String(dateLocal || "")
    .trim()
    .replace(/-/g, ".") || formatDateYmd(new Date(asOfISO));

  const retroMap = buildRetrogradeMap(asOfISO, BLOG_STRUCT_BODY_ORDER);
  const retroBodies = BLOG_STRUCT_BODY_ORDER.filter((k) => retroMap[k]);

  const ascDeg = computeTokyoAscDeg(asOfISO);
  const ascIndex = Number.isFinite(Number(ascDeg))
    ? Math.floor((((Number(ascDeg) % 360) + 360) % 360) / 30)
    : null;
  const bodyHouseMap = new Map();

  const strata = pub.sky_strata || {};
  const e = strata.element_count || {};
  const m = strata.modality_count || {};
  const elementLine = `🔥${e.fire || 0} 🪨${e.earth || 0} 💨${e.air || 0} 💧${e.water || 0}`;
  const modalityLine = `🏃${m.cardinal || 0} 🧱${m.fixed || 0} 🌿${m.mutable || 0}`;

  const skyAll = Array.isArray(pub.sky_all) ? [...pub.sky_all] : [];
  skyAll.sort((a, b) => (a?.orb_deg ?? 99) - (b?.orb_deg ?? 99));
  const resonanceAll = skyAll.filter((row) => Number(row?.orb_deg) <= (SPEC?.orb?.paid ?? 3.0));
  const resonancePool = [...resonanceAll];
  const strongest = resonancePool[0] || skyAll[0] || null;
  const resonanceTop = resonancePool
    .map((row) => {
      const aKey = normalizeBodyKey(row?.a || "");
      const bKey = normalizeBodyKey(row?.b || "");
      const aspectDeg = Number(row?.aspect_deg);
      const orb = Number(row?.orb_deg);
      const trend = aspectTrend(aKey, bKey, aspectDeg, asOfISO);
      const applying = trend === "接近中";
      const exact = Number.isFinite(orb) && orb <= 0.05;
      return { ...row, _orb: orb, _applying: applying, _exact: exact };
    })
    .sort((a, b) => {
      if (a._exact !== b._exact) return a._exact ? -1 : 1;
      if (a._applying !== b._applying) return a._applying ? -1 : 1;
      return (a._orb ?? 99) - (b._orb ?? 99);
    })
    .slice(0, 1);

  const { rows: houseRows } = buildHouseRowsPublic(story, asOfISO);
  const topHouses = houseRows.filter((r) => r.score > 0).slice(0, 3).map((r) => `第${r.houseNo}ハウス`);

  const retroList = retroBodies.length
    ? retroBodies.map((k) => `${bodyGlyph(k)} ${bodyLabelJa(dict, k)}`.trim()).join(" / ")
    : "なし";

  const overviewFacts = [
    `${elementLine}`,
    `${modalityLine}`,
    `逆行: ${retroList}`,
    strongest
      ? `強い角度: ${aspectLabelForLong(strongest.type, strongest.aspect_deg)} ${Math.round(strongest.aspect_deg)}°`
      : "強い角度: —",
  ];

  const overviewPrompt = [
    BLOG_LONG_OVERVIEW_GUIDE,
    "",
    `日付: ${dateLabel}`,
    `FACTS: ${overviewFacts.join(" / ")}`,
  ].join("\n");

  const overviewText = await runWithRetry({ userContent: overviewPrompt, model: modelMain, maxTokens: 500 });

  const lines = [];
  lines.push(`<h1>🌌 きょうのそら｜${dateLabel}</h1>`);
  lines.push("<h2>0｜今日の全体圧（圧縮）</h2>");
  pushParagraphs(lines, overviewText);

  // 1) Positions
  lines.push("<h2>1｜配置（全天体：短文化）</h2>");
  const transit = pub.transit_signs || {};
  for (const key of BLOG_STRUCT_BODY_ORDER) {
    const info = transit?.[key];
    if (!info) continue;
    const signKey = normalizeSignKey(info.sign_key || "");
    const signIndex = signIndexFromKey(dict, signKey || "");
    if (signIndex >= 0 && ascIndex != null) {
      const houseNo = houseNumberForSignIndex(signIndex, ascIndex);
      if (houseNo) bodyHouseMap.set(key, houseNo);
    }
    const glyph = bodyGlyph(key);
    const bodyLabel = bodyLabelJa(dict, key);
    const retroSuffix = retroMap[key] ? "（R）" : "";
    const houseNo = bodyHouseMap.get(key);
    const houseText = houseNo ? `第${houseNo}ハウス` : "第—ハウス";
    const title = `${glyph ? `${glyph} ` : ""}${bodyLabel}${retroSuffix}｜${formatSignDegree(signKey, info.lon_deg)}｜${houseText}`.trim();
    const retro = retroMap[key] ? "あり" : "なし";
    const facts = [
      `逆行: ${retro}`,
      `位置: ${signLabelJa(dict, signKey)} ${Number.isFinite(Number(info.lon_deg)) ? ((info.lon_deg % 30 + 30) % 30).toFixed(0) : "—"}°`,
      houseNo ? `所属ハウス: 第${houseNo}ハウス` : "所属ハウス: —",
    ];
    const prompt = [
      BLOG_LONG_POSITION_GUIDE,
      "",
      `日付: ${dateLabel}`,
      `TITLE: ${title}`,
      `FACTS: ${facts.join(" / ")}`,
    ].join("\n");
    const text = await runWithRetry({ userContent: prompt, model: modelParts, maxTokens: 180 });
    lines.push(`<h3>${escapeHtml(title)}</h3>`);
    pushParagraphs(lines, text);
  }

  // 2) Resonance
  lines.push("<h2>2｜共鳴（トップのみ／現状の並び維持）</h2>");
  if (!resonanceTop.length) {
    lines.push("<p>該当なし</p>");
  }
  for (const row of resonanceTop) {
    const aKey = normalizeBodyKey(row?.a || "");
    const bKey = normalizeBodyKey(row?.b || "");
    const aLabel = `${bodyGlyph(aKey)} ${bodyLabelJa(dict, aKey)}`.trim();
    const bLabel = `${bodyGlyph(bKey)} ${bodyLabelJa(dict, bKey)}`.trim();
    const aSign = row?.a_sign_ja || signLabelJa(dict, row?.a_sign_key);
    const bSign = row?.b_sign_ja || signLabelJa(dict, row?.b_sign_key);
    const aspectDeg = Number(row?.aspect_deg);
    const aspLabel = aspectLabelForLong(row?.type, aspectDeg);
    const orb = Number(row?.orb_deg);
    const trend = aspectTrend(aKey, bKey, aspectDeg, asOfISO);
    const title = `(T) ${aLabel}（${aSign}） × (T) ${bLabel}（${bSign}）`;
    const facts = [
      `角度: ${aspLabel} ${Math.round(aspectDeg)}°`,
      `orb: ${Number.isFinite(orb) ? orb.toFixed(1) : "—"}°`,
      `状態: ${trend || "—"}`,
    ];
    const prompt = [
      BLOG_LONG_RESONANCE_GUIDE,
      "",
      `日付: ${dateLabel}`,
      `TITLE: ${title}`,
      `FACTS: ${facts.join(" / ")}`,
    ].join("\n");
    const text = await runWithRetry({ userContent: prompt, model: modelParts, maxTokens: 220 });
    lines.push(`<h3>${escapeHtml(title)}</h3>`);
    pushParagraphs(lines, text);
  }

  // 3) Houses
  lines.push("<h2>3｜🏠 はうす（全ハウス）</h2>");
  lines.push("<h3>■ ログ</h3>");
  houseRows.forEach((row) => {
    lines.push(`<p>${escapeHtml(formatHouseLogLine(row))}</p>`);
  });

  const detailHouseRows = houseRows.filter((row) => row.score > 0).slice(0, 3);
  for (const row of detailHouseRows) {
    const logLine = formatHouseLogLine(row);
    const title = logLine;
    const facts = [
      `支配: ${row.signGlyph || ""}${row.signJa || ""}`.trim(),
      `天体: ${row.items.length ? row.items.join(" ") : "—"}`,
      `score: ${Number(row.score || 0).toFixed(2)}`,
    ];
    const signElement = dict?.SIGNS_V2?.signs?.[row.signKey]?.element || "";
    const temp = (signElement === "fire" || signElement === "air") ? "外向" : (signElement ? "内向" : "—");
    facts.push(`圧の温度: ${temp}`);
    const prompt = [
      BLOG_LONG_HOUSE_GUIDE,
      "",
      `日付: ${dateLabel}`,
      `TITLE: ${title}`,
      `FACTS: ${facts.join(" / ")}`,
    ].join("\n");
    const text = await runWithRetry({ userContent: prompt, model: modelParts, maxTokens: 200 });
    lines.push(`<h3>${escapeHtml(title)}</h3>`);
    pushParagraphs(lines, text);
  }

  // 4) Elements
  lines.push("<h2>4｜🔥 元素／三区分（圧縮）</h2>");
  lines.push(`<p>${escapeHtml(elementLine)}</p>`);
  lines.push(`<p>${escapeHtml(modalityLine)}</p>`);
  const elementsPrompt = [
    BLOG_LONG_ELEMENTS_GUIDE,
    "",
    `日付: ${dateLabel}`,
    `FACTS: ${elementLine} / ${modalityLine}`,
  ].join("\n");
  const elementsText = await runWithRetry({ userContent: elementsPrompt, model: modelMain, maxTokens: 700 });
  pushParagraphs(lines, elementsText);

  // 6) Kinjitsu log (lightweight)
  lines.push("<h2>6｜📅 近日（軽量版）</h2>");
  const kinjitsuRows = buildKinjitsuRowsPublic(story).slice(0, 3);
  if (!kinjitsuRows.length) {
    lines.push("<p>該当なし</p>");
  } else {
    const kinjitsuRetro = buildRetrogradeMap(asOfISO, Array.from(new Set(kinjitsuRows.flatMap((r) => [
      normalizeBodyKey(r?.a || ""),
      normalizeBodyKey(r?.b || ""),
    ]).filter(Boolean))));
    for (const row of kinjitsuRows) {
      const aKey = normalizeBodyKey(row?.a || "");
      const bKey = normalizeBodyKey(row?.b || "");
      const aLabel = `${bodyGlyph(aKey)} ${bodyLabelJa(dict, aKey)}${kinjitsuRetro[aKey] ? "（R）" : ""}`.trim();
      const bLabel = `${bodyGlyph(bKey)} ${bodyLabelJa(dict, bKey)}${kinjitsuRetro[bKey] ? "（R）" : ""}`.trim();
      const aspLabel = aspectLabelForLong(row?.aspect, row?.aspect_deg);
      const degText = `${Math.round(row?.aspect_deg)}°`;
      const orbText = Number.isFinite(Number(row?.now_orb)) ? `${Number(row.now_orb).toFixed(1)}°` : "—";
      const peakText = row?.peak_at ? formatDateYmdHm(new Date(row.peak_at)) : (row?.peak_label ? row.peak_label : "-");

      const afterPrompt = [
        "以下のFACTSから「余韻」を1行で書く。",
        "出力は日本語本文のみ（HTMLなし）。",
        "20〜45字。1文のみ。",
        "占い化しない。未来断定/指示/救済/運命固定/絶対語は禁止。",
        "主語は構造（配置/角度/圧/残り方）。",
        `FACTS: ${aLabel} × ${bLabel} / ${aspLabel} ${degText} / 現在 orb ${orbText}`,
      ].join("\n");
      const afterTextRaw = await runWithRetry({ userContent: afterPrompt, model: modelParts, maxTokens: 90 });
      const afterText = String(afterTextRaw || "").split(/\r?\n/)[0].trim();

      const line = [
        `★ ${aLabel} × ${bLabel}`,
        `${aspLabel} ${degText}`.trim(),
        `最接近 ${peakText}`,
        `現在 orb ${orbText}`,
        `余韻 ${afterText}`.trim(),
      ].filter(Boolean).join("<br>");
      lines.push(`<p>${escapeHtml(line).replace(/&lt;br&gt;/g, "<br>")}</p>`);
    }
  }

  const todayMoon = formatTodayMoonLines({ asOfISO, story, dict });
  todayMoon.lines.forEach((line) => lines.push(`<p>${escapeHtml(line)}</p>`));

  const nextMoon = formatNextMoonLines({ asOfISO, dict });
  nextMoon.lines.forEach((line) => lines.push(`<p>${escapeHtml(line)}</p>`));

  const nextSoon = orderedMoonEvents(nextMoon.events)[0];

  if (nextSoon?.line) {
    const moonAfterPrompt = [
      "以下のFACTSから「余韻」を1行で書く。",
      "出力は日本語本文のみ（HTMLなし）。",
      "15〜35字。1文のみ。",
      "占い化しない。未来断定/指示/救済/運命固定/絶対語は禁止。",
      "主語は構造（配置/角度/圧/残り方）。",
      `FACTS: ${nextSoon.line}`,
    ].join("\n");
    const moonAfterRaw = await runWithRetry({ userContent: moonAfterPrompt, model: modelParts, maxTokens: 70 });
    const moonAfter = String(moonAfterRaw || "").split(/\r?\n/)[0].trim();
    lines.push(`<p>${escapeHtml(moonAfter)}</p>`);
  }

  // 8) Aftertaste
  lines.push("<h2>8｜余韻（短縮）</h2>");
  const afterFacts = [
    `重心: ${strata.top_element || "—"}×${strata.top_modality || "—"}`,
    strongest ? `強い層: ${aspectLabelForLong(strongest.type, strongest.aspect_deg)}` : "強い層: —",
  ];
  const afterPrompt = [
    BLOG_LONG_AFTERTASTE_GUIDE,
    "",
    `日付: ${dateLabel}`,
    `FACTS: ${afterFacts.join(" / ")}`,
  ].join("\n");
  const afterText = await runWithRetry({ userContent: afterPrompt, model: modelMain, maxTokens: 700 });
  pushParagraphs(lines, afterText);

  return lines.join("\n");
}

function markdownToHtml(text, opts = {}) {
  const h1 = String(opts.h1 || "").trim();
  const raw = String(text || "");
  const lines = raw.split(/\r?\n/);
  const out = [];
  let para = [];

  const flushPara = () => {
    if (!para.length) return;
    out.push(`<p>${para.join(" ")}</p>`);
    para = [];
  };

  const pushHeading = (level, title) => {
    flushPara();
    out.push(`<h${level}>${escapeHtml(title)}</h${level}>`);
  };

  if (h1) {
    out.push(`<h1>${escapeHtml(h1)}</h1>`);
  }

  for (const line of lines) {
    const t = String(line || "").trim();
    if (!t) {
      flushPara();
      continue;
    }
    if (t.startsWith("### ")) {
      pushHeading(3, t.slice(4).trim());
      continue;
    }
    if (t.startsWith("## ")) {
      pushHeading(2, t.slice(3).trim());
      continue;
    }
    if (t.startsWith("# ")) {
      pushHeading(1, t.slice(2).trim());
      continue;
    }
    para.push(escapeHtml(t));
  }
  flushPara();
  return out.join("\n");
}

function softenText(text) {
  const s = String(text || "");
  const replacements = [
    [/示唆/g, "置かれている"],
    [/暗示/g, "残っている"],
    [/意味/g, "構造"],
    [/知られている/g, "観測される"],
    [/興味深い/g, "目に入っている"],
    [/解かれていない/g, "完全には処理されていない"],
    [/可能性/g, "余地"],
    [/と言える/g, "と置ける"],
    [/〜と言える/g, "〜と置ける"],
    [/状況/g, "状態"],
    [/きっかけ/g, "端緒"],
    [/助け/g, "支え"],
    [/変化/g, "移ろい"],
    [/気づき/g, "輪郭"],
    [/噛み合わなさを感じる/g, "噛み合わなさが残る"],
    [/噛み合わないまま並ぶ/g, "噛み合わなさが並ぶ"],
    [/生じている/g, "並んでいる"],
    [/生まれる/g, "残る"],
    [/起きる/g, "残る"],
    [/を生む/g, "が残る"],
    [/により/g, "その配置のまま"],
    [/ことによるもの/g, "として置かれている"],
    [/影響を与えている/g, "並んでいる"],
    [/必要になる/g, "置かれている"],
    [/形成している/g, "並んでいる"],
    [/これは([^。]+?)の感触。/g, "$1の感触が残る。"],
    [/と感じる/g, "が残る"],
    [/感じることがある/g, "が残る"],
  ];

  let out = s;
  for (const [re, to] of replacements) out = out.replace(re, to);

  // まとめ口調の緩和
  out = out.replace(/つまり、/g, "");
  out = out.replace(/要するに、/g, "");

  // 禁止寄りの語尾を軽く削る
  out = out.replace(/かもしれない/g, "");
  out = out.replace(/こともある/g, "");
  out = out.replace(/だろう/g, "");
  out = out.replace(/ようだ/g, "");
  out = out.replace(/例えば、?/g, "");

  return out;
}

function escapeRegex(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function enforceSingleClosing(text, closing) {
  const s = String(text || "").trim();
  if (!s) return closing;

  const closingLines = closing.split("\n").map((line) => line.trim());
  const closingPattern = closingLines
    .map((line) => escapeRegex(line))
    .join("\\s*\\n+\\s*");
  const closingRegex = new RegExp(closingPattern, "g");

  const body = s.replace(closingRegex, "").trim().replace(/\n+$/g, "").trim();
  return `${body}\n\n${closing}`.trim();
}

module.exports = { generateDailyDraft, buildDailyTitle, markdownToHtml, escapeHtml };
