"use strict";

/**
 * anshin.v1
 * - 「あんしんネイタル」専用の通過語彙
 * - ここを必ず通す（出力の安定と一貫性）
 */

const ANSHIN_V1 = Object.freeze({
  version: "anshin.v1",
  locale: "ja",

  // 文言固定（構造説明）
  intro_lines: [
    "🪐 あんしんネイタルの星｜{date}",
    "",
    "揺らされにくい領域の構造",
    "",
    "今日は、",
    "他の星との関係に入っていない",
    "ネイタルの星が浮かんでいます。",
  ],

  // 締め
  tail_lines: [
    "",
    "ここがあるから、揺れないわけでもない。",
    "ただ、他と絡まれずに残っている場所。",
    "",
    "安心とは感情ではなく、",
    "残り方の構造である。",
  ],

  // サインの空気を“あんしん文”に寄せる
  sign_phrase: {
    aries: "始まりが前に出る空気",
    taurus: "感覚が輪郭を持つ空気",
    gemini: "行き来が増える空気",
    cancer: "内側に寄る空気",
    leo: "中心が目に入る空気",
    virgo: "微差が際立つ空気",
    libra: "調律が働く空気",
    scorpio: "境界が深まる空気",
    sagittarius: "視野が外へ開く空気",
    capricorn: "骨格が見える空気",
    aquarius: "更新が前に出る空気",
    pisces: "余韻が広がる空気",
  },

  // 惑星別の「残りやすさ」表現
  planet_residue: {
    sun: "中心の意志が残る",
    moon: "反応と安心が残る",
    mercury: "思考のテンポが残る",
    venus: "価値と距離感が残る",
    mars: "動かす力の土台が残る",
    jupiter: "拡がりの視野が残る",
    saturn: "枠と時間が残る",
    uranus: "更新の癖が残る",
    neptune: "余韻の回路が残る",
    pluto: "深層の圧が残る",
  },

  // 惑星アイコン（あんしん用）
  planet_emoji: {
    sun: "☀️",
    moon: "🌙",
    mercury: "🪐",
    venus: "💫",
    mars: "💫",
    jupiter: "🪐",
    saturn: "🪐",
    uranus: "🪐",
    neptune: "🪐",
    pluto: "🪐",
  },
});

// ------------------------------
// summary map (sign × planet)
// ------------------------------
const SUMMARY_PREFIX = Object.freeze({
  aries: "始まりと衝動に根づいた、",
  taurus: "身体と生活に根づいた、",
  gemini: "言葉と行き来に根づいた、",
  cancer: "居場所と内側に根づいた、",
  leo: "表現と中心に根づいた、",
  virgo: "整えと実務に根づいた、",
  libra: "関係と均衡に根づいた、",
  scorpio: "境界と深層に根づいた、",
  sagittarius: "視野と拡張に根づいた、",
  capricorn: "役割と時間に根づいた、",
  aquarius: "更新と俯瞰に根づいた、",
  pisces: "余韻と共鳴に根づいた、",
});

const SUMMARY_NOUN = Object.freeze({
  sun: "中心の軸",
  moon: "安心の回路",
  mercury: "思考の通路",
  venus: "価値の基準",
  mars: "動かす力の土台",
  jupiter: "拡張の視野",
  saturn: "動かない基盤",
  uranus: "更新のスイッチ",
  neptune: "余韻の水脈",
  pluto: "深層の圧",
});

function buildSummaryMap() {
  const out = {};
  for (const [sKey, prefix] of Object.entries(SUMMARY_PREFIX)) {
    out[sKey] = {};
    for (const [pKey, noun] of Object.entries(SUMMARY_NOUN)) {
      out[sKey][pKey] = `${prefix}${noun}`;
    }
  }
  return Object.freeze(out);
}

const ANSHIN_V1_EXT = Object.freeze({
  ...ANSHIN_V1,
  summary_prefix: SUMMARY_PREFIX,
  summary_noun: SUMMARY_NOUN,
  summary_by_sign_planet: buildSummaryMap(),
});

module.exports = { ANSHIN_V1: ANSHIN_V1_EXT };
