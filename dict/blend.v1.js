"use strict";

/**
 * blend.v1 (FULL INTEGRATED + A-line final)
 * - LEGACY: 既存文言（絶対に壊さない）
 * - VERTICAL: 現行LINE（2行＋→）
 * - FUSION: かけ合わせ統合（1文）
 * - ✅ A-LINE: 最終形A文テンプレ（媒体横断・最小単位）
 *
 * 原則：
 * - 予言しない
 * - 良し悪しを言わない
 * - 解釈を固定しない
 *
 * 設計：
 * - SIGN_FLAVOR_V1 / GRAMmars_V1 は “あれば使う / 無ければ落ちない”
 * - render 側は「この関数を呼ぶだけ」に寄せられる
 */

// ----------------------------
// Optional imports (safe)
// ----------------------------
let LOCAL_SIGN_FLAVOR_V1 = null;
let LOCAL_GRAMmars_V1 = null;

try {
  // 例: ../dict/sign_flavor_v1.js
  LOCAL_SIGN_FLAVOR_V1 = require("../dict/sign_flavor_v1")?.SIGN_FLAVOR_V1 || null;
} catch (e) {
  LOCAL_SIGN_FLAVOR_V1 = null;
}

try {
  // 例: ../dict/grammars.v1.js or ./grammars.v1.js
  LOCAL_GRAMmars_V1 =
    require("../dict/grammars.v1")?.GRAMmars_V1 ||
    require("./grammars.v1")?.GRAMmars_V1 ||
    null;
} catch (e) {
  LOCAL_GRAMmars_V1 = null;
}

// ----------------------------
// Helpers
// ----------------------------
function _getSignFlavor(dict) {
  return dict?.SIGN_FLAVOR_V1 || LOCAL_SIGN_FLAVOR_V1 || null;
}
function _getGrammars(dict) {
  return dict?.GRAMmars_V1 || LOCAL_GRAMmars_V1 || null;
}

// seed付きの安定選択（同じ入力→同じ文に寄せる）
function _hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function _pick(pool, seedStr, fallback = "") {
  if (!Array.isArray(pool) || pool.length === 0) return fallback;
  const h = _hash32(String(seedStr || ""));
  return pool[h % pool.length] ?? fallback;
}

// ----------------------------
// ✅ SIGN_FLAVOR_V1 を最優先に “A/B（素材）” を作る
// 優先: tone -> sora_short -> core -> (fallback)
// ----------------------------
function resolveFusionFieldLabel(dict, signKey) {
  const flavor = _getSignFlavor(dict);

  // signKey は "leo" / "virgo" etc を想定
  const entry = flavor?.[signKey] || null;

  // SIGN_FLAVOR_V1 の優先順
  const val =
    entry?.tone ||
    entry?.sora_short ||
    entry?.core ||
    null;

  if (val && typeof val === "string") return val.trim();

  // fallback（BLEND側の sign_field_ja に落とす）
  const fb = BLEND_V1?.fusion?.sign_field_ja?.[signKey];
  if (fb) return fb;

  // 最後の砦：キーそのもの
  return String(signKey || "");
}

// ----------------------------
// aspect.relation（ここが “アスペクトの唯一の役割” ）
// ※ 長い説明はしない。関係の仕方だけ返す。
// ----------------------------
const ASPECT_RELATION_V1 = Object.freeze({
  "コンジャンクション": ["が重なり", "が同じ場で重なり", "が重なって"],
  "セクスタイル": ["が噛み合い", "が噛み合って", "が通路を作り"],
  "スクエア": ["が摩擦として触れ", "がぶつかり", "が交差し"],
  "トライン": ["が自然に流れ", "が無理なく巡り", "が循環し"],
  "オポジション": ["が映し合い", "が向かい合い", "が鏡になり"],

  "セミセクスタイル": ["が気配として触れ", "が小さく接点を持ち", "がかすかに噛み合い"],
  "セミスクエア": ["が小さく引っかかり", "が微調整として触れ", "が引っかかりになり"],
  "セスキスクエア": ["が積み重なった摩擦として触れ", "が圧として表に出て", "が摩擦として前に出て"],
  "インコンジャンクト": ["が噛み合いにくく", "が合わなさとして触れ", "が調整として現れ"],
  "クインタイル": ["が工夫の回路になり", "が創造として噛み合い", "が独自の回路を作り"],
  "バイクインタイル": ["が反復で整い", "が熟成として進み", "が整い続け"],
});

function resolveAspectRelationJa(aspectLabelJa, seedStr) {
  const pool = ASPECT_RELATION_V1[aspectLabelJa] || [];
  return _pick(pool, seedStr, "が触れ");
}

// ----------------------------
// legacy / vertical で使う dynamics（既存のまま保持）
// ----------------------------
function resolveAspectDynamicsJa(aspectLabelJa) {
  const m = BLEND_V1?.fusion?.aspect_dynamics_ja || {};
  return m[aspectLabelJa] || "";
}
function resolvePlanetActionJa(planetKey) {
  const m = BLEND_V1?.fusion?.planet_action_ja || {};
  return m[planetKey] || "";
}

// ----------------------------
// 既存 fusion（互換のため残す）
// ----------------------------
function buildFusionSentenceJa(params = {}) {
  const {
    dict,
    natalSignKey,
    transitSignKey,
    natalPlanetKey,
    transitPlanetKey,
    aspectLabelJa,
    orb = null,
    mode = "personal", // "sky" も可
  } = params;

  const field_natal = resolveFusionFieldLabel(dict, natalSignKey);
  const field_transit = resolveFusionFieldLabel(dict, transitSignKey);

  const action_natal = resolvePlanetActionJa(natalPlanetKey) || "";
  const action_transit = resolvePlanetActionJa(transitPlanetKey) || "";

  const dynamics = resolveAspectDynamicsJa(aspectLabelJa) || "";

  // orb hint はいまは空でOK（煽らない）
  const orb_hint = "";

  if (mode === "sky") {
    return BLEND_V1.fusion.template_sky_ja
      .replace("{field_natal}", field_natal)
      .replace("{action_natal}", action_natal)
      .replace("{field_transit}", field_transit)
      .replace("{action_transit}", action_transit)
      .replace("{dynamics}", dynamics)
      .replace("{orb_hint}", orb_hint);
  }

  return BLEND_V1.fusion.template_ja
    .replace("{field_natal}", field_natal)
    .replace("{action_natal}", action_natal)
    .replace("{field_transit}", field_transit)
    .replace("{action_transit}", action_transit)
    .replace("{dynamics}", dynamics)
    .replace("{orb_hint}", orb_hint);
}

// ----------------------------
// ✅ 最終形A文（完全統合・最小単位）
// 〔A〕と〔B〕が〔relation〕、〔expression〕は〔process〕の中で〔clarity〕〔tendency〕。
// ----------------------------
function buildAlineFusionJa(params = {}) {
  const {
    dict,
    seed = "",

    // A/B の素材
    natalSignKey,
    transitSignKey,

    // アスペクト
    aspectLabelJa,

    // 断定を避ける深度（媒体で変えてOK）
    // "light" | "mid" | "deep"
    tendencyDepth = "light",
  } = params;

  const grammars = _getGrammars(dict);

  // 〔A〕〔B〕＝素材（サイン×天体由来の “場” ）
  // ※ 今回はまず SIGN_FLAVOR_V1 の “サイン側ラベル” を採用
  //    将来 “sign×planet flavor” に寄せるならここを差し替えるだけでOK
  const A = resolveFusionFieldLabel(dict, natalSignKey);
  const B = resolveFusionFieldLabel(dict, transitSignKey);

  // 〔aspect.relation〕＝関係の仕方だけ（外/内、鏡かどうか等は決めない）
  const relation = resolveAspectRelationJa(
    aspectLabelJa,
    `${seed}|rel|${aspectLabelJa}|${A}|${B}`
  );

  // 〔expression〕〔process〕〔clarity〕＝GRAMmars_V1 から選ぶ（無ければ安全フォールバック）
  const expressionPool = grammars?.categories?.expression || ["表現", "反応", "振る舞い", "選び方", "使い方"];
  const processPool = grammars?.categories?.process || ["試行錯誤", "調整", "行き来", "反復", "組み替え", "手探り"];
  const clarityPool = grammars?.categories?.clarity || ["輪郭", "形", "手応え", "重み", "まとまり"];

  const expression = _pick(expressionPool, `${seed}|expr|${A}|${B}|${aspectLabelJa}`, "表現");
  const process = _pick(processPool, `${seed}|proc|${A}|${B}|${aspectLabelJa}`, "調整");
  const clarity = _pick(clarityPool, `${seed}|clar|${A}|${B}|${aspectLabelJa}`, "輪郭");

  // 〔tendency〕＝断定しない語尾（suffix）
  const tPool =
    grammars?.categories?.tendency?.[tendencyDepth] ||
    grammars?.categories?.tendency?.light ||
    [{ suffix: "しやすい" }, { suffix: "になりやすい" }, { suffix: "として現れやすい" }];

  const tendency = _pick(tPool, `${seed}|tend|${tendencyDepth}|${A}|${B}|${aspectLabelJa}`, { suffix: "しやすい" })?.suffix || "しやすい";

  // ✅ A文：あなたの最終形に固定（これ以上足さない）
  return `${A}と${B}${relation}、${expression}は${process}の中で${clarity}を持ち${tendency}。`;
}

// ----------------------------
// ✅ A文テンプレ出力を blocks.fusion / blocks.sky_fusion で使いたい場合の補助
// （render側が「body_lines_ja」に入れる文をここで作る用）
// ----------------------------
function buildFusionBlockLinesJa(params = {}) {
  const { mode = "personal", useAline = true } = params;

  // A文を優先（最終形）
  if (useAline) {
    return [buildAlineFusionJa(params)];
  }

  // 互換（旧fusion）
  if (mode === "sky") {
    return [buildFusionSentenceJa({ ...params, mode: "sky" })];
  }
  return [buildFusionSentenceJa({ ...params, mode: "personal" })];
}

// ==================================================
// BLEND_V1 本体（あなたの貼ってくれたやつを保持）
// ==================================================
const BLEND_V1 = Object.freeze({
  version: "blend.v1",
  locale: "ja",

  // --------------------
  // Style / Layout rules
  // --------------------
  style: Object.freeze({
    block_gap: "\n\n",
    line_break: "\n",
    bullet: "・",
    arrow: "→",
    x: "×",
    dash: "｜",
    quote_open: "「",
    quote_close: "」",
  }),

  limits: Object.freeze({
    max_line_chars: 34,
    max_block_chars: 340,
    max_total_chars: 1800,
  }),

  // ==================================================
  // ① LEGACY：既存そのまま（文末固定）
  // ==================================================
  legacy: Object.freeze({
    aspect_sentence_by_label_ja: Object.freeze({
      "コンジャンクション": "同じ領域で重なり、性質が強く表れやすい配置。",
      "セクスタイル": "噛み合う通路ができ、協力や選択肢が開きやすい配置。",
      "スクエア": "進行方向の違いが交差し、摩擦や調整点が表に出やすい配置。",
      "トライン": "自然に循環しやすく、無理なく機能しやすい配置。",
      "オポジション": "外側（関係/出来事）に映りやすく、鏡として見えやすい配置。",

      "セミセクスタイル": "気配レベルの接点として現れやすく、意識の外で反応しやすい配置。",
      "セミスクエア": "小さな引っかかりとして出やすく、微調整のサインになりやすい配置。",
      "セスキスクエア": "積み重なった圧が表に出やすく、転換点の摩擦として現れやすい配置。",
      "インコンジャンクト": "自然に噛み合いにくく、合わせにいく調整圧が出やすい配置。",
      "クインタイル": "独自の工夫が生まれやすく、創造の回路として現れやすい配置。",
      "バイクインタイル": "反復と試行錯誤で熟成し、表現が整い続けやすい配置。",
    }),
  }),

  // ==================================================
  // ② VERTICAL：いまのLINE用（2行＋→）
  // ==================================================
  vertical: Object.freeze({
    planet_in_sign: Object.freeze({
      pattern_ja: "{sign}の{planet}：{sign_core}の領域で、{planet_core}",

      planet_core_override_ja: Object.freeze({
        sun: "中心／意志／生の火",
        moon: "感情／反応／安心",
        mercury: "思考／言葉／接続",
        venus: "好み／関係／価値",
        mars: "行動／衝動／境界",
        jupiter: "拡大／寛容／追い風",
        saturn: "枠組み／責任／鍛錬",
        uranus: "刷新／解放／突然性",
        neptune: "溶解／夢／境界の薄さ",
        pluto: "変容／極点／再生",
        chiron: "傷と癒し／学びの入口",
        asc: "入口／印象／身体感覚",
      }),

      sign_core_override_ja: Object.freeze({
        aries: "始まり／衝動／直線",
        taurus: "身体／感覚／定着",
        gemini: "情報／交換／軽さ",
        cancer: "居場所／保護／親密",
        leo: "表現／中心／誇り",
        virgo: "整える／分析／微調整",
        libra: "関係／バランス／美意識",
        scorpio: "深層／境界／変容",
        sagittarius: "拡張／探求／視野",
        capricorn: "構造／責任／積み上げ",
        aquarius: "刷新／観測／自由",
        pisces: "溶解／共鳴／余韻",
      }),
    }),

    aspect_sentence_by_label_ja: Object.freeze({
      // 差分上書き用（未定義は legacy を使う）
    }),
  }),

  // ==================================================
  // ③ FUSION：かけ合わせ統合（1文）※互換維持
  // ==================================================
  fusion: Object.freeze({
    sign_field_ja: Object.freeze({
      aries: "始まりの端",
      taurus: "定着の地層",
      gemini: "行き来の風",
      cancer: "内側の水辺",
      leo: "中心の灯",
      virgo: "整える手元",
      libra: "調律の場",
      scorpio: "境界の深部",
      sagittarius: "視野の外縁",
      capricorn: "現実の骨格",
      aquarius: "更新の視点",
      pisces: "溶解の場",
    }),

    planet_action_ja: Object.freeze({
      sun: "中心",
      moon: "反応",
      mercury: "言葉",
      venus: "価値",
      mars: "境界",
      jupiter: "拡大",
      saturn: "枠",
      uranus: "更新",
      neptune: "溶解",
      pluto: "圧",
      chiron: "傷の入口",
      asc: "入口",
    }),

    aspect_dynamics_ja: Object.freeze({
      "コンジャンクション": "性質が重なって強調されやすい",
      "セクスタイル": "噛み合う余白が生まれやすい",
      "スクエア": "摩擦や調整点が表に出やすい",
      "トライン": "自然に循環しやすい",
      "オポジション": "外側に映りやすく、鏡として見えやすい",

      "セミセクスタイル": "気配の接点として反応が出やすい",
      "セミスクエア": "小さな引っかかりとして微調整が起きやすい",
      "セスキスクエア": "積み重なった圧が摩擦として表に出やすい",
      "インコンジャンクト": "噛み合いにくさが調整として出やすい",
      "クインタイル": "工夫や創造の回路が立ち上がりやすい",
      "バイクインタイル": "反復で熟成し、整い続けやすい",
    }),

    orb_hint_ja: Object.freeze([
      { max: 0.3, text: "" },
      { max: 1.0, text: "" },
      { max: 3.0, text: "" },
    ]),

    template_ja:
      "{field_natal}で{action_natal}が動き、{field_transit}で{action_transit}がにじみ、{dynamics}{orb_hint}。",

    template_mini_ja:
      "{field_natal}と{field_transit}の間で、{dynamics}{orb_hint}。",

    template_micro_ja:
      "{dynamics}{orb_hint}。",

    template_sky_ja:
      "{field_natal}で{action_natal}が動き、{field_transit}で{action_transit}が重なり、{dynamics}{orb_hint}。",

    template_sky_mini_ja:
      "{field_natal}と{field_transit}の間で、{dynamics}{orb_hint}。",

    template_sky_micro_ja:
      "{dynamics}{orb_hint}。",
  }),

  // ==================================================
  // ④ BLOCK TEMPLATES（切替器）
  // ==================================================
  blocks: Object.freeze({
    legacy: Object.freeze({
      body_lines_ja: ["{arrow} {aspect_sentence}"],
    }),

    vertical: Object.freeze({
      body_lines_ja: ["{natal_blend}", "{transit_blend}", "{arrow} {aspect_sentence}"],
    }),

    fusion: Object.freeze({
      body_lines_ja: ["{fusion_sentence}"],
    }),

    sky_fusion: Object.freeze({
      body_lines_ja: ["{fusion_sentence}"],
    }),
  }),

  headers: Object.freeze({
    personal_aspect_ja:
      "{idx}ネイタル：{natal} × トランジット：{transit}｜{aspect}（{angle}°｜orb {orb}°）",
    sky_aspect_ja:
      "{idx}{a} × {b}｜{aspect}（{angle}°｜orb {orb}°）",
  }),
});

// --------------------------------------------------
// exports
// --------------------------------------------------
module.exports = {
  BLEND_V1,

  // 互換
  resolveFusionFieldLabel,
  resolveAspectDynamicsJa,
  resolvePlanetActionJa,
  buildFusionSentenceJa,

  // ✅ 最終形A文
  resolveAspectRelationJa,
  buildAlineFusionJa,

  // ✅ block用（renderがラクになる）
  buildFusionBlockLinesJa,
};
