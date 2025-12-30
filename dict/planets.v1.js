"use strict";

/**
 * planets.v1 (FULL)
 * - core: 象徴の核（不変）
 * - field: 作用領域（分類）
 * - sora_short / sora / sora_deep: 出力の粒度
 * - keywords: 検索・抽出用（解釈固定しない）
 * - ai_tags: LLM用ラベル（非表示）
 * - polarity: active / receptive / neutral（分類）
 */
const PLANETS_V1 = {
  version: "planets.v1",
  bodies: {
    Sun: {
      label_ja: "太陽",
      core: "中心・意志・生の火",
      field: "自己/表現/選択",
      polarity: "active",
      sora_short: "中心の温度。どこに意志が向かうか。",
      sora: "中心の温度。自分で決める力がどの方向に向きやすいか。",
      sora_deep: "存在の中心にある火。選択の基準や、照らしたいテーマが浮かびやすい。",
      keywords: ["中心","意志","選択","自己","表現"],
      ai_tags: ["core","identity","will"],
    },
    Moon: {
      label_ja: "月",
      core: "感情・反応・安心",
      field: "体感/習慣/内側",
      polarity: "receptive",
      sora_short: "反応の流れ。安心の向かう先。",
      sora: "反応の流れ。安心をどこに置きやすいか。",
      sora_deep: "無意識の反応と安心の回路。言葉になる前の体感が動きやすい。",
      keywords: ["感情","反応","安心","習慣","無意識"],
      ai_tags: ["emotion","safety","habit"],
    },
    Mercury: {
      label_ja: "水星",
      core: "思考・言葉・接続",
      field: "情報/対話/理解",
      polarity: "neutral",
      sora_short: "言葉の回路。捉え方の癖。",
      sora: "言葉の回路。どう捉え、どう伝えやすいか。",
      sora_deep: "思考と情報の通り道。理解の仕方や対話のテンポが表れやすい。",
      keywords: ["思考","言葉","情報","理解","対話"],
      ai_tags: ["mind","communication"],
    },
    Venus: {
      label_ja: "金星",
      core: "好み・関係・価値",
      field: "愛/美/満足",
      polarity: "receptive",
      sora_short: "惹かれる方向。好きの磁力。",
      sora: "惹かれる方向。“好き”がどこに向きやすいか。",
      sora_deep: "価値と心地よさの基準。関係性の中で何を大切に感じやすいか。",
      keywords: ["好み","価値","美","満足","関係"],
      ai_tags: ["love","value","attraction"],
    },
    Mars: {
      label_ja: "火星",
      core: "行動・衝動・境界",
      field: "推進/怒り/決断",
      polarity: "active",
      sora_short: "動く力。踏み込むポイント。",
      sora: "動く力。どこで踏み込み、どこで守るか。",
      sora_deep: "衝動と決断のエネルギー。境界が立つ瞬間や衝突点が現れやすい。",
      keywords: ["行動","衝動","決断","境界","推進"],
      ai_tags: ["drive","action","boundary"],
    },

    Jupiter: {
      label_ja: "木星",
      core: "拡大・寛容・追い風",
      field: "成長/可能性/信念",
      polarity: "active",
      sora_short: "広がりの風。可能性が伸びる方向。",
      sora: "広がりの風。伸びやすい分野や、追い風が入りやすい領域。",
      sora_deep: "拡大と意味づけの働き。信念や学びが、世界を広げやすい。",
      keywords: ["拡大","成長","信念","幸運","追い風"],
      ai_tags: ["growth","luck","belief"],
    },

    Saturn: {
      label_ja: "土星",
      core: "枠組み・責任・鍛錬",
      field: "構造/制限/成熟",
      polarity: "neutral",
      sora_short: "枠と重み。形にする力。",
      sora: "枠と重み。時間をかけて形にしていく領域。",
      sora_deep: "現実の設計図。制限を通して成熟し、持続可能な形が作られやすい。",
      keywords: ["枠組み","責任","成熟","時間","継続"],
      ai_tags: ["structure","discipline","maturity"],
    },

    Uranus: {
      label_ja: "天王星",
      core: "刷新・解放・突然性",
      field: "変化/自由/アップデート",
      polarity: "active",
      sora_short: "更新の雷。自由が動く。",
      sora: "更新の雷。固定が外れ、やり方が変わりやすい領域。",
      sora_deep: "革新とズレの天体。既存の枠からの離脱や、再設計が起きやすい。",
      keywords: ["刷新","解放","変化","自由","アップデート"],
      ai_tags: ["reform","breakthrough","liberation"],
    },

    Neptune: {
      label_ja: "海王星",
      core: "溶解・夢・境界の薄さ",
      field: "感受性/祈り/幻想",
      polarity: "receptive",
      sora_short: "境界が薄い水。イメージが広がる。",
      sora: "境界が薄い水。直感やイメージが強まりやすい領域。",
      sora_deep: "溶け合いと共鳴の天体。現実の輪郭がゆるみ、感受性が立ち上がりやすい。",
      keywords: ["夢","直感","溶解","感受性","祈り"],
      ai_tags: ["intuition","dream","dissolve"],
    },

    Pluto: {
      label_ja: "冥王星",
      core: "変容・極点・再生",
      field: "深層/支配/脱皮",
      polarity: "neutral",
      sora_short: "深い圧。変わる力。",
      sora: "深い圧。根本から組み替えが起きやすい領域。",
      sora_deep: "終わりと始まりの天体。手放し・再生・極点の体験がテーマとして浮かびやすい。",
      keywords: ["変容","再生","深層","極点","手放し"],
      ai_tags: ["transform","intensity","rebirth"],
    },

    Chiron: {
      label_ja: "キロン",
      core: "傷と癒し・学びの入口",
      field: "癒し/気づき/統合",
      polarity: "receptive",
      sora_short: "傷の入口。学びが始まる。",
      sora: "痛みの入口。気づきと統合が起きやすいポイント。",
      sora_deep: "弱さや違和感が、理解の回路に変わりやすい場所。癒しがテーマとして浮かびやすい。",
      keywords: ["傷","癒し","統合","学び","気づき"],
      ai_tags: ["wound","healing","integration"],
    },
  },

  order: [
    "Sun","Moon","Mercury","Venus","Mars",
    "Jupiter","Saturn","Uranus","Neptune","Pluto",
    "Chiron","ASC"
  ],
};

module.exports = { PLANETS_V1 };
