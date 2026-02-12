"use strict";

/**
 * modalities.v1
 * - 3区分（活動/不動/柔軟）を“力の運び方”として説明
 */
const MODALITIES_V1 = {
  version: "modalities.v1",
  modalities: {
    cardinal: {
      label_ja: "活動",
      core: "始動・方向づけ",
      sora_short: "活動＝動き出す。",
      sora: "活動宮は、方向を決めて動き出す力として立ち上がりやすい。",
      keywords: ["始動", "方向", "起点"],
      ai_tags: ["start", "initiate"],
    },
    fixed: {
      label_ja: "不動",
      core: "維持・集中・定着",
      sora_short: "不動＝守り、育てる。",
      sora: "不動宮は、維持し、集中し、定着させる力として働きやすい。",
      keywords: ["維持", "集中", "定着"],
      ai_tags: ["stabilize", "focus"],
    },
    mutable: {
      label_ja: "柔軟",
      core: "変化・翻訳・調整",
      sora_short: "柔軟＝編み直す。",
      sora: "柔軟宮は、状況に合わせて翻訳し、調整し、流れを変えやすい。",
      keywords: ["変化", "調整", "翻訳"],
      ai_tags: ["adapt", "translate"],
    },
  },
  order: ["cardinal", "fixed", "mutable"],
};

module.exports = { MODALITIES_V1 };
