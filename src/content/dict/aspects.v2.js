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
      feel: ["強い", "密度が高い", "無自覚に出る", "境目が曖昧", "濃く残る", "勢いが混ざる"],
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
      feel: ["通路ができる", "橋がかかる", "選べる幅が増える", "助走がつく", "接点が生きる", "相互に拾う"],
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
      feel: ["引っかかる", "止まりやすい", "試行錯誤が出る", "張りが続く", "摩擦が輪郭を持つ", "引き戻しがある"],
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
      feel: ["楽", "自然", "当たり前すぎて気づきにくい", "力が抜ける", "滑らかに進む", "馴染みやすい"],
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
      feel: ["引き合う", "外側に映る", "二極が立つ", "距離が立つ", "映りが強い", "二点が並ぶ"],
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
      feel: ["かすかな接点", "ほぼ無意識", "気配で反応する", "薄い重なり", "音にならない", "外側で触れる"],
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
      feel: ["モヤモヤ", "微不快", "地味にひっかかる", "薄いざらつき", "小さな抵抗", "軽い詰まり"],
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
      feel: ["圧が溜まる", "限界感", "表面化しやすい", "溜めが効く", "押し返し", "臨界が近い"],
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
      feel: ["違和感", "説明できないズレ", "共通言語がない", "合わせにくさ", "噛み合わなさ", "調整不能感"],
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
      feel: ["工夫が出る", "ピンポイント", "独自の回路", "癖のある伸び", "職人的", "一点突破"],
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
      feel: ["反復", "熟成", "試行錯誤で整う", "手数が増える", "磨きが進む", "工夫が続く"],
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

    // -------------------------------
    // novile family (9分割) — inward / integration
    // -------------------------------
    novile_40: {
      deg: 40,
      key: "novile_40",
      label_ja: "ノヴィル",
      core: "内的完成・静かな統合",
      feel: ["内側で落ち着く", "言葉にしない完成", "静かな成熟", "沈黙の統合", "内側で結ぶ", "静かに収まる"],
      sora: "内側で意味が落ち着き、静かな統合が起きやすい配置。",
      ai_tags: ["inward", "integration"],

      relation: "内側で静かに触れ",
      clause: "内側で静かに触れ",
      adverbs: ["静かに", "言葉になる前に", "内側で", "落ち着く形で"],
      tendency_key: "deep",

      prose_ja: {
        layers: [],
        result: "内側で意味が落ち着き、静かな統合として現れる配置。",
        yasu: { deny_repeat: true, prefer: "名詞化" },
      },
    },

    binovile_80: {
      deg: 80,
      key: "binovile_80",
      label_ja: "バイノヴィル",
      core: "内在化・静かな修復",
      feel: ["深部で整う", "内面の調律", "ゆっくり馴染む", "内側で修復", "静かな手直し", "馴染みが続く"],
      sora: "内面で整いが進み、静かな修復が起きやすい配置。",
      ai_tags: ["inward", "settle"],

      relation: "内面で馴染むように触れ",
      clause: "内面で馴染むように触れ",
      adverbs: ["ゆっくりと", "内側で", "馴染むように", "静かに"],
      tendency_key: "deep",

      prose_ja: {
        layers: [],
        result: "内面で整いが進み、静かな修復として現れる配置。",
        yasu: { deny_repeat: true, prefer: "名詞化" },
      },
    },

    quadranovile_160: {
      deg: 160,
      key: "quadranovile_160",
      label_ja: "クアドラノヴィル",
      core: "内的完成の輪郭",
      feel: ["仕上がる", "言葉にならない確定", "静かな確かさ", "内的な区切り", "静かな決着", "芯が落ち着く"],
      sora: "内的な完成が輪郭を持ち、静かな確定として現れやすい配置。",
      ai_tags: ["completion", "quiet_certainty"],

      relation: "静かな確定として触れ",
      clause: "静かな確定として触れ",
      adverbs: ["落ち着いた形で", "言葉の外で", "静かに", "内側で"],
      tendency_key: "deep",

      prose_ja: {
        layers: [],
        result: "内的な完成が輪郭を持ち、静かな確定として現れる配置。",
        yasu: { deny_repeat: true, prefer: "名詞化" },
      },
    },

    septile_family: {
      key: "septile_family",
      label_ja: "セプタイル系",
      core: "運命・神秘・説明不能",
      feel: ["理由が言語化しにくい", "意味が後から追いつく", "説明不能な引力", "言語の外側", "名づけられない", "引力だけ残る"],
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

  craft_space: {
    enabled_by_default: false,

    decile_36: {
      deg: 36,
      key: "decile_36",
      label_ja: "デシル",
      core: "実装・組み立て",
      feel: ["組む", "手を動かす", "現実化する", "手順化", "組み上げる", "実装が進む"],
      sora: "構想を現実に落とし込みやすい配置。",
      ai_tags: ["build", "implementation"],

      relation: "実装の接点として触れ",
      clause: "実装の接点として触れ",
      adverbs: ["手を動かす形で", "組み立てとして", "現場感覚で", "実装寄りに"],
      tendency_key: "mid",

      prose_ja: {
        layers: [],
        result: "構想を現実に落とし込みやすい配置。",
        yasu: { deny_repeat: true, prefer: "名詞化" },
      },
    },

    tridecile_108: {
      deg: 108,
      key: "tridecile_108",
      label_ja: "トリデシル",
      core: "組み替え・運用",
      feel: ["運用が回る", "仕組み化", "使いこなす", "回しながら整える", "運用が続く", "回転が増す"],
      sora: "工夫を運用に変え、仕組みとして回しやすい配置。",
      ai_tags: ["operate", "systemize"],

      relation: "運用の回路として触れ",
      clause: "運用の回路として触れ",
      adverbs: ["回しながら", "実務として", "仕組み化の中で", "運用感覚で"],
      tendency_key: "mid",

      prose_ja: {
        layers: [],
        result: "工夫を運用に変え、仕組みとして回しやすい配置。",
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

  // sora-no-koe voice templates (全アスペクト共通)
  voice_templates: {
    conjunction: {
      touch: ["重なりが濃く残る", "境目が溶けやすい", "密度が増す", "一体感が強まる"],
      gap: ["区切りが曖昧になる", "一体化が進む", "境目が薄くなる", "輪郭が重なる"],
      rest: ["同じ場所に置かれ続ける", "重なったまま残る"],
    },
    sextile: {
      touch: ["接点が見えやすい", "通路が細く開く", "接点が生きる", "つながりが見える"],
      gap: ["選びどころが増える", "橋がかかるように並ぶ", "通り道ができる", "助走がつく"],
      rest: ["小さな協力が残る", "細い回路が残る"],
    },
    square: {
      touch: ["張りが残る", "引っかかりが立つ", "摩擦が残る", "硬さが目立つ"],
      gap: ["交差が目立つ", "調整点が浮かぶ", "ズレが見える", "押し引きが続く"],
      rest: ["摩擦が輪郭を持つ", "張りが残り続ける"],
    },
    trine: {
      touch: ["流れが通る", "無理が少ない", "力が抜ける", "滑らかに進む"],
      gap: ["自然に循環する", "気づかれにくいまま進む", "馴染みが続く", "当たり前のまま進む"],
      rest: ["滑らかなまま置かれる", "静かに続く"],
    },
    opposition: {
      touch: ["鏡として映る", "対比が立つ", "二点が立つ", "距離が浮かぶ"],
      gap: ["外側に出やすい", "揺り戻しが残る", "引き合いが続く", "映りが強まる"],
      rest: ["二極が並んだまま残る", "対比が残る"],
    },
    semi_sextile_30: {
      touch: ["気配が触れる", "微かな接点が残る", "薄い重なり", "かすかに触れる"],
      gap: ["まだ言葉にならない", "外側で反応する", "音にならない", "気配のまま並ぶ"],
      rest: ["薄い層として置かれる", "気配のまま残る"],
    },
    semi_square_45: {
      touch: ["小さな引っかかり", "微細なざらつき", "薄い抵抗", "軽い詰まり"],
      gap: ["調整点が浮かぶ", "細い摩擦が続く", "微差が目立つ", "小さなズレが続く"],
      rest: ["小さな違和感が残る", "薄いざらつきが残る"],
    },
    sesqui_square_135: {
      touch: ["積み重なった圧", "限界手前の摩擦", "溜まりの圧", "臨界が近い"],
      gap: ["蓄積が輪郭を持つ", "転換点がにじむ", "押し返しが出る", "限界が目立つ"],
      rest: ["圧が残り続ける", "溜まりが残る"],
    },
    quincunx_150: {
      touch: ["噛み合わないまま並ぶ", "同時に持ちきれない", "合わせにくい", "ズレが残る"],
      gap: ["調整不能なズレ", "共通言語がない", "噛み合わなさ", "折り合いが遠い"],
      rest: ["ズレがそのまま残る", "噛み合わなさが残る"],
    },
    quintile_72: {
      touch: ["工夫が浮かぶ", "手が動きやすい", "試作が出る", "工夫が立つ"],
      gap: ["独自の回路が開く", "ピンポイントに効く", "職人的に動く", "一点突破が出る"],
      rest: ["癖のある創造が残る", "独自の形が残る"],
    },
    biquintile_144: {
      touch: ["反復で整う", "熟成が進む", "磨きが続く", "手数が増える"],
      gap: ["扱いにくい余白", "活かし方が限定される", "置き方が難しい", "癖が残る"],
      rest: ["独自の形が残る", "熟成の余韻が残る"],
    },
    novile_40: {
      touch: ["内側で落ち着く", "静かな統合", "内側に収まる", "沈黙の統合"],
      gap: ["言葉にならない完成", "説明の外にある", "名づけられない", "静かな区切り"],
      rest: ["内在化したまま残る", "内側に残る"],
    },
    binovile_80: {
      touch: ["内面で整う", "静かな修復", "内側で修復", "馴染みが続く"],
      gap: ["ゆっくり馴染む", "輪郭が薄いまま進む", "静かに整う", "内面で落ち着く"],
      rest: ["内側で続く", "静かに残る"],
    },
    quadranovile_160: {
      touch: ["静かな確かさ", "仕上がりが残る", "芯が落ち着く", "静かな決着"],
      gap: ["言葉の外で確定する", "静かな輪郭", "内的な区切り", "確定の気配"],
      rest: ["落ち着いた形で残る", "確かさが残る"],
    },
    septile_family: {
      touch: ["説明不能な引力", "理屈の外で触れる", "引力だけが残る", "名づけられない接点"],
      gap: ["理由が言語化しにくい", "意味が後から追いつく", "言葉の外側", "説明の外にある"],
      rest: ["神秘的なまま残る", "理屈の外で残る"],
    },
    decile_36: {
      touch: ["手を動かす回路", "実装に寄る", "手順に落ちる", "組みが進む"],
      gap: ["組み立てが進む", "現場感が出る", "下書きが進む", "組み替えが起きる"],
      rest: ["作業として残る", "手が動くまま残る"],
    },
    tridecile_108: {
      touch: ["運用が回る", "仕組みが動く", "回転が増す", "回しが続く"],
      gap: ["使いこなしが進む", "整備が続く", "運用が定着する", "回し方が整う"],
      rest: ["運用の流れが残る", "回転が残る"],
    },
  },
};

module.exports = { ASPECTS_V2 };
