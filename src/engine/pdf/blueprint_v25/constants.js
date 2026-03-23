"use strict";

const { SIGN_EN, SIGN_SYMBOL } = require("../blueprint_light/shared");

const PAGE_WIDTH = 1080;
const PAGE_HEIGHT = 1920;
const TOTAL_SLIDES = 10;

const PAGE_INTROS = {
  sys: [
    "この星図の中心となる性質と方向性。",
    "あなたの出生図を、ひとつの構造として読み解く入口。",
  ],
  map: [
    "このページでは、出生チャート全体の配置バランスを俯瞰します。",
    "どこに星が集まり、どの領域に配置が広がるかを示す構造マップです。",
  ],
  obs: [
    "出生ホイール：配置の観測図。",
    "生まれた瞬間の天体配置を、図として確認する。",
  ],
  ang: [
    "世界との接点となる四つの軸。",
    "ASC・MC・IC・DCが示す、個人と世界の接続点。",
  ],
  pln: [
    "各天体の持ち場と役割。",
    "天体がどの領域で働くかを、簡潔に整理する。",
  ],
  lay: [
    "天体群のまとまり（レイヤー）。",
    "天体がどの層に集中し、どの領域が強調されるかを見る。",
  ],
  dep: [
    "水面下にある引力と裏テーマ。",
    "表には出にくい配置や、深層の動きに注目する。",
  ],
  asp: [
    "天体同士の接続回路。",
    "アスペクトによって生まれる、エネルギーの流れと張力。",
  ],
  pat: [
    "構造の統合。",
    "ここまでの配置をまとめ、このチャート全体の輪郭を描く。",
  ],
};

const UI_SCALE = 1.815;
const TITLE_SCALE = 1.44;
const FS_BODY = 13.4 * UI_SCALE;
const FS_SUB = 9.9 * UI_SCALE;
const FS_HEAD = 16 * UI_SCALE * TITLE_SCALE;
const LINE_HEIGHT = 1.72;
const TEXT_MAX_WIDTH = 520;

const BODY_GLYPH = {
  sun: "☉",
  moon: "☽",
  mercury: "☿",
  venus: "♀",
  mars: "♂",
  jupiter: "♃",
  saturn: "♄",
  uranus: "♅",
  neptune: "♆",
  pluto: "♇",
};

const BODY_LABEL_JA = {
  sun: "太陽",
  moon: "月",
  mercury: "水星",
  venus: "金星",
  mars: "火星",
  jupiter: "木星",
  saturn: "土星",
  uranus: "天王星",
  neptune: "海王星",
  pluto: "冥王星",
  asc: "ASC",
};

const PLANET_ROLE_TAGLINES = {
  sun: "中心の核（自己・存在・意志）",
  moon: "感情の反応点（安心・無意識・心の動き）",
  mercury: "思考の回路（言語・思考・伝達）",
  venus: "価値の向き（好み・関係性・心地よさ）",
  mars: "行動の起点（行動・衝動・エネルギー）",
  jupiter: "拡張の方向（成長・拡大・可能性）",
  saturn: "構造の枠（制限・責任・継続）",
  uranus: "変化の起点（革新・逸脱・転換）",
  neptune: "境界の拡散（直感・曖昧・理想）",
  pluto: "深層の変容点（破壊・再生・極端）",
};

const AXIS_ROLE_TAGLINES = {
  asc: "世界への入口｜第一印象・立ち上がり",
  mc: "社会への方向｜仕事・役割",
  ic: "内側の基盤｜安心・土台",
  dc: "他者との接点｜対人・関係",
};

const DEEP_AXIS_ROLE_TAGLINES = {
  north_node: "進行の引力（方向・成長）",
  south_node: "蓄積の基盤（過去・慣れ）",
  chiron: "揺らぎの核（痛み・感受）",
  lilith: "抑圧の焦点（欲望・拒絶）",
};

const SIGN_JA = {
  aries: "牡羊座",
  taurus: "牡牛座",
  gemini: "双子座",
  cancer: "蟹座",
  leo: "獅子座",
  virgo: "乙女座",
  libra: "天秤座",
  scorpio: "蠍座",
  sagittarius: "射手座",
  capricorn: "山羊座",
  aquarius: "水瓶座",
  pisces: "魚座",
};

const SIGN_ELEMENT_MAP = {
  aries: "fire",
  leo: "fire",
  sagittarius: "fire",
  taurus: "earth",
  virgo: "earth",
  capricorn: "earth",
  gemini: "air",
  libra: "air",
  aquarius: "air",
  cancer: "water",
  scorpio: "water",
  pisces: "water",
};

const SIGN_MODALITY_MAP = {
  aries: "cardinal",
  cancer: "cardinal",
  libra: "cardinal",
  capricorn: "cardinal",
  taurus: "fixed",
  leo: "fixed",
  scorpio: "fixed",
  aquarius: "fixed",
  gemini: "mutable",
  virgo: "mutable",
  sagittarius: "mutable",
  pisces: "mutable",
};

const SIGN_NAME_TO_KEY = Object.entries(SIGN_EN).reduce((acc, [key, value]) => {
  acc[String(value).toLowerCase()] = key;
  return acc;
}, {});

const SIGN_JA_TO_KEY = Object.entries(SIGN_JA).reduce((acc, [key, value]) => {
  acc[value] = key;
  return acc;
}, {});

module.exports = Object.freeze({
  PAGE_WIDTH,
  PAGE_HEIGHT,
  TOTAL_SLIDES,
  PAGE_INTROS,
  UI_SCALE,
  TITLE_SCALE,
  FS_BODY,
  FS_SUB,
  FS_HEAD,
  LINE_HEIGHT,
  TEXT_MAX_WIDTH,
  BODY_GLYPH,
  BODY_LABEL_JA,
  PLANET_ROLE_TAGLINES,
  AXIS_ROLE_TAGLINES,
  DEEP_AXIS_ROLE_TAGLINES,
  SIGN_JA,
  SIGN_ELEMENT_MAP,
  SIGN_MODALITY_MAP,
  SIGN_NAME_TO_KEY,
  SIGN_JA_TO_KEY,
  SIGN_EN,
  SIGN_SYMBOL,
});
