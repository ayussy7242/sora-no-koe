"use strict";

const { createJaFormatters } = require("../render_parts/fmt_ja");
const dict = require("../../dict");
const { createChatCompletion } = require("./openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
  SORA_AI_USER_GUIDE_BLOG,
} = require("../prompts/sora_ai_prompts");

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

const fmt = createJaFormatters({
  META: {
    ASPECTS_META,
    PLANETS_META: dict?.PLANETS_V2?.bodies || {},
    POINTS_META: dict?.POINTS_V1?.points || {},
  },
  normalizeAspectType,
});

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
  if (!meta) return fmt.fmtAspectJa(typeRaw);
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

function buildDailyDataBlock(story, maxItems = 5, dateLocal = "") {
  const pub = story?.public || {};
  const all = Array.isArray(pub.sky_all) ? [...pub.sky_all] : [];
  all.sort((a, b) => (a?.orb_deg ?? 99) - (b?.orb_deg ?? 99));

  const aspectTriplet = pickTripletByBucket(
    all,
    (x) => aspectToneBucket(x?.type),
    ["yin", "harmony", "yang"],
    `${dateLocal}|aspect-triplet`
  );
  const list = aspectTriplet.slice(0, 3);
  const seenAspect = new Set();

  const baseCandidates = [];
  const baseSeen = new Set();
  for (const x of list) {
    const aKey = String(x?.a || "");
    const bKey = String(x?.b || "");
    const aSignKey = String(x?.a_sign_key || x?.a_sign || x?.aS || "").toLowerCase();
    const bSignKey = String(x?.b_sign_key || x?.b_sign || x?.bS || "").toLowerCase();
    const aSig = `${aKey}|${aSignKey}`;
    const bSig = `${bKey}|${bSignKey}`;
    if (aKey && aSignKey && !baseSeen.has(aSig)) {
      baseSeen.add(aSig);
      baseCandidates.push({ bodyKey: aKey, signKey: aSignKey, orb_deg: x?.orb_deg });
    }
    if (bKey && bSignKey && !baseSeen.has(bSig)) {
      baseSeen.add(bSig);
      baseCandidates.push({ bodyKey: bKey, signKey: bSignKey, orb_deg: x?.orb_deg });
    }
  }
  const baseTriplet = pickTripletByBucket(
    baseCandidates,
    (x) => elementBucket(signElement(x.signKey)),
    ["yin", "harmony", "yang"],
    `${dateLocal}|base-triplet`
  ).slice(0, 3);

  const aspects = list.map((x, idx) => {
    const a = fmt.fmtAnyJa(x.a);
    const b = fmt.fmtAnyJa(x.b);
    const aS = signJa(x.a_sign_key || x.a_sign || x.aS);
    const bS = signJa(x.b_sign_key || x.b_sign || x.bS);
    const typeRaw = x.type || x.aspect || x.aspectType;
    const asp = aspectLabelWithDeg(typeRaw);
    const qSeed = hash32(`${dateLocal}-${normalizeAspectType(typeRaw)}-${x?.a}-${x?.b}`);
    const quality = aspectQualityLabel(typeRaw, qSeed);
    const aspectKey = normalizeAspectType(typeRaw);
    const role = seenAspect.has(aspectKey) ? aspectRoleEcho(typeRaw) : aspectRoleSentence(typeRaw);
    seenAspect.add(aspectKey);
    const roleLine = role ? `角度の役割: ${role}` : "";
    const orb = Number.isFinite(x.orb_deg) ? x.orb_deg.toFixed(1) : "—";
    const meta = aspectMeta(typeRaw);
    const core = meta?.core ? `角度質感: ${meta.core}` : "";
    const feel = Array.isArray(meta?.feel) && meta.feel.length ? `触れ味: ${meta.feel.join(" / ")}` : "";
    const qualityLine = quality ? `質感ラベル: ${quality}` : "";
    const voice = aspectVoice(typeRaw);
    const voiceLine = voice.length ? `角度語彙: ${voice.join(" / ")}` : "";
    const pTouchA = planetTouch(x.a);
    const pTouchB = planetTouch(x.b);
    const sTouchA = signTouch(x.a_sign_key || x.a_sign || x.aS);
    const sTouchB = signTouch(x.b_sign_key || x.b_sign || x.bS);
    const pLine = pTouchA.length || pTouchB.length ? `惑星感触: ${[...pTouchA, ...pTouchB].join(" / ")}` : "";
    const sLine = sTouchA.length || sTouchB.length ? `サイン感触: ${[...sTouchA, ...sTouchB].join(" / ")}` : "";
    const extra = [core, feel].filter(Boolean).join(" / ");
    return [
      `${["①", "②", "③"][idx] || "①"} ${a}（${aS}）× ${b}（${bS}）｜${asp}（orb ${orb}°）`,
      roleLine ? `  ${roleLine}` : "",
      extra ? `  ${extra}` : "",
      qualityLine ? `  ${qualityLine}` : "",
      voiceLine ? `  ${voiceLine}` : "",
      pLine ? `  ${pLine}` : "",
      sLine ? `  ${sLine}` : "",
    ].filter(Boolean).join("\n");
  });

  const planetLines = baseTriplet.map((item, idx) => {
    const bodyKey = item.bodyKey;
    const signKey = item.signKey;
    const ja = fmt.fmtAnyJa(bodyKey);
    const signJaLabel = signJa(signKey || "");
    const pTouch = planetTouch(bodyKey);
    const sTouch = signTouch(signKey);
    const touch = [...pTouch, ...sTouch].filter(Boolean);
    const touchLine = touch.length ? `感触: ${touch.slice(0, 4).join(" / ")}` : "";
    const fusion = fusionTokensFor(signKey, bodyKey);
    const fusionLine = fusion.length ? `融合語彙: ${fusion.slice(0, 12).join(" / ")}` : "";
    return [`${["①", "②", "③"][idx] || "①"} ${ja}×${signJaLabel}`, touchLine, fusionLine].filter(Boolean).join(" / ");
  });

  const sky = pub.sky_strata || {};
  const e = sky.element_count || {};
  const m = sky.modality_count || {};
  const elements = `火${e.fire || 0} 地${e.earth || 0} 風${e.air || 0} 水${e.water || 0}`;
  const modalities = `活${m.cardinal || 0} 不${m.fixed || 0} 柔${m.mutable || 0}`;
  const moon = pub?.moon?.sign_ja || signJa(pub?.moon?.sign_key || "");

  const qualities = aspects
    .map((a) => {
      const m = String(a || "").match(/質感ラベル:\s*([^\n]+)/);
      return m ? m[1].trim() : "";
    })
    .filter(Boolean);

  return [
    `月：${moon}`,
    `要素：${elements}`,
    `区分：${modalities}`,
    "",
    "配置メモ（①〜③）:",
    ...planetLines,
    "",
    "角度メモ（①〜③）:",
    ...aspects.map((a) => `- ${a}`),
    "",
    qualities.length ? `余韻ヒント: ${qualities.join(" / ")}` : "",
  ].filter(Boolean).join("\n");
}

function systemPrompt() {
  return SORA_AI_SYSTEM_PROMPT_COMMON;
}

function userPrompt({ dateLocal, dataBlock }) {
  return [
    SORA_AI_USER_GUIDE_BLOG,
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
  const dataBlock = buildDailyDataBlock(story, 3, dateLocal);
  const messages = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: userPrompt({ dateLocal, dataBlock }) },
  ];

  const text = await createChatCompletion({
    apiKey: openai.apiKey,
    baseUrl: openai.baseUrl,
    model: openai.model,
    messages,
    temperature: 0.7,
    maxTokens: 2200,
  });

  const closing = "これは占いではありません。\n星は答えを示さず、構造だけを置いています。\nどう感じ、どう扱うかの主権は、常にあなたにあります。";
  const cleaned = softenText(text);
  return enforceSingleClosing(cleaned, closing);
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
