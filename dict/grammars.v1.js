"use strict";

/**
 * grammars.v1 — OPTIMIZED (v2026.02.04)
 * ------------------------------------------------------------
 * ゴール：
 * - 「語彙の役割混線」を grammar 側で吸収（重複・連打・同義反復を抑える）
 * - A-line のレイヤー分業を壊さない（relation/dynamics/process/tendency を増やさない）
 *
 * 方針：
 * - tendency は “温度調整” だけ。必要なら出る、不要なら出さない。
 * - 同義語の連打回避：同じ意味の語が近距離に出たら次の選択から除外。
 * - glue は薄く。意味語（重なり/つながり/循環）は極力持たない。
 */

/* =========================
 * 0) Safety (Do not)
 * ========================= */

const HARD_BANNED_PATTERNS = [
  /絶対/g,
  /必ず/g,
  /確実に/g,
  /運命/g,
  /正しい/g,
  /間違い/g,
  /良い|悪い/g,
  /べき/g,
  /しよう/g,
  /おすすめ/g,
  /成功|失敗/g,
  /恋愛運|金運|仕事運/g,
  /当たる/g,
  /未来/g,
  /〜になるだろう/g,
  /〜に違いない/g,
  /〜はずだ/g,
];

const SAFE_ENDINGS = [
  "…のような手触りとして残りやすい。",
  "…として浮かびやすい。",
  "…という質感で置かれやすい。",
  "…と感じる人もいるかもしれない。",
];

/* =========================
 * 1) Seeded RNG
 * ========================= */

function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/* =========================
 * 2) Utils (anti-dup)
 * ========================= */

function ensureString(x, fallback = "") {
  if (x === null || x === undefined) return fallback;
  const s = String(x).trim();
  return s ? s : fallback;
}

function normalizeJa(s) {
  return ensureString(s, "")
    .replace(/[ \t\r\n]+/g, " ")
    .replace(/[、,]+/g, "、")
    .trim();
}

/**
 * 近距離での同義語連打を避けるための “禁止グループ”
 * ここは現場の違和感に直結する語だけ入れる（広げすぎない）
 */
const DUP_GROUPS = [
  ["反復", "繰り返し", "反復と", "試行錯誤", "調整の連続", "熟成"],
  ["整い", "整流", "整える", "まとまり", "輪郭", "形"],
  ["重なり", "融合", "同じ領域", "同席", "共存"],
  ["つながり", "接点", "通路", "橋", "回路"],
  ["循環", "行き来", "往復", "回る", "回転"],
];

function buildBanSetFromText(text) {
  const t = normalizeJa(text);
  const ban = new Set();

  for (const group of DUP_GROUPS) {
    const hit = group.some((w) => w && t.includes(w));
    if (hit) group.forEach((w) => ban.add(w));
  }

  // “やすい” 連打抑制（語尾の温度を落とす判定に使う）
  if (/やすい/.test(t)) ban.add("__HAS_YASU__");
  if (/として(現れ|残り|浮かび)/.test(t)) ban.add("__HAS_AS_NOUN__");

  return ban;
}

/**
 * pick with ban words
 */
function pickOneFiltered(arr, rand, banSet) {
  if (!arr || arr.length === 0) return "";
  const pool = arr.filter((x) => {
    const w = String(x || "");
    if (!w) return false;
    if (!banSet) return true;
    // banSet に “完全一致” があれば除外（過剰に除外しない）
    return !banSet.has(w);
  });
  const use = pool.length ? pool : arr;
  const i = Math.floor(rand() * use.length);
  return use[i];
}

function pickWeighted(map, rand) {
  const entries = Object.entries(map || {});
  if (entries.length === 0) return null;
  const total = entries.reduce((s, [, w]) => s + (Number(w) || 0), 0);
  if (total <= 0) return entries[0][0];
  let roll = rand() * total;
  for (const [k, wRaw] of entries) {
    const w = Number(wRaw) || 0;
    roll -= w;
    if (roll <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

/* =========================
 * 3) Core Dictionary
 * ========================= */

const GRAMmars_V1 = {
  version: "grammars.v1.optimized",

  categories: {
    emergence: ["兆し", "反応", "立ち上がり", "揺れ", "気配", "動き", "引っかかり", "余韻"],
    force: ["圧", "張力", "作用", "引力", "熱", "推進力", "うねり", "ノイズ", "粘り", "負荷", "緊張"],
    // ※接続語は “意味語” を極力減らす（重なり/つながり/循環 をここで言わない）
    conjunctions: ["と", "および", "のあいだで", "の同時進行として", "が並び", "が共存し"],
    expression: [
      // 既存
      "表現", "言葉", "外への出方", "示し方", "手触り", "出力", "見え方", "反射",
      // sign_flavor.outputs（表現系）
      "ふるまい", "置き方", "出し方", "見せ方",
      // 逃げ道（主語弱いときに事故りにくい）
      "立ち位置", "距離感", "伝え方", "まとめ方", "対話のテンポ"
    ],
    noun_expression_pool: [
      "表現", "ふるまい", "置き方", "出し方", "見せ方",
      "反応", "守り方", "揺れ方", "安心の取り方", "距離の取り方",
      "言葉", "伝え方", "まとめ方", "説明の輪郭", "対話のテンポ"
    ],
    process: ["調整", "行き来", "手探り", "間引き", "保留", "折り合い", "試し書き"],
    clarity: ["輪郭", "手応え", "まとまり", "焦点", "粒度", "境界", "密度", "温度差"],
    direction: ["立ち", "残り", "前に出てき", "薄くなり", "溶け", "詰まり", "ほどけ"],
    texture: ["静けさ", "硬さ", "やわらかさ", "鋭さ", "鈍さ", "乾き", "湿り", "透明度", "粘性", "速度差"],
    locality: ["内側", "外側", "境界", "中心", "周縁", "背面", "足元", "胸のあたり", "体感の近く"],

    /**
     * tendency: “温度調整”だけに限定
     * - ✅ none を追加：語尾を付けない（＝tendency を沈める）
     * - “やすい”も残すが、出す頻度を下げる（weights側で制御）
     */
    tendency: {
      none: [{ key: "none", suffix: "" }],
      light: [
        { key: "remain", suffix: "として残ることがある" },
        { key: "appear", suffix: "として現れることがある" },
        { key: "hint", suffix: "の気配が混ざることがある" },
      ],
      mid: [
        { key: "theme", suffix: "がテーマとして浮かぶことがある" },
        { key: "rise", suffix: "が立ち上がることがある" },
        { key: "surface", suffix: "が表に出ることがある" },
      ],
      deep: [
        { key: "maybe", suffix: "と感じる人もいるかもしれない" },
        { key: "before_words", suffix: "が先に鳴って、言葉が後から追いつく人もいるかもしれない" },
      ],
    },

    softeners: ["決めなくてもよく", "結論を急がなくてもよく", "整理は後からでもよく", "そのまま置いてよく"],
    qualifiers: ["ひとまず", "いったん", "当面は", "部分的に", "局所的に", "断片的に", "静かに"],
    negations_soft: ["断定は避けるなら", "意味を固定しないなら", "名前を急がないなら"],
  },

  glue: {
    // “重なり/つながり” をここで言わない（ASPECT側が言う）
    pair: [
      "が並び",
      "が並走し",
      "が同席し",
      "が同時に動き",
      "が隣り合い",
      "が相互に触れ",
    ],
    aspect_like: [
      "として触れて",
      "として表に出て",
      "として浮かび",
      "として輪郭を取り",
      "として残り",
    ],
    contrast: ["一方で", "その裏で", "同時に", "ただ", "別の層では"],
  },

  templates: {
    /**
     * a_core（LINE/IG基調）：意味を増やさず “薄い接続 + 温度調整”
     * - {tendency_suffix} が空でも壊れないように、前に余白や句読点を置かない
     */
    a_core: [
      "{p1_role}と{p2_role}{glue_pair}、{aspect_core}の{noun_force}として{glue_aspect}。{noun_expression}は{noun_process}の中で、{noun_clarity}を持つ{tendency_suffix}。",
      "{s1_tone}空気の中で、{p1_role}が{glue_aspect}。{aspect_core}が絡み、{noun_expression}の{noun_clarity}が立つ{tendency_suffix}。",
      "{p1_role}が前に出て、{p2_role}は背景で動く配置。{noun_process}を通して、{noun_clarity}が整う{tendency_suffix}。",
      "{qualifier}、{aspect_sora}{tendency_suffix}。",
    ],

    b_short: [
      "{aspect_core}の回路。{p1_role}の{noun_force}が残る{tendency_suffix}。",
      "{s1_tone}の空気。{aspect_sora}{tendency_suffix}。",
      "{p1_role}と{p2_role}{glue_pair}。{noun_expression}の{noun_clarity}が立つ{tendency_suffix}。",
    ],

    c_detail: [
      "{p1_role}と{p2_role}{glue_pair}、{aspect_core}の{noun_force}として{glue_aspect}。{glue_contrast}{noun_expression}は{noun_process}を挟み、{noun_clarity}の出方が変わる{tendency_suffix}。{softener}。",
      "{s1_tone}空気が先に立ち、{p1_role}が{glue_aspect}。{aspect_core}が絡み、{noun_texture}が{noun_locality}に残る{tendency_suffix}。{softener}。",
    ],

    disclaimers: {
      line: [
        "※これは占いではなく、配置の“構造”をそのまま記録しています。",
        "※意味づけや解釈は固定しません。受け取り方はあなたのまま。",
      ],
      web: [
        "※ここでは、天体配置を「意味」ではなく「構造」として記録します。",
        "※判断・予測・行動の指示は行いません。",
      ],
    },
  },

  selectors: {
    signFlavorPriority: ["tone", "sora_short", "core", "name"],
    planetRolePriority: ["role", "core", "name"],
    aspectLinePriority: ["prose_ja.result", "sora_short", "core", "name"],
  },

  /**
   * weights 調整：
   * - tendency は “none” を増やす（≒語尾の付与を減らす）
   * - deep は deep でも none が混ざる（連打回避）
   */
  weights: {
    channelTemplateBias: {
      line: { a_core: 0.78, c_detail: 0.18, b_short: 0.04 },
      x: { b_short: 0.92, a_core: 0.08, c_detail: 0.0 },
      threads: { b_short: 0.75, a_core: 0.22, c_detail: 0.03 },
      ig: { a_core: 0.62, c_detail: 0.34, b_short: 0.04 },
      note: { c_detail: 0.72, a_core: 0.24, b_short: 0.04 },
      web: { c_detail: 0.62, a_core: 0.34, b_short: 0.04 },
    },
    depthTendencyBias: {
      light: { none: 0.55, light: 0.40, mid: 0.05, deep: 0.0 },
      mid: { none: 0.45, light: 0.25, mid: 0.25, deep: 0.05 },
      deep: { none: 0.35, light: 0.15, mid: 0.30, deep: 0.20 },
    },
  },
};

/* =========================
 * 4) Sanitize / format
 * ========================= */

function sanitize(text) {
  let t = ensureString(text, "");
  t = t.replace(/\s+/g, " ").trim();

  for (const re of HARD_BANNED_PATTERNS) {
    if (re.test(t)) {
      t = t
        .replace(/絶対|必ず|確実に/g, "かなり")
        .replace(/運命/g, "流れ")
        .replace(/正しい|間違い/g, "一つの見方")
        .replace(/良い|悪い/g, "強い/弱い")
        .replace(/べき/g, "してもよい")
        .replace(/しよう/g, "してみる余地")
        .replace(/おすすめ/g, "選択肢")
        .replace(/成功|失敗/g, "反応")
        .replace(/当たる/g, "一致する")
        .replace(/未来/g, "この配置")
        .replace(/〜になるだろう|〜に違いない|〜はずだ/g, "…のように見える");
    }
  }

  // 句点付与
  if (!/[。！？…]$/.test(t)) t += "。";

  // よくある崩れ修正（軽く）
  t = t.replace(/、、+/g, "、");
  t = t.replace(/。。+/g, "。");
  t = t.replace(/、。/g, "。");
  t = t.replace(/ \./g, ".");

  return t;
}

function formatTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    return v === undefined || v === null ? "" : String(v);
  });
}

/* =========================
 * 5) Variable builder (dup-aware)
 * ========================= */

function buildVars({ rand, depth, channel, tokens }) {
  const cat = GRAMmars_V1.categories;
  const glue = GRAMmars_V1.glue;

  // ban set: tokensに含まれる語（反復/整い/重なり/つながり/循環 等）を拾って抑制
  const ban = new Set();
  const tokenText = [
    tokens?.p1_role,
    tokens?.p2_role,
    tokens?.s1_tone,
    tokens?.s2_tone,
    tokens?.aspect_core,
    tokens?.aspect_sora,
  ]
    .filter(Boolean)
    .map(normalizeJa)
    .join(" ");
  buildBanSetFromText(tokenText).forEach((x) => ban.add(x));

  // tendency bucket
  const bias = GRAMmars_V1.weights.depthTendencyBias[depth] || GRAMmars_V1.weights.depthTendencyBias.mid;
  let tendBucket = pickWeighted(bias, rand) || depth;

  // “やすい/として〜”がすでに入ってるなら tendency を沈める（noneへ寄せる）
  if (ban.has("__HAS_YASU__") || ban.has("__HAS_AS_NOUN__")) {
    // 強制ではなく確率で沈める（文体の呼吸を残す）
    if (rand() < 0.75) tendBucket = "none";
  }

  const tendencyObj =
    pickOneFiltered(cat.tendency[tendBucket] || cat.tendency.none, rand, null) || { suffix: "" };

  const softener = pickOneFiltered(cat.softeners, rand, null);
  const qualifier = pickOneFiltered(cat.qualifiers, rand, null);

  const p1_role = ensureString(tokens?.p1_role, "ある役割（天体）");
  const p2_role = ensureString(tokens?.p2_role, "別の役割（天体）");
  const s1_tone = ensureString(tokens?.s1_tone, ensureString(tokens?.s2_tone, ""));
  const s2_tone = ensureString(tokens?.s2_tone, "");
  const aspect_core = ensureString(tokens?.aspect_core, ensureString(tokens?.aspect_sora, "ある角度関係"));
  const aspect_sora = ensureString(tokens?.aspect_sora, aspect_core);

  // nouns: banに引っかかる語（反復/整い/重なり/つながり等）を選ばない
  return {
    p1_role,
    p2_role,
    s1_tone,
    s2_tone,
    aspect_core,
    aspect_sora,

    glue_pair: pickOneFiltered(glue.pair, rand, ban),
    glue_aspect: pickOneFiltered(glue.aspect_like, rand, ban),
    glue_contrast: pickOneFiltered(glue.contrast, rand, ban),

    noun_force: pickOneFiltered(cat.force, rand, ban),
    noun_process: pickOneFiltered(cat.process, rand, ban),
    noun_clarity: pickOneFiltered(cat.clarity, rand, ban),
    noun_expression: pickOneFiltered(cat.noun_expression_pool || cat.expression, rand, ban),
    noun_texture: pickOneFiltered(cat.texture, rand, ban),
    noun_locality: pickOneFiltered(cat.locality, rand, ban),

    tendency_suffix: tendencyObj.suffix ? ` ${tendencyObj.suffix}` : "",
    softener,
    qualifier,
  };
}

/* =========================
 * 6) Template selection
 * ========================= */

function chooseTemplateKey({ rand, channel }) {
  const bias = GRAMmars_V1.weights.channelTemplateBias[channel] || GRAMmars_V1.weights.channelTemplateBias.line;
  return pickWeighted(bias, rand) || "a_core";
}

function chooseTemplate({ rand, channel }) {
  const key = chooseTemplateKey({ rand, channel });
  const pool = GRAMmars_V1.templates[key] || GRAMmars_V1.templates.a_core;
  const tpl = pool[Math.floor(rand() * pool.length)] || GRAMmars_V1.templates.a_core[0];
  return { key, tpl };
}

/* =========================
 * 7) Public API
 * ========================= */

function composeAutoCompressText({
  seed = "",
  channel = "line",
  depth = "mid",
  tokens = {},
  withDisclaimer = false,
} = {}) {
  const seedStr = ensureString(seed, "seed");
  const rand = mulberry32(hash32(seedStr));

  const { tpl } = chooseTemplate({ rand, channel });
  const vars = buildVars({ rand, depth, channel, tokens });

  let text = formatTemplate(tpl, vars);

  // deep時の“否定の余白”は少量だけ（多すぎると説明になる）
  if (depth === "deep" && rand() < 0.18) {
    text += " " + pickOneFiltered(GRAMmars_V1.categories.negations_soft, rand, null) + "。";
  }

  text = sanitize(text);

  // まれに強い終止のときの保険
  if (rand() < 0.05) {
    const end = SAFE_ENDINGS[Math.floor(rand() * SAFE_ENDINGS.length)];
    if (end) text = text.replace(/[。！？]$/, "。") + " " + end;
    text = sanitize(text);
  }

  if (withDisclaimer) {
    const dPool =
      (GRAMmars_V1.templates.disclaimers && GRAMmars_V1.templates.disclaimers[channel]) ||
      GRAMmars_V1.templates.disclaimers.line;
    const d1 = dPool[Math.floor(rand() * dPool.length)];
    const d2 = dPool[Math.floor(rand() * dPool.length)];
    const disclaimer = [d1, d2].filter(Boolean).join("\n");
    text += "\n" + disclaimer;
  }

  return text;
}

function composeAutoCompressResult({
  seed = "",
  channel = "line",
  depth = "mid",
  tokens = {},
  withDisclaimer = false,
} = {}) {
  const seedStr = ensureString(seed, "seed");
  const rand = mulberry32(hash32(seedStr));

  const { key, tpl } = chooseTemplate({ rand, channel });
  const vars = buildVars({ rand, depth, channel, tokens });

  let text = formatTemplate(tpl, vars);
  text = sanitize(text);

  if (withDisclaimer) {
    const dPool =
      (GRAMmars_V1.templates.disclaimers && GRAMmars_V1.templates.disclaimers[channel]) ||
      GRAMmars_V1.templates.disclaimers.line;
    text += "\n" + dPool[Math.floor(rand() * dPool.length)];
  }

  return {
    version: GRAMmars_V1.version,
    channel,
    depth,
    templateKey: key,
    template: tpl,
    vars,
    text,
  };
}

module.exports = {
  GRAMmars_V1,
  composeAutoCompressText,
  composeAutoCompressResult,
};
