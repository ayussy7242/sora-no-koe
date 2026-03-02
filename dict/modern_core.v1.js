"use strict";

// dict/modern_core.v1.js
// SORA MODERN CORE (v0.1)
// - 占星術の意味を「現代語・体感語」に落とした核だけを保持
// - 説明文ではなく、置くだけで文章が立つ語を中心にする

const MODERN_CORE_V1 = Object.freeze({
  version: "modern_core.v1",
  locale: "ja",

  end_nouns: Object.freeze([
    "配置",
    "構造",
    "入口",
    "基準",
    "前提",
    "圧",
    "深度",
    "方向",
    "回路",
    "芯",
  ]),

  ban_words_soft: Object.freeze([
    "地点",
    "位置",
    "段階",
    "成熟",
    "示す",
    "強調",
    "印象",
    "可能性",
  ]),

  planet_core: Object.freeze({
    sun: {
      name: "太陽",
      cores: Object.freeze(["中心", "核", "温度", "前に立つ力"]),
      phrases: Object.freeze([
        "存在の核",
        "その人らしさ",
        "立ったときに出るもの",
      ]),
    },
    moon: {
      name: "月",
      cores: Object.freeze(["反応", "安心", "揺れ", "整う"]),
      phrases: Object.freeze([
        "どう反応するか",
        "安心の取り方",
        "揺れ方",
      ]),
    },
    mercury: {
      name: "水星",
      cores: Object.freeze(["言葉", "通路", "つなぐ", "整える"]),
      phrases: Object.freeze([
        "どう理解するか",
        "どう言葉にするか",
      ]),
    },
    venus: {
      name: "金星",
      cores: Object.freeze(["好意", "距離", "包む", "基準"]),
      phrases: Object.freeze([
        "何を心地よいと感じるか",
        "何を選ぶか",
      ]),
    },
    mars: {
      name: "火星",
      cores: Object.freeze(["推進", "圧", "摩擦", "止まりにくい"]),
      phrases: Object.freeze([
        "どう動くか",
        "どんな勢いか",
      ]),
    },
    jupiter: {
      name: "木星",
      cores: Object.freeze(["広がる", "信じる", "保護", "入口"]),
      phrases: Object.freeze([
        "何が広がるか",
        "どこで安心するか",
      ]),
    },
    saturn: {
      name: "土星",
      cores: Object.freeze(["構造", "骨格", "続ける", "現実"]),
      phrases: Object.freeze([
        "何を背負えるか",
        "どこで形にするか",
      ]),
    },
    uranus: {
      name: "天王星",
      cores: Object.freeze(["更新", "ずれ", "切り替え", "再設計"]),
      phrases: Object.freeze(["どこが更新されるか"]),
    },
    neptune: {
      name: "海王星",
      cores: Object.freeze(["溶ける", "共鳴", "夢", "にじむ"]),
      phrases: Object.freeze([
        "どこが溶けるか",
        "どこで理想を見るか",
      ]),
    },
    pluto: {
      name: "冥王星",
      cores: Object.freeze(["深度", "真実", "再定義", "核"]),
      phrases: Object.freeze([
        "どこが深くなるか",
        "どこが変わりきるか",
      ]),
    },
    chiron: {
      name: "キロン",
      cores: Object.freeze(["痛点", "触れにくい", "遅れる", "守りたい"]),
      phrases: Object.freeze(["どこで反応が止まるか"]),
    },
    lilith: {
      name: "リリス",
      cores: Object.freeze(["濃度", "拒否", "主権", "沈黙"]),
      phrases: Object.freeze(["どこで譲らないか"]),
    },
    north_node: {
      name: "北ノード",
      cores: Object.freeze(["方向", "全体を見る", "伸びる"]),
      phrases: Object.freeze(["向かう方向", "全体を見る"]),
    },
    south_node: {
      name: "南ノード",
      cores: Object.freeze(["慣れ", "自然に出る", "既知"]),
      phrases: Object.freeze(["すでにできること", "自然に出る"]),
    },
    asc: {
      name: "ASC",
      cores: Object.freeze(["入口", "第一印象", "届き方"]),
      phrases: Object.freeze(["最初に伝わる"]),
    },
    mc: {
      name: "MC",
      cores: Object.freeze(["社会面", "表舞台", "役割"]),
      phrases: Object.freeze(["見える役割"]),
    },
    ic: {
      name: "IC",
      cores: Object.freeze(["根", "居場所", "基点"]),
      phrases: Object.freeze(["安心の根"]),
    },
    dc: {
      name: "DC",
      cores: Object.freeze(["関係", "持続", "信頼"]),
      phrases: Object.freeze(["他者との関係"]),
    },
  }),

  sign_core: Object.freeze({
    aries: {
      name: "牡羊座",
      cores: Object.freeze(["始動", "火種", "衝動", "一番手"]),
      phrases: Object.freeze(["先に動く", "考える前に立つ"]),
    },
    taurus: {
      name: "牡牛座",
      cores: Object.freeze(["定着", "持続", "身体", "重み"]),
      phrases: Object.freeze(["止まりにくさ", "触れる現実"]),
    },
    gemini: {
      name: "双子座",
      cores: Object.freeze(["接続", "回路", "会話", "軽さ"]),
      phrases: Object.freeze(["つなぐ", "軽やかに動く"]),
    },
    cancer: {
      name: "蟹座",
      cores: Object.freeze(["包む", "内側", "保護", "安心圏"]),
      phrases: Object.freeze(["守る感覚", "距離の内側"]),
    },
    leo: {
      name: "獅子座",
      cores: Object.freeze(["中心", "発光", "堂々", "存在感"]),
      phrases: Object.freeze(["前に立つ", "温度で場を変える"]),
    },
    virgo: {
      name: "乙女座",
      cores: Object.freeze(["精度", "整える", "検証", "機能性"]),
      phrases: Object.freeze(["細部を整える", "役に立つかどうか"]),
    },
    libra: {
      name: "天秤座",
      cores: Object.freeze(["均衡", "対話", "距離感", "バランス"]),
      phrases: Object.freeze(["距離の測り方", "対になる感覚"]),
    },
    scorpio: {
      name: "蠍座",
      cores: Object.freeze(["深度", "濃度", "再定義", "核心"]),
      phrases: Object.freeze(["途中で終われない", "濃度が高い"]),
    },
    sagittarius: {
      name: "射手座",
      cores: Object.freeze(["拡張", "視野", "冒険", "意味"]),
      phrases: Object.freeze(["遠くを見る", "意味を探す"]),
    },
    capricorn: {
      name: "山羊座",
      cores: Object.freeze(["骨格", "現実", "持続責任", "制度"]),
      phrases: Object.freeze(["形にする", "背負えるかどうか"]),
    },
    aquarius: {
      name: "水瓶座",
      cores: Object.freeze(["更新", "未来", "ネットワーク", "自由"]),
      phrases: Object.freeze(["更新", "個を超える"]),
    },
    pisces: {
      name: "魚座",
      cores: Object.freeze(["溶ける", "共鳴", "境界", "漂う"]),
      phrases: Object.freeze(["境目が薄い", "にじむ"]),
    },
  }),
});

module.exports = { MODERN_CORE_V1 };
