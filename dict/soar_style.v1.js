"use strict";

/**
 * soar_style.v1
 * - "主語は惑星" / "サインは修飾" / "アスペクトは状態"
 * - personal / sky 共通で使えるベース辞書
 * - 深さ(light/mid/deep)を用意（将来の有料版拡張用）
 */

const SOAR_STYLE_V1 = Object.freeze({
  version: "soar_style.v1",
  locale: "ja",

  depths: ["light", "mid", "deep"],

  planets: Object.freeze({
    sun: {
      subjects: ["核", "意志", "起点"],
      modes: ["行動", "思考"],
      modifier_template: "{sign}を基準にしやすい",
    },
    moon: {
      subjects: ["心", "反応", "安心の置きどころ"],
      modes: ["反応", "感覚"],
      modifier_template: "{sign}で安心しやすい",
    },
    mercury: {
      subjects: ["思考", "言葉", "テンポ"],
      modes: ["思考", "テンポ"],
      modifier_template: "{sign}を言葉にしやすい",
    },
    venus: {
      subjects: ["価値観", "好み", "距離感"],
      modes: ["距離感", "心"],
      modifier_template: "{sign}に価値を置きやすい",
    },
    mars: {
      subjects: ["衝動", "境界の感覚", "推進力"],
      modes: ["行動", "境界の感覚"],
      modifier_template: "{sign}に踏み込みやすい",
    },
    jupiter: {
      subjects: ["伸び", "視野", "拡がり"],
      modes: ["行動", "思考"],
      modifier_template: "{sign}を広げやすい",
    },
    saturn: {
      subjects: ["骨格", "責任感", "構造意識"],
      modes: ["行動", "境界の感覚"],
      modifier_template: "{sign}を固めやすい",
    },
    uranus: {
      subjects: ["自由意識", "更新衝動", "ズレ感覚"],
      modes: ["思考", "距離感"],
      modifier_template: "{sign}を更新しやすい",
    },
    neptune: {
      subjects: ["感受性", "余韻", "直感"],
      modes: ["感覚", "距離感"],
      modifier_template: "{sign}がにじみやすい",
    },
    pluto: {
      subjects: ["深層意識", "圧", "変容点"],
      modes: ["思考", "距離感"],
      modifier_template: "{sign}が深まりやすい",
    },
    chiron: {
      subjects: ["痛点", "学び", "入口"],
      modes: ["感覚"],
      modifier_template: "{sign}が痛点になりやすい",
    },
    asc: {
      subjects: ["第一印象", "入口", "身体感覚"],
      modes: ["第一印象"],
      modifier_template: "{sign}が印象に出やすい",
    },
  }),

  // personal 用：人間語の主語（abstract 禁止）
  personal_subjects: Object.freeze({
    sun: ["意識", "集中の向き"],
    moon: ["心", "反応", "安心の置きどころ"],
    mercury: ["テンポ", "思考"],
    venus: ["距離感", "心"],
    mars: ["境界の感覚", "意識"],
    jupiter: ["意識", "集中の向き"],
    saturn: ["境界の感覚", "意識"],
    uranus: ["意識", "テンポ"],
    neptune: ["感覚", "心"],
    pluto: ["意識", "集中の向き"],
    chiron: ["感覚"],
    asc: ["第一印象"],
  }),

  personal_modes: Object.freeze({
    sun: ["行動", "思考"],
    moon: ["反応"],
    mercury: ["思考", "テンポ"],
    venus: ["距離感"],
    mars: ["行動", "境界の感覚"],
    jupiter: ["行動", "思考"],
    saturn: ["行動"],
    uranus: ["思考", "距離感"],
    neptune: ["感覚", "距離感"],
    pluto: ["思考", "距離感"],
    chiron: ["感覚"],
    asc: ["第一印象"],
  }),

  signs: Object.freeze({
    aries: { keywords: ["始まり", "衝動", "点火", "直線", "突破"] },
    taurus: { keywords: ["定着", "体感", "蓄え", "持続", "感覚"] },
    gemini: { keywords: ["言葉", "交換", "軽さ", "行き来", "情報"] },
    cancer: { keywords: ["内側", "保護", "親密", "居場所", "守り"] },
    leo: { keywords: ["表現", "中心", "誇り", "灯", "存在感"] },
    virgo: { keywords: ["整え", "分析", "手入れ", "微調整", "実務"] },
    libra: { keywords: ["対等", "バランス", "調律", "美意識", "対話"] },
    scorpio: { keywords: ["深さ", "境界", "濃度", "変容", "共有"] },
    sagittarius: { keywords: ["拡張", "探求", "遠景", "意味", "伸び"] },
    capricorn: { keywords: ["構造", "責任", "積み上げ", "現実", "骨格"] },
    aquarius: { keywords: ["俯瞰", "自由", "更新", "再設計", "未来"] },
    pisces: { keywords: ["溶解", "共鳴", "余韻", "にじみ", "境界の薄さ"] },
  }),

  states: Object.freeze({
    light: [
      "間ができやすい",
      "張りやすい",
      "固まりやすい",
      "揺れやすい",
      "切り替わりやすい",
      "混ざりやすい",
      "滞りやすい",
      "整え直しが起きやすい",
      "置き直しが起きやすい",
      "流れが通りやすい",
      "引っかかりが出やすい",
      "馴染みやすい",
      "緩急がつきやすい",
      "段取り替えが起きやすい",
      "境目が見えやすい",
      "輪郭が出やすい",
      "伸びやすい",
      "沈みやすい",
    ],
    mid: [
      "輪郭が立ちやすい",
      "距離が揺れやすい",
      "張りが出やすい",
      "切り替えが進みやすい",
      "混ざりが深まりやすい",
      "整え直しが起きやすい",
      "接点が目立ちやすい",
      "行き来が増えやすい",
      "ぶつかりが出やすい",
      "引力が強まりやすい",
      "保留が残りやすい",
      "修正が入りやすい",
      "幅が出やすい",
      "交換が増えやすい",
    ],
    deep: [
      "奥で反応が続きやすい",
      "言葉より体感が先に動きやすい",
      "境目が曖昧になりやすい",
      "気配として残りやすい",
      "静かに馴染みやすい",
      "余韻が長く残りやすい",
      "内側で落ち着きやすい",
      "ゆっくり統合が進みやすい",
      "確定より保留が残りやすい",
    ],
  }),

  state_by_aspect: Object.freeze({
    conjunction: {
      light: ["混ざりやすい", "固まりやすい", "強調されやすい"],
      mid: ["輪郭が濃く出やすい", "一体化しやすい"],
      deep: ["奥で統合が進みやすい", "余韻が残りやすい"],
    },
    trine: {
      light: ["流れが通りやすい", "馴染みやすい"],
      mid: ["循環が回りやすい", "自然にまとまりやすい"],
      deep: ["静かに定着しやすい", "内側で落ち着きやすい"],
    },
    sextile: {
      light: ["切り替わりやすい", "接点が目立ちやすい"],
      mid: ["通路が開きやすい", "交換が増えやすい"],
      deep: ["静かな接点が残りやすい"],
    },
    square: {
      light: ["張りが出やすい", "引っかかりが出やすい"],
      mid: ["交差が強まりやすい", "試行錯誤が増えやすい"],
      deep: ["圧が残りやすい"],
    },
    opposition: {
      light: ["揺れやすい", "揺り戻しが出やすい"],
      mid: ["対比が立ちやすい", "映りが出やすい"],
      deep: ["鏡として残りやすい"],
    },
    quincunx_150: {
      light: ["置き直しが起きやすい", "整え直しが起きやすい"],
      mid: ["噛み合い直しが増えやすい", "修正が入りやすい"],
      deep: ["違和感が残りやすい"],
    },
    semi_square_45: {
      light: ["引っかかりが出やすい", "小さなズレが出やすい"],
      mid: ["微調整が増えやすい"],
      deep: ["気配レベルで引っかかりやすい"],
    },
    sesqui_square_135: {
      light: ["滞りやすい", "張りが出やすい"],
      mid: ["限界手前の摩擦が出やすい", "圧が溜まりやすい"],
      deep: ["転換点の気配が残りやすい"],
    },
    semi_sextile_30: {
      light: ["混ざりやすい", "気配として出やすい"],
      mid: ["接点がぼやけやすい"],
      deep: ["無意識に触れやすい"],
    },
    quintile_72: {
      light: ["整え直しが起きやすい", "工夫が出やすい"],
      mid: ["試しが増えやすい", "磨き込みやすい"],
      deep: ["職人気質が残りやすい"],
    },
    biquintile_144: {
      light: ["整え直しが起きやすい", "反復が増えやすい"],
      mid: ["熟成が進みやすい", "工夫が深まりやすい"],
      deep: ["静かな完成度が残りやすい"],
    },
    novile_40: {
      light: ["静かに馴染みやすい"],
      mid: ["内側で整いやすい"],
      deep: ["落ち着きが残りやすい"],
    },
    binovile_80: {
      light: ["ゆっくり整いやすい"],
      mid: ["内面の調律が進みやすい"],
      deep: ["静かな修復が残りやすい"],
    },
    quadranovile_160: {
      light: ["静かな確定が出やすい"],
      mid: ["内的な完成が進みやすい"],
      deep: ["確定の余韻が残りやすい"],
    },
    decile_36: {
      light: ["実装に落ちやすい"],
      mid: ["組み立てが進みやすい"],
      deep: ["手が動きやすい"],
    },
    tridecile_108: {
      light: ["運用に回りやすい"],
      mid: ["仕組み化が進みやすい"],
      deep: ["回し方が見えやすい"],
    },
  }),

  // アスペクトの質感（tone）に合わせた状態語
  state_by_tone: Object.freeze({
    tense: ["張りが出やすい", "引っかかりが出やすい", "緊張が残りやすい"],
    smooth: ["流れが通りやすい", "馴染みやすい", "整いに向かいやすい"],
    blend: ["混ざりやすい", "濃くなりやすい", "強調されやすい"],
    adjust: ["微調整が起きやすい", "折り合いが出やすい", "揺れが出やすい"],
    craft: ["試しが増えやすい", "磨き込みやすい", "工夫が出やすい", "手が動きやすい"],
    inward: ["内側で整いやすい", "静かに馴染みやすい", "余韻が残りやすい"],
  }),
});

module.exports = { SOAR_STYLE_V1 };
