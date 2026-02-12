"use strict";

/**
 * elements.v1
 * - 4元素の“性質”を、解釈固定せずに説明できる辞書
 */
const ELEMENTS_V1 = {
  version: "elements.v1",
  elements: {
    fire: {
      label_ja: "火",
      core: "意志・創造・点火",
      field: "表現/推進/熱",
      sora_short: "火＝点火と推進。",
      sora: "火の要素は、意志や表現の熱が立ち上がりやすい領域。",
      keywords: ["意志", "表現", "創造", "熱"],
      ai_tags: ["ignite", "will", "express"],
    },
    earth: {
      label_ja: "地",
      core: "現実・形・安定",
      field: "身体/継続/実装",
      sora_short: "地＝形と継続。",
      sora: "地の要素は、現実に落とし込み、形として積み上げやすい領域。",
      keywords: ["現実", "身体", "継続", "実装"],
      ai_tags: ["ground", "build", "practical"],
    },
    air: {
      label_ja: "風",
      core: "思考・言葉・循環",
      field: "情報/対話/視点",
      sora_short: "風＝接続と循環。",
      sora: "風の要素は、言葉や視点を通じて接続が生まれやすい領域。",
      keywords: ["思考", "言葉", "対話", "視点"],
      ai_tags: ["connect", "mind", "exchange"],
    },
    water: {
      label_ja: "水",
      core: "感情・共鳴・溶け合い",
      field: "体感/関係/余韻",
      sora_short: "水＝共鳴と余韻。",
      sora: "水の要素は、感情や共鳴を通じて余韻が残りやすい領域。",
      keywords: ["感情", "共鳴", "余韻", "境界"],
      ai_tags: ["resonate", "feel", "merge"],
    },
  },
  order: ["fire", "earth", "air", "water"],
};

module.exports = { ELEMENTS_V1 };
