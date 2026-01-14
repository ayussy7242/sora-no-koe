"use strict";

/**
 * signs.v1
 * - サイン＝“空気の型”
 * - element / modality も紐づけておく（後段で自動差分が出せる）
 * - tone: 惑星に掛ける「質感フレーズ」（短文・形容詞レイヤー）
 */
const SIGNS_V1 = {
  version: "signs.v1",
  signs: {
    Aries: {
      label_ja: "牡羊座",
      element: "fire",
      modality: "cardinal",
      core: "始まり・衝動・直線",
      tone: "衝動的に立ち上げる",
      sora_short: "始動の火。",
      sora: "始まりの火。まず動くことで道が見えやすい空気。",
      keywords: ["始まり", "衝動", "直線", "スピード"],
      ai_tags: ["start", "bold"],
    },

    Taurus: {
      label_ja: "牡牛座",
      element: "earth",
      modality: "fixed",
      core: "身体・感覚・定着",
      tone: "感覚を通して定着させる",
      sora_short: "定着の地。",
      sora: "身体と感覚を通じて、安心を定着させやすい空気。",
      keywords: ["身体", "感覚", "安定", "価値"],
      ai_tags: ["ground", "sensory"],
    },

    Gemini: {
      label_ja: "双子座",
      element: "air",
      modality: "mutable",
      core: "情報・交換・軽さ",
      tone: "軽やかに行き来させる",
      sora_short: "循環の風。",
      sora: "情報と会話で循環が起きやすい空気。",
      keywords: ["情報", "会話", "交換", "好奇心"],
      ai_tags: ["exchange", "curious"],
    },

    Cancer: {
      label_ja: "蟹座",
      element: "water",
      modality: "cardinal",
      core: "居場所・保護・親密",
      tone: "感情を含んで守る",
      sora_short: "守る水。",
      sora: "居場所と親密さに意識が向きやすい空気。",
      keywords: ["居場所", "保護", "親密", "安心"],
      ai_tags: ["home", "nurture"],
    },

    Leo: {
      label_ja: "獅子座",
      element: "fire",
      modality: "fixed",
      core: "表現・中心・誇り",
      tone: "中心から表現する",
      sora_short: "輝きの火。",
      sora: "自分の中心の温度を、表現として置きやすい空気。",
      keywords: ["表現", "中心", "創造", "誇り"],
      ai_tags: ["shine", "creative"],
    },

    Virgo: {
      label_ja: "乙女座",
      element: "earth",
      modality: "mutable",
      core: "整える・分析・微調整",
      tone: "細部を整えながら扱う",
      sora_short: "整える地。",
      sora: "微調整を通して、現実を整えやすい空気。",
      keywords: ["整える", "分析", "改善", "手入れ"],
      ai_tags: ["refine", "analyze"],
    },

    Libra: {
      label_ja: "天秤座",
      element: "air",
      modality: "cardinal",
      core: "関係・バランス・美意識",
      tone: "関係性の中で調整する",
      sora_short: "調律の風。",
      sora: "関係性のバランスを調律しやすい空気。",
      keywords: ["関係", "バランス", "美意識", "対話"],
      ai_tags: ["balance", "relate"],
    },

    Scorpio: {
      label_ja: "蠍座",
      element: "water",
      modality: "fixed",
      core: "深層・境界・変容",
      tone: "深く掘り下げて変容させる",
      sora_short: "深い水。",
      sora: "表に出ない感情の層に触れやすい空気。",
      keywords: ["深層", "境界", "共有", "変容"],
      ai_tags: ["depth", "transform"],
    },

    Sagittarius: {
      label_ja: "射手座",
      element: "fire",
      modality: "mutable",
      core: "拡張・探求・視野",
      tone: "外へ広げて意味づける",
      sora_short: "広がる火。",
      sora: "視野を外へ広げ、可能性を探りやすい空気。",
      keywords: ["探求", "拡張", "視野", "意味"],
      ai_tags: ["explore", "expand"],
    },

    Capricorn: {
      label_ja: "山羊座",
      element: "earth",
      modality: "cardinal",
      core: "構造・責任・積み上げ",
      tone: "現実的に形にする",
      sora_short: "積み上げる地。",
      sora: "時間を使って形を作り、積み上げやすい空気。",
      keywords: ["構造", "責任", "継続", "成果"],
      ai_tags: ["build", "discipline"],
    },

    Aquarius: {
      label_ja: "水瓶座",
      element: "air",
      modality: "fixed",
      core: "刷新・観測・自由",
      tone: "既存から切り離して更新する",
      sora_short: "更新の風。",
      sora: "違う視点で観測し、更新を起こしやすい空気。",
      keywords: ["刷新", "観測", "自由", "発明"],
      ai_tags: ["innovate", "observe"],
    },

    Pisces: {
      label_ja: "魚座",
      element: "water",
      modality: "mutable",
      core: "溶解・共鳴・余韻",
      tone: "境界を溶かして共鳴させる",
      sora_short: "溶ける水。",
      sora: "境界がゆるみ、余韻として共鳴が残りやすい空気。",
      keywords: ["共鳴", "余韻", "直感", "溶解"],
      ai_tags: ["resonate", "dreamy"],
    },
  },

  // UI順（黄道順）
  order: [
    "Aries","Taurus","Gemini","Cancer","Leo","Virgo",
    "Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"
  ],
};

module.exports = { SIGNS_V1 };
