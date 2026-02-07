"use strict";

const { fmtDeg, planetJa } = require("../render_parts/line_ai_utils");
const { tpKey: defaultTpKey } = require("../render_parts/keys");
const _fmtDeg = fmtDeg;
const _planetJa = planetJa;
/**
 * channels/line_today.js (Unified / deps-safe) — FIXED SSOT
 * - LINE「今日のソラのこえ」(personal優先 / 無ければpublic)
 *
 * ✅ FIX方針
 * - personal は formatPersonalTPLine を最優先（無ければ Block）
 * - public fallback は formatPublicSkyLine を最優先（無ければ Block）
 * - どれも無い場合は buildNoContactLine へフォールバック
 * - fusion は “あれば追記” のみ（本文のフォーマットは壊さない）
 *
 * deps:
 * - tpKey, getSkyLayers
 * - pickCenterPublicContact, pickSecretPublicContact
 * - buildNoContactLine
 * - buildYoinLine
 * - buildNowModernPlanetCounts, buildPersonalTPCounts, buildDistLinesFromcounts
 * - formatPersonalTPLine / formatPersonalTPBlock
 * - formatPublicSkyLine / formatPublicSkyBlock
 * - buildFusionSentence（任意）
 * - publicSignKey（任意 / sky fusion用）
 * - RENDER_COPY
 *
 * NOTE:
 * - format* は (story, item, prefix, deps) で呼ぶ（deps渡し必須）
 */

function clampYoin2(s) {
  const lines = String(s || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const maxLines = 4;
  const out = lines.slice(0, maxLines);

  if (out.length) {
    const lastIdx = out.length - 1;
    if (out[lastIdx].length > 60) {
      const m = out[lastIdx].match(/^(.{1,80}?。)/);
      if (m) out[lastIdx] = m[1];
    }
  }

  return out.filter(Boolean).join("\n");
}


function safeStr(x) {
  return String(x ?? "");
}

function boolishEnv(v) {
  const s = String(v || "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}
const LINE_AI_DEBUG = boolishEnv(process.env.LINE_AI_DEBUG);

function _fmtDegLocal(deg) {
  const n = Number(deg);
  if (!Number.isFinite(n)) return "";
  return `${Math.round(n)}°`;
}

function _extractJsonBlock(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (s.startsWith("{") && s.endsWith("}")) return s;
  const m = s.match(/\{[\s\S]*\}/);
  return m ? m[0] : "";
}

function _safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function _containsBannedTokens(text, banned = []) {
  const s = String(text || "");
  if (!s) return false;
  if (/\d+\s*°/.test(s)) return true;
  if (/orb|オーブ/i.test(s)) return true;
  if (/座/.test(s)) return true;
  for (const t of banned || []) {
    if (!t) continue;
    if (s.includes(t)) return true;
  }
  return false;
}

function _filterBannedPool(list, banned = []) {
  const arr = Array.isArray(list) ? list : [];
  return arr
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .filter((v) => !_containsBannedTokens(v, banned));
}

const LINE_AI_SYSTEM_PROMPT = [
  "あなたは「ソラのこえ。」LINE配信用の生成エンジン。",
  "占いではない。未来断定・助言・指示・結論・吉凶判断は禁止。",
  "主語は「星・配置・接点」。読者を主語にしない。",
  "日本語のみ。英語・ローマ字は禁止。",
  "出力はJSONのみ。本文の装飾や余計な文は書かない。",
  "文体は静かで簡潔。説明しすぎない。観測的に「置く」。",
  "構造語彙（役割/触れ方/質感）を本文に必ず含める。",
  "",
  "【3枠構成（personal）】",
  "- 必ず2枠：🌗内側 / ☀️外側",
  "- レア共鳴がある日のみ✶レア共鳴 を1枠追加（最大1）",
  "- 各枠の構造文は2行まで",
  "",
  "【KeyWordルール（候補出力）】",
  "- keywordsは8〜12語の候補を出す（後処理で5語に絞る）",
  "- 固有名詞（惑星/星座/アスペクト/共鳴/影響/エネルギー/運勢/吉凶/開運/ラッキー等）禁止",
  "- 近い意味の連打は禁止（多様性最優先）",
].join("\n");

const LINE_AI_USER_GUIDE = [
  "以下の入力データを使って、JSONのみを返してください。",
  "候補は入力データにあるもののみを使う（自由解釈しない）。",
  "出力フォーマット（厳守）:",
  "{",
  '  "public": [',
  '    { "s1": "1行目", "s2": "2行目", "keywords": ["候補語..."] },',
  "    ...",
  "  ],",
  '  "personal": {',
  '    "inner": { "s1": "1行目", "s2": "2行目", "keywords": ["候補語..."] },',
  '    "outer": { "s1": "1行目", "s2": "2行目", "keywords": ["候補語..."] },',
  '    "rare": { "s1": "1行目", "s2": "2行目", "keywords": ["候補語..."] }',
  "  },",
  '  "sky_layer": { "line1": "空層1行目", "line2": "空層2行目" },',
  '  "personal_layer": { "line1": "個人空層1行目" }',
  "}",
  "",
  "条件:",
  "- public は top5 と同じ長さ。",
  "- s1/s2は合計2行以内。断定/指示/助言なし。",
  "- 英語は禁止。日本語のみ。",
  "- keywords は8〜12語の候補（多様性）。",
  "- sky_layer は2行。personal_layer は1行。",
  "- rare_candidate_aspects が空の場合、personal.rare は null か省略。",
  "- 候補配列は優先順（orb昇順/癒し優先）で並んでいるため、原則1件目を使う。",
  "- 各itemの structure を必ず参照し、構造語彙を入れる。",
  "- s1/s2は「惑星A/Bの役割」「アスペクトの触れ方」「サイン質感」から最低2要素を含める（汎用語だけで完結しない）。",
  "- structure内の語を優先し、言い換えても意味を外さない。",
  "",
  "personal出力のニュアンス指定:",
  "- inner: 内側で残る/起きやすい構造",
  "- outer: 外に出やすい反応",
  "- rare: レア共鳴（短く）",
].join("\n");

const LINE_AI_SYSTEM_PROMPT_PERSONAL = [
  "あなたは「sora-no-koe / LINE（きょう）本文」を生成する。",
  "目的は占いでも説明でもなく、“状態の短い描写”を置くこと。",
  "読者主語は禁止。断定・助言・結論は禁止。",
  "日本語のみ。英語・ローマ字は禁止。",
  "出力はJSONのみ。余計な文は書かない。",
  "",
  "【BLOG呼吸の定義（LLM向け制約）】",
  "説明しない（因果・解説・まとめ禁止）。",
  "感触を1回だけ置く（手触り/ズレ/気配の“描写”）。",
  "構造語は後置き（名詞で添える。主張しない）。",
  "結論で閉じない（余白で終える）。",
  "語彙は“弱い主語”で置く（誘導・評価・読者主語を避ける）。",
  "比喩を増やさない（象徴/示唆/水脈系は封印）。",
  "",
  "【断片禁止（最重要）】",
  "単語列・名詞列で終えない。必ず“文”として成立させる。",
  "NG例: 「導入、余白。」/「停滞、狭さ。」",
].join("\n");

const LINE_AI_BANNED_TOKENS_PERSONAL = [
  "配置",
  "現れやすい",
  "表に出やすい",
  "影響",
  "によって",
  "角度",
  "アスペクト",
  "として",
  "しやすい",
  "やすい",
  "試行錯誤",
  "独自",
  "更新",
  "全体最適",
  "意味づけ",
  "意味",
  "本質",
  "可能性",
  "状況",
  "余韻",
  "理想",
  "場面",
  "場面で",
  "観測",
  "水脈",
  "太陽","月","水星","金星","火星","木星","土星","天王星","海王星","冥王星",
  "ASC","MC","IC","DSC","アセンダント","ディセンダント","ミディアムコエリ","ノード","キロン","リリス",
  "牡羊座","牡牛座","双子座","蟹座","獅子座","乙女座","天秤座","蠍座","射手座","山羊座","水瓶座","魚座",
  "スクエア","トライン","セクスタイル","セミセクスタイル","セミスクエア","セスキスクエア",
  "オポジション","インコンジャンクト","クインタイル","バイクインタイル","セプタイル","ノヴィル","デシル",
];

const LINE_AI_SYSTEM_PROMPT_LAYER = [
  "あなたは「sora-no-koe / LINE（きょう）空層」を生成する。",
  "目的は占いでも説明でもなく、“状態の短い描写”を1行で置くこと。",
  "読者主語は禁止。断定・助言・結論は禁止。",
  "日本語のみ。英語・ローマ字は禁止。",
  "出力はJSONのみ。余計な文は書かない。",
  "",
  "説明しない（因果・解説・まとめ禁止）。",
  "感触を1回だけ置く（手触り/ズレ/気配）。比喩は増やさない。",
  "結論で閉じない（余白で終える）。",
].join("\n");

const LINE_AI_USER_GUIDE_PERSONAL = [
  "以下の入力データから、本文だけを生成してください。",
  "出力はJSONのみ。フォーマット厳守。",
  "",
  "【出力フォーマット】",
  "{",
  '  "prose": "短い段落"',
  "}",
  "",
  "【本文ルール】",
  "- 必ず2文。合計80〜111字。",
  "- 1段落。改行は入れない。",
  "- 固有名詞禁止（惑星名/星座名/アスペクト名/角度/記号/専門用語）。",
  "- A/B/Aspect の意味を必ず含める（入力の tokens/texture/process/touch/gap/rest を優先）。",
  "- 同じ語を繰り返さない。",
  "- 説明/因果/まとめ/一般論は禁止。",
  "- 「〜だ。」で断定しない（「〜が残る」「〜が濃い」など“置く”語尾に寄せる）。",
  "- 入力の banned に含まれる語は使わない。",
  "- 「角度/配置/アスペクト名/〜しやすい/影響/〜として/〜によって」禁止。",
  "- 断片禁止：単語列/名詞列で終えない（必ず述語のある文にする）。",
  "NG例: 「導入、余白。」/「停滞、狭さ。」",
  "",
  "【入力フォーマット】",
  "{",
  '  "slot": "inner|outer|third",',
  '  "A": { "tokens": ["..."], "texture": ["..."], "process": ["..."] },',
  '  "B": { "tokens": ["..."], "texture": ["..."], "process": ["..."] },',
  '  "aspect": { "tokens": ["..."], "touch": ["..."], "gap": ["..."], "rest": ["..."] },',
  '  "banned": ["..."],',
  '  "seed": "..."',
  "}",
].join("\n");

const LINE_AI_USER_GUIDE_LAYER = [
  "以下の入力データから、空層の1行だけを生成してください。",
  "出力はJSONのみ。フォーマット厳守。",
  "",
  "【出力フォーマット】",
  "{",
  '  "line1": "1行だけ"',
  "}",
  "",
  "【本文ルール】",
  "- 1文のみ。改行は入れない。",
  "- 40〜80文字程度。",
  "- 固有名詞禁止（惑星名/星座名/アスペクト名/角度/記号/専門用語）。",
  "- 同じ語を繰り返さない。",
  "- 説明/因果/まとめ/一般論は禁止。",
  "- 入力の banned に含まれる語は使わない。",
  "- 「〜の中で」「場面で」「生まれる」「助ける」「見せる」などの説明語は禁止。",
  "- 「角度/配置/アスペクト名/〜しやすい/影響/〜として/〜によって」禁止。",
  "",
  "【入力フォーマット】",
  "{",
  '  "element": "火/地/風/水",',
  '  "modality": "活動/不動/柔軟",',
  '  "seed": "..."',
  "}",
].join("\n");

function _dominantKey(counts, order = []) {
  const entries = order.length
    ? order.map((k) => [k, Number(counts?.[k] || 0)])
    : Object.entries(counts || {}).map(([k, v]) => [k, Number(v || 0)]);
  if (!entries.length) return "";
  let bestKey = "";
  let bestVal = -1;
  entries.forEach(([k, v]) => {
    if (v > bestVal) {
      bestVal = v;
      bestKey = k;
    }
  });
  return bestVal > 0 ? bestKey : "";
}

function _elementJa(dict, key) {
  return dict?.ELEMENTS_V1?.elements?.[key]?.label_ja || "";
}

function _modalityJa(dict, key) {
  return dict?.MODALITIES_V1?.modalities?.[key]?.label_ja || "";
}

function _buildLayerHints(counts, dict) {
  const element = counts?.element || {};
  const modality = counts?.modality || {};
  const domElementKey = _dominantKey(element, ["fire", "earth", "air", "water"]);
  const domModalityKey = _dominantKey(modality, ["cardinal", "fixed", "mutable"]);
  return {
    dominant_element: {
      key: domElementKey,
      label_ja: _elementJa(dict, domElementKey),
      count: Number(element?.[domElementKey] || 0),
    },
    dominant_modality: {
      key: domModalityKey,
      label_ja: _modalityJa(dict, domModalityKey),
      count: Number(modality?.[domModalityKey] || 0),
    },
    element_counts: element,
    modality_counts: modality,
  };
}

function _formatDistLines(counts) {
  const e = counts?.element || {};
  const m = counts?.modality || {};
  if (!Object.keys(e).length && !Object.keys(m).length) return [];
  return [
    `【惑星属性】 🔥 火${Number(e.fire || 0)}　🪨 地${Number(e.earth || 0)}　💨 風${Number(e.air || 0)}　💧 水${Number(e.water || 0)}`,
    `【三区分】 🏃 活動${Number(m.cardinal || 0)}　🧱 不動${Number(m.fixed || 0)}　🌿 柔軟${Number(m.mutable || 0)}`,
  ];
}

function _formatStructureLine(s1, s2) {
  const line1 = String(s1 || "").replace(/\s+/g, " ").trim();
  const line2 = String(s2 || "").replace(/\s+/g, " ").trim();
  if (!line1 && !line2) return "";
  if (line1 && line2) return `→ ${line1}\n${line2}`;
  return `→ ${line1 || line2}`;
}

function _formatStructureParagraph(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return `→ ${t}`;
}

function _limitProseSentences(text, maxSent = 2, maxLen = 111) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const parts = s.split(/[。]+/).map((p) => p.trim()).filter(Boolean);
  const picked = parts.slice(0, maxSent).map((p) => `${p}。`);
  let out = picked.join("");
  if (out.length > maxLen) {
    out = out.slice(0, maxLen);
    if (!out.endsWith("。")) out = `${out}。`;
  }
  return out;
}

function _fallbackProseFromTokens(input) {
  if (!input) return "";
  const pool = []
    .concat(input?.A?.tokens || [], input?.A?.texture || [], input?.A?.process || [])
    .concat(input?.B?.tokens || [], input?.B?.texture || [], input?.B?.process || [])
    .concat(input?.aspect?.tokens || [], input?.aspect?.touch || [], input?.aspect?.gap || [], input?.aspect?.rest || []);
  const picks = _pickMany(pool.filter(Boolean), `${input?.seed || "fallback"}|prose`, 4);
  if (!picks.length) return "";
  const s1 = picks.slice(0, 2).filter(Boolean).join("、");
  const s2 = picks.slice(2, 4).filter(Boolean).join("、");
  const text = s2 ? `${s1}。${s2}。` : `${s1}。`;
  return _limitProseSentences(text, 2, 111);
}

function _fallbackPersonalLayerLine(domElement, domModality) {
  const label = [domElement, domModality].filter(Boolean).join("×");
  if (label) return `個人空層は${label}に寄る。`;
  return "個人空層は均衡気味。";
}

function _publicAspectPayload(dict, item) {
  if (!item) return null;
  const info = _aspectInfo(dict, item?.type || item?.aspT || item?.aspect);
  const degree = _fmtDeg(info.deg);
  const aspectText = info.label_ja || String(item?.type || item?.aspT || item?.aspect || "");
  const aspectJaDeg = degree ? `${aspectText} ${degree}` : aspectText;
  const aKey = item?.a;
  const bKey = item?.b;
  const aSignKey = item?.aS || item?.a_sign_key;
  const bSignKey = item?.bS || item?.b_sign_key;
  const roleA = _getRole(dict, aSignKey, aKey);
  const roleB = _getRole(dict, bSignKey, bKey);
  const aMeta = _planetMeta(dict, aKey);
  const bMeta = _planetMeta(dict, bKey);
  const aSignMeta = _signMeta(dict, aSignKey);
  const bSignMeta = _signMeta(dict, bSignKey);
  return {
    a: _planetJa(dict, aKey),
    b: _planetJa(dict, bKey),
    a_sign: _signJa(dict, aSignKey),
    b_sign: _signJa(dict, bSignKey),
    aspect: aspectText,
    degree,
    aspect_ja_deg: aspectJaDeg,
    orb: Number(item?.orb_deg ?? item?.orb ?? 0).toFixed(1),
    axis: roleA && roleB ? `${roleA} × ${roleB}` : "",
    structure: {
      a_role: roleA || aMeta.role,
      b_role: roleB || bMeta.role,
      a_core: aMeta.core,
      b_core: bMeta.core,
      a_texture: aMeta.texture,
      b_texture: bMeta.texture,
      sign_a_texture: aSignMeta.texture,
      sign_b_texture: bSignMeta.texture,
      sign_a_flavor: _signFlavor(dict, aSignKey),
      sign_b_flavor: _signFlavor(dict, bSignKey),
      aspect_core: info.core || "",
      aspect_relation: info.relation || info.clause || "",
      aspect_feel: info.feel || [],
      aspect_adverbs: info.adverbs || [],
    },
  };
}

function _personalAspectPayload(dict, item) {
  if (!item) return null;
  const info = _aspectInfo(dict, item?.aspect || item?.type || item?.aspectType || item?.aspect_label_ja);
  const degree = _fmtDeg(info.deg);
  const aspectText = info.label_ja || String(item?.aspect || item?.type || item?.aspectType || "");
  const aspectJaDeg = degree ? `${aspectText} ${degree}` : aspectText;
  const aKey = item?.natal_body_or_point || item?.natal_body || item?.a;
  const bKey = item?.transit_body || item?.b;
  const aSignKey = item?.natal_sign_key || item?.natal_sign || item?.a_sign_key;
  const bSignKey = item?.transit_sign_key || item?.transit_sign || item?.b_sign_key;
  const aSign =
    item?.natal_sign_ja ||
    item?.natal_sign_label_ja ||
    item?.natal_sign_en ||
    (aSignKey ? _signJa(dict, aSignKey) : "");
  const bSign =
    item?.transit_sign_ja ||
    item?.transit_sign_label_ja ||
    item?.transit_sign_en ||
    (bSignKey ? _signJa(dict, bSignKey) : "");
  const aSignJa = /^[a-z]+$/.test(String(aSign || "")) ? _signJa(dict, aSign) : aSign;
  const bSignJa = /^[a-z]+$/.test(String(bSign || "")) ? _signJa(dict, bSign) : bSign;
  const roleA = _getRole(dict, aSignKey, aKey);
  const roleB = _getRole(dict, bSignKey, bKey);
  const aMeta = _planetMeta(dict, aKey);
  const bMeta = _planetMeta(dict, bKey);
  const aSignMeta = _signMeta(dict, aSignKey);
  const bSignMeta = _signMeta(dict, bSignKey);
  return {
    a: _planetJa(dict, aKey),
    b: _planetJa(dict, bKey),
    a_key: aKey,
    b_key: bKey,
    a_sign_key: aSignKey,
    b_sign_key: bSignKey,
    a_sign: aSignJa || "",
    b_sign: bSignJa || "",
    aspect: aspectText,
    degree,
    aspect_ja_deg: aspectJaDeg,
    orb: Number(item?.orb_deg ?? item?.orb ?? 0).toFixed(1),
    axis: roleA && roleB ? `${roleA} × ${roleB}` : "",
    structure: {
      a_role: roleA || aMeta.role,
      b_role: roleB || bMeta.role,
      a_core: aMeta.core,
      b_core: bMeta.core,
      a_texture: aMeta.texture,
      b_texture: bMeta.texture,
      sign_a_texture: aSignMeta.texture,
      sign_b_texture: bSignMeta.texture,
      sign_a_flavor: _signFlavor(dict, aSignKey),
      sign_b_flavor: _signFlavor(dict, bSignKey),
      aspect_core: info.core || "",
      aspect_relation: info.relation || info.clause || "",
      aspect_feel: info.feel || [],
      aspect_adverbs: info.adverbs || [],
    },
  };
}

function _formatPublicAspectLine(dict, item, prefix = "") {
  const payload = _publicAspectPayload(dict, item);
  if (!payload) return "";
  const head = `${prefix}${payload.a}${payload.a_sign ? `（${payload.a_sign}）` : ""} × ${payload.b}${payload.b_sign ? `（${payload.b_sign}）` : ""}`;
  const aspectText = payload.degree ? `${payload.aspect} ${payload.degree}` : payload.aspect;
  return `${head} ｜${aspectText}（orb ${payload.orb}°）`;
}

function _formatPersonalAspectLine(dict, item, prefix = "") {
  const payload = _personalAspectPayload(dict, item);
  if (!payload) return "";
  return _formatPersonalAspectLineFromPayload(payload, prefix);
}

function _formatPersonalAspectLineFromPayload(payload, prefix = "") {
  if (!payload) return "";
  const aEmoji = _emojiForBodyLocal(payload.a_key || payload.a);
  const bEmoji = _emojiForBodyLocal(payload.b_key || payload.b);
  const head = `${prefix}${aEmoji ? `${aEmoji} ` : ""}${payload.a}${payload.a_sign ? `（${payload.a_sign}）` : ""}×${bEmoji ? `${bEmoji} ` : ""}${payload.b}${payload.b_sign ? `（${payload.b_sign}）` : ""}`;
  const aspectText = payload.degree ? `${payload.aspect} ${payload.degree}` : payload.aspect;
  return `${head}｜${aspectText}（orb ${payload.orb}°）`;
}

function _emojiForBodyLocal(key) {
  const k = String(key || "").toLowerCase();
  const map = {
    sun: "☀️",
    moon: "🌙",
    mercury: "☿️",
    venus: "♀️",
    mars: "♂️",
    jupiter: "♃",
    saturn: "♄",
    uranus: "♅",
    neptune: "♆",
    pluto: "♇",
    chiron: "⚷",
  };
  return map[k] || "";
}

function _splitRoleTokens(text) {
  const raw = String(text || "").replace(/[（）()]/g, "").trim();
  if (!raw) return [];
  let t = raw
    .replace(/[×／/、,]/g, "・")
    .replace(/・+/g, "・");
  t = t.replace(/([一-龥ぁ-んァ-ン])と([一-龥ぁ-んァ-ン])/g, "$1・$2");
  return t
    .split("・")
    .map((s) => String(s || "").trim())
    .filter(Boolean);
}

function _splitRoleTokenParts(token) {
  const t = String(token || "").replace(/\s+/g, "");
  if (!t) return { noun: "", prefix: "" };
  const parts = t.split("の").filter(Boolean);
  if (parts.length >= 2) {
    const noun = parts[parts.length - 1] || "";
    const prefix = parts.slice(0, -1).join("") || "";
    return { noun, prefix };
  }
  return { noun: t, prefix: "" };
}

function _shortenLabelText(text, maxLen = 4) {
  const t = String(text || "").trim();
  if (!t) return "";
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen);
}

function _shortRoleToken(token) {
  let t = String(token || "").trim();
  if (!t) return "";
  t = t.replace(/[（）()]/g, "");
  t = t.replace(/意味づけ|意味付け|意味付/g, "意味");
  t = t.replace(/の/g, "");
  const dropSuffix = [
    "通路",
    "回路",
    "スイッチ",
    "エンジン",
    "水脈",
    "設計",
    "場",
    "場所",
    "条件",
    "基準",
    "方向",
    "意識",
    "感覚",
    "反射",
    "反応",
  ];
  for (const s of dropSuffix) {
    if (t.endsWith(s) && t.length > s.length + 1) {
      t = t.slice(0, -s.length);
      break;
    }
  }
  t = _shortenLabelText(t, 4);
  return t;
}

function _compactRoleLabel(role, core) {
  const src = role || core || "";
  const tokens = _splitRoleTokens(src);
  const altTokens = role ? _splitRoleTokens(core) : [];
  const first = _splitRoleTokenParts(tokens[0] || "");
  const last = _splitRoleTokenParts(tokens.length ? tokens[tokens.length - 1] : "");

  let main = first.noun || first.prefix || (tokens[0] || "");
  let sub = "";

  if (tokens.length > 1) {
    if (first.prefix && last.noun) sub = `${first.prefix}${last.noun}`;
    else if (last.prefix) sub = last.prefix;
    else if (last.noun) sub = last.noun;
  } else if (first.prefix) {
    sub = first.prefix;
  }

  if (!sub && altTokens.length) {
    const alt = _splitRoleTokenParts(altTokens[altTokens.length - 1]);
    sub = alt.prefix || alt.noun || "";
  }

  main = _shortenLabelText(main, 4);
  sub = _shortenLabelText(sub, 4);
  if (sub && sub === main) sub = "";

  return { main, sub };
}

function _roleShortForStructure(role, core) {
  const label = _compactRoleLabel(role, core);
  if (!label.main) return "";
  return label.sub ? `${label.main}（${label.sub}）` : label.main;
}

function _roleLine(dict, aSignKey, aPlanetKey, bSignKey, bPlanetKey) {
  const ra = _getRole(dict, aSignKey, aPlanetKey);
  const rb = _getRole(dict, bSignKey, bPlanetKey);
  const aCore = _planetMeta(dict, aPlanetKey)?.core || "";
  const bCore = _planetMeta(dict, bPlanetKey)?.core || "";
  const aLabel = _compactRoleLabel(ra, aCore);
  const bLabel = _compactRoleLabel(rb, bCore);
  const aText = aLabel.main ? `${aLabel.main}${aLabel.sub ? `（${aLabel.sub}）` : ""}` : "";
  const bText = bLabel.main ? `${bLabel.main}${bLabel.sub ? `（${bLabel.sub}）` : ""}` : "";
  if (!aText && !bText) return "";
  if (aText && bText) return `【${aText} × ${bText}】`;
  return `【${aText || bText}】`;
}

function _roleLinePublic(dict, item) {
  return _roleLine(
    dict,
    item?.aS || item?.a_sign_key,
    item?.a,
    item?.bS || item?.b_sign_key,
    item?.b
  );
}

function _roleLinePersonal(dict, item) {
  return _roleLine(
    dict,
    item?.natal_sign_key || item?.natal_sign || item?.a_sign_key,
    item?.natal_body_or_point || item?.natal_body || item?.a,
    item?.transit_sign_key || item?.transit_sign || item?.b_sign_key,
    item?.transit_body || item?.b
  );
}

function _labelTokenPoolFromAspect(dict, item) {
  const info = _aspectInfo(dict, item?.aspect || item?.type || item?.aspectType || item?.aspect_label_ja);
  const raw = []
    .concat(info.core || [])
    .filter(Boolean);
  return _uniq(
    raw
      .flatMap((v) => _tokenizePhrase(v))
      .map((v) => _labelNounize(_miniNormalize(v)))
      .filter((v) => v && !_isBannedKw(v) && !/座/.test(v))
  );
}

function _labelTokenPoolFromSignFlavor(dict, signKey, planetKey) {
  const { sign, by } = _getSignFlavor(dict, signKey, planetKey);
  const pool = []
    .concat(by?.fusion?.A || [])
    .concat(by?.fusion?.B || [])
    .concat(by?.fusion?.expression || [])
    .filter(Boolean);
  return _uniq(
    pool
      .flatMap((v) => _tokenizePhrase(v))
      .map((v) => _labelNounize(_miniNormalize(v)))
      .filter((v) => v && !_isBannedKw(v) && !/座/.test(v))
  );
}

function _labelNounize(val) {
  let t = _nounizePhrase(val);
  if (!t) return "";
  if (t.includes("の")) t = t.split("の").pop() || t;
  t = t.replace(/・/g, "");
  if (/[がをにはへでと]/.test(t)) return "";
  if (/続|残|出|止|効|立|揺|にじ/.test(t)) return "";
  if (t.length <= 1) return "";
  return t;
}

function _pickLabelToken(pool, seed, fallback = "") {
  const xs = (Array.isArray(pool) ? pool : []).filter(Boolean);
  if (!xs.length) return fallback;
  const picked = _pickMany(xs, seed, 1)[0];
  return picked || fallback;
}

function _buildRoleLabelText(main, sub, extra, seed) {
  const m = _shortenLabelText(main || "", 4);
  const s = _shortenLabelText(sub || "", 4);
  const e = _shortenLabelText(extra || "", 4);
  const patterns = [
    () => (m ? (s ? `${m}（${s}）` : m) : s),
    () => (m ? (e ? `${m}（${e}）` : s ? `${m}（${s}）` : m) : e || s),
    () => (m ? (s && e ? `${m}（${_shortenLabelText(`${s}${e}`, 4)}）` : s ? `${m}（${s}）` : m) : e || s),
  ];
  const idx = hash32(`${seed}|role`) % patterns.length;
  let text = patterns[idx]();
  if (text) {
    text = text.replace(/のの/g, "の").replace(/の$/g, "");
  }
  return text || m || s || e || "";
}

function _roleLinePersonalDynamic(dict, item, seed) {
  const aKey = item?.natal_body_or_point || item?.natal_body || item?.a;
  const bKey = item?.transit_body || item?.b;
  const aSignKey = item?.natal_sign_key || item?.natal_sign || item?.a_sign_key;
  const bSignKey = item?.transit_sign_key || item?.transit_sign || item?.b_sign_key;
  const roleA = _getRole(dict, aSignKey, aKey);
  const roleB = _getRole(dict, bSignKey, bKey);
  const aCore = _planetMeta(dict, aKey)?.core || "";
  const bCore = _planetMeta(dict, bKey)?.core || "";
  const longA = String(roleA || aCore || "").trim();
  const longB = String(roleB || bCore || "").trim();
  if (longA || longB) {
    const shortA = _shortRolePhrase(longA);
    const shortB = _shortRolePhrase(longB);
    if (shortA && shortB) return `【${shortA} × ${shortB}】`;
    return `【${shortA || shortB}】`;
  }
  const aLabel = _compactRoleLabel(roleA, aCore);
  const bLabel = _compactRoleLabel(roleB, bCore);

  const aSignPool = _labelTokenPoolFromSignFlavor(dict, aSignKey, aKey);
  const bSignPool = _labelTokenPoolFromSignFlavor(dict, bSignKey, bKey);

  const aExtraPool = _uniq([...aSignPool]);
  const bExtraPool = _uniq([...bSignPool]);
  const aExtra = _pickLabelToken(aExtraPool, `${seed}|a`, "");
  const bExtra = _pickLabelToken(bExtraPool, `${seed}|b`, "");

  const aText = _buildRoleLabelText(aLabel.main || roleA || "", aLabel.sub || aCore || "", aExtra, `${seed}|a`);
  const bText = _buildRoleLabelText(bLabel.main || roleB || "", bLabel.sub || bCore || "", bExtra, `${seed}|b`);

  if (!aText && !bText) return "";
  if (aText && bText) return `【${aText} × ${bText}】`;
  return `【${aText || bText}】`;
}

function _fallbackDomLabel(story) {
  const raw = story?.public?.element_modality?.label || story?.public?.element_modality || "";
  const parts = String(raw || "").split(/[×x]/).map((s) => s.trim()).filter(Boolean);
  return {
    element: parts[0] || "",
    modality: parts[1] || "",
  };
}

function _fallbackDomFromPublicSky(story, dict) {
  const list = Array.isArray(story?.public?.sky_all)
    ? story.public.sky_all
    : Array.isArray(story?.public?.sky_top)
      ? story.public.sky_top
      : [];
  const counts = { element: {}, modality: {} };
  list.forEach((it) => {
    [it?.aS || it?.a_sign_key, it?.bS || it?.b_sign_key].forEach((key) => {
      const k = _lowerKey(key);
      if (!k) return;
      const s = dict?.SIGNS_V2?.signs?.[k] || dict?.SIGNS_V1?.[k] || null;
      if (!s) return;
      if (s.element) counts.element[s.element] = (counts.element[s.element] || 0) + 1;
      if (s.modality) counts.modality[s.modality] = (counts.modality[s.modality] || 0) + 1;
    });
  });
  const domElementKey = _dominantKey(counts.element, ["fire", "earth", "air", "water"]);
  const domModalityKey = _dominantKey(counts.modality, ["cardinal", "fixed", "mutable"]);
  return {
    element: _elementJa(dict, domElementKey),
    modality: _modalityJa(dict, domModalityKey),
  };
}


function buildLineMainFallback({ dateLabel, parts, distLines, kusouYoin, footerLines, cta }) {
  const lines = [];
  lines.push(`🌌 今日のソラのこえ。｜${dateLabel}`);
  lines.push("");
  lines.push(parts || "");
  if (distLines) {
    lines.push("");
    lines.push(distLines);
  }
  if (kusouYoin) {
    lines.push("");
    lines.push(kusouYoin);
  }
  if (footerLines) {
    lines.push("");
    lines.push(footerLines);
  }
  if (cta) {
    lines.push("");
    lines.push(cta);
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* =========================
 * deps resolver (揺れ吸収)
 * ========================= */
function pickDep(deps, ...paths) {
  for (const p of paths) {
    const seg = p.split(".");
    let cur = deps;
    for (const s of seg) {
      cur = cur?.[s];
      if (!cur) break;
    }
    if (cur) return cur;
  }
  return null;
}

function resolveFormatters(deps) {
  return {
    // personal（TP）
    fmtPersonalTPLine:
      pickDep(deps, "fmt.formatPersonalTPLine") ||
      pickDep(deps, "formatPersonalTPLine") ||
      null,
    fmtPersonalTPBlock:
      pickDep(deps, "fmt.formatPersonalTPBlock") ||
      pickDep(deps, "formatPersonalTPBlock") ||
      null,

    // public（sky）
    fmtPublicSkyLine:
      pickDep(deps, "fmt.formatPublicSkyLine") ||
      pickDep(deps, "formatPublicSkyLine") ||
      null,
    fmtPublicSkyBlock:
      pickDep(deps, "fmt.formatPublicSkyBlock") ||
      pickDep(deps, "formatPublicSkyBlock") ||
      null,
  };
}

/**
 * FNV-1a 32bit hash (stable)
 */
function hash32(input) {
  const s = safeStr(input);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function _pickMany(pool, seed, count = 1) {
  const arr = (Array.isArray(pool) ? pool.filter(Boolean) : []).slice();
  if (!arr.length || count <= 0) return [];
  const out = [];
  for (let i = 0; i < count; i++) {
    if (!arr.length) break;
    const idx = hash32(`${seed}|${i}`) % arr.length;
    out.push(arr.splice(idx, 1)[0]);
  }
  return out;
}

function _lowerKey(x) {
  return safeStr(x).toLowerCase().trim();
}

function _getSignFlavor(dict, signKey, planetKey) {
  const sf = dict?.SIGN_FLAVOR_V1 || dict?.sign_flavor || null;
  const sKey = _lowerKey(signKey);
  const pKey = _lowerKey(planetKey);
  const sign = sf?.signs?.[sKey] || null;
  const by =
    sign?.by_body?.[pKey] ||
    (pKey === "lilith" ? sign?.by_body?.Lilith : null) ||
    (pKey === "chiron" ? sign?.by_body?.Chiron : null) ||
    null;
  return { sf, sign, by };
}

function _getSoarStyle(dict) {
  return dict?.SOAR_STYLE_V1 || require("../../dict/soar_style.v1").SOAR_STYLE_V1;
}

function _pickOne(pool, seed) {
  const arr = Array.isArray(pool) ? pool.filter(Boolean) : [];
  if (!arr.length) return "";
  return _pickMany(arr, `${seed}|one`, 1)[0];
}

function _subjectFromStyle(style, planetKey, seed, avoidTokens = []) {
  const k = _lowerKey(planetKey);
  if (k === "neptune") {
    const pool = ["感覚", "体感", "余韻", "直感", "気配"];
    const filtered = pool.filter((s) => {
      const t = String(s || "");
      return !avoidTokens.some((a) => a && t.includes(a));
    });
    return _pickOne(filtered.length ? filtered : pool, `${seed}|subj|${k}`) || "感覚";
  }
  const pool = style?.personal_subjects?.[k] || style?.planets?.[k]?.subjects || [];
  const filtered = pool.filter((s) => {
    const t = String(s || "");
    return !avoidTokens.some((a) => a && t.includes(a));
  });
  return _pickOne(filtered.length ? filtered : pool, `${seed}|subj|${k}`) || "心";
}

function _avoidTokensFromModifier(modifier) {
  const s = String(modifier || "");
  const tokens = [];
  const roots = [
    ["価値", ["価値観", "価値"]],
    ["基準", ["基準", "起点"]],
    ["安心", ["安心", "安心の置きどころ"]],
    ["印象", ["印象", "第一印象"]],
    ["距離", ["距離感", "距離"]],
    ["反応", ["反応"]],
    ["感覚", ["感覚", "体感"]],
    ["意志", ["意志", "意識"]],
    ["言葉", ["言葉", "伝え方"]],
    ["思考", ["思考", "考え"]],
    ["境界", ["境界", "輪郭"]],
    ["中心", ["中心", "核", "起点"]],
  ];
  roots.forEach(([k, list]) => {
    if (s.includes(k)) list.forEach((t) => tokens.push(t));
  });
  return Array.from(new Set(tokens.filter(Boolean)));
}

function _modeFromStyle(style, planetKey, seed, avoidTokens = []) {
  const k = _lowerKey(planetKey);
  const pool = style?.personal_modes?.[k] || style?.planets?.[k]?.modes || [];
  const filtered = pool.filter((s) => {
    const t = String(s || "");
    return !avoidTokens.some((a) => a && t.includes(a));
  });
  return _pickOne(filtered.length ? filtered : pool, `${seed}|mode|${k}`) || "反応";
}

function _stateFromStyle(style, aspectKey, depth, seed) {
  const key = _normAspectKey(aspectKey);
  const pool =
    style?.state_by_aspect?.[key]?.[depth] ||
    style?.state_by_aspect?.[key]?.light ||
    style?.states?.[depth] ||
    style?.states?.light ||
    [];
  return _pickOne(pool, `${seed}|state|${key}|${depth}`) || "揺れやすい";
}

function _stateFromStyleDistinct(style, aspectKey, depth, seed, avoid = []) {
  const key = _normAspectKey(aspectKey);
  const toneKey = _aspectToneCategory(aspectKey);
  const basePool =
    style?.state_by_aspect?.[key]?.[depth] ||
    style?.state_by_aspect?.[key]?.light ||
    style?.state_by_tone?.[toneKey] ||
    style?.states?.[depth] ||
    style?.states?.light ||
    [];
  const filtered = basePool.filter((s) => {
    const t = String(s || "");
    return !avoid.some((a) => a && t.includes(a));
  });
  let pool = filtered;
  if (!pool.length && avoid.length) {
    const altPool = [
      ...(style?.state_by_tone?.[toneKey] || []),
      ...(style?.states?.[depth] || []),
      ...(style?.states?.light || []),
    ].filter((s) => {
      const t = String(s || "");
      return !avoid.some((a) => a && t.includes(a));
    });
    pool = altPool;
  }
  const pick = _pickOne(pool.length ? pool : basePool, `${seed}|state|${key}|${depth}`) || "揺れやすい";
  return pick;
}

function _stateAvoidFromTension(tensionText) {
  const t = String(tensionText || "");
  const avoid = [];
  if (!t) return avoid;
  ["折り合い", "微調整", "調整", "調整点", "揺れ", "張り", "引っかかり"].forEach((w) => {
    if (t.includes(w)) avoid.push(w);
  });
  return avoid;
}

function _shortStateFromTone(style, aspectKey, seed, avoid = []) {
  const toneKey = _aspectToneCategory(aspectKey);
  const pool = style?.state_short_by_tone?.[toneKey] || [];
  const filtered = pool.filter((s) => {
    const t = String(s || "");
    return !avoid.some((a) => a && t.includes(a));
  });
  return _pickOne(filtered.length ? filtered : pool, `${seed}|short|${toneKey}`) || "";
}

function _dedupeModePrefix(mode, subject) {
  const m = String(mode || "").trim();
  const s = String(subject || "").trim();
  if (!m) return "";
  if (s && (m === s || s.includes(m) || m.includes(s))) return "";
  return `${m}として、`;
}

function _fillDynamicSlots(text, dict, seed, aspectKey) {
  const s = String(text || "");
  if (!s || (!s.includes("{drive}") && !s.includes("{dyn}"))) return s;
  const sf = dict?.SIGN_FLAVOR_V1 || dict?.sign_flavor || null;
  const dynamics = sf?.grammar?.dynamics || {};
  const dynByAspect = sf?.grammar?.dynamics_by_aspect || {};
  const toneKey = _aspectToneCategory(aspectKey);
  const drivePool = dynamics.drive || [];
  const dynPool =
    (Array.isArray(dynByAspect?.[toneKey]) && dynByAspect[toneKey].length)
      ? dynByAspect[toneKey]
      : (dynamics.dyn || []);
  const drive = _pickOne(drivePool, `${seed}|drive|${aspectKey}`) || "";
  const dyn = _pickOne(dynPool, `${seed}|dyn|${aspectKey}`) || "";
  return s.replace(/\{drive\}/g, drive).replace(/\{dyn\}/g, dyn).trim();
}

function _toDotDate(s) {
  return String(s || "").replace(/-/g, ".");
}

function renderSoraUraSilentPersonalLine(story, deps = {}) {
  const { fmt } = deps || {};
  const { formatPersonalTPLine } =
    (fmt && (fmt.formatPersonalTPLine || fmt.formatPersonalTPLine)) || {};

  const dateLabel = _toDotDate(story?.meta?.date_local);
  const list = Array.isArray(story?.personal?.touch_points_all) ? story.personal.touch_points_all : [];

  const filtered = list
    .filter((tp) => {
      const a = String(tp?.natal_body_or_point || "").toLowerCase();
      const b = String(tp?.transit_body || "").toLowerCase();
      return a === "chiron" || b === "chiron" || a === "lilith" || b === "lilith";
    })
    .sort((a, b) => Number(a?.orb_deg ?? 99) - Number(b?.orb_deg ?? 99))
    .slice(0, 5);

  if (!filtered.length) {
    return `🌒 沈黙のほし｜${dateLabel}\n今日は沈黙。`;
  }

  const lines = filtered.map((tp) => {
    const header = typeof formatPersonalTPLine === "function"
      ? formatPersonalTPLine(story, tp, "・", deps)
      : "";
    const flavor = buildFlavorBlockPersonal({ story, item: tp, deps });
    return [header, flavor].filter(Boolean).join("\n");
  }).join("\n\n");

  return [`🌒 沈黙のほし｜${dateLabel}`, lines].join("\n").trim();
}
function _uniq(arr) {
  const seen = new Set();
  const out = [];
  (arr || []).forEach((v) => {
    const s = String(v || "");
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  });
  return out;
}

function _aspectToneCategory(aspectKey) {
  const k = _normAspectKey(aspectKey);
  if (k.includes("quincunx") || k.includes("semi_square") || k.includes("sesqui_square") || k.includes("semi_sextile")) return "adjust";
  if (k.includes("square") || k.includes("opposition")) return "tense";
  if (k.includes("trine") || k.includes("sextile")) return "smooth";
  if (k.includes("conjunction")) return "blend";
  if (k.includes("quintile") || k.includes("biquintile")) return "craft";
  return "adjust";
}

function _aspectKeywordProfile(aspectKey) {
  const k = _normAspectKey(aspectKey);
  if (["square", "opposition"].includes(k)) return { a: 2, b: 3, tone: 2 };
  if (["trine", "sextile"].includes(k)) return { a: 3, b: 2, tone: 1 };
  if (["conjunction"].includes(k)) return { a: 2, b: 2, tone: 2 };
  if (["quintile_72", "biquintile_144"].includes(k)) return { a: 3, b: 1, tone: 2 };
  if (["quincunx_150", "semi_square_45", "sesqui_square_135", "semi_sextile_30"].includes(k)) return { a: 2, b: 2, tone: 2 };
  return { a: 2, b: 2, tone: 1 };
}

function _pickAspectToneWords(dict, aspectKey, seed, count = 1) {
  const sf = dict?.SIGN_FLAVOR_V1 || dict?.sign_flavor || null;
  const pool = sf?.grammar?.aspect_tone?.[_aspectToneCategory(aspectKey)] || [];
  return _pickMany(pool, `${seed}|tone|${aspectKey}`, count);
}

function _signModifierFromStyle(style, signKey, planetKey, seed, dict) {
  const k = _lowerKey(planetKey);
  const template = style?.planets?.[k]?.modifier_template || "に寄りやすい";
  const keywords = style?.signs?.[_lowerKey(signKey)]?.keywords || [];
  const picked = _pickMany(keywords, `${seed}|kw|${k}|${signKey}`, 2);
  const signLabel =
    dict?.SIGNS_V2?.signs?.[_lowerKey(signKey)]?.label_ja ||
    dict?.SIGNS_V1?.signs?.[_lowerKey(signKey)]?.label_ja ||
    signKey;
  const keyPhrase = picked.length ? picked.join("・") : signLabel;
  return template.includes("{sign}")
    ? template.replace("{sign}", keyPhrase)
    : `${keyPhrase}${template}`;
}

function _normalizeKw(word) {
  const w = String(word || "").trim();
  if (!w) return "";
  // 動詞ぽい語尾は名詞化して違和感を減らす
  if (/[くぐすむぶぬるつう]$/.test(w) && !/こと$/.test(w)) return `${w}こと`;
  // 形容詞は名詞化（例: 熱い→熱さ）
  if (w === "いい") return "良さ";
  if (/[い]$/.test(w) && !/さ$/.test(w)) return `${w.slice(0, -1)}さ`;
  return w;
}

function _smoothTension(text) {
  let t = String(text || "");
  if (!t) return t;
  t = t.replace(/への(衝動|迷い|ためらい|反発|引き|勢い|揺らぎ|決めきれなさ)/g, "");
  t = t.replace(/への気持ち/g, "");
  t = t.replace(/の(差|ズレ|間|余白|行き来|境目|切り替わり|揺れ幅|摩擦感|張り|圧|衝突点|引っかかり|尖り|流れ|和らぎ|馴染み|広がり|整い|滑らかさ|重なり|濃度|一体化|混ざり|結合|強調|調整|微差|補正|試行|磨き|工夫|探り|再設計|組み替え)/g, "のあいだ");
  t = t.replace(/と([^。]+)で/g, "のあいだで");
  t = t.replace(/で(詰まり|滞り)/g, "のあいだで$1");
  if (t.includes("や") && !/あいだ/.test(t)) {
    t = t.replace(/(.+?)や(.+?)$/g, "$1と$2のあいだ");
  }
  t = t.replace(/と、/g, "と");
  t = t.replace(/熱いさや/g, "熱さや");
  t = t.replace(/熱いや/g, "熱さや");
  t = t.replace(/熱いさ/g, "熱さ");
  t = t.replace(/熱い/g, "熱さ");
  // 「熱さや張りに揺れやすい」→「熱さと張りのあいだで揺れやすい」
  t = t.replace(/熱さや張りに揺れやすい/g, "熱さと張りのあいだで揺れやすい");
  t = t.replace(/引っかかりで/g, "引っかかりのあいだで");
  t = t.replace(/硬い/g, "硬さ");
  t = t.replace(/鋭い/g, "鋭さ");
  t = t.replace(/重い/g, "重さ");
  t = t.replace(/\s+/g, " ").trim();
  return t.trim();
}

function _fixDupPhrases(s) {
  let t = String(s || "");
  t = t.replace(/調整が微調整が/g, "調整が");
  t = t.replace(/微調整が調整が/g, "微調整が");
  t = t.replace(/折り合いで折り合いが/g, "折り合いが");
  t = t.replace(/が小さな引っかかりが/g, "に小さな引っかかりが");
  t = t.replace(/が調整点が/g, "に調整点が");
  t = t.replace(/印象が印象/g, "印象");
  t = t.replace(/価値観が価値観/g, "価値観");
  t = t.replace(/距離感が距離感/g, "距離感");
  t = t.replace(/反応が反応/g, "反応");
  t = t.replace(/感覚が感覚/g, "感覚");
  t = t.replace(/言葉が言葉/g, "言葉");
  t = t.replace(/揺れが出やすい。?揺れが出やすい。?/g, "揺れが出やすい。");
  return t;
}

function _kwToBetween(kwPhrase) {
  const s = String(kwPhrase || "").trim();
  if (!s) return "";
  const m = s.match(/^(.+?)や(.+)$/);
  if (m) return `${m[1]}と${m[2]}のあいだで`;
  return `${s}に`;
}

function _getRole(dict, signKey, planetKey) {
  const { by } = _getSignFlavor(dict, signKey, planetKey);
  const role = by?.role || by?.core || "";
  if (role) return role;
  const pointKey = _lowerKey(planetKey);
  const point = dict?.POINTS_V1?.points?.[pointKey] || null;
  if (point?.core) return String(point.core).replace(/・/g, "と");
  const p = dict?.PLANETS_V2?.bodies?.[_lowerKey(planetKey)] || null;
  return p?.role || p?.core || "";
}

function _planetJaLocal(dict, planetKey) {
  const k = _lowerKey(planetKey);
  return dict?.PLANETS_V2?.bodies?.[k]?.label_ja || dict?.PLANETS_V1?.[k]?.label_ja || planetKey || "";
}

function _signJa(dict, signKey) {
  const k = _lowerKey(signKey);
  return dict?.SIGNS_V2?.signs?.[k]?.label_ja || dict?.SIGNS_V1?.[k]?.label_ja || signKey || "";
}

function _planetMeta(dict, planetKey) {
  const k = _lowerKey(planetKey);
  const p = dict?.PLANETS_V2?.bodies?.[k] || dict?.PLANETS_V1?.[k] || null;
  const point = dict?.POINTS_V1?.points?.[k] || null;
  return {
    role: p?.role || p?.core || point?.core || "",
    core: p?.core || point?.core || "",
    texture: Array.isArray(p?.texture) ? p.texture.slice(0, 3) : [],
  };
}

function _signMeta(dict, signKey) {
  const k = _lowerKey(signKey);
  const s = dict?.SIGNS_V2?.signs?.[k] || dict?.SIGNS_V1?.[k] || null;
  return {
    label_ja: s?.label_ja || signKey || "",
    texture: Array.isArray(s?.texture) ? s.texture.slice(0, 3) : [],
    keywords: Array.isArray(s?.keywords) ? s.keywords.slice(0, 3) : [],
  };
}

function _signFlavor(dict, signKey) {
  const k = _lowerKey(signKey);
  const flavor = dict?.SIGN_FLAVOR_V1?.signs?.[k]?.flavor || "";
  if (!flavor) return "";
  const first = String(flavor).split("。")[0];
  return String(first || flavor).trim();
}

const _ASPECT_JA_FALLBACK = {
  conjunction: "コンジャンクション",
  sextile: "セクスタイル",
  square: "スクエア",
  trine: "トライン",
  opposition: "オポジション",
  quincunx_150: "インコンジャンクト",
  semi_square_45: "セミスクエア",
  sesqui_square_135: "セスキスクエア",
  semi_sextile_30: "セミセクスタイル",
  quintile_72: "クインタイル",
  biquintile_144: "バイクインタイル",
  septile: "セプタイル",
  novile_40: "ノヴィル",
  binovile_80: "バイノヴィル",
  trinovile_120: "トリノヴィル",
  quadranovile_160: "クアドラノヴィル",
  decile_36: "デシル",
  tridecile_108: "トリデシル",
};

function _aspectMetaFromDict(dict, k) {
  if (!k) return null;
  const v2 = dict?.ASPECTS_V2 || {};
  const v1 = dict?.ASPECTS_V1 || {};
  const pools = [v2.major, v2.deep_space, v2.craft_space, v1.major, v1.deep_space];
  for (const p of pools) {
    if (p && p[k]) return p[k];
  }
  return null;
}

function _aspectInfo(dict, rawType) {
  const k = _normAspectKey(rawType);
  const a = _aspectMetaFromDict(dict, k);
  let deg = Number.isFinite(Number(a?.deg)) ? Number(a.deg) : null;
  if (deg == null) {
    const m = String(k || "").match(/_(\d+)/);
    if (m) deg = Number(m[1]);
  }
  return {
    key: k,
    label_ja: a?.label_ja || _ASPECT_JA_FALLBACK[k] || "",
    deg,
    core: a?.core || "",
    tone: a?.tendency_key || "",
    relation: a?.relation || "",
    clause: a?.clause || "",
    feel: Array.isArray(a?.feel) ? a.feel : [],
    adverbs: Array.isArray(a?.adverbs) ? a.adverbs : [],
    sora: a?.sora || "",
    prose_result: a?.prose_ja?.result || "",
  };
}

function _getFallbackKeywords(dict, signKey, planetKey) {
  const sKey = _lowerKey(signKey);
  const pKey = _lowerKey(planetKey);
  const sign = dict?.SIGNS_V2?.signs?.[sKey] || null;
  const planet = dict?.PLANETS_V2?.bodies?.[pKey] || null;
  const pool = [
    ...(Array.isArray(planet?.action_noun_ja) ? planet.action_noun_ja : []),
    ...(Array.isArray(sign?.texture) ? sign.texture : []),
    ...(Array.isArray(sign?.keywords) ? sign.keywords : []),
  ].filter(Boolean);
  return pool;
}

function _dedupeRelation(relation, dynamics) {
  if (!relation || !dynamics) return relation || "";
  const roots = ["噛み合", "重な", "交差", "摩擦", "循環", "映し", "向かい", "鏡"];
  for (const r of roots) {
    if (relation.includes(r) && dynamics.includes(r)) return "";
  }
  return relation;
}

function _cleanClause(s) {
  return safeStr(s)
    .replace(/^[、\s]+/g, "")
    .replace(/^が\s*/g, "")
    .replace(/[、\s]+$/g, "")
    .replace(/。+$/g, "")
    .trim();
}

function _subjectify(core) {
  const c = _cleanClause(core);
  if (!c) return "";
  return c;
}

function _normAspectKey(raw) {
  const x = String(raw || "").toLowerCase().trim();
  if (!x) return "";
  const numStr = x.replace(/[^\d.]/g, "");
  if (numStr && /^\d+(\.\d+)?$/.test(numStr)) {
    const deg = Math.round(Number(numStr));
    const mapDeg = {
      0: "conjunction",
      30: "semi_sextile_30",
      36: "decile_36",
      40: "novile_40",
      45: "semi_square_45",
      60: "sextile",
      72: "quintile_72",
      80: "binovile_80",
      90: "square",
      108: "tridecile_108",
      120: "trine",
      135: "sesqui_square_135",
      144: "biquintile_144",
      150: "quincunx_150",
      160: "quadranovile_160",
      180: "opposition",
    };
    if (mapDeg[deg]) return mapDeg[deg];
  }
  if (x.startsWith("opposition")) return "opposition";
  if (x.startsWith("square")) return "square";
  if (x.startsWith("trine")) return "trine";
  if (x.startsWith("sextile")) return "sextile";
  if (x.startsWith("conjunction")) return "conjunction";
  if (x.startsWith("quincunx")) return "quincunx_150";
  if (x.startsWith("inconjunct")) return "quincunx_150";
  if (x.startsWith("quintile")) return "quintile_72";
  if (x.startsWith("biquintile")) return "biquintile_144";
  if (x.startsWith("semi_square")) return "semi_square_45";
  if (x.startsWith("semisquare")) return "semi_square_45";
  if (x.startsWith("sesqui_square")) return "sesqui_square_135";
  if (x.startsWith("sesquisquare")) return "sesqui_square_135";
  if (x.startsWith("semi_sextile")) return "semi_sextile_30";
  if (x.startsWith("semisextile")) return "semi_sextile_30";
  if (x.includes("スクエア")) return "square";
  if (x.includes("オポジション")) return "opposition";
  if (x.includes("トライン")) return "trine";
  if (x.includes("セクスタイル")) return "sextile";
  if (x.includes("コンジャンクション")) return "conjunction";
  if (x.includes("インコンジャンクト")) return "quincunx_150";
  if (x.includes("クインタイル")) return "quintile_72";
  if (x.includes("バイクインタイル")) return "biquintile_144";
  if (x.includes("セスキスクエア")) return "sesqui_square_135";
  if (x.includes("セミスクエア")) return "semi_square_45";
  if (x.includes("セミセクスタイル")) return "semi_sextile_30";
  if (x.includes("ノヴィル")) return "novile_40";
  if (x.includes("バイノヴィル")) return "binovile_80";
  if (x.includes("クアドラノヴィル")) return "quadranovile_160";
  if (x.includes("デシル")) return "decile_36";
  if (x.includes("トリデシル")) return "tridecile_108";
  const map = {
    "スクエア": "square",
    "オポジション": "opposition",
    "トライン": "trine",
    "セクスタイル": "sextile",
    "コンジャンクション": "conjunction",
    "インコンジャンクト": "quincunx_150",
    "クインタイル": "quintile_72",
    "バイクインタイル": "biquintile_144",
    "セミスクエア": "semi_square_45",
    "セスキスクエア": "sesqui_square_135",
    "セミセクスタイル": "semi_sextile_30",
    "ノヴィル": "novile_40",
    "バイノヴィル": "binovile_80",
    "クアドラノヴィル": "quadranovile_160",
    "デシル": "decile_36",
    "トリデシル": "tridecile_108",
    semisquare: "semi_square_45",
    semi_square: "semi_square_45",
    sesquisquare: "sesqui_square_135",
    sesqui_square: "sesqui_square_135",
    semisextile: "semi_sextile_30",
    semi_sextile: "semi_sextile_30",
    quincunx: "quincunx_150",
    inconjunct: "quincunx_150",
    quintile: "quintile_72",
    biquintile: "biquintile_144",
    novile: "novile_40",
    binovile: "binovile_80",
    quadranovile: "quadranovile_160",
    decile: "decile_36",
    tridecile: "tridecile_108",
  };
  return map[x] || x;
}

function _pickOne(pool, seed) {
  const arr = Array.isArray(pool) ? pool.filter(Boolean) : [];
  if (!arr.length) return "";
  return _pickMany(arr, `${seed}|one`, 1)[0];
}

function _subjectNoun(dict, planetKey, seed) {
  const k = _lowerKey(planetKey);
  const pool = SUBJECT_NOUNS[k] || [];
  if (pool.length) return _pickMany(pool, `${seed}|subj|${k}`, 1)[0];
  const p = dict?.PLANETS_V2?.bodies?.[k] || null;
  return p?.role || p?.core || "意志";
}

function _signModifier(dict, signKey, planetKey, seed) {
  const k = _lowerKey(planetKey);
  const template = SIGN_MOD_TEMPLATES[k] || "に寄りやすい";
  const { sign } = _getSignFlavor(dict, signKey, planetKey);
  const kw =
    (Array.isArray(sign?.base?.keywords) ? sign.base.keywords : null) ||
    (Array.isArray(sign?.keywords) ? sign.keywords : null) ||
    [];
  const picked = _pickMany(kw, `${seed}|kw|${k}|${signKey}`, 2);
  const signLabel =
    sign?.label_ja ||
    dict?.SIGNS_V2?.signs?.[_lowerKey(signKey)]?.label_ja ||
    signKey;
  const keyPhrase = picked.length ? picked.join("・") : (sign?.base?.short || sign?.base?.flavor || signLabel);
  return `${keyPhrase}${template}`;
}

function _ensureGa(clause) {
  const s = String(clause || "").trim();
  if (!s) return s;
  if (/(やすい|にくい)$/.test(s)) return s;
  if (/が/.test(s)) return s;
  if (/(し、|し\s|し$)/.test(s)) return s;
  if (/(起き|出|残|現れ|生まれ|強調|熟成|整い|広がり|伸び|浮かび)/.test(s)) {
    return s.replace(/^([^\s、]+)(\s*)/, "$1が$2");
  }
  return s;
}

function _simplifyDynamics(s) {
  let t = String(s || "");
  t = t.replace(/噛み合いにくさが調整として出やすい/g, "調整として出やすい");
  t = t.replace(/噛み合いにくさが出やすい/g, "噛み合いにくい");
  t = t.replace(/噛み合いにくさ/g, "噛み合いにくい");
  t = t.replace(/重なって強調されやすい/g, "強調されやすい");
  t = t.replace(/反復で熟成し、整い続けやすい/g, "整いやすい");
  t = t.replace(/整い続けやすい/g, "整いやすい");
  t = t.replace(/やすいが/g, "やすい");
  t = t.replace(/が$/g, "");
  return t;
}

function _fixDoubleGa(s) {
  const t = String(s || "");
  return t.replace(/が、([^。]*?)が/g, "は、$1が");
}
function normalizePersonalForFlavor(item = {}) {
  const pick = (...xs) => xs.find((v) => v !== undefined && v !== null && String(v).trim() !== "") || "";
  const a = pick(item.transit_body_or_point, item.transit_body, item.a, item.aPlanetKey);
  const b = pick(item.natal_body_or_point, item.natal_body, item.b, item.bPlanetKey);
  const aSign = pick(item.transit_sign_key, item.a_sign_key, item.aSignKey, item.a_sign);
  const bSign = pick(item.natal_sign_key, item.b_sign_key, item.bSignKey, item.b_sign);

  const aspectLabelJa = pick(item.aspect?.label_ja, item.aspect_label_ja, item.aspectLabelJa, item.aspect?.ja);
  const aspectType = pick(item.aspect?.type, item.type, item.aspectType, item.aspect_key);
  const aspectAngle = pick(item.aspect?.deg, item.aspect?.angle, item.aspect_deg, item.aspectDegree);

  return {
    a: safeStr(a).toLowerCase(),
    b: safeStr(b).toLowerCase(),
    a_sign_key: safeStr(aSign).toLowerCase(),
    b_sign_key: safeStr(bSign).toLowerCase(),
    aspectLabelJa: safeStr(aspectLabelJa),
    aspectType: safeStr(aspectType),
    aspectAngle: safeStr(aspectAngle),
  };
}

function buildFlavorBlockPersonal({ story, item, deps }) {
  const dict = deps?.dict || require("../../dict");
  const blend = require("../../dict/blend.v2");
  const n = normalizePersonalForFlavor(item);

  const { by } = _getSignFlavor(dict, n.b_sign_key, n.b);
  const roleA = _getRole(dict, n.a_sign_key, n.a);
  const roleB = _getRole(dict, n.b_sign_key, n.b);
  const role = roleA && roleB ? `${roleA} × ${roleB}` : (roleA || roleB || "");
  const core = by?.core || "";

  const seed = `${story?.meta?.date_local || ""}|${n.b}|${n.b_sign_key}|${n.aspectType || n.aspectLabelJa}`;
  const keywordsA = by?.fusion?.A || [];
  const keywordsB = by?.fusion?.B || [];
  const aspectKey = _normAspectKey(n.aspectType || n.aspectLabelJa || n.aspectAngle);
  const profile = _aspectKeywordProfile(aspectKey);

  let A = _pickMany(keywordsA, `${seed}|A`, profile.a);
  let B = _pickMany(keywordsB, `${seed}|B`, profile.b);
  const fb = _getFallbackKeywords(dict, n.b_sign_key, n.b);
  if (!A.length && !B.length) {
    A = _pickMany(fb, `${seed}|FB`, 5);
    B = [];
  } else if (!A.length) {
    A = _pickMany(keywordsB, `${seed}|AB`, profile.a);
    B = _pickMany(keywordsB, `${seed}|AB2`, profile.b);
  } else if (!B.length) {
    B = _pickMany(keywordsA, `${seed}|BA`, Math.max(1, profile.b));
  }

  const relationRaw = blend.resolveAspectRelationJa(dict, n.aspectLabelJa, `${seed}|rel`, n.aspectType) || "";
  const dynamicsRaw = blend.resolveAspectDynamicsJa(dict, n.aspectType || n.aspectLabelJa) || "触れやすい";
  const relation = _dedupeRelation(relationRaw, dynamicsRaw);
  const dyn = _cleanClause(dynamicsRaw);
  const rel = _cleanClause(relation);
  const clause = _ensureGa(_simplifyDynamics(dyn || rel || "触れやすい"));

  // personal template v1 (from SOAR_STYLE_V1)
  const style = _getSoarStyle(dict);
  const depth = "light";

  const state1 = _stateFromStyleDistinct(style, aspectKey, depth, `${seed}|state1`, []);

  const modifier = _signModifierFromStyle(style, n.b_sign_key, n.b, seed, dict);
  const avoid = _avoidTokensFromModifier(modifier);
  const subject = _subjectFromStyle(style, n.b, seed, avoid);
  const modeAvoid = Array.from(new Set([subject, ...avoid].filter(Boolean)));
  const mode = _modeFromStyle(style, n.b, seed, modeAvoid);

  const tensionRaw = by?.tension || "";
  const tensionFilled = _fillDynamicSlots(tensionRaw, dict, seed, aspectKey);
  const avoidState = _stateAvoidFromTension(tensionFilled);
  const state2 = _stateFromStyleDistinct(style, aspectKey, depth, `${seed}|state2`, [state1, ...avoidState]) || state1;

  const avoidKw = Array.from(
    new Set([subject, mode, ...avoid].filter(Boolean))
  );
  const tone = _pickAspectToneWords(dict, aspectKey, seed, profile.tone);
  const rawKw = [...tone, ...A, ...B, ...fb].filter(Boolean).filter((k) => {
    const t = String(k || "");
    return !avoidKw.some((a) => a && t.includes(a));
  });
  const kwBase = _uniq(rawKw.length ? rawKw : [...tone, ...A, ...B]);
  const keywordAll = kwBase.length > 5 ? _pickMany(kwBase, `${seed}|KW`, 5) : kwBase;
  const kw1 = _normalizeKw(keywordAll[0] || "");
  const kw2 = _normalizeKw(keywordAll[1] || "");
  const kwPhrase = [kw1, kw2].filter(Boolean).join("や");

  const s1 = _fixDoubleGa(`${modifier}${subject}が、${state1}。`);
  const modePrefix = _dedupeModePrefix(mode, subject);
  const s2 = _fixDoubleGa(
    tensionFilled
      ? `${modePrefix}${_smoothTension(tensionFilled)}で${state2}。`
      : kwPhrase
        ? `${modePrefix}${_kwToBetween(kwPhrase)}${state2}。`
        : `${modePrefix}${state2}。`
  );

  const s2Fixed = _fixDupPhrases(s2);
  const shortState = _shortStateFromTone(style, aspectKey, seed, [state1, state2, ...avoidState]) || state2;
  const s2Short = _fixDoubleGa(`${modePrefix}${shortState}。`);
  const useShort = s2Fixed.length > 44 || /微調整が微調整|調整が微調整|折り合いで折り合い|小さな引っかかりが出やすい|調整点が浮かびやすい/.test(s2Fixed);
  const s2Final = useShort ? s2Short : s2Fixed;

  const keywordLine = keywordAll.length ? `KeyWord\n${keywordAll.join(" / ")}` : "";

  const lines = [];
  if (role) lines.push(`【${role}】`);
  if (s1) lines.push(`→ ${s1}`);
  if (s2Final) lines.push(`→ ${s2Final}`);
  if (keywordLine) lines.push(keywordLine);

  return lines.length ? lines.join("\n") : "";
}

function buildFlavorBlockSky({ story, item, deps }) {
  const dict = deps?.dict || require("../../dict");
  const blend = require("../../dict/blend.v2");
  const a = safeStr(item?.a || item?.aPlanetKey || "").toLowerCase();
  const aSign = safeStr(item?.a_sign_key || item?.aSignKey || "").toLowerCase();
  const aspectLabelJa = safeStr(item?.aspect?.label_ja || item?.aspect_label_ja || "");
  const aspectType = safeStr(item?.type || item?.aspectType || "");

  const { by } = _getSignFlavor(dict, aSign, a);
  const roleA = _getRole(dict, aSign, a);
  const roleB = _getRole(dict, item?.b_sign_key || item?.bSignKey || "", item?.b || item?.bPlanetKey || "");
  const role = roleA && roleB ? `${roleA} × ${roleB}` : (roleA || roleB || "");
  const core = by?.core || "";

  const seed = `${story?.meta?.date_local || ""}|${a}|${aSign}|${aspectType || aspectLabelJa}`;
  const keywordsA = by?.fusion?.A || [];
  const keywordsB = by?.fusion?.B || [];
  const aspectKey = _normAspectKey(aspectType || aspectLabelJa);
  const profile = _aspectKeywordProfile(aspectKey);

  let A = _pickMany(keywordsA, `${seed}|A`, profile.a);
  let B = _pickMany(keywordsB, `${seed}|B`, profile.b);
  const fb = _getFallbackKeywords(dict, aSign, a);
  if (!A.length && !B.length) {
    A = _pickMany(fb, `${seed}|FB`, 5);
    B = [];
  } else if (!A.length) {
    A = _pickMany(keywordsB, `${seed}|AB`, profile.a);
    B = _pickMany(keywordsB, `${seed}|AB2`, profile.b);
  } else if (!B.length) {
    B = _pickMany(keywordsA, `${seed}|BA`, Math.max(1, profile.b));
  }

  const relationRaw = blend.resolveAspectRelationJa(dict, aspectLabelJa, `${seed}|rel`, aspectType) || "";
  const dynamicsRaw = blend.resolveAspectDynamicsJa(dict, aspectType || aspectLabelJa) || "触れやすい";
  const relation = _dedupeRelation(relationRaw, dynamicsRaw);
  const dyn = _cleanClause(dynamicsRaw);
  const rel = _cleanClause(relation);
  const clause = _ensureGa(_simplifyDynamics(dyn || rel || "触れやすい"));

  const subject = _subjectNoun(dict, a, seed);
  const modifier = _signModifier(dict, aSign, a, seed);
  const s1 = `${modifier}${subject}が、${clause}。`;

  const tone = _pickAspectToneWords(dict, aspectKey, seed, profile.tone);
  const kwBase = _uniq([...A, ...B, ...tone, ...fb].filter(Boolean));
  const keywordAll = kwBase.length > 5 ? _pickMany(kwBase, `${seed}|KW`, 5) : kwBase;
  const keywordLine = keywordAll.length ? `KeyWord\n${keywordAll.join(" / ")}` : "";

  const lines = [];
  if (role) lines.push(`【${role}】`);
  if (s1) lines.push(`→ ${s1}`);
  if (keywordLine) lines.push(keywordLine);

  return lines.length ? lines.join("\n") : "";
}

/* =========================
 * fusion wrapper（既存フォーマット + fusion 1文を付ける）
 * ========================= */
function formatWithFusion({
  story,
  item,
  prefix,
  deps,
  baseFormatter,
  fusionTemplate = "aline",
  fusionMode = "personal", // "personal" | "sky"
} = {}) {
  const line = typeof baseFormatter === "function" ? baseFormatter(story, item, prefix, deps) : "";
  if (!String(line || "").trim()) return "";

  const buildFusionSentence = deps?.buildFusionSentence;
  if (typeof buildFusionSentence !== "function") return line;

  // ✅ normalized を必ず作る（personal / public 両対応）
  let normalized = item;

  if (fusionMode === "sky") {
    const publicSignKey = deps?.publicSignKey;
    const aSign = typeof publicSignKey === "function" ? publicSignKey(story, item?.a) : "";
    const bSign = typeof publicSignKey === "function" ? publicSignKey(story, item?.b) : "";

    normalized = {
      kind: "sky",
      a: item?.a,
      b: item?.b,
      type: item?.type,
      orb_deg: Number.isFinite(Number(item?.orb_deg)) ? Number(item.orb_deg) : null,
      a_sign_key: aSign,
      b_sign_key: bSign,
      _raw: item,
    };
  }

  let fusion = "";
  try {
    fusion = String(
      buildFusionSentence(normalized, {
        template: fusionTemplate,
        mode: fusionMode,
        style: "sentence",
      }) || ""
    ).trim();
  } catch (_) {
    fusion = "";
  }

  if (!fusion) return line;
  if (String(line).includes(fusion)) return line;

  return `${line}\n${fusion}`.trim();
}

function formatWithFlavor({
  story,
  item,
  prefix,
  deps,
  baseFormatter,
  flavorMode = "personal",
} = {}) {
  const line = typeof baseFormatter === "function" ? baseFormatter(story, item, prefix, deps) : "";
  if (!String(line || "").trim()) return "";

  const flavor =
    flavorMode === "sky"
      ? buildFlavorBlockSky({ story, item, deps })
      : buildFlavorBlockPersonal({ story, item, deps });

  if (flavor && String(flavor).trim()) return `${line}\n${flavor}`.trim();

  // fallback to old fusion sentence if flavor not built
  return formatWithFusion({
    story,
    item,
    prefix,
    deps,
    baseFormatter,
    fusionTemplate: flavorMode === "sky" ? "sky_aline" : "aline",
    fusionMode: flavorMode,
  });
}

/* =========================
 * AI render (LINE)
 * ========================= */
// --- personal selection constants (keep for structure)
const INNER_BODIES = ["moon", "ic", "neptune", "saturn", "pluto", "lilith", "chiron"];
const OUTER_BODIES = ["sun", "asc", "mc", "mars", "uranus", "jupiter", "mercury", "venus"];
const FLOW_BODIES = ["venus", "jupiter", "moon", "neptune"];
const FLOW_ASPECTS = ["trine", "sextile", "semi_sextile_30", "quintile_72", "biquintile_144"];
const HARD_ASPECTS = ["square", "opposition", "quincunx_150", "semi_square_45", "sesqui_square_135"];
const RARE_ASPECTS = [
  "quintile_72",
  "biquintile_144",
  "septile",
  "biseptile",
  "triseptile",
  "novile_family",
  "novile_40",
  "novile",
  "binovile_80",
  "binovile",
  "trinovile_120",
  "trinovile",
  "quadranovile_160",
  "quadranovile",
  "decile_family",
  "decile_36",
  "decile",
  "decile_108",
  "tridecile_108",
  "tridecile",
];
const RARE_ASPECT_RE = /(novile|binovile|trinovile|quadranovile|decile|tridecile)/;

const HEAL_ASPECT_PRIORITY = ["trine", "sextile", "semi_sextile_30", "biquintile_144"];
const HEAL_BODIES = new Set(["moon", "venus", "jupiter"]);

function _tpBodies(item) {
  const a = _lowerKey(item?.natal_body_or_point || item?.natal_body || item?.a);
  const b = _lowerKey(item?.transit_body || item?.b);
  return [a, b].filter(Boolean);
}

function _tpBodyMatch(item, keys) {
  const [a, b] = _tpBodies(item);
  return keys.includes(a) || keys.includes(b);
}

function _aspectKey(item) {
  return _normAspectKey(item?.type || item?.asp || item?.aspT || item?.aspect || "");
}

function _orb(item) {
  const v = Number(item?.orb_deg);
  return Number.isFinite(v) ? v : 999;
}

function _moonElementKey(story, dict) {
  const raw =
    story?.public?.moon_sign ||
    story?.public?.moon?.sign_key ||
    story?.public?.moon?.signKey ||
    story?.public?.moon_sign_key ||
    "";
  const key = _lowerKey(raw);
  return (
    dict?.SIGNS_V2?.signs?.[key]?.element ||
    dict?.SIGNS_V1?.signs?.[key]?.element ||
    ""
  );
}

function _healingPriority(aspectKey) {
  const idx = HEAL_ASPECT_PRIORITY.indexOf(aspectKey);
  return idx === -1 ? 99 : idx;
}

function _healingBodyCount(item) {
  const bodies = _tpBodies(item);
  return bodies.reduce((acc, b) => acc + (HEAL_BODIES.has(b) ? 1 : 0), 0);
}

function _pickHealingCandidates(list) {
  return (Array.isArray(list) ? list : [])
    .filter((i) => _healingPriority(_aspectKey(i)) < 99)
    .sort((a, b) => {
      const pa = _healingPriority(_aspectKey(a));
      const pb = _healingPriority(_aspectKey(b));
      if (pa !== pb) return pa - pb;
      const ha = _healingBodyCount(a);
      const hb = _healingBodyCount(b);
      if (ha !== hb) return hb - ha;
      return _orb(a) - _orb(b);
    });
}

function _uniqueByTpKey(list, tpKeyFn) {
  const out = [];
  const seen = new Set();
  for (const item of list) {
    if (!item) continue;
    const k = tpKeyFn(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function _isFlowCandidate(item) {
  const k = _aspectKey(item);
  return FLOW_ASPECTS.includes(k);
}

function _pickPersonalBlocks(layers, tpKeyFn, story, dict, fallbackPool = []) {
  const layerItems = [
    ...(Array.isArray(layers?.theme) ? layers.theme : []),
    ...(Array.isArray(layers?.touch) ? layers.touch : []),
    ...(Array.isArray(layers?.hidden) ? layers.hidden : []),
  ];
  const basePool = layerItems.length ? layerItems : (Array.isArray(fallbackPool) ? fallbackPool : []);
  const src = _uniqueByTpKey(basePool, tpKeyFn);

  const byOrb = (a, b) => _orb(a) - _orb(b);
  const sortedAll = src.slice().sort(byOrb);

  const moonElement = _moonElementKey(story, dict);
  const moonIsYin = moonElement === "earth" || moonElement === "water";
  const innerBodies = moonIsYin ? ["moon", ...INNER_BODIES] : ["asc", ...INNER_BODIES];
  const outerBodies = moonIsYin ? ["asc", "mc", ...OUTER_BODIES] : ["moon", "mc", ...OUTER_BODIES];

  const innerCandidates = src.filter((i) => _tpBodyMatch(i, innerBodies)).sort(byOrb);
  const outerCandidates = src.filter((i) => _tpBodyMatch(i, outerBodies)).sort(byOrb);

  const inner = innerCandidates[0] || sortedAll[0] || null;
  const used = new Set(inner ? [tpKeyFn(inner)] : []);
  const outer =
    outerCandidates.find((i) => !used.has(tpKeyFn(i))) ||
    sortedAll.find((i) => !used.has(tpKeyFn(i))) ||
    inner ||
    null;
  if (outer) used.add(tpKeyFn(outer));

  const remaining = src.filter((i) => !used.has(tpKeyFn(i)));
  const rareCandidates = remaining
    .filter((i) => {
      const k = _aspectKey(i);
      return RARE_ASPECTS.includes(k) || RARE_ASPECT_RE.test(k);
    })
    .sort(byOrb);
  const rare = rareCandidates[0] || null;
  if (rare) rare._is_rare = true;

  let flowCandidates = [];
  let flow = null;
  if (!rare) {
    flowCandidates = remaining
      .filter((i) => _isFlowCandidate(i))
      .sort(byOrb);
    const softFallback = remaining
      .filter((i) => !HARD_ASPECTS.includes(_aspectKey(i)))
      .sort(byOrb);
    flow =
      flowCandidates[0] ||
      softFallback[0] ||
      remaining[0] ||
      sortedAll.find((i) => !used.has(tpKeyFn(i))) ||
      outer ||
      inner ||
      null;
  }

  return {
    inner,
    outer,
    flow,
    rare,
    innerCandidates,
    outerCandidates,
    flowCandidates,
    rareCandidates,
    mode: moonIsYin ? "moon" : "asc",
  };
}

function _aiKeywordList(arr, fallback = []) {
  const xs = Array.isArray(arr) ? arr.map((s) => String(s || "").trim()).filter(Boolean) : [];
  const fb = Array.isArray(fallback) ? fallback.map((s) => String(s || "").trim()).filter(Boolean) : [];
  const merged = _uniq([...xs, ...fb]);
  return merged.slice(0, 5);
}

function _normalizeKwToken(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

const _KW_GROUP_RULES = [
  { key: "adjust", re: /(調整|補正|修正|是正|整合|調律|整え|整う|整える|微調整|補う)/ },
  { key: "boundary", re: /(境界|境目|境|輪郭|区切り|端|縁)/ },
  { key: "distance", re: /(距離|間合|間|隔たり|離れ)/ },
  { key: "space", re: /(余白|空間|空気|隙間|隙)/ },
  { key: "temperature", re: /(温度|温か|暖|冷|冷え|熱)/ },
  { key: "speed", re: /(速度|速さ|スピード|テンポ|リズム|加速|減速)/ },
  { key: "density", re: /(密度|濃度|濃淡|厚み|重さ|軽さ)/ },
  { key: "flow", re: /(流れ|循環|巡り|滞り|移ろい|動き)/ },
  { key: "texture", re: /(手触り|触感|感触|質感|摩擦)/ },
  { key: "layer", re: /(層|重なり|重ね|奥行)/ },
  { key: "balance", re: /(配分|配合|配慮|均衡|バランス|割り振り|置き方)/ },
  { key: "stability", re: /(保ち|維持|持続|継続|安定|定着)/ },
  { key: "tension", re: /(緊張|張り|引っかかり)/ },
  { key: "fluctuation", re: /(揺れ|ゆらぎ|揺らぎ|震え|滲み|にじみ)/ },
  { key: "direction", re: /(指向|向き|方向|焦点)/ },
  { key: "language", re: /(言葉|語|発話|対話|会話|表現)/ },
  { key: "body", re: /(身体|からだ|体感|感覚)/ },
  { key: "update", re: /(更新|刷新|切替|切り替え|置き換え|再構成)/ },
];

function _kwGroup(s) {
  const t = String(s || "");
  if (!t) return "";
  const flat = _normalizeKwToken(t);
  for (const rule of _KW_GROUP_RULES) {
    if (rule.re.test(t) || (flat && rule.re.test(flat))) return rule.key;
  }
  return "";
}

const _KW_BANNED = new Set(
  [
    "太陽","月","水星","金星","火星","木星","土星","天王星","海王星","冥王星",
    "sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto",
    "サン","ムーン","マーキュリー","ヴィーナス","ビーナス","マーズ","ジュピター","サターン","ウラヌス","ネプチューン","プルート","プルト",
    "ASC","MC","IC","DSC","キロン","リリス","ノード","アセンダント","ディセンダント","ミディアムコエリ",
    "aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces",
    "牡羊座","牡牛座","双子座","蟹座","獅子座","乙女座","天秤座","蠍座","射手座","山羊座","水瓶座","魚座",
    "コンジャンクション","セミセクスタイル","セミスクエア","セクスタイル",
    "スクエア","トライン","インコンジャンクト","クインカンクス","オポジション",
    "セスキスクエア","クインタイル","バイクインタイル","セプタイル","ノヴィル","デシル",
    "conjunction","semi_sextile","semi_square","sextile","square","trine","quincunx","opposition","sesqui_square","quintile","biquintile","septile","novile","decile",
    "共鳴","共鳴的","影響","影響的","エネルギー","エネルギー的","運勢","運気","運","吉","凶","開運",
    "ラッキー","アンラッキー","ハッピー","幸運","不運","占い","占星術","運命","導き","救い","正解",
    "吉兆","凶兆","スピ","ヒーリング","セラピー","メッセージ",
    "内側","外側","反応","出やすい","内面","外面","きょう","今日",
    "理想","意味","余韻","本質","可能性","状況",
  ].map((s) => String(s || "").toLowerCase().trim()).filter(Boolean)
);

const _KW_SAFE_POOL = [
  "余白", "間", "輪郭", "密度", "距離", "手触り", "温度差", "配分", "境目",
  "微差", "流れ", "層", "奥行", "摩擦", "調整", "揺れ", "滞り", "反射",
  "保ち", "置き方", "明度", "暗度", "空気", "静けさ", "にじみ", "濃度",
];

function _isBannedKw(w) {
  const s = String(w || "").trim();
  if (!s) return true;
  if (/[0-9°]/.test(s)) return true;
  if (s.includes("座")) return true;
  const t = s.toLowerCase();
  const flat = t.replace(/[^\p{L}\p{N}]+/gu, "");
  if (_KW_BANNED.has(t) || (flat && _KW_BANNED.has(flat))) return true;
  for (const b of _KW_BANNED) {
    if (!b) continue;
    if (t.includes(b) || flat.includes(b)) return true;
  }
  return false;
}

function _splitKwString(val) {
  const raw = String(val || "");
  return raw
    .split(/[\/、,\|\n]+/g)
    .map((s) => String(s || "").trim())
    .filter(Boolean);
}

function _normalizeKeywords(list) {
  const out = [];
  const src = Array.isArray(list)
    ? list.flatMap((w) => _splitKwString(w))
    : _splitKwString(list);
  src.forEach((w) => {
    const s = String(w || "").trim();
    if (!s) return;
    if (out.some((x) => _isSimilarKw(x, s))) return;
    out.push(s);
  });
  return out;
}

function _isSimilarKw(a, b) {
  const sa = _normalizeKwToken(a);
  const sb = _normalizeKwToken(b);
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  if (sa.includes(sb) || sb.includes(sa)) return true;
  if (sa.length >= 2 && sb.length >= 2 && sa.slice(0, 2) === sb.slice(0, 2)) return true;
  const ga = _kwGroup(sa);
  const gb = _kwGroup(sb);
  if (ga && ga === gb) return true;
  return false;
}

function _sanitizeKeywords(list, fallback, avoidList = [], maxLen = 5) {
  const candidates = _normalizeKeywords(list).concat(_normalizeKeywords(fallback));
  const out = [];
  const usedGroups = new Set();
  const avoid = Array.isArray(avoidList) ? avoidList : [];
  const tryAdd = (w) => {
    const s = String(w || "").trim();
    if (!s) return;
    if (avoid.some((x) => _isSimilarKw(x, s))) return;
    if (_isBannedKw(s)) return;
    if (out.some((x) => _isSimilarKw(x, s))) return;
    const g = _kwGroup(s);
    if (g && usedGroups.has(g)) return;
    out.push(s);
    if (g) usedGroups.add(g);
  };
  for (const w of candidates) {
    tryAdd(w);
    if (out.length >= maxLen) break;
  }
  if (out.length < maxLen) {
    _KW_SAFE_POOL.forEach(tryAdd);
  }
  return out.slice(0, maxLen);
}

function _formatKeywordsLine(list, fallback) {
  const xs = _sanitizeKeywords(list, fallback);
  return xs.length ? `KeyWord ${xs.join(" / ")}` : "";
}

function _formatKeywordsBlock(list, fallback, avoidList = [], maxLen = 5) {
  const xs = _sanitizeKeywords(list, fallback, avoidList, maxLen);
  if (!xs.length) return "";
  return `KeyWord：\n${xs.join(" / ")}`;
}

function _kwPoolFromSignFlavor(dict, signKey, planetKey) {
  const { sign, by } = _getSignFlavor(dict, signKey, planetKey);
  const pool = []
    .concat(by?.fusion?.A || [])
    .concat(by?.fusion?.B || [])
    .concat(by?.fusion?.expression || []);
  const tokens = _uniq(
    pool
      .flatMap((v) => _tokenizePhrase(v))
      .map((v) => _labelNounize(_miniNormalize(v)))
      .filter((v) => v && !_isBannedKw(v) && !/座|として|やすい/.test(v))
  );
  return _uniq(tokens.map((v) => _normalizeKw(v)).filter(Boolean));
}

function _kwBoundaryFromSignFlavor(dict, signKey, planetKey) {
  const { by } = _getSignFlavor(dict, signKey, planetKey);
  const pool = []
    .concat(by?.fusion?.A || [])
    .concat(by?.fusion?.B || []);
  const tokens = _uniq(
    pool
      .flatMap((v) => _tokenizePhrase(v))
      .map((v) => _labelNounize(_miniNormalize(v)))
      .filter((v) => v && !_isBannedKw(v) && !/座|として|やすい/.test(v))
  );
  return _uniq(tokens.map((v) => _normalizeKw(v)).filter(Boolean));
}

function _kwPoolFromAspect(dict, aspectKey, seed = "") {
  const info = _aspectInfo(dict, aspectKey);
  const tone = _pickAspectToneWords(dict, aspectKey, `${seed}|tone`, 2);
  const pool = []
    .concat(info?.core || [])
    .concat(info?.feel || [])
    .concat(info?.relation || [])
    .concat(tone || []);
  const tokens = _uniq(
    pool
      .flatMap((v) => _tokenizePhrase(v))
      .map((v) => _labelNounize(_miniNormalize(v)))
      .filter((v) => v && !_isBannedKw(v) && !/座|として|やすい/.test(v))
  );
  return _uniq(tokens.map((v) => _normalizeKw(v)).filter(Boolean));
}

function _kwPoolFromSoar(dict, signKey, planetKey) {
  const soar = _getSoarStyle(dict);
  const pKey = _lowerKey(planetKey);
  const sKey = _lowerKey(signKey);
  const pTouch = soar?.planets?.[pKey]?.touch || [];
  const sTouch = soar?.signs?.[sKey]?.touch || [];
  const pool = []
    .concat(pTouch || [])
    .concat(sTouch || []);
  const tokens = _uniq(
    pool
      .flatMap((v) => _tokenizePhrase(v))
      .map((v) => _labelNounize(_miniNormalize(v)))
      .filter((v) => v && !_isBannedKw(v) && !/座|として|やすい/.test(v))
  );
  return _uniq(tokens.map((v) => _normalizeKw(v)).filter(Boolean));
}

function _pickKwFromPool(pool, seed, avoid = [], relaxAvoid = false) {
  const arr = Array.isArray(pool) ? pool.filter(Boolean) : [];
  if (!arr.length) return "";
  const picked = _pickMany(arr, seed, arr.length);
  for (const w of picked) {
    const s = String(w || "").trim();
    if (!s) continue;
    if (_isBannedKw(s)) continue;
    if (!relaxAvoid && avoid.some((x) => _isSimilarKw(x, s))) continue;
    return s;
  }
  return "";
}

function _formatKeywordsBlockPersonal(dict, item, seed = "", aiList = [], usedSet = null) {
  const aKey = item?.natal_body_or_point || item?.natal_body || item?.a;
  const bKey = item?.transit_body || item?.b;
  const aSignKey = item?.natal_sign_key || item?.natal_sign || item?.a_sign_key;
  const bSignKey = item?.transit_sign_key || item?.transit_sign || item?.b_sign_key;
  const aspectKey = _normAspectKey(item?.aspect || item?.type || item?.aspectType || item?.aspect_label_ja);

  const aPool = _uniq([
    ..._kwPoolFromSignFlavor(dict, aSignKey, aKey),
    ..._signKwPool(dict, aSignKey),
    ..._kwPoolFromSoar(dict, aSignKey, aKey),
  ]);
  const bPool = _uniq([
    ..._kwPoolFromSignFlavor(dict, bSignKey, bKey),
    ..._signKwPool(dict, bSignKey),
    ..._kwPoolFromSoar(dict, bSignKey, bKey),
  ]);
  const aspectPool = _kwPoolFromAspect(dict, aspectKey, seed);

  const fused = _uniq([...aPool, ...bPool, ...aspectPool]);
  const avoid = usedSet ? Array.from(usedSet) : [];
  const picked = [];

  const tone = _aspectToneCategory(aspectKey);
  const boundaryPool = _uniq([
    ..._kwBoundaryFromSignFlavor(dict, aSignKey, aKey),
    ..._kwBoundaryFromSignFlavor(dict, bSignKey, bKey),
  ]);

  if ((tone === "tense" || tone === "adjust") && boundaryPool.length) {
    const b1 = _pickKwFromPool(boundaryPool, `${seed}|boundary`, avoid, true);
    if (b1) {
      picked.push(b1);
      avoid.push(b1);
    }
  }

  const candidates = _pickMany(fused, `${seed}|fused`, fused.length);
  for (const w of candidates) {
    const s = String(w || "").trim();
    if (!s) continue;
    if (_isBannedKw(s)) continue;
    if (avoid.some((x) => _isSimilarKw(x, s))) continue;
    picked.push(s);
    avoid.push(s);
    if (picked.length >= 3) break;
  }

  if (picked.length < 3) {
    for (const w of _KW_SAFE_POOL) {
      const s = String(w || "").trim();
      if (!s) continue;
      if (avoid.some((x) => _isSimilarKw(x, s))) continue;
      picked.push(s);
      avoid.push(s);
      if (picked.length >= 3) break;
    }
  }

  const fallback = _uniq([...fused, ...(Array.isArray(aiList) ? aiList : [])]);
  const block = _formatKeywordsBlock(picked.filter(Boolean), fallback, avoid, 3);
  if (usedSet && block) {
    const lines = block.split("\n");
    const words = (lines[1] || "").split("/").map((s) => s.trim()).filter(Boolean);
    words.forEach((w) => usedSet.add(w));
  }
  return block;
}

function _normalizePhrase(str, maxLen = 28) {
  let t = String(str || "").trim();
  if (!t) return "";
  t = t.replace(/（.*?）/g, "").replace(/\(.*?\)/g, "");
  t = t.split("。")[0];
  t = t.replace(/やすい/g, "");
  t = t.replace(/[、，,]/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  if (t.length > maxLen) t = t.slice(0, maxLen);
  return t;
}

function _normalizeProseLine(str, maxLen = 38) {
  let t = String(str || "").trim();
  if (!t) return "";
  t = t.replace(/[，,]+/g, "、");
  t = t.replace(/\s+/g, " ").trim();
  if (t.length > maxLen) t = t.slice(0, maxLen);
  return t;
}

function _stripSentenceEnd(str) {
  return String(str || "").trim().replace(/[。\.]+$/g, "").trim();
}

function _normalizePiece(str, maxLen = 26) {
  let t = String(str || "").trim();
  if (!t) return "";
  t = t.replace(/[、，,]+/g, "、");
  t = t.replace(/[。\.]+/g, "。");
  t = t.replace(/\s+/g, " ").trim();
  t = _stripSentenceEnd(t);
  if (t.length > maxLen) t = t.slice(0, maxLen);
  return t;
}

function _shortRolePhrase(text, maxLen = 16) {
  const tokens = _splitRoleTokens(text)
    .map((v) => _shortRoleToken(v))
    .filter(Boolean);
  if (!tokens.length) return "";
  if (tokens.length === 1) return tokens[0];
  const phrase = `${tokens[0]}と${tokens[1]}`;
  return _shortenLabelText(phrase, maxLen);
}

const _STRUCTURE_BANNED = [
  /残りやすい/g,
  /処理/g,
  /交差点で触れ/g,
  /AとBが触れ/g,
  /だから/g,
  /なので/g,
  /ため/g,
  /場面で/g,
  /の中で/g,
  /中で/g,
  /生まれる/g,
  /手助け/g,
  /観測/g,
  /訪れる/g,
  /浮かび上がる/g,
  /広がる/g,
  /進む/g,
  /助ける/g,
  /見せる/g,
];

function _isBannedStructure(line) {
  const s = String(line || "");
  return _STRUCTURE_BANNED.some((re) => re.test(s));
}

function _formatStructureLines(lines) {
  const xs = Array.isArray(lines) ? lines.filter(Boolean) : [];
  if (!xs.length) return "";
  const head = `→ ${xs[0]}`;
  const rest = xs.slice(1).join("\n");
  return rest ? `${head}\n${rest}` : head;
}

function _splitSentences(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  return raw
    .split(/[。\.]+/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `${s}。`);
}

function _normalizeProseSentence(s, maxLen = 40) {
  const t = _normalizeProseLine(s, maxLen);
  if (!t) return "";
  return /[。\.]$/.test(t) ? t : `${t}。`;
}

function _isOkProse(line) {
  const s = String(line || "").trim();
  if (!s) return false;
  if (s.length < 8) return false;
  if (/(太陽|月|水星|金星|火星|木星|土星|天王星|海王星|冥王星|ASC|MC|IC|DSC|アセンダント|ディセンダント|ミディアムコエリ|ノード|キロン|リリス)/.test(s)) return false;
  if (/(牡羊座|牡牛座|双子座|蟹座|獅子座|乙女座|天秤座|蠍座|射手座|山羊座|水瓶座|魚座)/.test(s)) return false;
  if (/(スクエア|トライン|セクスタイル|セミセクスタイル|セミスクエア|セスキスクエア|オポジション|インコンジャンクト|クインタイル|バイクインタイル|セプタイル|ノヴィル|デシル)/.test(s)) return false;
  if (/配置/.test(s)) return false;
  if (/現れやすい|表に出やすい/.test(s)) return false;
  if (/影響/.test(s)) return false;
  if (/として/.test(s)) return false;
  if (/(試行錯誤|独自|更新|全体最適|意味づけ|状況)/.test(s)) return false;
  if (_isBannedStructure(s)) return false;
  if (/座/.test(s)) return false;
  return true;
}

function _isFiniteNum(n) {
  return Number.isFinite(Number(n));
}

function _moonPhaseInfo(story) {
  const moonLon = story?.public?.moon?.lon_deg ?? story?.public?.transit_signs?.moon?.lon_deg;
  const sunLon = story?.public?.transit_signs?.sun?.lon_deg;
  if (!_isFiniteNum(moonLon) || !_isFiniteNum(sunLon)) return null;
  const diff = (Number(moonLon) - Number(sunLon) + 360) % 360;
  const idx = Math.floor((diff + 22.5) / 45) % 8;
  const names = ["新月","三日月","上弦の月","十三夜","満月","寝待月","下弦の月","三十日月"];
  const emojis = ["🌑","🌒","🌓","🌔","🌕","🌖","🌗","🌘"];
  return { name: names[idx], emoji: emojis[idx] };
}

function _isOkPiece(line) {
  const s = String(line || "").trim();
  if (!s) return false;
  if (s.length < 6) return false;
  if (/(太陽|月|水星|金星|火星|木星|土星|天王星|海王星|冥王星|ASC|MC|IC|DSC|アセンダント|ディセンダント|ミディアムコエリ|ノード|キロン|リリス)/.test(s)) return false;
  if (/(牡羊座|牡牛座|双子座|蟹座|獅子座|乙女座|天秤座|蠍座|射手座|山羊座|水瓶座|魚座)/.test(s)) return false;
  if (/(スクエア|トライン|セクスタイル|セミセクスタイル|セミスクエア|セスキスクエア|オポジション|インコンジャンクト|クインタイル|バイクインタイル|セプタイル|ノヴィル|デシル)/.test(s)) return false;
  if (/配置/.test(s)) return false;
  if (/現れやすい|表に出やすい/.test(s)) return false;
  if (/影響/.test(s)) return false;
  if (/として/.test(s)) return false;
  if (/(試行錯誤|独自|更新|全体最適|意味づけ|状況)/.test(s)) return false;
  if (_isBannedStructure(s)) return false;
  if (/座/.test(s)) return false;
  return true;
}

function _pickSentence(pool, seed, avoid = []) {
  const arr = (Array.isArray(pool) ? pool : []).filter(Boolean);
  if (!arr.length) return "";
  const shuffled = _pickMany(arr, seed, arr.length);
  for (const s of shuffled) {
    if (!s) continue;
    if (avoid.some((a) => _isSimilarKw(a, s))) continue;
    if (!_isOkProse(s)) continue;
    return s;
  }
  return "";
}

function _buildPiecePool(list, minLen = 6, maxLen = 26) {
  const raw = Array.isArray(list) ? list : [];
  const out = [];
  raw.forEach((v) => {
    const s = String(v || "").trim();
    if (!s) return;
    const parts = s.includes("。") ? s.split(/[。\.]+/g) : [s];
    parts.forEach((p) => {
      const piece = _normalizePiece(p, maxLen);
      if (!piece) return;
      if (piece.length < minLen) return;
      if (!_isOkPiece(piece)) return;
      out.push(piece);
    });
  });
  return _uniq(out);
}

function _signFlavorTokens(dict, signKey, planetKey) {
  const { sign, by } = _getSignFlavor(dict, signKey, planetKey);
  const pool = []
    .concat(by?.fusion?.A || [])
    .concat(by?.fusion?.B || [])
    .concat(by?.fusion?.expression || [])
    .concat(by?.core || [])
    .concat(by?.role || [])
    .concat(sign?.base?.keywords || []);
  return _uniq(
    pool
      .flatMap((v) => _tokenizePhrase(v))
      .map((v) => _labelNounize(_miniNormalize(v)))
      .filter((v) => v && !_isBannedKw(v) && !/座|として|やすい/.test(v))
  );
}

function _pickNounPhrase(tokens, seed) {
  const arr = Array.isArray(tokens) ? tokens.filter(Boolean) : [];
  if (!arr.length) return "";
  const picks = _uniq(_pickMany(arr, seed, 2));
  if (!picks.length) return "";
  return picks.length >= 2 ? `${picks[0]}と${picks[1]}` : picks[0];
}

function _pickSingleToken(tokens, seed) {
  const arr = Array.isArray(tokens) ? tokens.filter(Boolean) : [];
  if (!arr.length) return "";
  const picks = _uniq(_pickMany(arr, seed, 1));
  return picks[0] || "";
}

function _meaningPiecesFromSignFlavor(dict, signKey, planetKey) {
  const { sign, by } = _getSignFlavor(dict, signKey, planetKey);
  const pool = []
    .concat(by?.core || [])
    .concat(by?.role || [])
    .concat(by?.fusion?.A || [])
    .concat(by?.fusion?.B || [])
    .concat(by?.fusion?.expression || [])
    .concat(sign?.base?.short || [])
    .concat(sign?.base?.flavor || [])
    .concat(sign?.base?.keywords || []);
  return _buildPiecePool(pool, 6, 28);
}

function _meaningPiecesFromSoar(dict, signKey, planetKey) {
  const soar = _getSoarStyle(dict);
  const sKey = _lowerKey(signKey);
  const pKey = _lowerKey(planetKey);
  const pTouch = soar?.planets?.[pKey]?.touch || [];
  const sTouch = soar?.signs?.[sKey]?.touch || [];
  return _buildPiecePool([].concat(pTouch || []).concat(sTouch || []), 6, 28);
}

function _meaningPiecesFromAspect(dict, aspectKey) {
  const info = _aspectInfo(dict, aspectKey);
  const voice = dict?.ASPECTS_V2?.voice_templates?.[_normAspectKey(aspectKey)] || {};
  const pool = []
    .concat(info?.core || [])
    .concat(info?.feel || [])
    .concat(info?.relation || [])
    .concat(info?.adverbs || [])
    .concat(voice?.touch || [])
    .concat(voice?.gap || [])
    .concat(voice?.rest || []);
  return _buildPiecePool(pool, 6, 28);
}

function _collectSignPack(dict, signKey, planetKey, aspectKey, orb) {
  const { sign, by } = _getSignFlavor(dict, signKey, planetKey);
  const soar = _getSoarStyle(dict);
  const fusion = by?.fusion || {};
  const tone = _aspectToneCategory(aspectKey);
  const tier = _orbTier(orb);
  const aList = fusion.A || [];
  const bList = fusion.B || [];

  let tokensPool = [];
  if (tone === "tense" || tone === "adjust") {
    tokensPool = [].concat(aList, aList, bList);
  } else if (tone === "smooth" || tone === "blend") {
    tokensPool = [].concat(bList, bList, aList);
  } else {
    tokensPool = [].concat(aList, bList);
  }

  const tokens = _buildPiecePool(tokensPool, 5, 22);

  const signMeta = dict?.SIGNS_V2?.signs?.[_lowerKey(signKey)] || {};
  const texturePool = []
    .concat(signMeta?.texture || [])
    .concat(soar?.signs?.[_lowerKey(signKey)]?.touch || []);
  const texture = _buildPiecePool(texturePool, 5, 22);

  const pickProcessBucket = () => {
    if (tone === "tense" || tone === "adjust") return "tension";
    if (tone === "smooth" || tone === "blend") return "clarity";
    if (tone === "craft") return "tendency";
    if (tier === "tight") return "tension";
    if (tier === "wide" || tier === "loose") return "clarity";
    return "tendency";
  };
  const bucket = pickProcessBucket();
  const processPool = (fusion?.[bucket] || []);
  const process = _buildPiecePool(processPool, 3, 26);

  return {
    tokens: _uniq(tokens),
    texture: _uniq(texture),
    process: _uniq(process),
  };
}

function _collectAspectPack(dict, aspectKey, orb) {
  const info = _aspectInfo(dict, aspectKey);
  const voice = dict?.ASPECTS_V2?.voice_templates?.[_normAspectKey(aspectKey)] || {};
  const key = _normAspectKey(aspectKey);
  const tone = _aspectToneCategory(key);
  const tier = _orbTier(orb);
  const sf = dict?.SIGN_FLAVOR_V1 || dict?.sign_flavor || null;
  const stateAspect = sf?.states?.state_by_aspect?.[key] || {};
  const stateTone = sf?.states?.state_by_tone?.[tone] || [];
  const stateShort = sf?.states?.state_short_by_tone?.[tone] || [];
  const touchPool = [].concat(stateAspect?.light || [], stateAspect?.mid || [], stateShort || []);
  const gapPool = [].concat(stateTone || []);
  const restPool = [].concat(stateAspect?.deep || [], stateShort || [], voice?.rest || []);

  const touch = _buildPiecePool(touchPool, 5, 22);
  const gap = _buildPiecePool(gapPool, 5, 22);
  const rest = _buildPiecePool(restPool, 5, 22);
  const tokens = _uniq([].concat(touch, gap, rest));
  return {
    tokens: _uniq(tokens),
    touch: _uniq(touch),
    gap: _uniq(gap),
    rest: _uniq(rest),
  };
}

function _samplePool(pool, seed, max = 4) {
  const arr = Array.isArray(pool) ? pool.filter(Boolean) : [];
  if (!arr.length) return [];
  return _pickMany(arr, seed, Math.min(max, arr.length));
}

function _clampNum(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function _orbTier(orb) {
  const v = Number(orb);
  if (!Number.isFinite(v)) return "mid";
  if (v <= 0.6) return "tight";
  if (v <= 1.4) return "mid";
  if (v <= 2.4) return "wide";
  return "loose";
}

function _samplingPlan(aspectKey, orb) {
  const tone = _aspectToneCategory(aspectKey);
  const tier = _orbTier(orb);
  let p = {
    aTok: 4, bTok: 4,
    aTex: 2, bTex: 2,
    aProc: 1, bProc: 1,
    aspTok: 4,
    touch: 1, gap: 1, rest: 1,
  };

  if (tier === "tight") {
    p.aspTok += 2;
    p.touch += 1;
    p.gap += 1;
    p.aTok -= 1;
    p.bTok -= 1;
  } else if (tier === "wide") {
    p.aspTok -= 1;
    p.rest += 1;
    p.aTok += 1;
    p.bTok += 1;
    p.aTex += 1;
    p.bTex += 1;
    p.gap -= 1;
  } else if (tier === "loose") {
    p.aspTok -= 2;
    p.rest += 1;
    p.aTok += 1;
    p.bTok += 1;
    p.gap -= 1;
  }

  if (tone === "tense" || tone === "adjust") {
    p.gap += 1;
    p.rest -= 1;
  } else if (tone === "smooth" || tone === "blend") {
    p.rest += 1;
    p.gap -= 1;
  } else if (tone === "craft") {
    p.touch += 1;
  }

  p.aTok = _clampNum(p.aTok, 2, 6);
  p.bTok = _clampNum(p.bTok, 2, 6);
  p.aTex = _clampNum(p.aTex, 1, 3);
  p.bTex = _clampNum(p.bTex, 1, 3);
  p.aProc = _clampNum(p.aProc, 0, 1);
  p.bProc = _clampNum(p.bProc, 0, 1);
  p.aspTok = _clampNum(p.aspTok, 2, 6);
  p.touch = _clampNum(p.touch, 0, 2);
  p.gap = _clampNum(p.gap, 0, 2);
  p.rest = _clampNum(p.rest, 0, 2);

  return p;
}

function _phraseGroups(phrase) {
  const groups = new Set();
  const tokens = _tokenizePhrase(phrase);
  for (const tok of tokens) {
    const g = _kwGroup(tok);
    if (g) groups.add(g);
  }
  return Array.from(groups);
}

function _hasGroupOverlap(groups, targetGroups) {
  if (!targetGroups || !targetGroups.length) return true;
  return groups.some((g) => targetGroups.includes(g));
}

function _pickPiece(pool, seed, requiredGroups = [], avoid = []) {
  const arr = (Array.isArray(pool) ? pool : []).filter(Boolean);
  if (!arr.length) return "";
  const shuffled = _pickMany(arr, seed, arr.length);
  for (const s of shuffled) {
    if (!s) continue;
    if (avoid.some((a) => _isSimilarKw(a, s))) continue;
    if (!_isOkPiece(s)) continue;
    const groups = _phraseGroups(s);
    if (!_hasGroupOverlap(groups, requiredGroups)) continue;
    return s;
  }
  // fallback without group constraint
  for (const s of shuffled) {
    if (!s) continue;
    if (avoid.some((a) => _isSimilarKw(a, s))) continue;
    if (!_isOkPiece(s)) continue;
    return s;
  }
  return "";
}

function _composeSentence(pieceA, pieceB, maxLen = 42) {
  const a = _normalizePiece(pieceA, Math.min(26, maxLen));
  const b = _normalizePiece(pieceB, Math.min(26, maxLen));
  let core = "";
  if (a && b && !_isSimilarKw(a, b)) {
    core = `${a}、${b}`;
  } else {
    core = a || b || "";
  }
  core = core.trim();
  if (!core) return "";
  const line = _normalizeProseLine(core, maxLen);
  return _normalizeProseSentence(line, maxLen);
}

function _nounizeWord(word) {
  const w = String(word || "").trim();
  if (!w) return "";
  const map = {
    "突然": "突然性",
    "静か": "静けさ",
    "硬い": "硬さ",
    "柔らかい": "柔らかさ",
    "鋭い": "鋭さ",
    "深い": "深さ",
    "薄い": "薄さ",
    "重い": "重さ",
    "軽い": "軽さ",
  };
  if (map[w]) return map[w];
  if (w.endsWith("しい")) return `${w.slice(0, -2)}しさ`;
  if (w.endsWith("かな")) return `${w.slice(0, -1)}さ`;
  if (w.endsWith("い")) return `${w.slice(0, -1)}さ`;
  if (w.endsWith("的")) return `${w}性`;
  return w;
}

function _nounizePhrase(phrase) {
  let t = _normalizePhrase(phrase);
  if (!t) return "";
  t = t.replace(/がある$/g, "");
  t = t.replace(/している$/g, "");
  t = t.replace(/しやすい$/g, "");
  t = t.replace(/やすい$/g, "");
  t = t.replace(/触れる$/g, "");
  t = t.replace(/触れ$/g, "");
  t = t.replace(/が(続く|出る|残る|立つ|揺れる|にじむ|増える|伸びる|引っかかる|戻る|返る|刺さる|止まる)$/g, "");
  t = t.replace(/を(押す|引く|返す|進める|動かす)$/g, "");
  const trimmed = t.replace(
    /(として|の中で|のあいだで|の間で|の手前で|の境目で|の境界で|の外で|の内で|で|に|へ|を|から|まで)$/g,
    ""
  );
  if (trimmed) t = trimmed;
  const token = t.split(/[ /]/)[0];
  return _nounizeWord(token || t);
}

function _ensureEnd(line, endChar) {
  const t = String(line || "").trim();
  if (!t) return "";
  if (/[。、]$/.test(t)) return t;
  return `${t}${endChar || ""}`;
}

function _clampStructureLine(line, maxLen = 28) {
  let t = String(line || "").trim();
  if (!t) return "";
  if (t.length <= maxLen) return t;
  t = t.replace(/（[^）]+）/g, "");
  if (t.length <= maxLen) return t;
  t = t.replace(/とき$/g, "");
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen);
}

function _tokenizePhrase(text) {
  return String(text || "")
    .replace(/[（）()]/g, "")
    .split(/[・/、,\s]+/g)
    .map((s) => _normalizePhrase(s))
    .filter(Boolean)
    .filter((s) => !/座|的/.test(s));
}

function _scoreTag(tag, tokens, hints = []) {
  const t = _normalizeKwToken(tag);
  let score = 0;
  tokens.forEach((tok) => {
    const nt = _normalizeKwToken(tok);
    if (!nt || !t) return;
    if (nt === t) score += 3;
    else if (nt.includes(t) || t.includes(nt)) score += 2;
  });
  return score;
}

function _pickByScore(cands, tokens, seed) {
  const scored = cands.map((c) => ({ c, s: _scoreTag(c, tokens) }));
  let best = scored.reduce((m, v) => (v.s > m.s ? v : m), { c: "", s: -1 });
  const bests = scored.filter((v) => v.s === best.s).map((v) => v.c);
  if (!bests.length) return "";
  const idx = hash32(`${seed}|${best.s}`) % bests.length;
  return bests[idx];
}

function _verbizeFromPhrase(phrase) {
  let t = _normalizePhrase(phrase);
  if (!t) return "";
  t = t.replace(/やすい$/g, "");
  t = t.replace(/にくい$/g, "");
  const m = t.match(/(?:.*?(?:が|を|に|へ|と|で|として|から))?([^\s]+)$/);
  let tail = m ? m[1] : t;
  if (!tail) return "";
  if (tail.endsWith("り") && tail.length > 1) {
    tail = `${tail.slice(0, -1)}る`;
  }
  if (/(する|なる|れる|られる|える|る|う|く|ぐ|む|ぶ|ぬ|つ|す)$/.test(tail)) return tail;
  return "";
}

function _extractVerbCandidates(phrases) {
  const list = Array.isArray(phrases) ? phrases : [phrases];
  return _uniq(list.map((v) => _verbizeFromPhrase(v)).filter(Boolean));
}

const _MINI_BANNED_VERBS = new Set(["出る", "効く", "止まる", "続く", "残る"]);

function _miniNormalize(str, maxLen = 24) {
  let t = _normalizePhrase(str, maxLen);
  if (!t) return "";
  t = t.replace(/として触れ/g, "");
  t = t.replace(/として/g, "");
  t = t.replace(/触れ$/g, "");
  t = t.replace(/触れる$/g, "");
  t = t.replace(/しやすい/g, "");
  t = t.replace(/やすい/g, "");
  return t.trim();
}

function _isAdverbLike(phrase) {
  return /(で|に|へ|として|ながら|まま|より|まで)$/.test(String(phrase || ""));
}

function _filterMiniTokens(list, roleTokens = []) {
  const out = [];
  for (const raw of list) {
    const t = String(raw || "").trim();
    if (!t) continue;
    if (_isBannedStructure(t)) continue;
    if (_isBannedKw(t)) continue;
    if (roleTokens.some((r) => r && _isSimilarKw(r, t))) continue;
    if (/座/.test(t)) continue;
    out.push(t);
  }
  return _uniq(out);
}

function _pickDistinctPhrase(pool, seed, avoid = []) {
  const arr = (Array.isArray(pool) ? pool : []).filter(Boolean);
  if (!arr.length) return "";
  const picked = _pickMany(arr, seed, arr.length);
  for (const p of picked) {
    if (avoid.some((a) => _isSimilarKw(a, p))) continue;
    return p;
  }
  return "";
}

function buildStructureLines(item, mode = "", dict) {
  const s = item?.structure || {};
  const seedExtra = item?.seed || item?._seed || "";
  const seed = `${seedExtra}|${item?.a || ""}|${item?.b || ""}|${item?.aspect_ja_deg || ""}|${item?.a_sign || ""}|${item?.b_sign || ""}|${mode}`;
  const d = dict || require("../../dict");

  const aKey = item?.a_key || item?.a || item?.natal_body_or_point || item?.natal_body || "";
  const bKey = item?.b_key || item?.b || item?.transit_body || "";
  const aSignKey = item?.a_sign_key || item?.a_sign || "";
  const bSignKey = item?.b_sign_key || item?.b_sign || "";

  const point = d?.POINTS_V1?.points || {};
  const soar = _getSoarStyle(d);
  const aSignMeta = _signMeta(d, aSignKey);
  const bSignMeta = _signMeta(d, bSignKey);
  const aPlanetMeta = _planetMeta(d, aKey);
  const bPlanetMeta = _planetMeta(d, bKey);

  const aspectInfo = _aspectInfo(d, item?.aspect || item?.type || item?.aspectType || item?.aspect_label_ja);
  const voice = d?.ASPECTS_V2?.voice_templates?.[_normAspectKey(item?.aspect || item?.type || item?.aspectType)] || {};
  const aspectPieces = _buildPiecePool(
    []
      .concat(voice?.touch || [])
      .concat(voice?.gap || [])
      .concat(aspectInfo?.relation || [])
      .concat(aspectInfo?.feel || [])
      .concat(aspectInfo?.adverbs || []),
    8,
    28
  );
  const restPieces = _buildPiecePool(
    []
      .concat(voice?.rest || [])
      .concat(aspectInfo?.feel || [])
      .concat(aSignMeta?.texture || [])
      .concat(bSignMeta?.texture || []),
    8,
    26
  );

  const aTokens = _signFlavorTokens(d, aSignKey, aKey);
  const bTokens = _signFlavorTokens(d, bSignKey, bKey);

  const aFallbackRole = _roleShortForStructure(_getRole(d, aSignKey, aKey), _planetMeta(d, aKey)?.core || "");
  const bFallbackRole = _roleShortForStructure(_getRole(d, bSignKey, bKey), _planetMeta(d, bKey)?.core || "");
  const aPhraseRaw =
    _pickSingleToken(aTokens, `${seed}|a1`) ||
    _pickSingleToken(aTokens, `${seed}|a2`) ||
    _stripSentenceEnd(aFallbackRole);
  const bPhraseRaw =
    _pickSingleToken(bTokens, `${seed}|b1`) ||
    _pickSingleToken(bTokens, `${seed}|b2`) ||
    _stripSentenceEnd(bFallbackRole);
  const aPhrase = aPhraseRaw || "感触";
  const bPhrase = bPhraseRaw || "方向";

  const aspRaw = _pickPiece(aspectPieces, `${seed}|asp`, _uniq([..._phraseGroups(aPhrase), ..._phraseGroups(bPhrase)]), [aPhrase, bPhrase]);
  const aspClause = _normalizePiece(aspRaw, 28);
  const aspNoun = _nounizePhrase(aspRaw) || aspClause;

  const betweenPool =
    d?.SIGN_FLAVOR_V1?.grammar?.connectors?.between ||
    ["のあいだで", "の境目で", "の間で", "の交点で"];
  const between = _pickOne(betweenPool, `${seed}|between`) || "のあいだで";

  const openVerbs = ["先に立つ", "手前に浮く", "輪郭が立つ", "前に出る"];
  const swayVerbs = ["揺れる", "ずれる", "触れる", "引っかかる"];
  const openVerb = _pickOne(openVerbs, `${seed}|open`) || "先に立つ";
  const swayVerb = _pickOne(swayVerbs, `${seed}|sway`) || "揺れる";

  const aspectPartRaw = _stripSentenceEnd(aspClause || aspNoun || "");
  const aspectPart = aspectPartRaw || "間合いが動く";
  const sentence1 = _normalizeProseSentence(
    `${aPhrase}が${openVerb}、${bPhrase}が${swayVerb}、${aspectPart}`,
    56
  );

  const lines = [sentence1].filter(Boolean);
  return lines.slice(0, 1);
}

function _pickDistinct(pool, seed, want = 1, avoid = []) {
  const picked = [];
  const arr = _pickMany(pool, seed, Math.max(want * 3, 6));
  for (const w of arr) {
    if (!w) continue;
    if (avoid.some((a) => _isSimilarKw(a, w))) continue;
    picked.push(w);
    avoid.push(w);
    if (picked.length >= want) break;
  }
  return picked;
}

function _composeKeywords({ aspectPool, planetPool, signPool, extraPool, seed }) {
  const avoid = [];
  const out = [];
  if (aspectPool?.length) out.push(..._pickDistinct(aspectPool, `${seed}|aspect`, 1, avoid));
  if (planetPool?.length) out.push(..._pickDistinct(planetPool, `${seed}|planet`, 1, avoid));
  if (signPool?.length) out.push(..._pickDistinct(signPool, `${seed}|sign`, 1, avoid));
  const rest = _pickDistinct(extraPool || [], `${seed}|extra`, 5, avoid);
  out.push(...rest);
  return _uniq(out).slice(0, 5);
}

function _planetKwPool(dict, planetKey) {
  const p = dict?.PLANETS_V2?.bodies?.[_lowerKey(planetKey)] || null;
  const pool = [
    ...(Array.isArray(p?.action_noun_ja) ? p.action_noun_ja : []),
    ...(Array.isArray(p?.action_verb_ja) ? p.action_verb_ja.map((v) => _normalizeKw(v)) : []),
  ].filter(Boolean);
  return _uniq(pool);
}

function _signKwPool(dict, signKey) {
  const s = dict?.SIGNS_V2?.signs?.[_lowerKey(signKey)] || null;
  const pool = [
    ...(Array.isArray(s?.texture) ? s.texture : []),
    ...(Array.isArray(s?.keywords) ? s.keywords : []),
  ].filter(Boolean);
  return _uniq(pool);
}

function _fallbackKwPublic(dict, item, seed = "") {
  const a = _lowerKey(item?.a || item?.aPlanetKey);
  const aSign = _lowerKey(item?.aS || item?.a_sign_key || item?.aSignKey);
  const aspectKey = _normAspectKey(item?.type || item?.aspectType || item?.aspect?.type || item?.aspect_label_ja);
  const tone = _pickAspectToneWords(dict, aspectKey, `${seed}|tone`, 3);
  const planetPool = _planetKwPool(dict, a);
  const signPool = _signKwPool(dict, aSign);
  const extra = _uniq([...tone, ...planetPool, ...signPool]);
  return _composeKeywords({
    aspectPool: tone,
    planetPool,
    signPool,
    extraPool: extra,
    seed: `${seed}|pub`,
  });
}

function _fallbackKwPersonal(dict, item, seed = "") {
  const a = _lowerKey(item?.natal_body_or_point || item?.natal_body || item?.a);
  const b = _lowerKey(item?.transit_body || item?.b);
  const aSign = _lowerKey(item?.natal_sign_key || item?.natal_sign || item?.a_sign_key);
  const bSign = _lowerKey(item?.transit_sign_key || item?.transit_sign || item?.b_sign_key);
  const aspectKey = _normAspectKey(item?.aspect || item?.type || item?.aspectType || item?.aspect_label_ja);
  const tone = _pickAspectToneWords(dict, aspectKey, `${seed}|tone`, 3);
  const planetPool = _uniq([..._planetKwPool(dict, a), ..._planetKwPool(dict, b)]);
  const signPool = _uniq([..._signKwPool(dict, aSign), ..._signKwPool(dict, bSign)]);
  const extra = _uniq([...tone, ...planetPool, ...signPool]);
  return _composeKeywords({
    aspectPool: tone,
    planetPool,
    signPool,
    extraPool: extra,
    seed: `${seed}|per`,
  });
}

async function renderLineAI(story, deps = {}, opts = {}) {
  const { createChatCompletion } = require("../blog/openai_client");
  const {
    getSkyLayers,
    buildNowModernPlanetCounts,
    buildPersonalTPCounts,
    RENDER_COPY,
  } = deps || {};

  const dict = deps?.dict || require("../../dict");
  const dateLabel = String(story?.meta?.date_local || "").replace(/-/g, ".");
  const tpKeyFn = typeof deps?.tpKey === "function" ? deps.tpKey : defaultTpKey;
  const layers = typeof getSkyLayers === "function" ? getSkyLayers(story) : null;
  const personalPool = Array.isArray(story?.personal?.touch_points_all)
    ? story.personal.touch_points_all
    : [];

  const publicTop = Array.isArray(story?.public?.sky_top)
    ? story.public.sky_top.slice(0, 5)
    : Array.isArray(story?.public?.sky_all)
      ? story.public.sky_all.slice(0, 5)
      : [];

  const personalPick = _pickPersonalBlocks(layers || {}, tpKeyFn, story, dict, personalPool);

  const publicInput = publicTop
    .map((it) => _publicAspectPayload(dict, it))
    .filter(Boolean);

  const pickCandidates = (list, limit = 6) =>
    (Array.isArray(list) ? list.slice(0, limit) : []);
  const orderCandidates = (list, selected) => {
    const out = [];
    if (selected) out.push(selected);
    (Array.isArray(list) ? list : []).forEach((item) => {
      if (selected && tpKeyFn(item) === tpKeyFn(selected)) return;
      out.push(item);
    });
    return out;
  };

  const innerCandidates = pickCandidates(orderCandidates(personalPick.innerCandidates, personalPick.inner))
    .map((it) => _personalAspectPayload(dict, it))
    .filter(Boolean);
  const outerCandidates = pickCandidates(orderCandidates(personalPick.outerCandidates, personalPick.outer))
    .map((it) => _personalAspectPayload(dict, it))
    .filter(Boolean);
  const rareCandidates = pickCandidates(orderCandidates(personalPick.rareCandidates, personalPick.rare))
    .map((it) => _personalAspectPayload(dict, it))
    .filter(Boolean);

  const distCounts = typeof buildNowModernPlanetCounts === "function"
    ? buildNowModernPlanetCounts(story)
    : null;
  const skyLayerHints = _buildLayerHints(distCounts, dict);

  const personalCounts =
    layers && typeof buildPersonalTPCounts === "function"
      ? buildPersonalTPCounts(
          [
            personalPick.inner,
            personalPick.outer,
            personalPick.rare ? personalPick.rare : personalPick.flow,
          ].filter(Boolean)
        )
      : null;
  const personalLayerHints = _buildLayerHints(personalCounts, dict);

  const SEP = RENDER_COPY?.LINE_SEP || "─────────────";
  const parts = [];
  const hasPersonal = !!(
    personalPick?.inner ||
    personalPick?.outer ||
    personalPick?.flow ||
    personalPick?.rare
  );
  const apiKey = process.env.OPENAI_API_KEY || "";
  const model = process.env.OPENAI_MODEL || "gpt-4o";
  const baseUrl = process.env.OPENAI_BASE_URL || "";
  const canCallLLM = !!apiKey && !opts?.forceNoLLM;
  if (LINE_AI_DEBUG) {
    console.error("[line_today] renderLineAI", {
      hasPersonal,
      canCallLLM,
      hasApiKey: !!apiKey,
      model,
      baseUrl: !!baseUrl,
      forceNoLLM: !!opts?.forceNoLLM,
    });
  }

  let aiPublic = [];
  let aiPersonal = {};
  let aiSkyLayer = {};
  let aiPersonalLayer = {};

  if (!hasPersonal) {
    try {
      const inputPayload = {
        date: dateLabel,
        top5: publicInput,
        sky_layer_hints: skyLayerHints,
        inner_candidate_aspects: innerCandidates,
        outer_candidate_aspects: outerCandidates,
        rare_candidate_aspects: rareCandidates,
        layer_hints: personalLayerHints,
        switch_mode: personalPick.mode || "",
      };

      const raw = await createChatCompletion({
        apiKey,
        baseUrl,
        model,
        temperature: 0.5,
        maxTokens: 1200,
        messages: [
          { role: "system", content: LINE_AI_SYSTEM_PROMPT },
          { role: "user", content: `${LINE_AI_USER_GUIDE}\n\nINPUT:\n${JSON.stringify(inputPayload)}` },
        ],
      });

      const jsonText = _extractJsonBlock(raw);
      const parsed = _safeJsonParse(jsonText || raw);
      if (parsed && typeof parsed === "object") {
        aiPublic = Array.isArray(parsed.public) ? parsed.public : [];
        aiPersonal = parsed.personal || {};
        aiSkyLayer = parsed.sky_layer || {};
        aiPersonalLayer = parsed.personal_layer || {};
      }
    } catch (_) {
      // keep empty AI payloads (no throw) to avoid dict fallback
    }
  } else {
    const banned = Array.isArray(LINE_AI_BANNED_TOKENS_PERSONAL)
      ? LINE_AI_BANNED_TOKENS_PERSONAL.slice()
      : [];

    const buildInput = (slot, item) => {
      if (!item) return null;
      const aKey = item?.natal_body_or_point || item?.natal_body || item?.a;
      const bKey = item?.transit_body || item?.b;
      const aSignKey = item?.natal_sign_key || item?.natal_sign || item?.a_sign_key;
      const bSignKey = item?.transit_sign_key || item?.transit_sign || item?.b_sign_key;
      const aspectKey = _normAspectKey(item?.aspect || item?.type || item?.aspectType || item?.aspect_label_ja);
      const orbDeg = Number(item?.orb_deg ?? item?.orb ?? 0);
      const aPack = _collectSignPack(dict, aSignKey, aKey, aspectKey, orbDeg);
      const bPack = _collectSignPack(dict, bSignKey, bKey, aspectKey, orbDeg);
      const aspectPack = _collectAspectPack(dict, aspectKey, orbDeg);
      const seedBase = `${dateLabel}|${slot}|${aKey}|${bKey}|${aspectKey}|${aSignKey}|${bSignKey}`;
      const plan = _samplingPlan(aspectKey, orbDeg);
      return {
        slot,
        A: {
          label: "A",
          tokens: _filterBannedPool(_samplePool(aPack.tokens, `${seedBase}|a|tok`, plan.aTok), banned),
          texture: _filterBannedPool(_samplePool(aPack.texture, `${seedBase}|a|tex`, plan.aTex), banned),
          process: _filterBannedPool(_samplePool(aPack.process, `${seedBase}|a|proc`, plan.aProc), banned),
        },
        B: {
          label: "B",
          tokens: _filterBannedPool(_samplePool(bPack.tokens, `${seedBase}|b|tok`, plan.bTok), banned),
          texture: _filterBannedPool(_samplePool(bPack.texture, `${seedBase}|b|tex`, plan.bTex), banned),
          process: _filterBannedPool(_samplePool(bPack.process, `${seedBase}|b|proc`, plan.bProc), banned),
        },
        aspect: {
          label: "relation",
          tokens: _filterBannedPool(_samplePool(aspectPack.tokens, `${seedBase}|asp|tok`, plan.aspTok), banned),
          touch: _filterBannedPool(_samplePool(aspectPack.touch, `${seedBase}|asp|touch`, plan.touch), banned),
          gap: _filterBannedPool(_samplePool(aspectPack.gap, `${seedBase}|asp|gap`, plan.gap), banned),
          rest: _filterBannedPool(_samplePool(aspectPack.rest, `${seedBase}|asp|rest`, plan.rest), banned),
        },
        banned,
        seed: `${dateLabel}|personal|${slot}|${aKey}|${bKey}|${aspectKey}|${aSignKey}|${bSignKey}`,
      };
    };

    const generateProse = async (input) => {
      if (!input) return "";
      if (!canCallLLM) {
        if (LINE_AI_DEBUG) console.error("[line_today] generateProse: LLM disabled, using fallback");
        return _fallbackProseFromTokens(input);
      }
      const banned = input?.banned || [];
      for (let i = 0; i < 2; i++) {
        try {
          const raw = await createChatCompletion({
            apiKey,
            baseUrl,
            model,
            temperature: 0.4,
            maxTokens: 220,
            messages: [
              { role: "system", content: LINE_AI_SYSTEM_PROMPT_PERSONAL },
              { role: "user", content: `${LINE_AI_USER_GUIDE_PERSONAL}\n\nINPUT:\n${JSON.stringify(input)}` },
            ],
          });
          const jsonText = _extractJsonBlock(raw);
          const parsed = _safeJsonParse(jsonText || raw);
          const prose = parsed && typeof parsed === "object" && typeof parsed.prose === "string"
            ? parsed.prose
            : raw;
          const cleaned = _limitProseSentences(prose || "", 2, 111);
          if (_containsBannedTokens(cleaned, banned)) {
            if (LINE_AI_DEBUG) {
              console.error("[line_today] generateProse: banned tokens hit", cleaned);
            }
            continue;
          }
          return cleaned;
        } catch (_) {
          if (LINE_AI_DEBUG) console.error("[line_today] generateProse: LLM error", _);
          // retry
        }
      }
      return _fallbackProseFromTokens(input);
    };

    aiPersonal = {
      inner: { prose: await generateProse(buildInput("inner", personalPick.inner)) },
      outer: { prose: await generateProse(buildInput("outer", personalPick.outer)) },
      third: {
        prose: await generateProse(buildInput("third", personalPick.rare || personalPick.flow)),
      },
    };
  }

  // ---------- public (top 5) — only when personal is not available
  if (!hasPersonal && publicTop.length) {
    parts.push(`🌌 今日のソラ｜そら｜${dateLabel}`);
    parts.push("【今日のソラの配置｜上位5共鳴（orb≤6°）】");
    parts.push(SEP);
    for (let i = 0; i < publicTop.length; i++) {
      const item = publicTop[i];
      const ai = aiPublic[i] || {};
      const header = _formatPublicAspectLine(
        dict,
        item,
        `${RENDER_COPY?.CIRCLES?.[i] || ["①", "②", "③", "④", "⑤"][i]} `
      );
      const roles = _roleLinePublic(dict, item);
      const kwFallback = _fallbackKwPublic(dict, item, `${dateLabel}|public|${i}`);
      parts.push(
        [
          header,
          roles,
          _formatStructureLine(ai.s1, ai.s2),
          _formatKeywordsLine(ai.keywords, kwFallback),
        ]
          .filter(Boolean)
          .join("\n")
      );
      if (i < publicTop.length - 1) parts.push(SEP);
    }
    parts.push(SEP);

    const moonLine = story?.public?.moon_sign
      ? `🌙 月：${_signJa(dict, story.public.moon_sign)}`
      : "";
    if (moonLine) parts.push(moonLine);

    const distLines = _formatDistLines(distCounts);
    if (distLines.length) parts.push(...distLines);

    if (aiSkyLayer?.line1 || aiSkyLayer?.line2) {
      const fallbackDom = _fallbackDomLabel(story);
      const domElement =
        skyLayerHints?.dominant_element?.label_ja ||
        fallbackDom.element ||
        "";
      const domModality =
        skyLayerHints?.dominant_modality?.label_ja ||
        fallbackDom.modality ||
        "";
      if (domElement || domModality) {
        parts.push(`【空層】${domElement}${domElement && domModality ? " × " : ""}${domModality}`.trim());
      } else {
        parts.push("【空層】");
      }
      if (aiSkyLayer.line1) parts.push(aiSkyLayer.line1);
      if (aiSkyLayer.line2) parts.push(aiSkyLayer.line2);
    }

    parts.push("解釈は、あなたのもの。");
    parts.push("星は語る。決めるのは、人。");
    parts.push("そらとして、眺めてみてね。🌌");
  }

  // ---------- personal
  if (hasPersonal) {
    parts.push(`🌌 今日のソラのこえ。｜${dateLabel}`);
    parts.push("");
    parts.push("【あなたの星 × きょうのそら】");
    parts.push("");
    parts.push(SEP);
    parts.push("");

    const aiInner = aiPersonal?.inner || {};
    const aiOuter = aiPersonal?.outer || {};
    const aiThird = aiPersonal?.third || {};
    const usedKw = new Set();

    const block = (label, index, item, ai, mode = "") => {
      if (!item) return;
      const payload = _personalAspectPayload(dict, item);
      if (!payload) return;
      payload._seed = dateLabel;
      const seedLabel = `${dateLabel}|${mode}|${item?.natal_body_or_point || item?.natal_body || item?.a || ""}|${item?.transit_body || item?.b || ""}|${item?.aspect || item?.type || item?.aspectType || ""}|${item?.natal_sign_key || item?.natal_sign || item?.a_sign_key || ""}|${item?.transit_sign_key || item?.transit_sign || item?.b_sign_key || ""}`;
      const roles = _roleLinePersonalDynamic(dict, item, seedLabel);
      const proseText = ai?.prose || "";
      const structure = proseText ? _formatStructureParagraph(proseText) : "";
      const keywordBlock = _formatKeywordsBlockPersonal(
        dict,
        item,
        `${dateLabel}|personal|${index}`,
        [],
        usedKw
      );
      const blockLines = [
        label,
        "",
        _formatPersonalAspectLineFromPayload(payload, `${index} `),
        roles || null,
        "",
        structure,
        "",
        keywordBlock,
      ].filter((v) => v !== null);
      parts.push(...blockLines);
    };

    block("🌗 内側の反応点", "①", personalPick.inner, aiInner, "inner");
    parts.push("");
    parts.push(SEP);
    parts.push("");
    block("☀️ 外に出やすい反応", "②", personalPick.outer, aiOuter, "outer");
    parts.push("");
    parts.push(SEP);
    parts.push("");

    if (personalPick.rare) {
      block("✶ レア共鳴", "③", personalPick.rare, aiThird, "rare");
    } else {
      block("🌿 自然に流れるところ", "③", personalPick.flow, aiThird, "flow");
    }

    parts.push("");
    parts.push(SEP);
    parts.push("");

    const sunSign =
      story?.public?.transit_signs?.sun?.sign_ja ||
      _signJa(dict, story?.public?.transit_signs?.sun?.sign_key || "");
    if (sunSign) {
      parts.push(`☀️ 太陽：${sunSign}`);
      parts.push("");
    }

    const phase = _moonPhaseInfo(story);
    const moonSign =
      story?.public?.moon?.sign_ja ||
      _signJa(dict, story?.public?.moon?.sign_key || story?.public?.moon_sign_key || story?.public?.moon_sign || "");
    if (moonSign) {
      const moonLine = `${phase?.emoji || "🌙"} 月：${moonSign}${phase?.name ? `（${phase.name}）` : ""}`;
      parts.push(moonLine);
      parts.push("");
    }

    const fallbackDom = _fallbackDomLabel(story);
    const fallbackDomPublic = _fallbackDomFromPublicSky(story, dict);
    const domElement =
      personalLayerHints?.dominant_element?.label_ja ||
      fallbackDom.element ||
      fallbackDomPublic.element ||
      skyLayerHints?.dominant_element?.label_ja ||
      "";
    const domModality =
      personalLayerHints?.dominant_modality?.label_ja ||
      fallbackDom.modality ||
      fallbackDomPublic.modality ||
      skyLayerHints?.dominant_modality?.label_ja ||
      "";

    parts.push(`【空層】${domElement}${domElement && domModality ? "×" : ""}${domModality}`.trim());
    parts.push("");

    const generateLayerLine = async (input) => {
      if (!input) return "";
      if (!canCallLLM) return "";
      const bannedLayer = input?.banned || [];
      for (let i = 0; i < 2; i++) {
        try {
          const raw = await createChatCompletion({
            apiKey,
            baseUrl,
            model,
            temperature: 0.4,
            maxTokens: 120,
            messages: [
              { role: "system", content: LINE_AI_SYSTEM_PROMPT_LAYER },
              { role: "user", content: `${LINE_AI_USER_GUIDE_LAYER}\n\nINPUT:\n${JSON.stringify(input)}` },
            ],
          });
          const jsonText = _extractJsonBlock(raw);
          const parsed = _safeJsonParse(jsonText || raw);
          const line1 = parsed && typeof parsed === "object" && typeof parsed.line1 === "string"
            ? parsed.line1
            : raw;
          const cleaned = _limitProseSentences(line1 || "", 1, 80);
          if (_containsBannedTokens(cleaned, bannedLayer)) continue;
          return cleaned;
        } catch (_) {
          // retry
        }
      }
      return "";
    };

    const layerInput = {
      element: domElement,
      modality: domModality,
      banned: LINE_AI_BANNED_TOKENS_PERSONAL,
      seed: `${dateLabel}|layer|${domElement}|${domModality}`,
    };
    const aiLayerLine = aiPersonalLayer?.line1 || await generateLayerLine(layerInput);
    const pLayer1 =
      aiLayerLine ||
      aiSkyLayer?.line1 ||
      _fallbackPersonalLayerLine(domElement, domModality);
    if (pLayer1) parts.push(pLayer1);

    parts.push("");
    parts.push("解釈は、あなたのもの。");
    parts.push("星は語る。決めるのは、人。🌎️🛸✨️");
    parts.push("");
    parts.push("──");
    parts.push("");
    parts.push("必要な人は、次に");
    parts.push("「そら」");
    parts.push("と送ってみてね。");
    parts.push("今日のソラの配置一覧が出るよ🌌");
  }

  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* =========================
 * main
 * ========================= */
function renderLineDict(story, deps = {}) {
  const {
    tpKey,
    getSkyLayers,
    pickCenterPublicContact,
    pickSecretPublicContact,
    buildNoContactLine,
    buildYoinLine,
    buildNowModernPlanetCounts,
    buildPersonalTPCounts,
    buildDistLinesFromcounts,
    RENDER_COPY,
  } = deps || {};

  const { fmtPersonalTPLine, fmtPersonalTPBlock, fmtPublicSkyLine, fmtPublicSkyBlock } =
    resolveFormatters(deps);

  // ✅ 「もとに」寄せる：LINE用は基本 “Line formatter” を使う（Blockは保険）
  const fmtTP = fmtPersonalTPLine || fmtPersonalTPBlock;
  const fmtSky = fmtPublicSkyLine || fmtPublicSkyBlock;

  const dateLabel = String(story?.meta?.date_local || "").replace(/-/g, ".");
  const layers = typeof getSkyLayers === "function" ? getSkyLayers(story) : null;
  const hasPersonal = !!layers;

  const HEAD_LAYERS = RENDER_COPY?.HEAD_LAYERS || {
    THEME: "【今日の中心（触れやすい場所）】",
    TOUCH: "【引っかかりやすい接点】",
    HIDDEN: "【ひそかな接点】",
  };
  const CIRCLES = RENDER_COPY?.CIRCLES || ["①", "②", "③"];
  const SEP = RENDER_COPY?.LINE_SEP || "─────────────";

  const parts = [];
  const used = new Set();
  const tpsShown = [];
  const tpKeyFn = typeof tpKey === "function" ? tpKey : defaultTpKey;
  const pickFirstUnused = (list) => {
    const arr = Array.isArray(list) ? list : [];
    for (const item of arr) {
      if (!item) continue;
      const k = tpKeyFn(item);
      if (used.has(k)) continue;
      return item;
    }
    return null;
  };

  // --------------------
  // personal first
  // --------------------
  if (hasPersonal && typeof fmtTP === "function") {
    const theme0 = layers.theme?.[0] || null;
    const touch = Array.isArray(layers.touch) ? layers.touch : [];
    const hidden0 = layers.hidden?.[0] || null;

    if (theme0) {
      used.add(tpKeyFn(theme0));
      tpsShown.push(theme0);
      const line = formatWithFlavor({
        story,
        item: theme0,
        prefix: `${CIRCLES[0]} `,
        deps,
        baseFormatter: fmtTP,
        flavorMode: "personal",
      });
      parts.push(HEAD_LAYERS.THEME ? `${HEAD_LAYERS.THEME}\n${line}` : line);
    }

    if (touch[0]) {
      used.add(tpKeyFn(touch[0]));
      tpsShown.push(touch[0]);
      const line = formatWithFlavor({
        story,
        item: touch[0],
        prefix: `${CIRCLES[1]} `,
        deps,
        baseFormatter: fmtTP,
        flavorMode: "personal",
      });
      parts.push(HEAD_LAYERS.TOUCH ? `${HEAD_LAYERS.TOUCH}\n${line}` : line);
    }

    const thirdCandidate =
      pickFirstUnused([touch[1], hidden0]) ||
      pickFirstUnused(touch.slice(2)) ||
      pickFirstUnused(layers.hidden) ||
      pickFirstUnused(layers.theme);

    if (thirdCandidate) {
      used.add(tpKeyFn(thirdCandidate));
      tpsShown.push(thirdCandidate);
      const line = formatWithFlavor({
        story,
        item: thirdCandidate,
        prefix: `${CIRCLES[2]} `,
        deps,
        baseFormatter: fmtTP,
        flavorMode: "personal",
      });
      parts.push(HEAD_LAYERS.HIDDEN ? `${HEAD_LAYERS.HIDDEN}\n${line}` : line);
    }

    if (!parts.length && typeof buildNoContactLine === "function") {
      parts.push(buildNoContactLine(story));
    }
  }

  // --------------------
  // public fallback（✅ここが重要：fmtSky を使う）
  // --------------------
  if (!parts.length) {
    const skyTop = Array.isArray(story?.public?.sky_top) ? story.public.sky_top : [];
    const center =
      skyTop?.[0] || (typeof pickCenterPublicContact === "function" ? pickCenterPublicContact(story) : null);
    const t1 = skyTop?.[1] || null;
    const t2 = skyTop?.[2] || null;

    if (center && typeof fmtSky === "function") {
      const line = formatWithFlavor({
        story,
        item: center,
        prefix: `${CIRCLES[0]} `,
        deps,
        baseFormatter: fmtSky,
        flavorMode: "sky",
      });
      parts.push(HEAD_LAYERS.THEME ? `${HEAD_LAYERS.THEME}\n${line}` : line);
    }

    if (t1 && typeof fmtSky === "function") {
      const line = formatWithFlavor({
        story,
        item: t1,
        prefix: `${CIRCLES[1]} `,
        deps,
        baseFormatter: fmtSky,
        flavorMode: "sky",
      });
      parts.push(HEAD_LAYERS.TOUCH ? `${HEAD_LAYERS.TOUCH}\n${line}` : line);
    }

    const secret = typeof pickSecretPublicContact === "function" ? pickSecretPublicContact(story) : null;
    const thirdSky = t2 || secret || null;
    if (thirdSky && typeof fmtSky === "function") {
      const line = formatWithFlavor({
        story,
        item: thirdSky,
        prefix: `${CIRCLES[2]} `,
        deps,
        baseFormatter: fmtSky,
        flavorMode: "sky",
      });
      parts.push(HEAD_LAYERS.HIDDEN ? `${HEAD_LAYERS.HIDDEN}\n${line}` : line);
    }

    if (!parts.length && typeof buildNoContactLine === "function") {
      parts.push(buildNoContactLine(story));
    }
  }

  // --------------------
  // yoin
  // --------------------
  const yoinRaw =
    typeof buildYoinLine === "function"
      ? hasPersonal
        ? buildYoinLine(story, { kind: "personal", statsScope: "all" })
        : buildYoinLine(story, { kind: "public", statsScope: "top" })
      : "";

  const yoin = clampYoin2(yoinRaw);

  // --------------------
  // dist
  // --------------------
  const distCounts =
    hasPersonal && typeof buildPersonalTPCounts === "function"
      ? buildPersonalTPCounts(tpsShown)
      : typeof buildNowModernPlanetCounts === "function"
        ? buildNowModernPlanetCounts(story)
        : null;

  const distLines =
    typeof buildDistLinesFromcounts === "function"
      ? buildDistLinesFromcounts(distCounts, { forX: false })
      : "";

  // --------------------
  // template hook
  // --------------------
  const tpl = RENDER_COPY?.TPL?.LINE?.buildMain;
  if (typeof tpl === "function") {
    return tpl({
      dateLabel,
      parts: parts.join(`\n\n${SEP}\n\n`),
      distLines,
      kusouYoin: yoin,
      footerLines: RENDER_COPY?.FOOTER_LINE,
      cta: RENDER_COPY?.LINE_MAIN_CTA,
    });
  }

  return buildLineMainFallback({
    dateLabel,
    parts: parts.join(`\n\n${SEP}\n\n`),
    distLines,
    kusouYoin: yoin,
    footerLines: RENDER_COPY?.FOOTER_LINE,
    cta: RENDER_COPY?.LINE_MAIN_CTA,
  });
}

async function renderLine(story, deps = {}) {
  try {
    return await renderLineAI(story, deps);
  } catch (e) {
    if (LINE_AI_DEBUG) console.error("[line_today] renderLineAI failed", e);
    try {
      return await renderLineAI(story, deps, { forceNoLLM: true });
    } catch (_) {
      if (LINE_AI_DEBUG) console.error("[line_today] renderLineAI fallback failed", _);
      // last resort
      return renderLineDict(story, deps);
    }
  }
}

module.exports = { renderLine, renderLineDict, renderSoraUraSilentPersonalLine };
