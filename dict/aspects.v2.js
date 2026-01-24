"use strict";

/**
 * aspects.v2
 * - V1互換のキーは維持（deg/key/label_ja/core/feel/sora/ai_tags など）
 * - V2追加：relation / adverbs / clause / tendency_key
 *
 * 目的：
 * - render/fusion が「交差し、」みたいな説明語を持たずに
 *   aspect側の relation で “関係そのもの” を表現できるようにする
 * - 判断しない／予測しない／行動を促さない を維持したまま、文の呼吸を作る
 *
 * tendency_key:
 * - GRAMMARS_V1.categories.tendency の light/mid/deep のどれを寄せやすいか（重み付け用ヒント）
 */
const ASPECTS_V2 = {
  version: "aspects.v2",

  major: {
    conjunction: {
      deg: 0,
      key: "conjunction",
      label_ja: "コンジャンクション",
      core: "重なり・融合・増幅",
      feel: ["強い", "密度が高い", "無自覚に出る"],
      sora: "同じ領域でエネルギーが重なり、性質が強く表れやすい配置。",
      ai_tags: ["dense", "merge"],

      // ---- V2 add
      relation: "同じ領域で重なりやすく",
      adverbs: ["濃く", "一気に", "同じ場所で", "まとめて", "無自覚に"],
      clause: "同じ領域で重なりやすく、",
      tendency_key: "light",
    },

    sextile: {
      deg: 60,
      key: "sextile",
      label_ja: "セクスタイル",
      core: "チャンス・協力・選択肢",
      feel: ["通路ができる", "橋がかかる", "選べる幅が増える"],
      sora: "噛み合うポイントが生まれやすく、選択肢や協力の回路が開きやすい配置。",
      ai_tags: ["option", "bridge"],

      // ---- V2 add
      relation: "接点としてつながりやすく",
      adverbs: ["通路として", "橋がかかる形で", "選べる幅として", "協力の回路として"],
      clause: "接点としてつながりやすく、",
      tendency_key: "light",
    },

    square: {
      deg: 90,
      key: "square",
      label_ja: "スクエア",
      core: "摩擦・調整・ズレ",
      feel: ["引っかかる", "止まりやすい", "試行錯誤が出る"],
      sora: "進行方向の異なる力が交差し、摩擦や調整ポイントが表に出やすい配置。",
      ai_tags: ["friction", "adjust"],

      // ---- V2 add
      relation: "摩擦として表に出やすく",
      adverbs: ["引っかかりながら", "試行錯誤しつつ", "止まりやすい形で", "調整を挟みながら"],
      clause: "摩擦として表に出やすく、",
      tendency_key: "mid",
    },

    trine: {
      deg: 120,
      key: "trine",
      label_ja: "トライン",
      core: "調和・才能・自然さ",
      feel: ["楽", "自然", "当たり前すぎて気づきにくい"],
      caution: "自然すぎて、輪郭が立たないこともある",
      sora: "エネルギーが自然に循環し、無理なく機能しやすい配置。",
      ai_tags: ["flow", "ease"],

      // ---- V2 add
      relation: "流れとして循環しやすく",
      adverbs: ["自然に", "無理なく", "当たり前のように", "滑らかに", "気づかれにくいまま"],
      clause: "流れとして循環しやすく、",
      tendency_key: "light",
    },

    opposition: {
      deg: 180,
      key: "opposition",
      label_ja: "オポジション",
      core: "対立・鏡・関係性",
      feel: ["引き合う", "外側に映る", "二極が立つ"],
      sora: "向かい合う位置関係により、テーマが『外側』に映りやすい配置。",
      ai_tags: ["mirror", "polarity"],

      // ---- V2 add
      relation: "関係性として外側に映りやすく",
      adverbs: ["対比で", "鏡として", "引き合いながら", "二極が立つ形で", "外側に投影されて"],
      clause: "関係性として外側に映りやすく、",
      tendency_key: "mid",
    },
  },

  deep_space: {
    enabled_by_default: false,

    semi_sextile_30: {
      deg: 30,
      key: "semi_sextile_30",
      label_ja: "セミセクスタイル",
      core: "気配レベルの関係",
      feel: ["かすかな接点", "ほぼ無意識", "気配で反応する"],
      sora: "意識の外側で、かすかな接点が生まれやすい配置。",
      ai_tags: ["subtle", "hint"],

      relation: "気配として触れやすく",
      adverbs: ["かすかに", "無意識の外側で", "気配のまま", "音にならないまま"],
      clause: "気配として触れやすく、",
      tendency_key: "deep",
    },

    semi_square_45: {
      deg: 45,
      key: "semi_square_45",
      label_ja: "セミスクエア",
      core: "小さな苛立ち",
      feel: ["モヤモヤ", "微不快", "地味にひっかかる"],
      sora: "小さな引っかかりが出やすく、微調整のサインとして現れやすい配置。",
      ai_tags: ["micro_friction", "irritation"],

      relation: "微細な引っかかりとして出やすく",
      adverbs: ["地味に", "小さく", "繰り返し", "些細なところで", "言葉にならないまま"],
      clause: "微細な引っかかりとして出やすく、",
      tendency_key: "mid",
    },

    sesqui_square_135: {
      deg: 135,
      key: "sesqui_square_135",
      label_ja: "セスキスクエア",
      core: "蓄積された摩擦",
      feel: ["圧が溜まる", "限界感", "表面化しやすい"],
      sora: "積み重なった摩擦が表に出やすく、転換点として現れやすい配置。",
      ai_tags: ["pressure", "threshold"],

      relation: "蓄積が表面化しやすく",
      adverbs: ["溜まった分だけ", "限界に触れる形で", "圧のかたちで", "転換点として"],
      clause: "蓄積が表面化しやすく、",
      tendency_key: "mid",
    },

    quincunx_150: {
      deg: 150,
      key: "quincunx_150",
      label_ja: "インコンジャンクト",
      core: "噛み合わなさ・調整不能",
      feel: ["違和感", "説明できないズレ", "共通言語がない"],
      sora: "性質が異なり、自然に噛み合わせにくい配置（調整点が浮かびやすい）。",
      ai_tags: ["mismatch", "recalibration"],

      relation: "噛み合わなさとして浮かびやすく",
      adverbs: ["違和感として", "説明より先に", "共通言語の外で", "調整点として"],
      clause: "噛み合わなさとして浮かびやすく、",
      tendency_key: "deep",
    },

    quintile_72: {
      deg: 72,
      key: "quintile_72",
      label_ja: "クインタイル",
      core: "創造・職人芸",
      feel: ["工夫が出る", "ピンポイント", "独自の回路"],
      sora: "独自の工夫や創造の回路が現れやすい配置。",
      ai_tags: ["craft", "creative_edge"],

      relation: "工夫として現れやすく",
      adverbs: ["ピンポイントに", "独自の回路で", "職人的に", "ひらめきとして"],
      clause: "工夫として現れやすく、",
      tendency_key: "mid",
    },

    biquintile_144: {
      deg: 144,
      key: "biquintile_144",
      label_ja: "バイクインタイル",
      core: "創造の反復",
      feel: ["反復", "熟成", "試行錯誤で整う"],
      sora: "反復と試行錯誤を通じて、表現が熟成しやすい配置。",
      ai_tags: ["refine", "iteration"],

      relation: "反復の中で整いやすく",
      adverbs: ["繰り返しながら", "熟成する形で", "調整の連続として", "試行錯誤の末に"],
      clause: "反復の中で整いやすく、",
      tendency_key: "mid",
    },

    septile_family: {
      key: "septile_family",
      label_ja: "セプタイル系",
      core: "運命・神秘・説明不能",
      feel: ["理由が言語化しにくい", "意味が後から追いつく", "説明不能な引力"],
      sora: "理屈の外側で結びつきが生まれやすい配置（深宇宙専用）。",
      ai_tags: ["fate", "mystic"],

      relation: "理屈の外側で結びつきやすく",
      adverbs: ["説明不能なまま", "意味が後から追いつく形で", "言語化の外で", "引力として"],
      clause: "理屈の外側で結びつきやすく、",
      tendency_key: "deep",
    },
  },

  major_list: [
    { type: "conjunction", deg: 0 },
    { type: "sextile", deg: 60 },
    { type: "square", deg: 90 },
    { type: "trine", deg: 120 },
    { type: "opposition", deg: 180 },
  ],
};

module.exports = { ASPECTS_V2 };
