"use strict";

/**
 * planets.v2
 * - V1互換のキーは維持（label_ja/core/field/polarity/sora_*など）
 * - V2追加：role / verbs / texture / tendency_key
 *
 * 目的：
 * - SIGN×PLANET 圧縮（planet_role + sign_flavor）を “設計で” 作れるようにする
 * - render/fusion が固定語（衝動/圧/交差…）を持たずに文章を組めるようにする
 * - 判断しない／予測しない／行動を促さない を維持
 * aspects.v2 は「出力の質感（dynamics）辞書」。意味づけしない／予言しない。
 */
const PLANETS_V2 = {
    version: "planets.v2",
    bodies: {
        sun: {
            label_ja: "太陽",
            core: "中心・意志・生の火",
            field: "自己/表現/選択",
            polarity: "active",
            sora_short: "中心の温度。どこに意志が向かうか。",
            sora: "中心の温度。自分で決める力がどの方向に向きやすいか。",
            sora_deep: "存在の中心にある火。選択の基準や、照らしたいテーマが浮かびやすい。",
            keywords: ["中心", "意志", "選択", "自己", "表現"],
            ai_tags: ["core", "identity", "will"],

            role: "中心の意志",
            verbs: ["決める", "照らす", "選ぶ", "掲げる", "軸を立てる"],
            texture: ["中心", "明確", "熱", "方向性", "主体"],
            tendency_key: "mid",

            action_noun_ja: ["中心", "意志", "選択", "火", "軸"],
            action_verb_ja: ["照らす", "決める", "選ぶ", "掲げる", "軸を立てる"],
        },

        moon: {
            label_ja: "月",
            core: "感情・反応・安心",
            field: "体感/習慣/内側",
            polarity: "receptive",
            sora_short: "反応の流れ。安心の向かう先。",
            sora: "反応の流れ。安心をどこに置きやすいか。",
            sora_deep: "無意識の反応と安心の回路。言葉になる前の体感が動きやすい。",
            keywords: ["感情", "反応", "安心", "習慣", "無意識"],
            ai_tags: ["emotion", "safety", "habit"],

            role: "反応と安心の回路",
            verbs: ["感じる", "守る", "落ち着く", "馴染む", "抱える"],
            texture: ["内側", "習慣", "体感", "安心", "波"],
            tendency_key: "mid",

            action_noun_ja: ["反応", "安心", "体感", "波", "習慣"],
            action_verb_ja: ["感じる", "守る", "馴染む", "抱える", "落ち着く"],
        },

        mercury: {
            label_ja: "水星",
            core: "思考・言葉・接続",
            field: "情報/対話/理解",
            polarity: "neutral",
            sora_short: "言葉の回路。捉え方の癖。",
            sora: "言葉の回路。どう捉え、どう伝えやすいか。",
            sora_deep: "思考と情報の通り道。理解の仕方や対話のテンポが表れやすい。",
            keywords: ["思考", "言葉", "情報", "理解", "対話"],
            ai_tags: ["mind", "communication"],

            role: "言葉と理解の通路",
            verbs: ["考える", "まとめる", "つなぐ", "伝える", "翻訳する"],
            texture: ["情報", "対話", "テンポ", "理解", "接続"],
            tendency_key: "light",

            action_noun_ja: ["言葉", "理解", "接続", "テンポ", "思考"],
            action_verb_ja: ["考える", "まとめる", "つなぐ", "伝える", "翻訳する"],
        },

        venus: {
            label_ja: "金星",
            core: "好み・関係・価値",
            field: "愛/美/満足",
            polarity: "receptive",
            sora_short: "惹かれる方向。好きの磁力。",
            sora: "惹かれる方向。“好き”がどこに向きやすいか。",
            sora_deep: "価値と心地よさの基準。関係性の中で何を大切に感じやすいか。",
            keywords: ["好み", "価値", "美", "満足", "関係"],
            ai_tags: ["love", "value", "attraction"],

            role: "価値と好みの基準",
            verbs: ["惹かれる", "選ぶ", "味わう", "整える", "関係をつくる"],
            texture: ["心地よさ", "美意識", "満足", "惹力", "やさしさ"],
            tendency_key: "light",

              action_noun_ja: ["価値", "好み", "惹力", "美", "満足"],
  action_verb_ja: ["惹かれる", "選ぶ", "味わう", "整える", "和らげる"],
        },

        mars: {
            label_ja: "火星",
            core: "行動・衝動・境界",
            field: "推進/怒り/決断",
            polarity: "active",
            sora_short: "動く力。踏み込むポイント。",
            sora: "動く力。どこで踏み込み、どこで守るか。",
            sora_deep: "衝動と決断のエネルギー。境界が立つ瞬間や衝突点が現れやすい。",
            keywords: ["行動", "衝動", "決断", "境界", "推進"],
            ai_tags: ["drive", "action", "boundary"],

            role: "推進と境界のエンジン",
            verbs: ["動く", "踏み込む", "切る", "守る", "決断する"],
            texture: ["熱", "直進", "即応", "境界", "衝突点"],
            tendency_key: "mid",

  action_noun_ja: ["境界", "推進", "衝動", "決断", "火"],
  action_verb_ja: ["動く", "踏み込む", "切る", "守る", "突き進む"],
        },

        jupiter: {
            label_ja: "木星",
            core: "拡大・寛容・追い風",
            field: "成長/可能性/信念",
            polarity: "active",
            sora_short: "広がりの風。可能性が伸びる方向。",
            sora: "広がりの風。伸びやすい分野や、追い風が入りやすい領域。",
            sora_deep: "拡大と意味づけの働き。信念や学びが、世界を広げやすい。",
            keywords: ["拡大", "成長", "信念", "幸運", "追い風"],
            ai_tags: ["growth", "luck", "belief"],

            role: "拡大と意味づけ",
            verbs: ["広げる", "信じる", "学ぶ", "励ます", "伸ばす"],
            texture: ["可能性", "追い風", "寛容", "視野", "増幅"],
            tendency_key: "light",

  action_noun_ja: ["拡大", "追い風", "可能性", "寛容", "増幅"],
  action_verb_ja: ["広げる", "伸ばす", "励ます", "学ぶ", "信じる"],

        },

        saturn: {
            label_ja: "土星",
            core: "枠組み・責任・鍛錬",
            field: "構造/制限/成熟",
            polarity: "neutral",
            sora_short: "枠と重み。形にする力。",
            sora: "枠と重み。時間をかけて形にしていく領域。",
            sora_deep: "現実の設計図。制限を通して成熟し、持続可能な形が作られやすい。",
            keywords: ["枠組み", "責任", "成熟", "時間", "継続"],
            ai_tags: ["structure", "discipline", "maturity"],

            role: "枠と時間の設計",
            verbs: ["積む", "耐える", "整える", "責任を持つ", "形にする"],
            texture: ["重み", "構造", "制限", "成熟", "継続"],
            tendency_key: "mid",

              action_noun_ja: ["枠", "構造", "重み", "時間", "責任"],
  action_verb_ja: ["積む", "整える", "耐える", "形にする", "担う"],
        },

        uranus: {
            label_ja: "天王星",
            core: "刷新・解放・突然性",
            field: "変化/自由/アップデート",
            polarity: "active",
            sora_short: "更新の雷。自由が動く。",
            sora: "更新の雷。固定が外れ、やり方が変わりやすい領域。",
            sora_deep: "革新とズレの天体。既存の枠からの離脱や、再設計が起きやすい。",
            keywords: ["刷新", "解放", "変化", "自由", "アップデート"],
            ai_tags: ["reform", "breakthrough", "liberation"],

            role: "更新とズレのスイッチ",
            verbs: ["外す", "切り替える", "更新する", "解放する", "揺らす"],
            texture: ["非連続", "自由", "突然", "刷新", "再設計"],
            tendency_key: "mid",


  action_noun_ja: ["更新", "解放", "ズレ", "刷新", "再設計"],
  action_verb_ja: ["外す", "切り替える", "更新する", "揺らす", "解放する"],
        },

        neptune: {
            label_ja: "海王星",
            core: "溶解・夢・境界の薄さ",
            field: "感受性/祈り/幻想",
            polarity: "receptive",
            sora_short: "境界が薄い水。イメージが広がる。",
            sora: "境界が薄い水。直感やイメージが強まりやすい領域。",
            sora_deep: "溶け合いと共鳴の天体。現実の輪郭がゆるみ、感受性が立ち上がりやすい。",
            keywords: ["夢", "直感", "溶解", "感受性", "祈り"],
            ai_tags: ["intuition", "dream", "dissolve"],

            role: "溶解と共鳴の水脈",
            verbs: ["溶かす", "にじませる", "感じ取る", "ゆだねる", "ぼかす"],
            texture: ["境界", "夢", "余韻", "直感", "イメージ"],
            tendency_key: "deep",


   action_noun_ja: ["溶解", "夢", "余韻", "境界", "直感"],
  action_verb_ja: ["溶かす", "にじませる", "感じ取る", "ゆだねる", "ぼかす"],
        },

        pluto: {
            label_ja: "冥王星",
            core: "変容・極点・再生",
            field: "深層/支配/脱皮",
            polarity: "neutral",
            sora_short: "深い圧。変わる力。",
            sora: "深い圧。根本から組み替えが起きやすい領域。",
            sora_deep: "終わりと始まりの天体。手放し・再生・極点の体験がテーマとして浮かびやすい。",
            keywords: ["変容", "再生", "深層", "極点", "手放し"],
            ai_tags: ["transform", "intensity", "rebirth"],

            role: "深層の圧と再編",
            verbs: ["剥がす", "変える", "終える", "再編する", "露わにする"],
            texture: ["極点", "圧", "深層", "再生", "脱皮"],
            tendency_key: "mid",

              action_noun_ja: ["圧", "変容", "深層", "脱皮", "再編"],
  action_verb_ja: ["剥がす", "変える", "終える", "再編する", "露わにする"],
        },

        chiron: {
            label_ja: "キロン",
            core: "傷と癒し・学びの入口",
            field: "癒し/気づき/統合",
            polarity: "receptive",
            sora_short: "傷の入口。学びが始まる。",
            sora: "痛みの入口。気づきと統合が起きやすいポイント。",
            sora_deep: "弱さや違和感が、理解の回路に変わりやすい場所。癒しがテーマとして浮かびやすい。",
            keywords: ["傷", "癒し", "統合", "学び", "気づき"],
            ai_tags: ["wound", "healing", "integration"],

            role: "傷から学びへ向かう入口",
            verbs: ["気づく", "癒す", "統合する", "学ぶ", "ほどく"],
            texture: ["違和感", "入口", "学習", "統合", "やさしさ"],
            tendency_key: "deep",
        },

        Lilith: {
            label_ja: "リリス",
            core: "拒否・逸脱・主権の原点",
            field: "影/無意識/禁忌",
            polarity: "neutral",

            sora_short: "言葉にならない違和感。",
            sora: "言葉になる前の拒否や、選ばなかった衝動が浮かびやすいポイント。",
            sora_deep: "説明されなかった欲求や、抑圧された主権が、違和感として残りやすい場所。",
            keywords: ["拒否", "違和感", "影", "主権", "禁忌", "逸脱"],
            ai_tags: ["raw_self", "taboo", "sovereignty"],

            role: "言語化されなかった主権",
            verbs: ["拒む", "外れる", "沈黙する", "選ばない", "逸脱する"],
            texture: ["違和感", "沈黙", "影", "主権", "説明不能"],
            tendency_key: "deep",
        },
    },

    order: [
        "sun", "moon", "mercury", "venus", "mars",
        "jupiter", "saturn", "uranus", "neptune", "pluto",
        "chiron", "Lilith", "asc"
    ],
};

module.exports = { PLANETS_V2 };
