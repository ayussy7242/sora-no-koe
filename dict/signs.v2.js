"use strict";

/**
 * signs.v2 (OPTIMIZED)
 *
 * 目的：
 * - flavor を「空気の型」最小単位に統一（意味を増やさない）
 * - verbs は process 専用（3つに圧縮）
 * - texture は内部参照（出力しない前提）
 * - tendency_key は GRAMMAR の重み付けヒントのみ
 *
 * 互換キー維持：
 * label_ja / element / modality / core / tone / sora_short / sora / keywords / ai_tags
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

      // V2
      flavor: "始動が前に出る空気。",
      texture: ["速い", "直線的", "熱が先行", "迷いが薄い", "点火しやすい"],
      verbs: ["始める", "切り込む", "突破する"],
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

      flavor: "感覚が輪郭を持つ空気。",
      texture: ["ゆっくり", "確か", "触感的", "粘り強い", "変えにくい"],
      verbs: ["味わう", "保つ", "育てる"],
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

      flavor: "行き来が増える空気。",
      texture: ["軽い", "早い", "切り替わる", "散らばる", "接続的"],
      verbs: ["つなぐ", "伝える", "切り替える"],
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

      flavor: "内側に寄る空気。",
      texture: ["やわらかい", "内向き", "包む", "敏感", "親密に寄る"],
      verbs: ["包む", "守る", "温める"],
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

      flavor: "中心が目に入る空気。",
      texture: ["明るい", "まっすぐ", "熱い", "目に入りやすい", "誇りが触れやすい"],
      verbs: ["示す", "創る", "掲げる"],
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

      flavor: "微差が際立つ空気。",
      texture: ["細い", "正確", "実務的", "手入れ感", "整頓的"],
      verbs: ["整える", "仕分ける", "磨く"],
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

      flavor: "釣り合いが立つ空気。",
      texture: ["整う", "対話的", "客観", "美的", "均衡に敏感"],
      verbs: ["量る", "調整する", "対話する"],
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

      flavor: "深さが増す空気。",
      texture: ["深い", "濃密", "静か", "境界が鋭い", "共有に触れる"],
      verbs: ["掘る", "結ぶ", "浄化する"],
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

      flavor: "遠くが開く空気。",
      texture: ["広い", "軽快", "未来志向", "探索的", "意味が動く"],
      verbs: ["探す", "広げる", "学ぶ"],
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

      flavor: "骨格が見える空気。",
      texture: ["硬い", "現実的", "持続", "段取り", "骨格が見える"],
      verbs: ["積む", "設計する", "仕上げる"],
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

      flavor: "距離が生まれる空気。",
      texture: ["冷静", "俯瞰", "非連続", "自由", "更新的"],
      verbs: ["観測する", "切り離す", "組み替える"],
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

      flavor: "輪郭がにじむ空気。",
      texture: ["にじむ", "やわらかい", "溶ける", "遠い", "共鳴的"],
      verbs: ["にじませる", "受け取る", "共鳴する"],
      tendency_key: "mid",
    },
  },

  // UI順（黄道順）
  order: [
    "aries", "taurus", "gemini", "cancer", "leo", "virgo",
    "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces",
  ],
};

(function injectFlavorWordingIntoSignsV2() {
  const COMMON_VERBS = [
    "整える", "調整する", "試す", "観測する", "磨く",
    "混ぜる", "ほどく", "固める", "切り替える", "合わせる",
  ];

  const COMMON_TEXTURE = [
    "粒度", "温度差", "余白", "距離感", "密度",
    "輪郭", "明度", "配分", "重なり", "境目",
  ];

  const PER_SIGN = {
    aries: {
      verbs: ["起動する", "走り出す", "押し出す", "直線化する"],
      texture: ["勢い", "初速", "直進感", "即応"],
    },
    taurus: {
      verbs: ["定着させる", "整備する", "保つ", "蓄える"],
      texture: ["安定", "粘り", "厚み", "持続"],
    },
    gemini: {
      verbs: ["行き来する", "言い換える", "切り替える", "並べる"],
      texture: ["軽さ", "速度差", "対話感", "多層"],
    },
    cancer: {
      verbs: ["守る", "包む", "養う", "馴染ませる"],
      texture: ["保護", "内側", "湿度", "親密さ"],
    },
    leo: {
      verbs: ["照らす", "示す", "引き上げる", "前に出す"],
      texture: ["中心感", "明るさ", "誇り", "存在感"],
    },
    virgo: {
      verbs: ["整える", "磨く", "仕分ける", "調律する"],
      texture: ["精密", "手入れ感", "実務性", "細やかさ"],
    },
    libra: {
      verbs: ["量る", "釣り合わせる", "調停する", "調律する"],
      texture: ["均衡", "客観", "対話感", "美意識"],
    },
    scorpio: {
      verbs: ["掘る", "深める", "集約する", "変える"],
      texture: ["濃度", "深さ", "内圧", "集中"],
    },
    sagittarius: {
      verbs: ["広げる", "伸ばす", "探る", "越える"],
      texture: ["遠景", "拡張", "伸び", "開放感"],
    },
    capricorn: {
      verbs: ["積み上げる", "固定する", "形にする", "支える"],
      texture: ["骨格", "現実感", "重み", "持続性"],
    },
    aquarius: {
      verbs: ["更新する", "切り離す", "再設計する", "俯瞰する"],
      texture: ["距離", "非連続", "自由", "再編"],
    },
    pisces: {
      verbs: ["にじませる", "溶かす", "受け取る", "共鳴する"],
      texture: ["余韻", "霞", "やわらかさ", "境界の薄さ"],
    },
  };

  function uniqPush(arr, items) {
    if (!Array.isArray(arr)) return items ? Array.from(new Set(items)) : [];
    const set = new Set(arr.map(String));
    (items || []).forEach((x) => set.add(String(x)));
    return Array.from(set);
  }

  const signs = SIGNS_V2?.signs || {};
  Object.keys(signs).forEach((k) => {
    const s = signs[k];
    if (!s || typeof s !== "object") return;
    const add = PER_SIGN[k] || {};

    s.verbs = uniqPush(s.verbs || [], [...COMMON_VERBS, ...(add.verbs || [])]);
    s.texture = uniqPush(s.texture || [], [...COMMON_TEXTURE, ...(add.texture || [])]);
  });
})();

module.exports = { SIGNS_V2 };
