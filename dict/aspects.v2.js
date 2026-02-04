"use strict";

/**
 * aspects.v2 (OPTIMIZED + prose_ja)
 *
 * 最適化方針：
 * - relation / clause は「触れ方（距離・接点・交差・向かい・重なり）」のみ
 * - adverbs は “結果語” を削り、呼吸・質感だけに
 * - prose_ja.result は括弧なし、〜やすい連打を避ける
 * - 「説明」や「意味増殖」になりやすい語を relation から撤去
 */
const ASPECTS_V2 = {
  version: "aspects.v2",
  locale: "ja",

  major: {
    conjunction: {
      deg: 0,
      key: "conjunction",
      label_ja: "コンジャンクション",
      core: "重なり・融合・増幅",
      feel: ["強い", "密度が高い", "無自覚に出る"],
      sora: "同じ領域でエネルギーが重なり、性質が強く表れやすい配置。",
      ai_tags: ["dense", "merge"],

      // V2 fragments
      relation: "同じ領域で重なり",
      clause: "同じ領域で重なり",
      adverbs: ["同じ場所で", "濃く", "一気に", "まとめて", "無自覚に"],
      tendency_key: "light",

      prose_ja: {
        layers: [],
        result: "同じ領域で重なり、性質が濃く出やすい配置。",
        yasu: { deny_repeat: true, prefer: "名詞化" },
      },
    },

    sextile: {
      deg: 60,
      key: "sextile",
      label_ja: "セクスタイル",
      core: "チャンス・協力・選択肢",
      feel: ["通路ができる", "橋がかかる", "選べる幅が増える"],
      sora: "噛み合うポイントが生まれやすく、選択肢や協力の回路が開きやすい配置。",
      ai_tags: ["option", "bridge"],

      relation: "接点としてつながり",
      clause: "接点としてつながり",
      adverbs: ["通路として", "橋のように", "噛み合う点として", "選べる幅として"],
      tendency_key: "light",

      prose_ja: {
        layers: [],
        result: "接点としてつながり、噛み合う点が生まれる配置。",
        yasu: { deny_repeat: true, prefer: "名詞化" },
      },
    },

    square: {
      deg: 90,
      key: "square",
      label_ja: "スクエア",
      core: "摩擦・調整・ズレ",
      feel: ["引っかかる", "止まりやすい", "試行錯誤が出る"],
      sora: "進行方向の異なる力が交差し、摩擦や調整ポイントが表に出やすい配置。",
      ai_tags: ["friction", "adjust"],

      relation: "交差点として触れ",
      clause: "交差点として触れ",
      adverbs: ["引っかかりとして", "試行錯誤の中で", "ズレとして", "調整点として"],
      tendency_key: "mid",

      prose_ja: {
        layers: [],
        result: "進行方向の異なる力が交差し、摩擦や調整点が浮かぶ配置。",
        yasu: { deny_repeat: true, prefer: "名詞化" },
      },
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

      relation: "流れとして通り",
      clause: "流れとして通り",
      adverbs: ["自然に", "無理なく", "滑らかに", "当たり前のように", "気づかれにくいまま"],
      tendency_key: "light",

      prose_ja: {
        layers: [],
        result: "流れとして通り、無理なく機能する配置。",
        yasu: { deny_repeat: true, prefer: "名詞化" },
      },
    },

    opposition: {
      deg: 180,
      key: "opposition",
      label_ja: "オポジション",
      core: "対立・鏡・関係性",
      feel: ["引き合う", "外側に映る", "二極が立つ"],
      sora: "向かい合う位置関係により、テーマが外側に映りやすい配置。",
      ai_tags: ["mirror", "polarity"],

      relation: "向かい合い、外側に映り",
      clause: "向かい合い、外側に映り",
      adverbs: ["対比として", "鏡のように", "引き合いながら", "二極が立つ形で", "外側に投影されて"],
      tendency_key: "mid",

      prose_ja: {
        layers: [],
        result: "向かい合う形で外側に映り、鏡として見えやすい配置。",
        yasu: { deny_repeat: true, prefer: "名詞化" },
      },
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

      relation: "気配として触れ",
      clause: "気配として触れ",
      adverbs: ["かすかに", "音にならないまま", "無意識の外側で", "気配のまま"],
      tendency_key: "deep",

      prose_ja: {
        layers: [],
        result: "意識の外側で、かすかな接点として現れる配置。",
        yasu: { deny_repeat: true, prefer: "名詞化" },
      },
    },

    semi_square_45: {
      deg: 45,
      key: "semi_square_45",
      label_ja: "セミスクエア",
      core: "小さな苛立ち",
      feel: ["モヤモヤ", "微不快", "地味にひっかかる"],
      sora: "小さな引っかかりが出やすく、微調整のサインとして現れやすい配置。",
      ai_tags: ["micro_friction", "irritation"],

      relation: "微細な引っかかりとして触れ",
      clause: "微細な引っかかりとして触れ",
      adverbs: ["地味に", "小さく", "繰り返し", "些細なところで", "言葉になる前に"],
      tendency_key: "mid",

      prose_ja: {
        layers: [],
        result: "小さな引っかかりとして触れ、微調整点が浮かぶ配置。",
        yasu: { deny_repeat: true, prefer: "名詞化" },
      },
    },

    sesqui_square_135: {
      deg: 135,
      key: "sesqui_square_135",
      label_ja: "セスキスクエア",
      core: "蓄積された摩擦",
      feel: ["圧が溜まる", "限界感", "表面化しやすい"],
      sora: "積み重なった摩擦が表に出やすく、転換点として現れやすい配置。",
      ai_tags: ["pressure", "threshold"],

      relation: "蓄積の縁で触れ",
      clause: "蓄積の縁で触れ",
      adverbs: ["溜まった分だけ", "圧として", "限界の手前で", "転換点の気配として"],
      tendency_key: "mid",

      prose_ja: {
        layers: [],
        result: "積み重なった摩擦が輪郭を持ち、転換点として現れやすい配置。",
        yasu: { deny_repeat: true, prefer: "名詞化" },
      },
    },

    quincunx_150: {
      deg: 150,
      key: "quincunx_150",
      label_ja: "インコンジャンクト",
      core: "噛み合わなさ・調整不能",
      feel: ["違和感", "説明できないズレ", "共通言語がない"],
      sora: "性質が異なり、自然に噛み合わせにくい配置（調整点が浮かびやすい）。",
      ai_tags: ["mismatch", "recalibration"],

      relation: "噛み合わなさとして触れ",
      clause: "噛み合わなさとして触れ",
      adverbs: ["違和感として", "説明より先に", "共通言語の外で", "ズレとして"],
      tendency_key: "deep",

      prose_ja: {
        layers: [],
        result: "性質が異なり、自然に噛み合わせにくい配置。",
        yasu: { deny_repeat: true, prefer: "名詞化" },
      },
    },

    quintile_72: {
      deg: 72,
      key: "quintile_72",
      label_ja: "クインタイル",
      core: "創造・職人芸",
      feel: ["工夫が出る", "ピンポイント", "独自の回路"],
      sora: "独自の工夫や創造の回路が現れやすい配置。",
      ai_tags: ["craft", "creative_edge"],

      relation: "工夫の接点として触れ",
      clause: "工夫の接点として触れ",
      adverbs: ["ピンポイントに", "職人的に", "独自の回路で", "ひらめきとして"],
      tendency_key: "mid",

      prose_ja: {
        layers: [],
        result: "独自の工夫や創造の回路として現れる配置。",
        yasu: { deny_repeat: true, prefer: "名詞化" },
      },
    },

    biquintile_144: {
      deg: 144,
      key: "biquintile_144",
      label_ja: "バイクインタイル",
      core: "創造の反復",
      feel: ["反復", "熟成", "試行錯誤で整う"],
      sora: "反復と試行錯誤を通じて、表現が熟成しやすい配置。",
      ai_tags: ["refine", "iteration"],

      // ✅ 重複回避：relation は触れ方だけ、結果語は prose 側へ
      relation: "反復の接点として触れ",
      clause: "反復の接点として触れ",
      adverbs: ["繰り返しながら", "調整の連続として", "試行錯誤の中で"],
      tendency_key: "mid",

      prose_ja: {
        layers: [],
        result: "反復と試行錯誤を通じて、表現が熟成する配置。",
        yasu: { deny_repeat: true, prefer: "名詞化" },
      },
    },

    septile_family: {
      key: "septile_family",
      label_ja: "セプタイル系",
      core: "運命・神秘・説明不能",
      feel: ["理由が言語化しにくい", "意味が後から追いつく", "説明不能な引力"],
      sora: "理屈の外側で結びつきが生まれやすい配置（深宇宙専用）。",
      ai_tags: ["fate", "mystic"],

      relation: "理屈の外側で触れ",
      clause: "理屈の外側で触れ",
      adverbs: ["言語化の外で", "引力として", "説明不能なまま", "意味が後から追いつく形で"],
      tendency_key: "deep",

      prose_ja: {
        layers: [],
        result: "理屈の外側で結びつきが生まれる配置。",
        yasu: { deny_repeat: true, prefer: "名詞化" },
      },
    },
  },

  // 互換の既定順
  major_list: [
    { type: "conjunction", deg: 0 },
    { type: "sextile", deg: 60 },
    { type: "square", deg: 90 },
    { type: "trine", deg: 120 },
    { type: "opposition", deg: 180 },
  ],
};

module.exports = { ASPECTS_V2 };
