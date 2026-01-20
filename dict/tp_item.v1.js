"use strict";

const { ASPECTS_V1 } = require("../dict/aspects.v1");

// deep_space を “短いキー” で引けるように寄せる（必要最低限）
const DEEP_SPACE_ALIAS = Object.freeze({
  semi_sextile: "semi_sextile_30",
  semi_square: "semi_square_45",
  sesquisquare: "sesqui_square_135",
  inconjunct: "quincunx_150",
  quincunx: "quincunx_150",
  quintile: "quintile_72",
  biquintile: "biquintile_144",
});

// ASPECTS_V1 から「短文サマリー」を作る
function buildSummaryByAspect() {
  const out = {};

  // major
  const major = ASPECTS_V1?.major || {};
  for (const [k, v] of Object.entries(major)) {
    // 例: sextile / square ...
    out[k] = `→ ${v?.sora || `「${v?.core || "—"}」の配置。`}`;
  }

  // deep_space（使う可能性があるものだけ）
  const ds = ASPECTS_V1?.deep_space || {};
  for (const [shortKey, longKey] of Object.entries(DEEP_SPACE_ALIAS)) {
    const v = ds?.[longKey];
    if (v) out[shortKey] = `→ ${v?.sora || `「${v?.core || "—"}」の配置。`}`;
  }

  // septile系は “family” なので type が来たら一旦ここに寄せる
  if (ds?.septile_family) {
    out.septile_family = `→ ${ds.septile_family?.sora || "→ 理屈の外側で結びつきが出やすい配置。"}`;
  }

  return Object.freeze(out);
}

const TP_ITEM_V1 = Object.freeze({
  // サイン＝「場」（文章用）
  COPY_SIGN_FIELD: Object.freeze({
    aries: "衝動／始動",
    taurus: "身体／感覚／定着",
    gemini: "情報／言葉／行き来",
    cancer: "内側／保護／記憶",
    leo: "表現／中心／誇り",
    virgo: "整える／微調整／実務",
    libra: "関係／均衡／美意識",
    scorpio: "深層／境界／変容",
    sagittarius: "視野／探索／意味",
    capricorn: "構造／責任／積み上げ",
    aquarius: "刷新／観測／自由",
    pisces: "溶解／共鳴／余韻",
  }),

  // 天体＝「作用」（文章用）
  COPY_PLANET_ACTION: Object.freeze({
    Sun: "中心／意志／生の火",
    Moon: "感情／反応／安心",
    Mercury: "思考／言葉／接続",
    Venus: "好み／関係／価値",
    Mars: "衝動／実行／熱",
    Jupiter: "拡張／意味／可能性",
    Saturn: "枠組み／責任／鍛錬",
    Uranus: "刷新／解放／突然性",
    Neptune: "溶解／夢／境界の薄さ",
    Pluto: "変容／極点／再生",
  }),

  // ✅ ここが肝：ASPECTS_V1 から生成した “→短文”
  SUMMARY_BY_ASPECT: buildSummaryByAspect(),
});

module.exports = { TP_ITEM_V1 };
