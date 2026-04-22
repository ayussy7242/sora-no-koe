"use strict";

/**
 * houses.v1
 * - ハウス＝“人生の領域（場）”
 * - keyword を置いて、後段で自動要約できるようにする
 */
const HOUSES_V1 = {
  version: "houses.v1",
  houses: {
    1: {
      label_ja: "第1ハウス",
      focus_short: "自己・始点",
      core: "自己・身体・入口",
      sora_short: "入口の領域。",
      sora: "自分の立ち姿や、世界との接点がテーマとして浮かびやすい領域。",
      keywords: ["身体", "印象", "自己", "入口"],
      ai_tags: ["self", "stance"],
    },
    2: {
      label_ja: "第2ハウス",
      focus_short: "所有・資源",
      core: "価値・所有・感覚",
      sora_short: "価値の領域。",
      sora: "何を大切にし、何を持ち、どう安心を作るかが浮かびやすい領域。",
      keywords: ["価値", "所有", "感覚", "安心"],
      ai_tags: ["value", "resources"],
    },
    3: {
      label_ja: "第3ハウス",
      focus_short: "思考・やりとり",
      core: "言葉・学び・日常の移動",
      sora_short: "言葉の領域。",
      sora: "情報や会話、学びの循環がテーマとして浮かびやすい領域。",
      keywords: ["言葉", "学び", "情報", "移動"],
      ai_tags: ["communication", "learning"],
    },
    4: {
      label_ja: "第4ハウス",
      focus_short: "基盤・内側",
      core: "居場所・家・ルーツ",
      sora_short: "居場所の領域。",
      sora: "安心の拠点や、内側の基盤がテーマとして浮かびやすい領域。",
      keywords: ["居場所", "家", "ルーツ", "基盤"],
      ai_tags: ["home", "roots"],
    },
    5: {
      label_ja: "第5ハウス",
      focus_short: "創造・表現",
      core: "表現・創造・遊び",
      sora_short: "創造の領域。",
      sora: "自分の温度を表現し、創造として置きやすい領域。",
      keywords: ["表現", "創造", "遊び", "喜び"],
      ai_tags: ["creative", "play"],
    },
    6: {
      label_ja: "第6ハウス",
      focus_short: "日常・整え",
      core: "習慣・整える・役割",
      sora_short: "整える領域。",
      sora: "日々の習慣や手入れ、現実の整え直しがテーマになりやすい領域。",
      keywords: ["習慣", "整える", "手入れ", "役割"],
      ai_tags: ["routine", "refine"],
    },
    7: {
      label_ja: "第7ハウス",
      focus_short: "対人・関係",
      core: "関係・対等・契約",
      sora_short: "関係の領域。",
      sora: "他者との鏡合わせや、対等さがテーマとして浮かびやすい領域。",
      keywords: ["関係", "対等", "契約", "鏡"],
      ai_tags: ["relationship", "mirror"],
    },
    8: {
      label_ja: "第8ハウス",
      focus_short: "共有・深部",
      core: "共有・境界・深層",
      sora_short: "深層の領域。",
      sora: "共有や境界、心理の奥がテーマとして浮かびやすい領域。",
      keywords: ["共有", "境界", "深層", "変容"],
      ai_tags: ["depth", "merge"],
    },
    9: {
      label_ja: "第9ハウス",
      focus_short: "拡張・探求",
      core: "探求・世界観・遠く",
      sora_short: "探求の領域。",
      sora: "視野を広げる学びや、世界観がテーマとして浮かびやすい領域。",
      keywords: ["探求", "世界観", "学び", "遠く"],
      ai_tags: ["explore", "belief"],
    },
    10: {
      label_ja: "第10ハウス",
      focus_short: "社会・役割",
      core: "社会・到達点・役割",
      sora_short: "社会の領域。",
      sora: "役割や到達点、外側の輪郭がテーマとして浮かびやすい領域。",
      keywords: ["社会", "役割", "到達点", "見られ方"],
      ai_tags: ["career", "public"],
    },
    11: {
      label_ja: "第11ハウス",
      focus_short: "仲間・未来",
      core: "仲間・未来・ネットワーク",
      sora_short: "つながりの領域。",
      sora: "仲間や未来像、ネットワークがテーマとして浮かびやすい領域。",
      keywords: ["仲間", "未来", "ネットワーク", "共創"],
      ai_tags: ["community", "future"],
    },
    12: {
      label_ja: "第12ハウス",
      focus_short: "内側・潜在",
      core: "無意識・余白・溶解",
      sora_short: "余白の領域。",
      sora: "見えない層や余白、言葉にならない感覚がテーマになりやすい領域。",
      keywords: ["無意識", "余白", "溶解", "浄化"],
      ai_tags: ["subconscious", "mystic"],
    },
  },
  order: [1,2,3,4,5,6,7,8,9,10,11,12],
};

module.exports = { HOUSES_V1 };
