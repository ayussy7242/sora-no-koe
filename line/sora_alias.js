"use strict";

// line/sora_alias.js
// - LINEコマンド / API channel の共通エイリアス定義
// - mode は line/intent.js の SORA_MODE と一致する文字列を使う

const SORA_ALIAS_ENTRIES = Object.freeze([
  // ALL
  { alias: "そらぜんぶ", mode: "sora_all", channel: "line_sora_all" },
  { alias: "そら全部", mode: "sora_all", channel: "line_sora_all" },
  { alias: "soraall", mode: "sora_all", channel: "line_sora_all" },
  { alias: "sora_all", mode: "sora_all", channel: "line_sora_all" },
  { alias: "sora_all_line", mode: "sora_all", channel: "line_sora_all" },
  { alias: "line_sora_all", mode: "sora_all", channel: "line_sora_all" },
  { alias: "うらがわ", mode: "sora_all", channel: "line_sora_all" },

  // URA
  { alias: "そらのうら", mode: "sora_ura", channel: "line_sora_ura" },
  { alias: "ソラのうら", mode: "sora_ura", channel: "line_sora_ura" },
  { alias: "うらこまんど", mode: "sora_ura", channel: "line_sora_ura" },
  { alias: "うらコマンド", mode: "sora_ura", channel: "line_sora_ura" },
  { alias: "うら", mode: "sora_ura", channel: "line_sora_ura" },
  { alias: "sora_ura", mode: "sora_ura", channel: "line_sora_ura" },
  { alias: "sora_ura_line", mode: "sora_ura", channel: "line_sora_ura" },
  { alias: "line_sora_ura", mode: "sora_ura", channel: "line_sora_ura" },

  // SILENT
  { alias: "沈黙のほし", mode: "sora_ura_silent", channel: "line_sora_ura_silent" },
  { alias: "沈黙", mode: "sora_ura_silent", channel: "line_sora_ura_silent" },
  { alias: "ちんもく", mode: "sora_ura_silent", channel: "line_sora_ura_silent" },
  { alias: "ちんもくのほし", mode: "sora_ura_silent", channel: "line_sora_ura_silent" },
  { alias: "chinmoku", mode: "sora_ura_silent", channel: "line_sora_ura_silent" },
  { alias: "chimmoku", mode: "sora_ura_silent", channel: "line_sora_ura_silent" },
  { alias: "sora_ura_silent", mode: "sora_ura_silent", channel: "line_sora_ura_silent" },
  { alias: "line_sora_ura_silent", mode: "sora_ura_silent", channel: "line_sora_ura_silent" },

  // RARE
  { alias: "裏共鳴", mode: "sora_ura_rare", channel: "line_sora_ura_rare" },
  { alias: "うら共鳴", mode: "sora_ura_rare", channel: "line_sora_ura_rare" },
  { alias: "裏きょうめい", mode: "sora_ura_rare", channel: "line_sora_ura_rare" },
  { alias: "きょうのうら", mode: "sora_ura_rare", channel: "line_sora_ura_rare" },
  { alias: "kyou_no_ura", mode: "sora_ura_rare", channel: "line_sora_ura_rare" },
  { alias: "sora_ura_rare", mode: "sora_ura_rare", channel: "line_sora_ura_rare" },
  { alias: "line_sora_ura_rare", mode: "sora_ura_rare", channel: "line_sora_ura_rare" },

  // HARMONY
  { alias: "調和層", mode: "sora_ura_harmony", channel: "line_sora_ura_harmony" },
  { alias: "調和", mode: "sora_ura_harmony", channel: "line_sora_ura_harmony" },
  { alias: "ちょうわ層", mode: "sora_ura_harmony", channel: "line_sora_ura_harmony" },
  { alias: "ちょうわ", mode: "sora_ura_harmony", channel: "line_sora_ura_harmony" },
  { alias: "chouwa", mode: "sora_ura_harmony", channel: "line_sora_ura_harmony" },
  { alias: "sora_ura_harmony", mode: "sora_ura_harmony", channel: "line_sora_ura_harmony" },
  { alias: "line_sora_ura_harmony", mode: "sora_ura_harmony", channel: "line_sora_ura_harmony" },

  // TOP
  { alias: "そら", mode: "sora_top", channel: "line_sora" },
  { alias: "sora", mode: "sora_top", channel: "line_sora" },
  { alias: "sora_line", mode: "sora_top", channel: "line_sora" },
  { alias: "line_sora", mode: "sora_top", channel: "line_sora" },
]);

module.exports = { SORA_ALIAS_ENTRIES };
