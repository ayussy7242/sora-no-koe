"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createNatalService } = require("../story/story_natal");
const { generateBlueprintLightText, generateBlueprintLightTextV2 } = require("./generate_text");
const { renderPdfBuffer } = require("../../engine/pdf/blueprint_light/render");
const { createBlueprintLightStorage } = require("./storage");
const { getBlueprintLightPaths } = require("./paths");
const { getBlueprintLightManifest } = require("./manifest");
const { buildBlueprintV25BgImages, buildStoryStub, BG_IMAGE_KEYS } = require("../../engine/pdf/blueprint_v25/backgrounds");
const { signIndexFromKey, houseNumberForSignIndex } = require("../../domain/astro_compute");
const {
  SIGN_KEYS,
  BODY_ORDER_MAIN,
  BODY_ORDER_EXTRA,
  BODY_LABEL,
  BODY_GLYPH,
} = require("../../engine/pdf/blueprint_light/shared");

function norm360(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return null;
  return ((n % 360) + 360) % 360;
}

function absAngularDistance(a, b) {
  const d = Math.abs(norm360(a) - norm360(b));
  return d > 180 ? 360 - d : d;
}

function toSignMeta(dict, lon) {
  const v = norm360(lon);
  if (!Number.isFinite(v)) return null;
  const idx = Math.floor(v / 30);
  const within = v - idx * 30;
  const deg = Math.floor(within);
  const min = Math.floor((within - deg) * 60 + 1e-9);
  const key = SIGN_KEYS[idx] || null;
  const sign = dict?.SIGNS_V2?.signs?.[key] || {};
  return {
    lon_deg: v,
    sign_key: key,
    sign_ja: sign?.label_ja || key || "（不明）",
    element: sign?.element || null,
    modality: sign?.modality || null,
    deg,
    min,
    flavor: sign?.flavor || sign?.sora_short || "",
  };
}

function formatSignText(meta) {
  if (!meta) return "";
  const mm = String(meta.min).padStart(2, "0");
  return `${meta.sign_ja} ${meta.deg}°${mm}’`;
}

function formatSignPipe(meta) {
  if (!meta) return "";
  const mm = String(meta.min).padStart(2, "0");
  return `${meta.sign_ja}｜${meta.deg}°${mm}’`;
}

function buildBlueprintLightRows({ longitudes, dict }) {
  const rowsMain = [];
  const rowsAngles = [];
  const rowsExtra = [];
  const element = { fire: 0, earth: 0, air: 0, water: 0 };
  const modality = { cardinal: 0, fixed: 0, mutable: 0 };

  const pushRow = (rows, key, lon, { count = false } = {}) => {
    const meta = toSignMeta(dict, lon);
    if (!meta) return;
    rows.push({
      key,
      glyph: BODY_GLYPH[key] || "",
      label: BODY_LABEL[key] || key,
      value: formatSignText(meta),
      meta,
    });
    if (count) {
      if (meta.element && element[meta.element] !== undefined) element[meta.element] += 1;
      if (meta.modality && modality[meta.modality] !== undefined) modality[meta.modality] += 1;
    }
  };

  BODY_ORDER_MAIN.forEach((k) => {
    const lon = longitudes?.[k];
    if (Number.isFinite(Number(lon))) pushRow(rowsMain, k, lon, { count: true });
  });

  const asc = longitudes?.asc;
  const mc = longitudes?.mc;
  const ic = Number.isFinite(Number(mc)) ? norm360(Number(mc) + 180) : null;
  const dc = Number.isFinite(Number(asc)) ? norm360(Number(asc) + 180) : null;
  if (Number.isFinite(Number(asc))) pushRow(rowsAngles, "asc", asc);
  if (Number.isFinite(Number(mc))) pushRow(rowsAngles, "mc", mc);
  if (Number.isFinite(Number(ic))) pushRow(rowsAngles, "ic", ic);
  if (Number.isFinite(Number(dc))) pushRow(rowsAngles, "dc", dc);

  BODY_ORDER_EXTRA.forEach((k) => {
    const lon = longitudes?.[k];
    if (!Number.isFinite(Number(lon))) return;
    const count = k === "chiron" || k === "lilith";
    pushRow(rowsExtra, k, lon, { count });
  });

  return { rowsMain, rowsAngles, rowsExtra, element, modality };
}

function buildBirthText(birth) {
  if (!birth) return "";
  const date = birth.date_local ? String(birth.date_local) : "";
  const time = birth.time_hm ? String(birth.time_hm) : "";
  const place = birth.place_text || birth.place_formatted || "";
  const parts = [];
  if (date) parts.push(date);
  if (time) parts.push(time);
  if (place) parts.push(place);
  return parts.length ? `出生: ${parts.join(" / ")}` : "";
}

async function resolveDisplayName({ db, appUserId, lineUser }) {
  const fromLine =
    lineUser?.line_profile?.display_name ||
    lineUser?.profile?.display_name ||
    lineUser?.display_name ||
    "";
  if (fromLine) return fromLine;
  if (!db || !appUserId) return "";
  try {
    const snap = await db.collection("users").doc(appUserId).get();
    if (!snap.exists) return "";
    const ud = snap.data() || {};
    return (
      ud.display_name ||
      ud?.profile?.display_name ||
      ud?.channels?.line?.profile?.display_name ||
      ""
    );
  } catch (_) {
    return "";
  }
}

function buildFactLine(row) {
  if (!row?.meta?.sign_ja || !row?.label) return "";
  const deg = Number(row.meta?.deg);
  const sign = row.meta.sign_ja;
  const label = row.label;
  if (Number.isNaN(deg)) return `${sign}にある${label}。`;
  if (deg >= 29) return `最終度数にある${sign}の${label}。`;
  if (deg >= 20) return `${sign}の後半度数にある${label}。`;
  if (deg >= 10) return `${sign}の中盤の位置で、${label}が立つ。`;
  return `始まりの度数にある${sign}の${label}。`;
}

function prependFactLine(text, factLine) {
  const body = String(text || "").trim();
  if (!factLine) return body;
  if (body.startsWith(factLine)) return body;
  return body ? `${factLine}\n${body}` : factLine;
}

function stripLeadingLine(text, line) {
  const body = String(text || "").trim();
  const target = String(line || "").trim();
  if (!body || !target) return body;
  const lines = body.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return body;
  if (lines[0] !== target) return body;
  const stripped = lines.slice(1).join("\n").trim();
  return stripped || body;
}

function stripLeadingAny(text, linesToStrip) {
  let out = String(text || "").trim();
  if (!out) return out;
  (linesToStrip || []).forEach((line) => {
    out = stripLeadingLine(out, line);
  });
  return out;
}

function buildStructureLineForRow(row) {
  if (!row) return "";
  return buildFactLine(row);
}

function prependStructureLine(text, structureLine) {
  const body = String(text || "").trim();
  if (!structureLine) return body;
  if (body.startsWith(structureLine)) return body;
  return body ? `${structureLine}\n${body}` : structureLine;
}

function normalizeSentenceCore(text) {
  let out = String(text || "")
    .replace(/、\s*。/g, "。")
    .replace(/,\s*。/g, "。")
    .replace(/[、,]+$/g, "")
    .replace(/で[、,]*$/g, "")
    .trim();
  if (/[はがをにとへ]$/.test(out) && out.length > 1) {
    out = out.replace(/([はがをにとへ])$/, "").trim();
  }
  return out;
}

function splitByCommaAdaptive(sentence, { maxParts = 6, targetLen = 26 } = {}) {
  const parts = String(sentence || "")
    .split("、")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length <= 1) return [sentence];
  const out = [];
  let current = "";
  for (const part of parts) {
    if (!current) {
      current = part;
      continue;
    }
    const next = `${current}、${part}`;
    if (next.length <= targetLen || out.length >= maxParts - 1) {
      current = next;
      continue;
    }
    out.push(current);
    current = part;
  }
  if (current) out.push(current);
  return out;
}

function dedupeSentences(lines) {
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    const key = String(line || "").replace(/[。、「」、\s]/g, "");
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function splitByConnectors(sentence) {
  const core = String(sentence || "");
  if (!core) return [];
  const withCuts = core.replace(/(が、|けれど|しかし|一方|だが)/g, "。$1");
  return withCuts
    .split("。")
    .map((s) => s.trim())
    .filter(Boolean);
}

function wrapParagraph(text, { maxLines = 4 } = {}) {
  const raw = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/、\s*。/g, "。")
    .replace(/,\s*。/g, "。")
    .trim();
  if (!raw) return raw;
  let sentences = raw
    .split("。")
    .map((s) => s.trim())
    .filter(Boolean);
  const expanded = [];
  for (const sentence of sentences) {
    const core = normalizeSentenceCore(sentence);
    if (!core) continue;
    if (core.length > 80 && /が、|けれど|しかし|一方|だが/.test(core)) {
      const chunks = splitByConnectors(core);
      expanded.push(...chunks);
      continue;
    }
    const commaCount = (core.match(/、/g) || []).length;
    if (core.length > 110 && commaCount >= 2) {
      const chunks = splitByCommaAdaptive(core, { maxParts: 6, targetLen: 26 });
      expanded.push(...chunks);
      continue;
    }
    if (core.length > 70 && commaCount >= 2) {
      const chunks = splitByCommaAdaptive(core, { maxParts: 4, targetLen: 24 });
      expanded.push(...chunks);
      continue;
    }
    expanded.push(core);
  }
  const lines = dedupeSentences(expanded).map((s) => (s.endsWith("。") ? s : `${s}。`));
  if (lines.length > maxLines) {
    const out = [...lines];
    while (out.length > maxLines && out.length >= 2) {
      const last = out.pop();
      out[out.length - 1] = `${out[out.length - 1]}${last}`;
    }
    return out.join("\n");
  }
  return lines.join("\n");
}

function wrapSummaryText(text, { maxLines = 10 } = {}) {
  const raw = String(text || "").trim();
  if (!raw) return raw;
  const lines = raw.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return raw;
  const first = lines[0];
  const isCounts = /^(?:🔥|🏃|🪨|💨|💧)/.test(first) && /[0-9]/.test(first);
  if (!isCounts) return wrapParagraph(raw, { maxLines });
  const rest = lines.slice(1).join(" ");
  const wrapped = wrapParagraph(rest, { maxLines: Math.max(2, maxLines - 1) });
  return wrapped ? `${first}\n${wrapped}` : first;
}

function applyFactLinesToAiData(aiData, rowsMain, rowsExtra, rowsAngles) {
  if (!aiData || !Array.isArray(aiData.sections)) return aiData;
  const byId = new Map(aiData.sections.map((s) => [s?.id, s]));
  const mainMap = new Map((rowsMain || []).map((row) => [row.key, row]));
  const extraMap = new Map((rowsExtra || []).map((row) => [row.key, row]));
  const angleMap = new Map((rowsAngles || []).map((row) => [row.key, row]));

  const bodies = byId.get("bodies");
  if (bodies && Array.isArray(bodies.items)) {
    bodies.items = bodies.items.map((item) => {
      const row = mainMap.get(item?.key);
      if (!row) return item;
      const factLine = buildFactLine(row);
      const cleaned = stripLeadingAny(item?.text, [factLine, item?.structure_line]);
      const text = wrapParagraph(cleaned, { maxLines: 6 });
      return {
        ...item,
        fact_line: factLine,
        text,
        structure_line: undefined,
      };
    });
  }

  const summary = byId.get("summary");
  if (summary && Array.isArray(summary.blocks)) {
    summary.blocks = summary.blocks.map((b) => ({
      ...b,
      text: wrapSummaryText(String(b?.text || ""), { maxLines: 10 }),
    }));
  }

  const chiron = byId.get("chiron");
  if (chiron && extraMap.has("chiron")) {
    const row = extraMap.get("chiron");
    const factLine = buildFactLine(row);
    chiron.fact_line = factLine;
    chiron.text = wrapParagraph(stripLeadingAny(chiron?.text, [factLine, chiron?.structure_line]), { maxLines: 6 });
    delete chiron.structure_line;
  }
  const lilith = byId.get("lilith");
  if (lilith && extraMap.has("lilith")) {
    const row = extraMap.get("lilith");
    const factLine = buildFactLine(row);
    lilith.fact_line = factLine;
    lilith.text = wrapParagraph(stripLeadingAny(lilith?.text, [factLine, lilith?.structure_line]), { maxLines: 6 });
    delete lilith.structure_line;
  }

  const nodes = byId.get("nodes");
  if (nodes && nodes.south && extraMap.has("south_node")) {
    const row = extraMap.get("south_node");
    const factLine = buildFactLine(row);
    nodes.south = {
      ...nodes.south,
      fact_line: factLine,
      text: wrapParagraph(stripLeadingAny(nodes.south?.text, [factLine, nodes.south?.structure_line]), { maxLines: 6 }),
      structure_line: undefined,
    };
  }
  if (nodes && nodes.north && extraMap.has("north_node")) {
    const row = extraMap.get("north_node");
    const factLine = buildFactLine(row);
    nodes.north = {
      ...nodes.north,
      fact_line: factLine,
      text: wrapParagraph(stripLeadingAny(nodes.north?.text, [factLine, nodes.north?.structure_line]), { maxLines: 6 }),
      structure_line: undefined,
    };
  }

  const angles = byId.get("angles");
  if (angles && Array.isArray(angles.items)) {
    angles.items = angles.items.map((item) => {
      const row = angleMap.get(item?.key);
      if (!row) return item;
      const factLine = buildFactLine(row);
      const cleaned = stripLeadingAny(item?.text, [factLine, item?.structure_line]);
      const text = wrapParagraph(cleaned, { maxLines: 6 });
      return {
        ...item,
        fact_line: factLine,
        text,
        structure_line: undefined,
      };
    });
  }

  return aiData;
}

function asArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function toBool(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeTraitTokens(list) {
  const out = [];
  for (const raw of asArray(list)) {
    const t = String(raw || "").trim();
    if (!t) continue;
    // 文っぽい長文を除外（例文に寄せる）
    if (t.length > 12) continue;
    if (/ながら|つつ|しつつ|しながら/.test(t)) continue;
    out.push(t);
  }
  return Array.from(new Set(out));
}

function normalizeCoreTokens(list, { maxLen = 24 } = {}) {
  const out = [];
  for (const raw of asArray(list)) {
    const t = String(raw || "").trim();
    if (!t) continue;
    if (t.length > maxLen) continue;
    if (/ながら|つつ|しつつ|しながら/.test(t)) continue;
    out.push(t);
  }
  return Array.from(new Set(out));
}

function getSoraCore(dict) {
  return dict?.SORA_CORE_V2 || dict?.SORA_CORE_V1 || dict?.sora_core || null;
}

function getSoraPlanetSlotTokens(dict, key, slot) {
  const core = getSoraCore(dict)?.meaning?.planets?.[key] || null;
  const bucket = core?.[slot] || null;
  if (!bucket) return [];
  if (Array.isArray(bucket)) {
    return normalizeCoreTokens(bucket);
  }
  if (typeof bucket === "object") {
    return normalizeCoreTokens([
      ...asArray(bucket.cores),
      ...asArray(bucket.seeds),
      ...asArray(bucket.phrases),
      ...asArray(bucket.verbs),
    ]);
  }
  return normalizeCoreTokens(asArray(bucket));
}

function getSoraPlanetCoreTokens(dict, key) {
  const core = getSoraCore(dict)?.meaning?.planets?.[key] || null;
  if (!core) return [];
  if (Array.isArray(core.role)) {
    return normalizeCoreTokens(core.role);
  }
  if (core.role) {
    return normalizeCoreTokens([
      ...asArray(core.role?.cores),
      ...asArray(core.role?.seeds),
    ]);
  }
  return normalizeCoreTokens([
    ...asArray(core.cores),
    ...asArray(core.phrases),
    ...asArray(core.verbs),
  ]);
}

function getSoraSignCoreTokens(dict, signKey) {
  const k = String(signKey || "").toLowerCase();
  const core = getSoraCore(dict)?.meaning?.signs?.[k] || null;
  if (!core) return [];
  if (core.cores || core.seeds || core.color || core.verbs) {
    return normalizeCoreTokens([
      ...asArray(core.cores),
      ...asArray(core.seeds),
      ...asArray(core.color),
      ...asArray(core.verbs),
    ]);
  }
  return normalizeCoreTokens([...asArray(core.cores), ...asArray(core.phrases)]);
}

function getSoraDegreePhase(dict, deg) {
  const phases = getSoraCore(dict)?.facts?.degree_phase || [];
  const bias = getSoraCore(dict)?.facts?.phase_bias || null;
  const d = typeof deg === "number" ? deg : Number(deg);
  for (const p of phases) {
    if (typeof p?.min !== "number" || typeof p?.max !== "number") continue;
    if (d >= p.min && d <= p.max) {
      return {
        name: p.name || null,
        fact: p.fact || null,
        bias: bias?.[p.name] || null,
      };
    }
  }
  return { name: null, fact: null, bias: null };
}

function splitFlavorText(text) {
  if (!text) return [];
  const s = String(text).replace(/[。．]/g, " ");
  const parts = s
    .split(/[・、,\s/]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => (p.includes("と") ? p.split("と") : [p]))
    .map((p) => p.trim())
    .filter(Boolean);
  return parts;
}

function getSignFlavorTokens(dict, signKey, bodyKey) {
  const sf = dict?.SIGN_FLAVOR_V1 || dict?.sign_flavor || null;
  if (!sf || !signKey) return [];
  const s = sf.signs?.[String(signKey || "").toLowerCase()] || null;
  if (!s) return [];

  const baseKeywords = asArray(s.base?.keywords || []);
  const body = s.by_body?.[bodyKey] || null;
  const fusion = body?.fusion || {};
  const a = asArray(fusion.A || []);
  const expr = asArray(fusion.expression || []);
  const process = asArray(fusion.process || []);

  return normalizeTraitTokens([...baseKeywords, ...a, ...expr, ...process]);
}

function getSignFlavorRoleCoreTokens(dict, signKey, bodyKey) {
  const sf = dict?.SIGN_FLAVOR_V1 || dict?.sign_flavor || null;
  if (!sf || !signKey) return [];
  const s = sf.signs?.[String(signKey || "").toLowerCase()] || null;
  if (!s) return [];
  const body = s.by_body?.[bodyKey] || null;
  if (!body) return [];
  const role = splitFlavorText(body.role || "");
  const core = splitFlavorText(body.core || "");
  return normalizeTraitTokens([...role, ...core]);
}

const SIGN_TRAIT_MAP = Object.freeze({
  "牡羊座": ["切り出し", "初速", "先頭", "直線", "突き出る", "即応"],
  "牡牛座": ["持続", "重み", "触感", "保持", "摩擦", "ゆっくり"],
  "双子座": ["接続", "往復", "言い換え", "分岐", "軽さ", "散る"],
  "蟹座": ["内側", "包む", "濃度", "記憶", "保護", "湿り"],
  "獅子座": ["中心", "温度", "熱", "前面", "表出", "発光", "名乗り"],
  "乙女座": ["整える", "調律", "粒度", "手入れ", "計測", "整備"],
  "天秤座": ["間合い", "均衡", "交点", "対", "中点", "並ぶ"],
  "蠍座": ["深度", "濃度", "吸着", "沈む", "極性", "密着"],
  "射手座": ["遠景", "射程", "外へ", "方向", "拡張", "視界"],
  "山羊座": ["構造", "枠", "制度", "重み", "背負う", "組み替える", "持続"],
  "水瓶座": ["距離", "俯瞰", "更新", "ずれ", "外側", "一歩引く", "全体を見る"],
  "魚座": ["溶解", "境界", "にじみ", "混ざる", "漂い", "水気"],
});

function buildSignTraitAll({ dict, signKey, signJa, bodyKey }) {
  const fallback = SIGN_TRAIT_MAP[signJa] || [];
  const flavor = getSignFlavorTokens(dict, signKey, bodyKey);
  const modern = getSoraSignCoreTokens(dict, signKey);
  return normalizeTraitTokens([...fallback, ...flavor, ...modern]);
}

const DEGREE_PHASE_MAP = Object.freeze({
  P1: { key: "P1", anchor: ["立ち上がり", "生まれたて", "先に出る"] },
  P2: { key: "P2", anchor: ["馴染み始め", "触感", "まだ柔らかい"] },
  P3: { key: "P3", anchor: ["重心", "厚み", "中核"] },
  P4: { key: "P4", anchor: ["輪郭", "仕上がり", "成熟"] },
  P5: { key: "P5", anchor: ["極まり", "端", "決着点"] },
});

const PHASE_MOTION_BASE = Object.freeze({
  P1: ["立つ", "先に出る", "走る"],
  P2: ["馴染む", "手が入る", "固まり始める"],
  P3: ["厚みが出る", "運用に乗る", "芯が立つ"],
  P4: ["輪郭が立つ", "仕上がる", "収束する"],
  P5: ["決着する", "閉じる", "張りつめる"],
});

const PLANET_MOTION_HINTS = Object.freeze({
  sun: ["照らす", "名乗る", "温度が上がる"],
  moon: ["揺れる", "満ちる", "受け止める"],
  mercury: ["走る", "繋ぐ", "言葉が先に出る"],
  venus: ["包む", "寄る", "選ぶ"],
  mars: ["押す", "踏む", "進む"],
  jupiter: ["広げる", "膨らむ", "許す"],
  saturn: ["固める", "背骨が入る", "制限する"],
  uranus: ["ずれる", "跳ねる", "外す"],
  neptune: ["溶ける", "にじむ", "混ざる"],
  pluto: ["沈む", "圧が入る", "掘る"],
  chiron: ["触れる", "止まる", "遅れる"],
  lilith: ["拒む", "沈黙する", "逸れる"],
  south_node: ["戻る", "馴染む", "反射する"],
  north_node: ["向く", "引く", "伸びる"],
  asc: ["届く", "先に伝わる", "立つ"],
  mc: ["見える", "前に出る", "露出する"],
  ic: ["根づく", "内へ沈む", "守る"],
  dc: ["向かい合う", "寄る", "受け取る"],
});

const SIGN_FIELD_MAP = Object.freeze({
  "牡羊座": ["火花", "前", "先端"],
  "牡牛座": ["土台", "触感", "重さ"],
  "双子座": ["風", "往復", "軽さ"],
  "蟹座": ["内側", "境界", "包み"],
  "獅子座": ["光", "前面", "温度"],
  "乙女座": ["手元", "精度", "粒度"],
  "天秤座": ["間", "対面", "空気"],
  "蠍座": ["深部", "濃度", "核"],
  "射手座": ["遠景", "射程", "外"],
  "山羊座": ["骨格", "現実", "積み上げ"],
  "水瓶座": ["距離", "俯瞰", "全体"],
  "魚座": ["水面", "境界", "にじみ"],
});

const SENSE_TOKENS = Object.freeze([
  "体温",
  "温度",
  "気配",
  "手触り",
  "濃度",
  "距離",
  "間",
  "名残",
  "芯",
  "圧",
  "基準",
  "入口",
]);

function buildStructureLine(functionWords, signTraits, seed) {
  const f = Array.isArray(functionWords) && functionWords.length ? functionWords[0] : "性質";
  const s = Array.isArray(signTraits) && signTraits.length ? signTraits[0] : "向き";
  const templates = [
    `${f}と${s}が同じ方向を向く配置。`,
    `${f}が${s}側へ寄る配置。`,
    `${f}が${s}に置かれる配置。`,
  ];
  const idx = Math.abs(seed) % templates.length;
  return templates[idx];
}

const FUNCTION_WORDS_MAP = Object.freeze({
  sun: ["中心", "焦点", "名乗り", "表出", "意志", "発光", "存在", "温度"],
  moon: ["反応", "体感", "揺れ", "安心", "受け止め", "満ち引き", "生活感覚", "内側の動き"],
  mercury: ["接続", "翻訳", "理解", "編集", "言葉", "伝達", "整理", "往復"],
  venus: ["好意", "価値", "受容", "距離", "包む", "選択基準", "美意識", "調和"],
  mars: ["推進", "摩擦", "衝動", "方向性", "動力", "切り込む", "持続圧", "速度"],
  jupiter: ["拡張", "意味の広がり", "信頼", "余裕", "遠景", "包括", "余白", "教示"],
  saturn: ["制約", "骨格", "現実化", "限界設定", "責任", "重さ", "継続", "構造保持"],
  uranus: ["更新", "再配置", "断続", "逸脱", "革新", "切断", "距離化", "非連続"],
  neptune: ["溶解", "共鳴", "境界の薄さ", "霧", "理想", "漂い", "融解", "混ざり"],
  pluto: ["深度", "変容", "圧縮", "極性", "核化", "本質化", "再編", "密度上昇"],
  chiron: ["痛点", "遅延", "傷の接続", "敏感域", "裂け目", "反応停止点"],
  lilith: ["濃度", "拒否", "未統合", "原初衝動", "境界拒絶", "逸脱の核"],
  south_node: ["慣れ", "既知", "反射的反応", "過去傾向", "安定側"],
  north_node: ["方向", "引力", "未経験側", "触れ続ける点", "拡張方向"],
  asc: ["入口", "外面", "第一印象", "接点", "見え方"],
  mc: ["社会面", "上面", "見え方", "表舞台", "露出"],
  ic: ["内側", "基点", "根", "居場所", "安心"],
  dc: ["関係", "対面", "入口", "距離", "持続"],
});

const RESIDUE_BASE_MAP = Object.freeze({
  sun: ["温度", "中心", "熱"],
  moon: ["揺れ", "湿り", "波"],
  mercury: ["言葉", "整理", "伝達"],
  venus: ["包み", "結び", "基準"],
  mars: ["摩擦", "勢い", "押し"],
  jupiter: ["余白", "広がり", "入口"],
  saturn: ["重み", "枠", "背負い"],
  uranus: ["切替", "ずれ", "更新"],
  neptune: ["にじみ", "霧", "境界"],
  pluto: ["深さ", "根", "極端"],
  chiron: ["遅れ", "痛点", "ためらい"],
  lilith: ["濃度", "沈黙", "拒否"],
  south_node: ["慣れ", "既知", "反射"],
  north_node: ["引力", "方向", "偏り"],
  asc: ["印象", "入口", "深度"],
  mc: ["露出", "上面", "見え方"],
  ic: ["根", "基点", "安心"],
  dc: ["接点", "関係", "信頼"],
});

const RESIDUE_VERB_TOKENS = Object.freeze([
  "なる",
  "置く",
  "保つ",
  "変える",
]);

const LINE3_ENDINGS_MAP = Object.freeze({
  sun: ["温度が基準", "場を変える", "前に出る", "中心が立つ"],
  moon: ["外で整う", "外に出る", "揺れが整う", "分断されにくい"],
  mercury: ["話しながら整う", "同時に動く", "体温に近い", "通路が揃う"],
  venus: ["包めるかどうか", "守る感覚", "基準になる", "内側から始まる"],
  mars: ["持続圧", "摩擦で進む", "進み続ける", "止まりにくい"],
  jupiter: ["内側に起きる", "入口になる", "守られる感覚", "信じる入口"],
  saturn: ["組み替える力", "背負える形", "枠になる", "現実を知る"],
  uranus: ["中から更新", "静かな再設計", "ずれで変わる", "更新が入る"],
  neptune: ["現実側に置く", "形になる前提", "抽象ではない", "境界が薄い"],
  pluto: ["真実に触れる", "深さに迷いがない", "核に触れる", "極端に触れる"],
  chiron: ["言葉が遅れる", "反応が止まる", "感覚が深すぎる", "守りたいもの"],
  lilith: ["途中で終われない", "濃度の問題", "沈黙の濃度", "濃度が張る"],
  south_node: ["自然に立つ", "中心になれる", "慣れが出る", "既知が強い"],
  north_node: ["一歩引く", "全体を見る", "関係性に置く", "方向が引かれる"],
  asc: ["簡単じゃなさ", "先に届く", "深度が先", "入口になる"],
  mc: ["前に立つ", "仕事になる", "表現者", "前面に出る"],
  ic: ["距離と自由", "近すぎない", "居場所を保つ", "根になる"],
  dc: ["安定と持続", "信頼が深まる", "急がない関係", "持続が基準"],
  default: ["配置になる", "構造になる", "基準になる", "入口になる"],
});

const LINE3_SIGNATURES_MAP = Object.freeze({
  sun: [
    "存在が場の温度を変える。",
    "中心に立った瞬間、温度が変わる。",
    "意識して輝くのではなく、もう出ている。",
  ],
  moon: [
    "揺れは内側に留まらず、外で整う。",
    "感じることと、見せることが分断されにくい。",
  ],
  mercury: [
    "考えてから話すより、話しながら整う。",
    "言葉は武器ではなく、体温に近い。",
  ],
  venus: [
    "好き嫌いより先に、包めるかどうか。",
    "判断ではなく、守る感覚が基準。",
  ],
  mars: [
    "瞬発力より、持続圧。",
    "止まりにくい方向性が先に決まる。",
  ],
  jupiter: [
    "拡大は外ではなく、内側に起きる。",
    "守られている感覚が入口になる。",
  ],
  saturn: [
    "背負うのではなく、背負える形に組み替える。",
    "現実の骨格が、無理をほどく。",
  ],
  uranus: [
    "壊すより、中から更新する。",
    "急進ではなく、静かな再設計。",
  ],
  neptune: [
    "夢は逃避ではなく、形になる前提で置かれる。",
    "理想は抽象ではなく、現実側に置かれる。",
  ],
  pluto: [
    "極端さは破壊ではなく、真実に触れるため。",
    "深さに迷いがない。",
  ],
  chiron: [
    "反応が止まるのは、防御ではなく深さ。",
    "守りたいものに触れたとき、言葉が遅れる。",
  ],
  lilith: [
    "途中で終われない濃度がある。",
    "沈黙は拒否ではなく、濃度の問題。",
  ],
  south_node: [
    "自然に立ち、自然に表現する。",
    "意識しなくても中心になれる。",
  ],
  north_node: [
    "一歩引いた位置で、全体を見る。",
    "個の輝きを、関係性の中に置く。",
  ],
  asc: [
    "説明より先に、深度が届く。",
    "最初に伝わるのは、簡単じゃなさ。",
  ],
  mc: [
    "前に立つこと自体が仕事になる。",
    "表現者として見える。",
  ],
  ic: [
    "近すぎないことで、居場所が保たれる。",
    "安心の根は、距離と自由。",
  ],
  dc: [
    "急がない関係ほど、信頼が深まる。",
    "安定と持続が基準。",
  ],
  default: [
    "配置が基準になる。",
    "構造が入口になる。",
  ],
});

const LINE3_SIGNATURE_TAGS_MAP = Object.freeze({
  sun: ["温度", "中心", "出る", "場が変わる"],
  moon: ["外で整う", "分断されにくい", "揺れ", "外へ"],
  mercury: ["話しながら整う", "同時に動く", "体温", "通路"],
  venus: ["包める", "守る感覚", "基準", "内側"],
  mars: ["持続圧", "止まりにくい", "進む", "摩擦"],
  jupiter: ["内側に起きる", "入口", "守られる感覚", "広がる"],
  saturn: ["組み替える", "背負える形", "現実", "骨格"],
  uranus: ["中から更新", "静かな再設計", "ずれ", "更新"],
  neptune: ["現実側", "形になる前提", "溶ける", "共鳴"],
  pluto: ["真実に触れる", "迷いがない", "深度", "核"],
  chiron: ["言葉が遅れる", "反応が止まる", "深さ", "守りたいもの"],
  lilith: ["途中で終われない", "濃度の問題", "沈黙", "濃度"],
  south_node: ["自然に立つ", "中心になる", "慣れ", "既知"],
  north_node: ["一歩引く", "全体を見る", "関係性に置く", "方向"],
  asc: ["深度が届く", "簡単じゃなさ", "入口", "先に届く"],
  mc: ["前に立つ", "仕事になる", "表現者", "前面"],
  ic: ["距離と自由", "居場所", "近すぎない", "根"],
  dc: ["信頼が深まる", "安定と持続", "急がない", "関係"],
  default: ["配置", "基準", "入口", "構造"],
});

function pickDegreeBand(deg) {
  if (deg == null || Number.isNaN(deg)) return "P3";
  if (deg >= 29) return "P5";
  if (deg >= 20) return "P4";
  if (deg >= 10) return "P3";
  return "P1";
}

function hashString(seed) {
  const str = String(seed || "");
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash >>> 0;
}

function pickN(list, count, seed) {
  if (!Array.isArray(list) || list.length === 0 || count <= 0) return [];
  if (list.length <= count) return [...new Set(list)];
  const chosen = [];
  const step = 7;
  let idx = seed % list.length;
  let guard = 0;
  while (chosen.length < count && guard < list.length * 2) {
    const item = list[idx];
    if (item && !chosen.includes(item)) chosen.push(item);
    idx = (idx + step) % list.length;
    guard += 1;
  }
  return chosen;
}

function buildKernelForItem({ key, sign, signKey, deg, label, houseNo, elementBias, modalityBias, dict }) {
  const seed = hashString(`${key}|${sign}|${deg ?? ""}`);
  const phaseKey = pickDegreeBand(deg);
  const degreePhase = DEGREE_PHASE_MAP[phaseKey] || DEGREE_PHASE_MAP.P3;
  const soraPhase = getSoraDegreePhase(dict, deg);
  const modernFunction = getSoraPlanetCoreTokens(dict, key);
  const functionPool = Array.from(
    new Set([...(FUNCTION_WORDS_MAP[key] || []), ...modernFunction])
  );
  const functionWords = pickN(functionPool, 2, seed);
  const signFlavorTokens = getSignFlavorTokens(dict, signKey, key);
  const signTraitAll = buildSignTraitAll({ dict, signKey, signJa: sign, bodyKey: key });
  const signTraitPrimary = signFlavorTokens && signFlavorTokens.length ? signFlavorTokens : signTraitAll;
  const signTraits = pickN(signTraitAll, 2, seed + 11);
  const signRoleCore = getSignFlavorRoleCoreTokens(dict, signKey, key);
  const motionPool = [
    ...(PLANET_MOTION_HINTS[key] || []),
    ...(PHASE_MOTION_BASE[phaseKey] || []),
  ];
  const phaseMotion = pickN(motionPool, 2, seed + 23);
  const signFieldPool = SIGN_FIELD_MAP[sign] || [];
  const signField = pickN(signFieldPool, 1, seed + 29);
  const residueBase = pickN(RESIDUE_BASE_MAP[key] || [], 1, seed + 31);
  const senseToken = pickN(SENSE_TOKENS, 1, seed + 53);
  const residueVerbAll = RESIDUE_VERB_TOKENS || [];
  const residueVerb = pickN(residueVerbAll, 1, seed + 47);
  const line3EndingsPool = LINE3_ENDINGS_MAP[key] || LINE3_ENDINGS_MAP.default;
  const line3Ending = pickN(line3EndingsPool, 1, seed + 71)[0];
  const line3SignaturesPool = LINE3_SIGNATURES_MAP[key] || LINE3_SIGNATURES_MAP.default;
  const line3TagsPool = LINE3_SIGNATURE_TAGS_MAP[key] || LINE3_SIGNATURE_TAGS_MAP.default;
  const elementBiasWords = pickN(elementBias || [], 2, seed + 37);
  const modalityBiasWords = pickN(modalityBias || [], 2, seed + 41);
  const orderPatterns = [
    { id: "A", guide: "段階→機能→残り方" },
    { id: "B", guide: "機能→段階→残り方" },
    { id: "C", guide: "段階→残り方→機能" },
  ];
  const orderPattern = orderPatterns[seed % orderPatterns.length];

  const structureLine =
    label && sign ? buildStructureLineForRow({ key, meta: { sign_ja: sign, deg }, label }) : "";
  const slotMaterials = {
    role: getSoraPlanetSlotTokens(dict, key, "role"),
    appear: getSoraPlanetSlotTokens(dict, key, "appear"),
    impact: getSoraPlanetSlotTokens(dict, key, "impact"),
    order: getSoraPlanetSlotTokens(dict, key, "order"),
    residue: getSoraPlanetSlotTokens(dict, key, "residue"),
    stance: getSoraPlanetSlotTokens(dict, key, "stance"),
  };
  const signCore = getSoraCore(dict)?.meaning?.signs?.[String(signKey || "").toLowerCase()] || null;
  const signMaterials = {
    cores: getSoraSignCoreTokens(dict, signKey),
    color: normalizeCoreTokens(asArray(signCore?.color)),
    verbs: normalizeCoreTokens(asArray(signCore?.verbs)),
    lens: normalizeCoreTokens(asArray(signCore?.lens)),
    order_bias: normalizeCoreTokens(asArray(signCore?.order_bias)),
    residue_bias: normalizeCoreTokens(asArray(signCore?.residue_bias)),
    contrasts: normalizeCoreTokens(asArray(signCore?.contrasts)),
  };
  return {
    meta: {
      key,
      label: label || "",
      sign_ja: sign || "",
      sign_key: signKey || "",
      deg: deg ?? null,
      house_no: Number.isFinite(Number(houseNo)) ? Number(houseNo) : null,
    },
    function: functionWords,
    sign_trait: signTraits,
    sign_trait_primary: signTraitPrimary,
    sign_trait_all: signTraitAll,
    sign_role_core: signRoleCore,
    degree_phase: { key: degreePhase.key, anchor: degreePhase.anchor || [] },
    degree_phase_v2: soraPhase,
    phase_motion: phaseMotion,
    phase_motion_all: motionPool,
    sign_field: signField,
    structure_line: structureLine || buildStructureLine(functionWords, signTraits, seed + 61),
    sense_token: senseToken,
    residue_base: residueBase,
    residue_verb: residueVerb,
    residue_verb_all: residueVerbAll,
    line3_endings: line3EndingsPool,
    line3_ending: line3Ending,
    line3_signatures: line3SignaturesPool,
    line3_tags: line3TagsPool,
    slots: slotMaterials,
    sign_materials: signMaterials,
    element_bias: elementBiasWords,
    modality_bias: modalityBiasWords,
    order_pattern: orderPattern.id,
    order_guide: orderPattern.guide,
  };
}

function analyzeDistribution(counts) {
  const list = Array.isArray(counts) ? counts.slice() : [];
  const sorted = [...list].sort((a, b) => b - a);
  const max = sorted[0] ?? 0;
  const second = sorted[1] ?? 0;
  const min = sorted[sorted.length - 1] ?? 0;
  const spread = max - min;
  const zeros = list.filter((n) => n === 0).length;
  let type = "balanced";
  if (max >= 5 && min === 0) {
    type = "polarized";
  } else if (spread <= 1) {
    type = "balanced";
  } else if (min === 0) {
    type = "flat_missing";
  } else if (max - second >= 2) {
    type = "dominant";
  } else {
    type = "dominant";
  }
  return { max, min, spread, zeros, type };
}

function buildElementBecauseLine({ distribution }) {
  const type = distribution?.type || "dominant";
  if (type === "polarized") {
    return "偏りが極端なため、感触と言葉の順序が一方向に寄りやすい。";
  }
  if (type === "balanced") {
    return "偏りが少ないため、入り方は散りやすい。";
  }
  if (type === "flat_missing") {
    return "欠けがあるため、感触と言語化の順序がズレやすい。";
  }
  return "差がはっきりしているため、感触の入り方が偏りやすい。";
}

function buildModalityBecauseLine({ distribution }) {
  const type = distribution?.type || "dominant";
  if (type === "polarized") {
    return "偏りが極端なため、起動と維持の圧が同時に強くなる。";
  }
  if (type === "balanced") {
    return "偏りが少ないため、動きは循環しやすい。";
  }
  if (type === "flat_missing") {
    return "欠けがあるため、切り替えは後追いになりやすい。";
  }
  return "差がはっきりしているため、動き方に偏りが出やすい。";
}

function buildElementKernel(balance) {
  const elements = [
    { key: "火", count: balance?.fire ?? 0 },
    { key: "地", count: balance?.earth ?? 0 },
    { key: "風", count: balance?.air ?? 0 },
    { key: "水", count: balance?.water ?? 0 },
  ];
  const sorted = [...elements].sort((a, b) => b.count - a.count);
  const dominant = sorted.filter((e) => e.count > 0).slice(0, 2).map((e) => e.key);
  const missing = elements.filter((e) => e.count === 0).map((e) => e.key);
  const dominantKeys = dominant.join("");
  let orderHint = "感触が先に入る";
  if (dominantKeys.includes("火") || dominantKeys.includes("風")) {
    orderHint = "動きが先に立つ";
  }
  const residueHint = missing.length ? "空白が残る" : "重なりが残る";
  const countsLine = `🔥 火 ${balance?.fire ?? 0} / 🪨 地 ${balance?.earth ?? 0} / 💨 風 ${balance?.air ?? 0} / 💧 水 ${balance?.water ?? 0}`;

  const distribution = analyzeDistribution(elements.map((e) => e.count));
  const becauseLine = buildElementBecauseLine({ dominant, missing, distribution });

  return {
    dominant,
    missing,
    order_hint: orderHint,
    residue_hint: residueHint,
    counts_line: countsLine,
    because_line: becauseLine,
    distribution,
  };
}

function buildModalityKernel(balance) {
  const modalities = [
    { key: "活動", count: balance?.cardinal ?? 0 },
    { key: "不動", count: balance?.fixed ?? 0 },
    { key: "柔軟", count: balance?.mutable ?? 0 },
  ];
  const sorted = [...modalities].sort((a, b) => b.count - a.count);
  const dominant = sorted.filter((m) => m.count > 0).slice(0, 2).map((m) => m.key);
  const missing = modalities.filter((m) => m.count === 0).map((m) => m.key);
  const top = sorted[0]?.key || "";
  let orderHint = "動きの順序が交差する";
  if (top === "活動") orderHint = "動き出しが先に立つ";
  if (top === "不動") orderHint = "留まりが先に立つ";
  if (top === "柔軟") orderHint = "揺らぎが先に立つ";
  const residueHint = missing.length ? "切り替えが遅れる" : "留まりが残る";
  const countsLine = `🏃 活動 ${balance?.cardinal ?? 0} / 🧱 不動 ${balance?.fixed ?? 0} / 🌿 柔軟 ${balance?.mutable ?? 0}`;

  const distribution = analyzeDistribution(modalities.map((m) => m.count));
  const becauseLine = buildModalityBecauseLine({ dominant, missing, distribution });

  return {
    dominant,
    missing,
    order_hint: orderHint,
    residue_hint: residueHint,
    counts_line: countsLine,
    because_line: becauseLine,
    distribution,
  };
}

function buildElementBiasTerms(balance) {
  const fire = balance?.fire ?? 0;
  const earth = balance?.earth ?? 0;
  const air = balance?.air ?? 0;
  const water = balance?.water ?? 0;
  const hot = fire + air;
  const cool = earth + water;
  const terms = [];

  if (hot >= cool) {
    terms.push("動き", "外へ");
  } else {
    terms.push("感触", "重さ");
  }
  if (air === 0) terms.push("言葉は後");
  if (water === 0) terms.push("感触は遅い");
  if (earth === 0) terms.push("支えは後");
  if (fire === 0) terms.push("動きは遅い");

  return Array.from(new Set(terms.filter(Boolean)));
}

function buildModalityBiasTerms(balance) {
  const cardinal = balance?.cardinal ?? 0;
  const fixed = balance?.fixed ?? 0;
  const mutable = balance?.mutable ?? 0;
  const terms = [];
  if (cardinal >= fixed && cardinal >= mutable) terms.push("起動");
  if (fixed >= cardinal && fixed >= mutable) terms.push("留まり");
  if (mutable >= cardinal && mutable >= fixed) terms.push("揺らぎ");

  if (mutable === 0) terms.push("切替", "位相");
  if (fixed === 0) terms.push("留まりが薄い");
  if (cardinal === 0) terms.push("起動が遅い");

  return Array.from(new Set(terms.filter(Boolean)));
}

function buildHouseEmphasis({ rowsMain, rowsExtra, rowsAngles, dict }) {
  const ascRow = (rowsAngles || []).find((row) => row.key === "asc");
  const ascKey = ascRow?.meta?.sign_key || "";
  const ascIndex = signIndexFromKey(dict, ascKey);
  if (!ascKey || ascIndex < 0) return null;

  const counts = {};
  const placements = [];
  const rows = [...(rowsMain || []), ...(rowsExtra || [])];
  rows.forEach((row) => {
    const signKey = row?.meta?.sign_key || "";
    if (!signKey) return;
    const signIndex = signIndexFromKey(dict, signKey);
    if (signIndex < 0) return;
    const houseNo = houseNumberForSignIndex(signIndex, ascIndex);
    if (!houseNo) return;
    counts[houseNo] = (counts[houseNo] || 0) + 1;
    placements.push({
      key: row.key,
      label: row.label,
      house_no: houseNo,
      sign_key: signKey,
      sign_ja: row.meta?.sign_ja || "",
    });
  });

  const sorted = Object.entries(counts)
    .map(([houseNo, count]) => ({ house_no: Number(houseNo), count }))
    .sort((a, b) => (b.count - a.count) || (a.house_no - b.house_no));
  const emphasis = sorted.filter((row) => row.count >= 2).map((row) => row.house_no);
  return {
    asc_sign_key: ascKey,
    asc_sign_ja: ascRow?.meta?.sign_ja || "",
    counts,
    top: sorted.slice(0, 3),
    emphasis,
    placements,
  };
}

function normalizeCuspsFromNatalCache(natalCache) {
  const hs = natalCache?.houses || natalCache?.engine?.houses || {};
  const cuspsRaw = hs.cusps || hs.house || hs.cusp || null;
  if (!Array.isArray(cuspsRaw) || cuspsRaw.length < 12) return null;
  if (cuspsRaw.length === 13) return cuspsRaw.slice(1).map((v) => Number(v));
  return cuspsRaw.slice(0, 12).map((v) => Number(v));
}

function getHouseFromCusps(lon, cusps) {
  const v = norm360(lon);
  if (!Number.isFinite(v) || !Array.isArray(cusps) || cusps.length !== 12) return null;
  for (let i = 0; i < 12; i += 1) {
    const start = norm360(cusps[i]);
    const end = norm360(cusps[(i + 1) % 12]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (start <= end) {
      if (v >= start && v < end) return i + 1;
    } else {
      if (v >= start || v < end) return i + 1;
    }
  }
  return null;
}

function buildHouseEmphasisFromCusps({ rowsMain, rowsExtra, cusps, dict, system }) {
  if (!Array.isArray(cusps) || cusps.length !== 12) return null;
  const counts = {};
  const placements = [];
  const rows = [...(rowsMain || []), ...(rowsExtra || [])];
  rows.forEach((row) => {
    const lon = row?.meta?.lon_deg ?? row?.meta?.lon ?? null;
    const houseNo = getHouseFromCusps(lon, cusps);
    if (!houseNo) return;
    counts[houseNo] = (counts[houseNo] || 0) + 1;
    placements.push({
      key: row.key,
      label: row.label,
      house_no: houseNo,
      sign_key: row.meta?.sign_key || "",
      sign_ja: row.meta?.sign_ja || "",
    });
  });
  const sorted = Object.entries(counts)
    .map(([houseNo, count]) => ({ house_no: Number(houseNo), count }))
    .sort((a, b) => (b.count - a.count) || (a.house_no - b.house_no));
  const emphasis = sorted.filter((row) => row.count >= 2).map((row) => row.house_no);
  return {
    system: system || null,
    counts,
    top: sorted.slice(0, 3),
    emphasis,
    placements,
  };
}

function buildMajorAspectDefs(dict) {
  const major = dict?.ASPECTS?.major || {};
  const orbRules = dict?.ORB_RULES_V1?.aspect_by_type || {};
  const defaults = {
    conjunction: { deg: 0, orb: 6.0 },
    opposition: { deg: 180, orb: 6.0 },
    square: { deg: 90, orb: 5.0 },
    trine: { deg: 120, orb: 5.0 },
    sextile: { deg: 60, orb: 4.5 },
  };
  const order = ["conjunction", "opposition", "square", "trine", "sextile"];
  return order
    .map((key) => {
      const base = defaults[key] || {};
      const aspect = major[key] || {};
      const deg = Number.isFinite(Number(aspect.deg)) ? Number(aspect.deg) : base.deg;
      const orb = Number.isFinite(Number(orbRules?.[key]?.orb_deg)) ? Number(orbRules[key].orb_deg) : base.orb;
      if (!Number.isFinite(deg)) return null;
      return { key, deg, orb, label_ja: aspect.label_ja || "" };
    })
    .filter(Boolean);
}

function buildNatalAspects({ longitudes, rowsMain, dict, max = 5 } = {}) {
  if (!longitudes) return [];
  const aspectDefs = buildMajorAspectDefs(dict);
  if (!aspectDefs.length) return [];
  const order = aspectDefs.map((d) => d.key);
  const priority = new Map(order.map((key, idx) => [key, idx]));
  const bodies = BODY_ORDER_MAIN.filter((k) => Number.isFinite(Number(longitudes[k])));
  const signByKey = new Map((rowsMain || []).map((row) => [row.key, row.meta?.sign_ja || ""]));
  const signKeyByKey = new Map((rowsMain || []).map((row) => [row.key, row.meta?.sign_key || ""]));
  const labelByKey = new Map((rowsMain || []).map((row) => [row.key, row.label || ""]));
  const out = [];

  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const aKey = bodies[i];
      const bKey = bodies[j];
      const lonA = Number(longitudes[aKey]);
      const lonB = Number(longitudes[bKey]);
      if (!Number.isFinite(lonA) || !Number.isFinite(lonB)) continue;
      const dist = absAngularDistance(lonA, lonB);
      let best = null;
      for (const aspect of aspectDefs) {
        const orb = Math.abs(dist - aspect.deg);
        if (orb > aspect.orb) continue;
        if (!best || orb < best.orb) {
          best = {
            a: aKey,
            b: bKey,
            type: aspect.key,
            aspect_deg: aspect.deg,
            orb_deg: Number(orb.toFixed(2)),
          };
        }
      }
      if (best) {
        out.push({
          ...best,
          a_label: labelByKey.get(aKey) || aKey,
          b_label: labelByKey.get(bKey) || bKey,
          a_sign_ja: signByKey.get(aKey) || "",
          b_sign_ja: signByKey.get(bKey) || "",
          a_sign_key: signKeyByKey.get(aKey) || "",
          b_sign_key: signKeyByKey.get(bKey) || "",
        });
      }
    }
  }

  out.sort((a, b) => {
    if (a.orb_deg !== b.orb_deg) return a.orb_deg - b.orb_deg;
    const pa = priority.get(a.type) ?? 99;
    const pb = priority.get(b.type) ?? 99;
    return pa - pb;
  });

  return out.slice(0, max);
}

function buildAiInput({ displayName, rowsMain, rowsAngles, rowsExtra, element, modality, dict, longitudes, identity, cusps, houseSystem }) {
  const elementKernel = buildElementKernel(element || {});
  const modalityKernel = buildModalityKernel(modality || {});
  const elementBiasTerms = buildElementBiasTerms(element || {});
  const modalityBiasTerms = buildModalityBiasTerms(modality || {});
  const houseEmphasis =
    buildHouseEmphasisFromCusps({ rowsMain, rowsExtra, cusps, dict, system: houseSystem }) ||
    buildHouseEmphasis({ rowsMain, rowsExtra, rowsAngles, dict }) ||
    {};
  const houseNoByKey = new Map((houseEmphasis.placements || []).map((row) => [row.key, row.house_no]));

  const bodies = rowsMain.map((row) => ({
    key: row.key,
    kernel: buildKernelForItem({
      key: row.key,
      label: row.label,
      sign: row.meta?.sign_ja || "",
      signKey: row.meta?.sign_key || "",
      deg: row.meta?.deg ?? null,
      houseNo: houseNoByKey.get(row.key),
      elementBias: elementBiasTerms,
      modalityBias: modalityBiasTerms,
      dict,
    }),
  }));

  const angles = rowsAngles.map((row) => ({
    key: row.key,
    kernel: buildKernelForItem({
      key: row.key,
      label: row.label,
      sign: row.meta?.sign_ja || "",
      signKey: row.meta?.sign_key || "",
      deg: row.meta?.deg ?? null,
      houseNo: houseNoByKey.get(row.key),
      elementBias: elementBiasTerms,
      modalityBias: modalityBiasTerms,
      dict,
    }),
  }));

  const extraMap = rowsExtra.reduce((acc, row) => {
    acc[row.key] = row;
    return acc;
  }, {});
  const chironRow = extraMap.chiron || null;
  const lilithRow = extraMap.lilith || null;
  const southNodeRow = extraMap.south_node || null;
  const northNodeRow = extraMap.north_node || null;

  const kernel = {
    summary: {
      element: { ...elementKernel, bias_tokens: elementBiasTerms },
      modality: { ...modalityKernel, bias_tokens: modalityBiasTerms },
    },
    bodies,
    chiron: chironRow
      ? {
          key: "chiron",
          kernel: buildKernelForItem({
          key: "chiron",
          label: chironRow.label,
          sign: chironRow.meta?.sign_ja || "",
          signKey: chironRow.meta?.sign_key || "",
          deg: chironRow.meta?.deg ?? null,
          houseNo: houseNoByKey.get("chiron"),
          elementBias: elementBiasTerms,
          modalityBias: modalityBiasTerms,
          dict,
          }),
        }
      : null,
    lilith: lilithRow
      ? {
          key: "lilith",
          kernel: buildKernelForItem({
          key: "lilith",
          label: lilithRow.label,
          sign: lilithRow.meta?.sign_ja || "",
          signKey: lilithRow.meta?.sign_key || "",
          deg: lilithRow.meta?.deg ?? null,
          houseNo: houseNoByKey.get("lilith"),
          elementBias: elementBiasTerms,
          modalityBias: modalityBiasTerms,
          dict,
          }),
        }
      : null,
    nodes: {
      south: southNodeRow
        ? {
            key: "south_node",
          kernel: buildKernelForItem({
            key: "south_node",
            label: southNodeRow.label,
            sign: southNodeRow.meta?.sign_ja || "",
            signKey: southNodeRow.meta?.sign_key || "",
            deg: southNodeRow.meta?.deg ?? null,
            houseNo: houseNoByKey.get("south_node"),
            elementBias: elementBiasTerms,
            modalityBias: modalityBiasTerms,
            dict,
          }),
          }
        : null,
      north: northNodeRow
        ? {
            key: "north_node",
          kernel: buildKernelForItem({
            key: "north_node",
            label: northNodeRow.label,
            sign: northNodeRow.meta?.sign_ja || "",
            signKey: northNodeRow.meta?.sign_key || "",
            deg: northNodeRow.meta?.deg ?? null,
            houseNo: houseNoByKey.get("north_node"),
            elementBias: elementBiasTerms,
            modalityBias: modalityBiasTerms,
            dict,
          }),
          }
        : null,
    },
    angles,
    houses: houseEmphasis,
    aspects: buildNatalAspects({ longitudes, rowsMain, dict, max: 5 }),
  };

  return {
    product: "blueprint_light_v1",
    tone: "静か・誠実・やわらかいが曖昧すぎない",
    longitudes,
    rules: {
      no_prediction: true,
      no_advice: true,
      no_commands: true,
      no_fear: true,
      no_fortune: true,
    },
    identity: {
      name: "",
      birth_date: identity?.birth_date || "",
      birth_time: identity?.birth_time || "",
      birth_place: identity?.birth_place || "",
    },
    user: {
      display_name: "",
    },
    kernel,
  };
}

function mapAiContent(ai) {
  const sections = Array.isArray(ai?.sections) ? ai.sections : [];
  const pickSection = (id) => sections.find((s) => s?.id === id) || null;

  const summary = pickSection("summary");
  const summaryBlocks = Array.isArray(summary?.blocks) ? summary.blocks : [];
  const summaryOut = {
    element: summaryBlocks[0] ? { text: summaryBlocks[0].text || "" } : null,
    modality: summaryBlocks[1] ? { text: summaryBlocks[1].text || "" } : null,
    closing: null,
  };

  const bodies = pickSection("bodies");
  const bodyItems = Array.isArray(bodies?.items) ? bodies.items : [];
  const normalizeKey = (key) => String(key || "").trim().toLowerCase();
  const bodyTextByKey = new Map(bodyItems.map((i) => [normalizeKey(i?.key), i?.text]));

  const angles = pickSection("angles");
  const angleItems = Array.isArray(angles?.items) ? angles.items : [];
  const angleTextByKey = new Map(angleItems.map((i) => [normalizeKey(i?.key), i?.text]));

  const chiron = pickSection("chiron");
  const lilith = pickSection("lilith");

  const nodes = pickSection("nodes") || {};
  const nodeBlocks = Array.isArray(nodes?.blocks) ? nodes.blocks : [];
  const nodeText = {
    south:
      nodes?.south?.text ||
      nodes?.south ||
      nodeBlocks.find((b) => b?.key === "south")?.text ||
      nodeBlocks.find((b) => String(b?.subheading || "").includes("☋"))?.text ||
      nodeBlocks[0]?.text ||
      "",
    north:
      nodes?.north?.text ||
      nodes?.north ||
      nodeBlocks.find((b) => b?.key === "north")?.text ||
      nodeBlocks.find((b) => String(b?.subheading || "").includes("☊"))?.text ||
      nodeBlocks[1]?.text ||
      "",
  };

  summaryOut.closing = { text: (pickSection("closing_summary")?.text || pickSection("closing")?.text || "") };

  return {
    summary: summaryOut,
    bodyTextByKey,
    angleTextByKey,
    chironText: chiron?.text || "",
    lilithText: lilith?.text || "",
    nodeText,
    closingText:
      pickSection("closing_summary")?.text ||
      pickSection("closing")?.text ||
      "",
    footerEcho: ai?.footer?.echo || "",
  };
}

function createBlueprintLightService({ db, admin, storage, env, dict }) {
  if (!db) throw new Error("db is required");
  if (!admin) throw new Error("admin is required");
  if (!storage) throw new Error("storage is required");

  const bucketName = env?.GCS_BUCKET_BLUEPRINTS || null;
  const urlExpireDays = Number(env?.BLUEPRINT_URL_EXPIRES_DAYS || 7);

  const bucket = bucketName ? storage.bucket(bucketName) : null;
  const blueprintStorage = bucket ? createBlueprintLightStorage({ bucket, urlExpireDays }) : null;
  const natalService = createNatalService({ db, norm360 });

  async function getLineUser(lineUserId) {
    if (!lineUserId) return null;
    const snap = await db.collection("line_users").doc(lineUserId).get();
    return snap.exists ? snap.data() || null : null;
  }

  async function getOrCreateSignedUrl({ lineUserId, variant = "print" }) {
    if (!lineUserId) return { ok: false, code: "missing_line_user" };
    if (!bucketName || !bucket || !blueprintStorage) return { ok: false, code: "config_missing" };

    const manifest = getBlueprintLightManifest({ variant });
    const { pdfPath: filePath } = getBlueprintLightPaths(lineUserId, manifest.variant);
    const existsResult = await blueprintStorage.existsPdf(lineUserId, variant);
    const exists = !!existsResult?.exists;
    console.log("[blueprint] gcs", {
      bucket_set: !!bucketName,
      file_path: filePath,
      object_exists: !!exists,
    });

    if (!exists) return { ok: false, code: "not_ready" };

    const signed = await blueprintStorage.getSignedUrl(lineUserId, variant);
    if (!signed?.ok) {
      console.log("[blueprint] signed_url failed", { error: signed?.error || signed?.code });
      return signed;
    }
    console.log("[blueprint] signed_url", { ok: !!signed?.url });
    return signed;
  }

  async function hasPdf({ lineUserId, variant = "print" }) {
    if (!lineUserId) return { ok: false, code: "missing_line_user" };
    if (!bucketName || !bucket || !blueprintStorage) return { ok: false, code: "config_missing" };
    const result = await blueprintStorage.existsPdf(lineUserId, variant);
    return { ok: true, exists: !!result?.exists, filePath: result?.filePath || null };
  }

  async function generateAndStore({
    lineUserId,
    forceRegen = false,
    variant = "print",
    skipPdf = false,
  } = {}) {
    if (!lineUserId) throw new Error("lineUserId is required");
    if (!bucketName || !bucket || !blueprintStorage) throw new Error("bucket not configured");

    const manifest = getBlueprintLightManifest({ variant });
    const { pdfPath: filePath } = getBlueprintLightPaths(lineUserId, manifest.variant);
    const pdfExistsResult = await blueprintStorage.existsPdf(lineUserId, variant);
    const jsonExistsResult = await blueprintStorage.existsJson(lineUserId);
    const pdfExists = !!pdfExistsResult?.exists;
    const jsonExists = !!jsonExistsResult?.exists;
    const envForceRegen = String(env?.BLUEPRINT_REGEN || process.env.BLUEPRINT_REGEN || "") === "1";
    const shouldForceRegen = Boolean(forceRegen || envForceRegen);
    console.log("[blueprint] regen flags", {
      forceRegen: !!forceRegen,
      envForceRegen: !!envForceRegen,
      shouldForceRegen: !!shouldForceRegen,
    });

    if (pdfExists && !shouldForceRegen) {
      console.log("[blueprint] generate skip (pdf exists)", { file_path: filePath, json_exists: jsonExists });
      return { ok: true, filePath, skipped: true };
    }

    const lineUser = await getLineUser(lineUserId);
    if (!lineUser) throw new Error("line user not found");
    const appUserId = lineUser.app_user_id || null;
    if (!appUserId) throw new Error("app_user_id missing");

    const natalCache = await natalService.loadNatalFromcache(appUserId);
    if (!natalCache) throw new Error("natal_cache missing");

    const { ok, longitudes } = natalService.extractNatalLongitudes(natalCache);
    if (!ok) throw new Error("natal_cache invalid");
    const cusps = normalizeCuspsFromNatalCache(natalCache);
    const houseSystem = natalCache?.houses?.system || natalCache?.engine?.houses?.system || null;

    const {
      rowsMain,
      rowsAngles,
      rowsExtra,
      element,
      modality,
    } = buildBlueprintLightRows({ longitudes, dict });

    const titleForRow = (row) => {
      if (!row) return "";
      if (row.key === "south_node" || row.key === "north_node") {
        const signTitle = formatSignPipe(row.meta);
        const suffix = row.key === "south_node" ? "（慣れた反応）" : "（触れ続ける方向）";
        return `${row.glyph} ${signTitle}${suffix}`;
      }
      if (row.key === "asc" || row.key === "mc" || row.key === "ic" || row.key === "dc") {
        return `${row.label}｜${row.value}`;
      }
      const prefix = row.glyph ? `${row.glyph} ${row.label}` : `${row.label}`;
      return `${prefix}｜${row.value}`;
    };

    const titlePartsForRow = (row) => {
      if (!row) return { glyph: "", rest: "" };
      if (row.key === "south_node" || row.key === "north_node") {
        const signTitle = formatSignPipe(row.meta);
        const suffix = row.key === "south_node" ? "（慣れた反応）" : "（触れ続ける方向）";
        return { glyph: row.glyph || "", rest: `${signTitle}${suffix}` };
      }
      if (row.key === "asc" || row.key === "mc" || row.key === "ic" || row.key === "dc") {
        return { glyph: "", rest: `${row.label}｜${row.value}` };
      }
      return { glyph: row.glyph || "", rest: `${row.label}｜${row.value}` };
    };

    rowsMain.forEach((row) => {
      row.title = titleForRow(row);
      row.titleParts = titlePartsForRow(row);
    });
    rowsExtra.forEach((row) => {
      row.title = titleForRow(row);
      row.titleParts = titlePartsForRow(row);
    });
    rowsAngles.forEach((row) => {
      row.title = titleForRow(row);
      row.titleParts = titlePartsForRow(row);
    });

    const birthText = buildBirthText(natalCache?.birth || {});
    const displayName = await resolveDisplayName({ db, appUserId, lineUser });

    const skipAi = toBool(env?.BLUEPRINT_SKIP_AI || process.env.BLUEPRINT_SKIP_AI || "");
    let aiData = null;
    const useV25 = manifest?.version === "v25";
    if (skipAi) {
      if (jsonExists) {
        try {
          const download = await blueprintStorage.downloadJson(lineUserId);
          aiData = JSON.parse(String(download?.data || ""));
          if (!useV25) {
            aiData = applyFactLinesToAiData(aiData, rowsMain, rowsExtra, rowsAngles);
          }
          console.log("[blueprint] skip ai (cached json)", { file_path: filePath });
        } catch (e) {
          console.log("[blueprint] skip ai json parse failed", { error: e?.message || String(e) });
          aiData = { sections: [] };
        }
      } else {
        console.log("[blueprint] skip ai (no json)", { file_path: filePath });
        aiData = { sections: [] };
      }
    } else if (jsonExists && !shouldForceRegen) {
      try {
        const download = await blueprintStorage.downloadJson(lineUserId);
        aiData = JSON.parse(String(download?.data || ""));
        if (!useV25) {
          aiData = applyFactLinesToAiData(aiData, rowsMain, rowsExtra, rowsAngles);
        } else if (aiData?.version !== "blueprint_light_v2") {
          aiData = null;
        }
      } catch (e) {
        throw new Error(`json_parse_failed: ${e?.message || String(e)}`);
      }
    }
    if (!aiData) {
      const aiIdentity = {
        name: displayName || "",
        birth_date: natalCache?.birth?.date_local || "",
        birth_time: natalCache?.birth?.time_hm || "",
        birth_place: natalCache?.birth?.place_text || natalCache?.birth?.place_formatted || "",
      };
      const aiInput = buildAiInput({
        displayName,
        rowsMain,
        rowsAngles,
        rowsExtra,
        element,
        modality,
        dict,
        longitudes,
        cusps,
        houseSystem,
        identity: aiIdentity,
      });
      const aiRes = useV25
        ? await generateBlueprintLightTextV2({ env, input: aiInput })
        : await generateBlueprintLightText({ env, input: aiInput });
      if (!aiRes?.ok) {
        throw new Error(`ai_failed:${aiRes?.reason || "unknown"}`);
      }
      aiData = useV25 ? aiRes.data : applyFactLinesToAiData(aiRes.data, rowsMain, rowsExtra, rowsAngles);
      await blueprintStorage.saveJson(lineUserId, JSON.stringify(aiData, null, 2));
    }

    const mapped = !useV25 && aiData ? mapAiContent(aiData) : null;
    const summary = mapped?.summary || null;

    if (skipPdf) {
      console.log("[blueprint] skip pdf generation", { file_path: filePath });
      return { ok: true, filePath, skipped: false, skippedPdf: true };
    }

    if (pdfExists && !shouldForceRegen) {
      console.log("[blueprint] generate skip (exists)", { file_path: filePath });
      return { ok: true, filePath, skipped: true };
    }

    const narratives = {
      main: rowsMain.map((row) => ({
        ...row,
        text: prependFactLine(
          mapped?.bodyTextByKey?.get(row.key) ||
            row.meta?.flavor ||
            "構造の質感が静かに立ち上がる配置。",
          buildFactLine(row)
        ),
      })),
      chiron: rowsExtra.filter((r) => r.key === "chiron").map((row) => ({
        ...row,
        text: prependFactLine(
          mapped?.chironText || row.meta?.flavor || "傷と回復の入口に、構造的な輪郭が生まれやすい。",
          buildFactLine(row)
        ),
      })),
      lilith: rowsExtra.filter((r) => r.key === "lilith").map((row) => ({
        ...row,
        text: prependFactLine(
          mapped?.lilithText || row.meta?.flavor || "境界の深い層に、静かな緊張が触れやすい。",
          buildFactLine(row)
        ),
      })),
      nodes: [
        rowsExtra.find((r) => r.key === "south_node"),
        rowsExtra.find((r) => r.key === "north_node"),
      ]
        .filter(Boolean)
        .map((row) => ({
          ...row,
          text: prependFactLine(
            row.key === "south_node"
              ? mapped?.nodeText?.south || row.meta?.flavor || "方向性の軸が、配置として浮かびやすい。"
              : mapped?.nodeText?.north || row.meta?.flavor || "方向性の軸が、配置として浮かびやすい。",
            buildFactLine(row)
          ),
        })),
      axes: rowsAngles.map((row) => ({
        ...row,
        text: prependFactLine(
          mapped?.angleTextByKey?.get(row.key) ||
            row.meta?.flavor ||
            "視点の入口として、構造の基準になる。",
          buildFactLine(row)
        ),
      })),
    };
    rowsMain.forEach((row) => {
      row.fact_line = buildFactLine(row);
    });
    rowsAngles.forEach((row) => {
      row.fact_line = buildFactLine(row);
    });
    rowsExtra.forEach((row) => {
      row.fact_line = buildFactLine(row);
    });

    let bgImages = null;
    let story = null;
    if (useV25 && variant === "mobile") {
      const elementCounts = aiData?.master_chart?.element_balance || element;
      const dateLabel = birthText || "";
      story = buildStoryStub({ rowsMain, rowsExtra, elementCounts, dateLabel });
      const bgDir = path.join(process.cwd(), "tmp", "blueprint_bg", lineUserId);
      await buildBlueprintV25BgImages({
        blueprint: aiData,
        rowsMain,
        rowsExtra,
        elementCounts,
        dateLabel,
        outDir: bgDir,
        inline: false,
      });
      const bgKeys = BG_IMAGE_KEYS;
      const bgBuffers = {};
      bgKeys.forEach((key) => {
        const filePath = path.join(bgDir, `bg_${key}.png`);
        if (fs.existsSync(filePath)) {
          bgBuffers[key] = fs.readFileSync(filePath);
        }
      });
      for (const key of bgKeys) {
        const buf = bgBuffers[key];
        if (buf) await blueprintStorage.saveBgImage(lineUserId, key, buf);
      }
      const signedBg = await blueprintStorage.getBgSignedUrls(lineUserId);
      if (signedBg?.ok && signedBg.urls) bgImages = signedBg.urls;
    }

    const pdfBuffer = await renderPdfBuffer({
      manifest,
      displayName,
      birthText,
      rowsMain,
      rowsAngles,
      rowsExtra,
      summary,
      element,
      modality,
      blueprintText: useV25 ? aiData : null,
      bgImages,
      story,
      bodyTextByKey: mapped?.bodyTextByKey,
      angleTextByKey: mapped?.angleTextByKey,
      chironText: mapped?.chironText,
      lilithText: mapped?.lilithText,
      nodeText: mapped?.nodeText,
      closingText: mapped?.closingText || summary?.closing?.text || "",
    });
    const pdfHash = crypto.createHash("sha256").update(pdfBuffer).digest("hex").slice(0, 12);
    console.log("[blueprint] pdf hash", { hash: pdfHash, bytes: pdfBuffer.length });

    await blueprintStorage.savePdf(lineUserId, pdfBuffer, manifest.variant);

    console.log("[blueprint] generate stored", { file_path: filePath });
    return { ok: true, filePath, skipped: false };
  }

  async function renderPdfFromStoredJson({ lineUserId, variant = "mobile", forceRegen = false } = {}) {
    if (!lineUserId) throw new Error("lineUserId is required");
    if (!bucketName || !bucket || !blueprintStorage) throw new Error("bucket not configured");

    const manifest = getBlueprintLightManifest({ variant });
    const { pdfPath: filePath } = getBlueprintLightPaths(lineUserId, manifest.variant);
    const pdfExistsResult = await blueprintStorage.existsPdf(lineUserId, variant);
    const pdfExists = !!pdfExistsResult?.exists;
    if (pdfExists && !forceRegen) {
      return { ok: true, filePath, skipped: true };
    }

    const jsonExistsResult = await blueprintStorage.existsJson(lineUserId);
    if (!jsonExistsResult?.exists) throw new Error("json_missing");
    const download = await blueprintStorage.downloadJson(lineUserId);
    const aiData = JSON.parse(String(download?.data || ""));

    const lineUser = await getLineUser(lineUserId);
    if (!lineUser) throw new Error("line user not found");
    const appUserId = lineUser.app_user_id || null;
    if (!appUserId) throw new Error("app_user_id missing");

    const natalCache = await natalService.loadNatalFromcache(appUserId);
    if (!natalCache) throw new Error("natal_cache missing");

    const { ok, longitudes } = natalService.extractNatalLongitudes(natalCache);
    if (!ok) throw new Error("natal_cache invalid");

    const {
      rowsMain,
      rowsAngles,
      rowsExtra,
      element,
      modality,
    } = buildBlueprintLightRows({ longitudes, dict });

    const birthText = buildBirthText(natalCache?.birth || {});
    const displayName = await resolveDisplayName({ db, appUserId, lineUser });

    let bgImages = null;
    let story = null;
    const elementCounts = aiData?.master_chart?.element_balance || element;
    const dateLabel = birthText || "";
    story = buildStoryStub({ rowsMain, rowsExtra, elementCounts, dateLabel });
    const bgDir = path.join(process.cwd(), "tmp", "blueprint_bg", lineUserId);
    await buildBlueprintV25BgImages({
      blueprint: aiData,
      rowsMain,
      rowsExtra,
      elementCounts,
      dateLabel,
      outDir: bgDir,
      inline: false,
    });
    const bgKeys = BG_IMAGE_KEYS;
    const bgBuffers = {};
    bgKeys.forEach((key) => {
      const filePath = path.join(bgDir, `bg_${key}.png`);
      if (fs.existsSync(filePath)) {
        bgBuffers[key] = fs.readFileSync(filePath);
      }
    });
    for (const key of bgKeys) {
      const buf = bgBuffers[key];
      if (buf) await blueprintStorage.saveBgImage(lineUserId, key, buf);
    }
    const signedBg = await blueprintStorage.getBgSignedUrls(lineUserId);
    if (signedBg?.ok && signedBg.urls) bgImages = signedBg.urls;

    const pdfBuffer = await renderPdfBuffer({
      manifest,
      displayName,
      birthText,
      rowsMain,
      rowsAngles,
      rowsExtra,
      summary: null,
      element,
      modality,
      blueprintText: aiData,
      bgImages,
      story,
    });

    await blueprintStorage.savePdf(lineUserId, pdfBuffer, manifest.variant);
    return { ok: true, filePath, skipped: false };
  }

  return {
    getOrCreateSignedUrl,
    hasPdf,
    generateAndStore,
    renderPdfFromStoredJson,
  };
}

module.exports = {
  createBlueprintLightService,
  buildBlueprintLightRows,
  buildAiInput,
};
