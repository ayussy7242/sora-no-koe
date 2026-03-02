"use strict";

// dict/sora_core.v1.js
// SORA CORE SSOT (v1)
// - FACT: 事実テンプレ（度数フェーズ）
// - MEANING: 現代語・体感語の芯（説明ではなく置ける語）
// - RHYTHM: 文体の圧（終止語・禁止語など）

const SORA_CORE_V1 = Object.freeze({
  version: "sora_core.v1",
  locale: "ja",

  facts: Object.freeze({
    degree_phase: Object.freeze([
      { name: "early", min: 0, max: 9.999, fact: "始まりの度数にある{sign}の{planet}。" },
      { name: "mid", min: 10, max: 19.999, fact: "{sign}の中盤の位置で、{planet}が立つ。" },
      { name: "late", min: 20, max: 28.999, fact: "{sign}の後半度数にある{planet}。" },
      { name: "final", min: 29, max: 29.999, fact: "最終度数にある{sign}の{planet}。" },
    ]),
  }),

  meaning: Object.freeze({
    planets: Object.freeze({
      sun: Object.freeze({
        cores: Object.freeze(["存在", "中心", "温度", "芯"]),
        phrases: Object.freeze(["存在の核", "立った瞬間に出る", "場の温度を変える"]),
      }),
      moon: Object.freeze({
        cores: Object.freeze(["反応", "安心", "揺れ", "整う"]),
        phrases: Object.freeze(["外で整う", "内側に留まらない", "安心の取り方"]),
      }),
      mercury: Object.freeze({
        cores: Object.freeze(["言葉", "通路", "接続", "体温"]),
        phrases: Object.freeze(["話しながら整う", "考えるより先に出る", "言葉が体温に近い"]),
      }),
      venus: Object.freeze({
        cores: Object.freeze(["好意", "距離", "包む", "基準"]),
        phrases: Object.freeze(["守る感覚が先", "包めるかどうかが基準", "判断より先に反応する"]),
      }),
      mars: Object.freeze({
        cores: Object.freeze(["推進", "摩擦", "継続", "持続圧"]),
        phrases: Object.freeze(["速くないが止まりにくい", "摩擦ごと進む", "持続圧で押す"]),
      }),
      jupiter: Object.freeze({
        cores: Object.freeze(["拡大", "安心", "保護", "入口"]),
        phrases: Object.freeze([
          "拡大は内側に起きる",
          "安心が広がると行動も広がる",
          "守られている感覚が入口",
        ]),
      }),
      saturn: Object.freeze({
        cores: Object.freeze(["現実", "枠", "責任", "骨格"]),
        phrases: Object.freeze(["背負える形に組み替える", "続く形だけを残す", "枠が芯になる"]),
      }),
      uranus: Object.freeze({
        cores: Object.freeze(["更新", "ずれ", "再設計", "切替"]),
        phrases: Object.freeze(["壊すより中から更新する", "静かな再設計", "ズレがスイッチになる"]),
      }),
      neptune: Object.freeze({
        cores: Object.freeze(["理想", "境界", "共鳴", "溶ける"]),
        phrases: Object.freeze(["夢は逃避ではなく前提", "境界が薄くなる", "共鳴が現実に混ざる"]),
      }),
      pluto: Object.freeze({
        cores: Object.freeze(["深層", "真実", "再定義", "核"]),
        phrases: Object.freeze(["深さに迷いがない", "真実に触れるために起きる", "核が掘られる"]),
      }),
      chiron: Object.freeze({
        cores: Object.freeze(["痛点", "遅れる", "触れにくい", "守りたい"]),
        phrases: Object.freeze(["反応が止まる", "言葉が遅れる", "守りたいもの"]),
      }),
      lilith: Object.freeze({
        cores: Object.freeze(["濃度", "拒否", "主権", "沈黙"]),
        phrases: Object.freeze(["途中で終われない", "濃度の問題", "沈黙が濃度になる"]),
      }),
      north_node: Object.freeze({
        cores: Object.freeze(["方向", "引力", "全体を見る"]),
        phrases: Object.freeze(["一歩引いて全体を見る", "関係性に置く", "方向が引かれる"]),
      }),
      south_node: Object.freeze({
        cores: Object.freeze(["慣れ", "既知", "自然に出る"]),
        phrases: Object.freeze(["自然に立つ", "中心になれる", "慣れが出る"]),
      }),
      asc: Object.freeze({
        cores: Object.freeze(["入口", "第一印象", "届き方"]),
        phrases: Object.freeze(["最初に伝わる", "先に届く"]),
      }),
      mc: Object.freeze({
        cores: Object.freeze(["表舞台", "見られ方", "役割"]),
        phrases: Object.freeze(["前に立つことが仕事になる", "表現者として見える"]),
      }),
      ic: Object.freeze({
        cores: Object.freeze(["根", "居場所", "基点"]),
        phrases: Object.freeze(["安心の根", "近すぎないことで保たれる"]),
      }),
      dc: Object.freeze({
        cores: Object.freeze(["関係", "持続", "信頼"]),
        phrases: Object.freeze(["安定と持続が基準", "信頼が深まる"]),
      }),
    }),

    signs: Object.freeze({
      aries: Object.freeze({
        cores: Object.freeze(["始動", "火種", "衝動", "一番手"]),
        phrases: Object.freeze(["先に動く", "考える前に立つ"]),
      }),
      taurus: Object.freeze({
        cores: Object.freeze(["定着", "持続", "身体", "重み"]),
        phrases: Object.freeze(["止まりにくさ", "触れる現実"]),
      }),
      gemini: Object.freeze({
        cores: Object.freeze(["接続", "回路", "会話", "軽さ"]),
        phrases: Object.freeze(["つなぐ", "軽やかに動く"]),
      }),
      cancer: Object.freeze({
        cores: Object.freeze(["包む", "内側", "保護", "安心圏"]),
        phrases: Object.freeze(["守る感覚", "距離の内側"]),
      }),
      leo: Object.freeze({
        cores: Object.freeze(["中心", "発光", "堂々", "存在感"]),
        phrases: Object.freeze(["前に立つ", "温度で場を変える"]),
      }),
      virgo: Object.freeze({
        cores: Object.freeze(["精度", "整える", "検証", "機能性"]),
        phrases: Object.freeze(["細部を整える", "役に立つかどうか"]),
      }),
      libra: Object.freeze({
        cores: Object.freeze(["均衡", "対話", "距離感", "バランス"]),
        phrases: Object.freeze(["距離の測り方", "対になる感覚"]),
      }),
      scorpio: Object.freeze({
        cores: Object.freeze(["深度", "濃度", "再定義", "核心"]),
        phrases: Object.freeze(["途中で終われない", "濃度が高い"]),
      }),
      sagittarius: Object.freeze({
        cores: Object.freeze(["拡張", "視野", "冒険", "意味"]),
        phrases: Object.freeze(["遠くを見る", "意味を探す"]),
      }),
      capricorn: Object.freeze({
        cores: Object.freeze(["骨格", "現実", "持続責任", "制度"]),
        phrases: Object.freeze(["形にする", "背負えるかどうか"]),
      }),
      aquarius: Object.freeze({
        cores: Object.freeze(["更新", "未来", "ネットワーク", "自由"]),
        phrases: Object.freeze(["更新", "個を超える"]),
      }),
      pisces: Object.freeze({
        cores: Object.freeze(["溶ける", "共鳴", "境界", "漂う"]),
        phrases: Object.freeze(["境目が薄い", "にじむ"]),
      }),
    }),
  }),

  rhythm: Object.freeze({
    end_nouns: Object.freeze(["配置", "構造", "入口", "基準", "前提", "圧", "深度", "方向", "回路", "芯"]),
    ban_words_soft: Object.freeze(["地点", "位置", "段階", "成熟", "示す", "強調", "印象", "可能性"]),
    contrast_markers: Object.freeze(["ではなく", "というより", "より先に"]),
  }),
});

module.exports = { SORA_CORE_V1 };
