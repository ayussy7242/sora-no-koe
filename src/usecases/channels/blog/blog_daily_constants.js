"use strict";

const dict = require("../../../content/dict");
const { EXTENDED_PLANETS, DEEP_BODIES } = require("../../../domain/astro/constants");
const { resolveProximityConfig } = require("../../../config/aspect_channel_config");

const BLOG_BANNED_TERMS = [
  "あなた",
  "あなたは",
  "あなたが",
  "必ず",
  "確実",
  "逃れられない",
  "絶対",
  "運命",
  "使命",
  "すべき",
  "した方がいい",
  "したほうがいい",
  "しよう",
  "求められる",
  "必要",
  "べき",
  "これその配置のまま",
  "日本語校正フェーズ",
  "校正フェーズ",
  "日本語校正",
  "内部処理",
  "処理しました",
  "実行しました",
];

const BLOG_TITLE_EXCLUDE_BODIES = new Set(DEEP_BODIES);
const BLOG_TITLE_BODY_ORDER = EXTENDED_PLANETS;
const BLOG_TITLE_BODY_RANK = BLOG_TITLE_BODY_ORDER.reduce((acc, key, idx) => {
  acc[key] = idx + 1;
  return acc;
}, {});

const BLOG_STRUCT_BODY_ORDER = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
  "lilith",
  "chiron",
];

const BLOG_STRUCT_SIGN_ORDER =
  dict?.SIGNS_V2?.order ||
  dict?.SIGNS?.order || [
    "aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces",
  ];

const BLOG_STRUCT_TSUKIJI_MIN_DAYS = 30;
const BLOG_STRUCT_TSUKIJI_MAX = 3;
const BLOG_PROXIMITY_CFG = resolveProximityConfig("blog_daily", dict);

module.exports = {
  BLOG_BANNED_TERMS,
  BLOG_TITLE_EXCLUDE_BODIES,
  BLOG_TITLE_BODY_ORDER,
  BLOG_TITLE_BODY_RANK,
  BLOG_STRUCT_BODY_ORDER,
  BLOG_STRUCT_SIGN_ORDER,
  BLOG_STRUCT_TSUKIJI_MIN_DAYS,
  BLOG_STRUCT_TSUKIJI_MAX,
  BLOG_PROXIMITY_CFG,
};
