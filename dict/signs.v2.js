"use strict";

/**
 * signs.v2
 * - サイン＝“空気の型”
 * - V1互換のキーは維持（label_ja / element / modality / core / tone / sora_short / sora / keywords / ai_tags）
 * - V2追加：flavor / texture / verbs / tendency_key
 *
 * 目的：
 * - render/fusion が「説明文」ではなく「差し込みパーツ」で自然合成できるようにする
 * - “占い化”しない（判断しない／予測しない／行動を促さない）
 *
 * tendency_key:
 * - GRAMMARS_V1.categories.tendency の light/mid/deep のどれを寄せやすいか（重み付け用のヒント）
 */
const SIGNS_V2 = {
  version: "signs.v2",
  signs: {
    aries: {
      label_ja: "牡羊座",
      element: "fire",
      modality: "cardinal",
      core: "始まり・衝動・直線",
      tone: "衝動的に立ち上げる",
      sora_short: "始動の火。",
      sora: "始まりの火。まず動くことで道が見えやすい空気。",
      keywords: ["始まり", "衝動", "直線", "スピード"],
      ai_tags: ["start", "bold"],

      flavor: "はじまりが先に立つ空気。",
      texture: ["速い", "直線的", "熱が先行", "迷いが薄い", "点火しやすい"],
      verbs: ["始める", "突き進む", "切り込む", "点ける", "突破する"],
      tendency_key: "mid",
    },

    taurus: {
      label_ja: "牡牛座",
      element: "earth",
      modality: "fixed",
      core: "身体・感覚・定着",
      tone: "感覚を通して定着させる",
      sora_short: "定着の地。",
      sora: "身体と感覚を通じて、安心を定着させやすい空気。",
      keywords: ["身体", "感覚", "安定", "価値"],
      ai_tags: ["ground", "sensory"],

      flavor: "感覚が現実をつかまえる空気。",
      texture: ["ゆっくり", "確か", "触感的", "粘り強い", "変えにくい"],
      verbs: ["味わう", "保つ", "固める", "育てる", "定着させる"],
      tendency_key: "light",
    },

    gemini: {
      label_ja: "双子座",
      element: "air",
      modality: "mutable",
      core: "情報・交換・軽さ",
      tone: "軽やかに行き来させる",
      sora_short: "循環の風。",
      sora: "情報と会話で循環が起きやすい空気。",
      keywords: ["情報", "会話", "交換", "好奇心"],
      ai_tags: ["exchange", "curious"],

      flavor: "言葉と情報が行き来する空気。",
      texture: ["軽い", "早い", "切り替わる", "散らばる", "接続的"],
      verbs: ["つなぐ", "伝える", "聞く", "並べる", "切り替える"],
      tendency_key: "light",
    },

    cancer: {
      label_ja: "蟹座",
      element: "water",
      modality: "cardinal",
      core: "居場所・保護・親密",
      tone: "感情を含んで守る",
      sora_short: "守る水。",
      sora: "居場所と親密さに意識が向きやすい空気。",
      keywords: ["居場所", "保護", "親密", "安心"],
      ai_tags: ["home", "nurture"],

      flavor: "居場所の輪郭が触れやすい空気。",
      texture: ["やわらかい", "内向き", "包む", "敏感", "親密に寄る"],
      verbs: ["守る", "包む", "寄せる", "温める", "育む"],
      tendency_key: "mid",
    },

    leo: {
      label_ja: "獅子座",
      element: "fire",
      modality: "fixed",
      core: "表現・中心・誇り",
      tone: "中心から表現する",
      sora_short: "輝きの火。",
      sora: "自分の中心の温度を、表現として置きやすい空気。",
      keywords: ["表現", "中心", "創造", "誇り"],
      ai_tags: ["shine", "creative"],

      flavor: "自分の中心の温度を、外に置く空気。",
      texture: ["明るい", "まっすぐ", "熱い", "目に入りやすい", "誇りが触れやすい"],
      verbs: ["照らす", "示す", "前に出す", "創る", "掲げる"],
      tendency_key: "mid",
    },

    virgo: {
      label_ja: "乙女座",
      element: "earth",
      modality: "mutable",
      core: "整える・分析・微調整",
      tone: "細部を整えながら扱う",
      sora_short: "整える地。",
      sora: "微調整を通して、現実を整えやすい空気。",
      keywords: ["整える", "分析", "改善", "手入れ"],
      ai_tags: ["refine", "analyze"],

      flavor: "微差が見えやすい空気。",
      texture: ["細い", "正確", "実務的", "手入れ感", "整頓的"],
      verbs: ["整える", "点検する", "仕分ける", "修正する", "磨く"],
      tendency_key: "light",
    },

    libra: {
      label_ja: "天秤座",
      element: "air",
      modality: "cardinal",
      core: "関係・バランス・美意識",
      tone: "関係性の中で調整する",
      sora_short: "調律の風。",
      sora: "関係性のバランスを調律しやすい空気。",
      keywords: ["関係", "バランス", "美意識", "対話"],
      ai_tags: ["balance", "relate"],

      flavor: "関係の釣り合いがテーマになりやすい空気。",
      texture: ["整う", "対話的", "客観", "美的", "均衡に敏感"],
      verbs: ["量る", "調整する", "並べる", "対話する", "整える"],
      tendency_key: "light",
    },

    scorpio: {
      label_ja: "蠍座",
      element: "water",
      modality: "fixed",
      core: "深層・境界・変容",
      tone: "深く掘り下げて変容させる",
      sora_short: "深い水。",
      sora: "表に出ない感情の層に触れやすい空気。",
      keywords: ["深層", "境界", "共有", "変容"],
      ai_tags: ["depth", "transform"],

      flavor: "見えない層が濃くなる空気。",
      texture: ["深い", "濃密", "静か", "境界が鋭い", "共有に触れる"],
      verbs: ["掘る", "結ぶ", "見抜く", "変える", "浄化する"],
      tendency_key: "mid",
    },

    sagittarius: {
      label_ja: "射手座",
      element: "fire",
      modality: "mutable",
      core: "拡張・探求・視野",
      tone: "外へ広げて意味づける",
      sora_short: "広がる火。",
      sora: "視野を外へ広げ、可能性を探りやすい空気。",
      keywords: ["探求", "拡張", "視野", "意味"],
      ai_tags: ["explore", "expand"],

      flavor: "視野が遠くへ伸びやすい空気。",
      texture: ["広い", "軽快", "未来志向", "探索的", "意味が動く"],
      verbs: ["探す", "広げる", "飛ぶ", "学ぶ", "射抜く"],
      tendency_key: "mid",
    },

    capricorn: {
      label_ja: "山羊座",
      element: "earth",
      modality: "cardinal",
      core: "構造・責任・積み上げ",
      tone: "現実的に形にする",
      sora_short: "積み上げる地。",
      sora: "時間を使って形を作り、積み上げやすい空気。",
      keywords: ["構造", "責任", "継続", "成果"],
      ai_tags: ["build", "discipline"],

      flavor: "形と時間が前に出やすい空気。",
      texture: ["硬い", "現実的", "持続", "段取り", "骨格が見える"],
      verbs: ["積む", "固める", "設計する", "背負う", "仕上げる"],
      tendency_key: "light",
    },

    aquarius: {
      label_ja: "水瓶座",
      element: "air",
      modality: "fixed",
      core: "刷新・観測・自由",
      tone: "既存から切り離して更新する",
      sora_short: "更新の風。",
      sora: "違う視点で観測し、更新を起こしやすい空気。",
      keywords: ["刷新", "観測", "自由", "発明"],
      ai_tags: ["innovate", "observe"],

      flavor: "距離を取って観測しやすい空気。",
      texture: ["冷静", "俯瞰", "非連続", "自由", "更新的"],
      verbs: ["観測する", "切り離す", "更新する", "組み替える", "解放する"],
      tendency_key: "light",
    },

    pisces: {
      label_ja: "魚座",
      element: "water",
      modality: "mutable",
      core: "溶解・共鳴・余韻",
      tone: "境界を溶かして共鳴させる",
      sora_short: "溶ける水。",
      sora: "境界がゆるみ、余韻として共鳴が残りやすい空気。",
      keywords: ["共鳴", "余韻", "直感", "溶解"],
      ai_tags: ["resonate", "dreamy"],

      flavor: "境界がゆるみ、余韻が残りやすい空気。",
      texture: ["にじむ", "やわらかい", "溶ける", "遠い", "共鳴的"],
      verbs: ["溶かす", "にじませる", "ゆだねる", "受け取る", "共鳴する"],
      tendency_key: "mid",
    },
  },

  // UI順（黄道順）: canonical ids
  order: [
    "aries", "taurus", "gemini", "cancer", "leo", "virgo",
    "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces",
  ],
};

module.exports = { SIGNS_V2 };
